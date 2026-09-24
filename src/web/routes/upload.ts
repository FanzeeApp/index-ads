/**
 * `POST /api/upload` — Mini App dan kelgan rasmni qabul qiluvchi yagona endpoint.
 *
 * Xavfsizlik ketma-ketligi (tartibi muhim, hech biri o'tkazib yuborilmaydi):
 *   1) initData imzosi  → Telegram foydalanuvchisi kim ekanini isbotlaydi
 *   2) sessiya tokeni   → token aynan shu foydalanuvchiga berilganmi (IDOR himoyasi)
 *   3) fayl sarlavhasi  → bufer haqiqatan rasmmi (Content-Type ga ishonilmaydi)
 *   4) EXIF hukmi       → rasm hozir olinganmi (rad etmaydi, belgilaydi)
 *   5) arxivga saqlash  → Telegram file_id olinadi
 *   6) bazaga biriktirish
 */

import type { ValidationVerdict } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { REQUIRED_SIDES, MIN_IMAGE_DIMENSION, MINUTE_MS } from '../../config/constants.js';
import { ValidationError, describeError } from '../../core/errors.js';
import { childLogger } from '../../core/logger.js';
import { t } from '../../i18n/index.js';
import { attachPhoto, type CheckRequestFull } from '../../services/checkService.js';
import { storePhotoBuffer } from '../../services/storageService.js';
import { consumeSession, resolveSession } from '../../services/uploadSessionService.js';
import { readPhotoMetadata, validatePhotoFreshness, type PhotoMetadata } from '../../utils/exif.js';
import { formatDateTime } from '../../utils/time.js';
import { verifyInitData } from '../security/initData.js';
import { toApiError } from '../httpError.js';
import { assertImageBuffer, buildStoredFilename, readUploadForm, type UploadForm } from './uploadForm.js';

const log = childLogger('web:upload');

export const UPLOAD_ROUTE = '/api/upload';

/**
 * Bir tekshiruvda atigi 3 ta rasm, lekin chegara IP bo'yicha hisoblanadi va
 * mobil operatorlarda ko'p haydovchi bitta tashqi IP ortida bo'ladi (CGNAT).
 * Shu sababli zaxira qoldirilgan: ~10 haydovchi bir daqiqada bemalol yuboradi,
 * ayni paytda chegara umumiy 100 so'rov/daqiqadan qattiqroq.
 */
const UPLOAD_RATE_LIMIT_MAX = 30;
const UPLOAD_RATE_LIMIT_WINDOW_MS = MINUTE_MS;

type UploadResponse = {
  readonly ok: true;
  readonly side: string;
  readonly receivedSides: readonly string[];
  readonly remaining: readonly string[];
  readonly completed: boolean;
};

/** EXIF o'lchamlari ma'lum bo'lsa — juda kichik (ekran surati/qisqartirilgan) rasmni rad etamiz. */
const assertDimensions = (meta: PhotoMetadata): void => {
  if (meta.width === undefined || meta.height === undefined) return;
  if (Math.min(meta.width, meta.height) >= MIN_IMAGE_DIMENSION) return;
  throw new ValidationError(t.miniapp.errorPhotoSmall, { width: meta.width, height: meta.height });
};

const buildResponse = (check: CheckRequestFull, side: string, completed: boolean): UploadResponse => {
  const received = REQUIRED_SIDES.filter((required) => check.photos.some((photo) => photo.side === required));
  const remaining = REQUIRED_SIDES.filter((required) => !received.includes(required));
  return Object.freeze({ ok: true as const, side, receivedSides: received, remaining, completed });
};

/**
 * Xabarnomalar (haydovchi, adminlar, reklama beruvchi) foydalanuvchini kutdirmasligi kerak —
 * shuning uchun javob yuborilgandan keyin fon rejimida ishlaydi.
 * Dinamik import halqa bog'lanishning oldini oladi: bot qatlami web qatlamini biladi.
 */
const scheduleSubmittedNotification = (checkId: string): void => {
  void import('../../bot/handlers/driver/check.js')
    .then((module) => module.onCheckSubmitted(checkId))
    .catch((error: unknown) => {
      log.error({ checkId, reason: describeError(error) }, 'Yakuniy xabarnomalarni yuborib bo\'lmadi');
    });
};

/** Jonli kadr shu daqiqada olingan hisoblanishi uchun ruxsat etilgan eng katta farq. */
const LIVE_CAPTURE_MAX_AGE_MS = 15 * MINUTE_MS;

/**
 * Yakuniy ishonch darajasini aniqlaydi.
 *
 * Nozik nuqta: jonli kamera oqimidan olingan kadr canvas orqali yaratiladi va
 * unda EXIF UMUMAN bo'lmaydi. Shu sababli oddiy EXIF tekshiruvi eng ishonchli
 * yo'lni (`live`) noto'g'ri ravishda SUSPECT_NO_EXIF deb belgilaydi. Bu yerda
 * shu teskarilik tuzatiladi: `live` uchun mijoz vaqti hujjatli manba bo'ladi,
 * `fallback` uchun esa galereya ehtimoli izohga qo'shiladi.
 */
