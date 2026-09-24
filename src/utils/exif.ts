/**
 * EXIF o'qish va rasmning "yangiligi"ni baholash.
 *
 * Nima uchun kerak: haydovchi galereyadagi eski rasmni qayta yuborishi mumkin.
 * EXIF vaqti va GPS mavjudligi — buni aniqlashning arzon va ishonchli belgisi.
 * Biz rasmni RAD ETMAYMIZ, faqat adminga ko'rinadigan hukm (verdict) qo'yamiz.
 */

import exifr from 'exifr';
import { z } from 'zod';
import type { ValidationVerdict } from '@prisma/client';
import { env } from '../config/env.js';
import { childLogger } from '../core/logger.js';
import { describeError } from '../core/errors.js';
import { t } from '../i18n/index.js';
import { minutesBetween } from './time.js';

const log = childLogger('exif');

/** Qurilma soati biroz oldinda bo'lishi mumkin — shuncha daqiqaga toqat qilamiz. */
const FUTURE_SKEW_TOLERANCE_MINUTES = 10;

export type PhotoMetadata = {
  readonly takenAt?: Date;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly width?: number;
  readonly height?: number;
  readonly make?: string;
  readonly model?: string;
};

export type FreshnessResult = {
  readonly verdict: ValidationVerdict;
  readonly note?: string;
};

const EMPTY_METADATA: PhotoMetadata = Object.freeze({});

/**
 * EXIF — tashqi, ishonchsiz ma'lumot: har bir maydon alohida tekshiriladi va
 * yaroqsiz bo'lsa undefined ga aylanadi (butun o'qishni buzmaydi).
 */
const optionalDate = z.coerce.date().optional().catch(undefined);
const optionalCoordinate = z.number().finite().optional().catch(undefined);
const optionalDimension = z.number().int().positive().optional().catch(undefined);
const optionalLabel = z.string().trim().min(1).max(120).optional().catch(undefined);

const exifSchema = z
  .object({
    DateTimeOriginal: optionalDate,
    CreateDate: optionalDate,
    ModifyDate: optionalDate,
    latitude: optionalCoordinate,
    longitude: optionalCoordinate,
    ExifImageWidth: optionalDimension,
    ExifImageHeight: optionalDimension,
    ImageWidth: optionalDimension,
    ImageHeight: optionalDimension,
    Make: optionalLabel,
    Model: optionalLabel,
  })
  .passthrough();

const toMetadata = (raw: unknown): PhotoMetadata => {
  const parsed = exifSchema.safeParse(raw);
  if (!parsed.success) {
    log.debug({ issues: parsed.error.issues.length }, 'EXIF tuzilmasi kutilganidek emas');
    return EMPTY_METADATA;
  }

  const data = parsed.data;
  return Object.freeze({
    takenAt: data.DateTimeOriginal ?? data.CreateDate ?? data.ModifyDate,
    latitude: data.latitude,
    longitude: data.longitude,
    width: data.ExifImageWidth ?? data.ImageWidth,
    height: data.ExifImageHeight ?? data.ImageHeight,
    make: data.Make,
    model: data.Model,
  });
};

/**
 * Rasm buferidan EXIF metama'lumotlarini o'qiydi.
 * exifr xato tashlasa — jim yutmaymiz, debug logga yozamiz va bo'sh natija qaytaramiz:
 * metama'lumot yo'qligi o'zi ham hukmda hisobga olinadi.
 */
export const readPhotoMetadata = async (buffer: Buffer): Promise<PhotoMetadata> => {
  try {
    // ifd0 exifr'da o'chirilmaydi va doim o'qiladi — shuning uchun ro'yxatda yo'q.
    const raw: unknown = await exifr.parse(buffer, { tiff: true, exif: true, gps: true });
    if (raw === null || typeof raw !== 'object') return EMPTY_METADATA;
    return toMetadata(raw);
  } catch (error) {
    log.debug({ reason: describeError(error) }, "EXIF o'qilmadi — metama'lumotsiz davom etamiz");
    return EMPTY_METADATA;
  }
};

const hasCoordinates = (meta: PhotoMetadata): boolean =>
  typeof meta.latitude === 'number' && typeof meta.longitude === 'number';

/**
 * Rasm hozir olinganmi degan savolga hukm beradi.
 * clientTakenAt — Mini App dagi brauzer vaqti; EXIF vaqti bo'lmaganda zaxira manba.
 */
export const validatePhotoFreshness = (
  meta: PhotoMetadata,
  clientTakenAt?: Date,
  now: Date = new Date(),
): FreshnessResult => {
  if (env.PHOTO_VALIDATION_MODE === 'off') return { verdict: 'SKIPPED' };

  const isStrict = env.PHOTO_VALIDATION_MODE === 'strict';
  const takenAt = meta.takenAt ?? clientTakenAt;

  if (!takenAt) {
    return { verdict: 'SUSPECT_NO_EXIF', note: isStrict ? t.note.noExifStrict : t.note.noExifLenient };
  }

  const ageMinutes = Math.round(minutesBetween(takenAt, now));
  if (ageMinutes > env.PHOTO_MAX_AGE_MINUTES) {
    return { verdict: 'SUSPECT_OLD', note: t.note.tooOld(ageMinutes) };
  }
  if (ageMinutes < -FUTURE_SKEW_TOLERANCE_MINUTES) {
    return { verdict: 'SUSPECT_OLD', note: t.note.futureTime };
  }

  // Vaqt yangi, lekin EXIF dan emas — bu hali ham zaif dalil.
  if (!meta.takenAt) {
    return { verdict: 'SUSPECT_NO_EXIF', note: t.note.clientTimeFallback };
  }

  if (!hasCoordinates(meta) && isStrict) {
    return { verdict: 'SUSPECT_GEO', note: t.note.noGeo };
  }

  return { verdict: 'OK' };
};