export const resolveVerdict = (
  freshness: { verdict: ValidationVerdict; note?: string },
  captureMode: 'live' | 'fallback',
  clientTakenAt: Date | undefined,
  now: Date,
): { verdict: ValidationVerdict; note?: string } => {
  if (captureMode !== 'live') {
    if (freshness.verdict === 'OK') return freshness;
    const suffix = 'fayl tanlagich orqali yuborilgan — galereyadan olingan bo\'lishi mumkin';
    return { verdict: freshness.verdict, note: freshness.note ? `${freshness.note}; ${suffix}` : suffix };
  }

  // Jonli kadr: mijoz vaqti yo'q yoki eski bo'lsa — shubhali.
  if (!clientTakenAt) {
    return { verdict: 'SUSPECT_NO_EXIF', note: 'Jonli kadr, lekin olingan vaqt ko\'rsatilmagan' };
  }
  const ageMs = now.getTime() - clientTakenAt.getTime();
  if (ageMs > LIVE_CAPTURE_MAX_AGE_MS) {
    return { verdict: 'SUSPECT_OLD', note: 'Jonli kadr, lekin yuborish juda kechikkan' };
  }

  // EXIF yo'qligi jonli kadr uchun kutilgan holat — bu kamchilik emas.
  if (freshness.verdict === 'SUSPECT_NO_EXIF') {
    return { verdict: 'OK', note: 'Mini App jonli kamerasidan olingan (EXIF kutilmaydi)' };
  }
  return freshness;
};

/** Yuklangan rasmni tekshiruvga biriktiradi va yangilangan holatni qaytaradi. */
const persistPhoto = async (
  form: UploadForm,
  check: CheckRequestFull,
  mimeType: string,
  now: Date,
): Promise<{ check: CheckRequestFull; allSidesReceived: boolean }> => {
  const meta = await readPhotoMetadata(form.buffer);
  assertDimensions(meta);

  const freshness = resolveVerdict(
    validatePhotoFreshness(meta, form.fields.clientTakenAt, now),
    form.fields.captureMode,
    form.fields.clientTakenAt,
    now,
  );
  const sideLabel = t.side[form.fields.side];

  const stored = await storePhotoBuffer({
    buffer: form.buffer,
    filename: buildStoredFilename(check.car.plateNumber, form.fields.side, mimeType, now),
    caption: t.advertiser.photoCaption(check.car.plateNumber, sideLabel, formatDateTime(now)),
  });

  return attachPhoto(
    check.id,
    {
      side: form.fields.side,
      origin: 'MINIAPP',
      telegramFileId: stored.telegramFileId ?? undefined,
      fileUniqueId: stored.fileUniqueId ?? undefined,
      width: meta.width,
      height: meta.height,
      sizeBytes: stored.sizeBytes,
      sha256: stored.sha256,
      // EXIF vaqti ishonchliroq; bo'lmasa Mini App bergan vaqt ishlatiladi.
      takenAt: meta.takenAt ?? form.fields.clientTakenAt,
      latitude: meta.latitude ?? form.fields.lat,
      longitude: meta.longitude ?? form.fields.lng,
      accuracyM: form.fields.accuracy,
      verdict: freshness.verdict,
      verdictNote: freshness.note,
    },
    now,
  );
};

const handleUpload = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
  const now = new Date();
  try {
    const form = await readUploadForm(request);

    const verified = verifyInitData(form.fields.initData, now);
    const telegramId = verified.user.id;

    const { check } = await resolveSession(form.fields.token, telegramId, now);
    const mimeType = assertImageBuffer(form.buffer);

    const result = await persistPhoto(form, check, mimeType, now);

    if (result.allSidesReceived) {
      await consumeSession(form.fields.token, now);
      scheduleSubmittedNotification(check.id);
    }

    log.info(
      { checkId: check.id, side: form.fields.side, telegramId, completed: result.allSidesReceived },
      'Rasm qabul qilindi',
    );

    return reply.code(200).send(buildResponse(result.check, form.fields.side, result.allSidesReceived));
  } catch (error) {
    const mapped = toApiError(error);
    const logPayload = { status: mapped.status, code: mapped.body.code, reason: describeError(error) };
    if (mapped.status >= 500) log.error(logPayload, 'Yuklashda ichki xato');
    else log.warn(logPayload, 'Yuklash rad etildi');
    return reply.code(mapped.status).send(mapped.body);
  }
};

export const registerUploadRoutes = (app: FastifyInstance): void => {
  app.post(
    UPLOAD_ROUTE,
    { config: { rateLimit: { max: UPLOAD_RATE_LIMIT_MAX, timeWindow: UPLOAD_RATE_LIMIT_WINDOW_MS } } },
    handleUpload,
  );
};
