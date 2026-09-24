/**
 * `POST /api/upload` uchun multipart so'rovini xavfsiz o'qish va tekshirish.
 *
 * Nima uchun alohida fayl: yuklash handleri faqat biznes ketma-ketligi bilan
 * shug'ullansin, tashqi (ishonchsiz) ma'lumotni tozalash shu yerda tugasin.
 */

import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES, REQUIRED_SIDES } from '../../config/constants.js';
import { ValidationError, isAppError } from '../../core/errors.js';
import { t } from '../../i18n/index.js';

/** initData Telegram tomonidan ~4 KB atrofida beriladi; zaxira bilan cheklaymiz. */
const INIT_DATA_MAX_LENGTH = 8192;
const TOKEN_MIN_LENGTH = 8;
const TOKEN_MAX_LENGTH = 128;
const MAX_ACCURACY_METERS = 100_000;

/**
 * Fayl nomida faqat xavfsiz belgilar qoladi. Nuqta ham olib tashlanadi —
 * kengaytma alohida qo'shiladi va `..` kabi ketma-ketliklar paydo bo'lmasligi kerak.
 */
const UNSAFE_FILENAME_CHARS = /[^A-Za-z0-9_-]/g;
const FILENAME_MAX_LENGTH = 80;

const fieldsSchema = z.object({
  token: z.string().trim().min(TOKEN_MIN_LENGTH).max(TOKEN_MAX_LENGTH),
  side: z.enum(REQUIRED_SIDES),
  initData: z.string().min(1).max(INIT_DATA_MAX_LENGTH),
  clientTakenAt: z.coerce.date().optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  accuracy: z.coerce.number().nonnegative().max(MAX_ACCURACY_METERS).optional(),
  /**
   * Rasm qanday olingani. 'live' — Mini App ichidagi jonli kamera oqimi
   * (galereya imkonsiz). 'fallback' — tizim fayl tanlagichi, ya'ni rasm
   * galereyadan olingan bo'lishi mumkin. Eski mijozlar bu maydonni
   * yubormaydi — shu sababli sukut bo'yicha 'fallback' (ehtiyotkor taxmin).
   */
  captureMode: z.enum(['live', 'fallback']).default('fallback'),
});

export type UploadFields = Readonly<z.infer<typeof fieldsSchema>>;

export type UploadForm = {
  readonly fields: UploadFields;
  readonly buffer: Buffer;
  readonly declaredMimeType: string;
  readonly filename: string;
};

/** Rasm formatlarining boshlang'ich baytlari — Content-Type ga ishonmaymiz. */
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff] as const;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46] as const;
const WEBP_TAG = 'WEBP';
const FTYP_TAG = 'ftyp';
const FTYP_OFFSET = 4;
const BRAND_OFFSET = 8;
const BRAND_LENGTH = 4;
const HEIF_BRANDS = Object.freeze(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);
const MIN_SNIFF_BYTES = 12;

const EXTENSION_BY_MIME: Readonly<Record<string, string>> = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
});

const startsWith = (buffer: Buffer, signature: readonly number[]): boolean =>
  signature.every((byte, index) => buffer[index] === byte);

const isHeif = (buffer: Buffer): boolean => {
  if (buffer.subarray(FTYP_OFFSET, FTYP_OFFSET + BRAND_LENGTH).toString('latin1') !== FTYP_TAG) return false;
  const brand = buffer.subarray(BRAND_OFFSET, BRAND_OFFSET + BRAND_LENGTH).toString('latin1');
  return HEIF_BRANDS.includes(brand);
};

/**
 * Bufer haqiqatan ham rasmmi — sarlavha baytlari bo'yicha aniqlaydi.
 * `null` — tanilmagan format (rad etiladi).
 */
export const detectImageMimeType = (buffer: Buffer): string | null => {
  if (buffer.byteLength < MIN_SNIFF_BYTES) return null;
  if (startsWith(buffer, JPEG_SIGNATURE)) return 'image/jpeg';
  if (startsWith(buffer, PNG_SIGNATURE)) return 'image/png';
  if (startsWith(buffer, RIFF_SIGNATURE) && buffer.subarray(8, 12).toString('latin1') === WEBP_TAG) {
    return 'image/webp';
  }
  if (isHeif(buffer)) return 'image/heic';
  return null;
};

/** Tanilgan va ruxsat etilgan formatni qaytaradi, aks holda xato tashlaydi. */
export const assertImageBuffer = (buffer: Buffer): string => {
  if (buffer.byteLength === 0) throw new ValidationError(t.miniapp.errorPhotoEmpty);
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new ValidationError(t.miniapp.errorPhotoTooLarge, { sizeBytes: buffer.byteLength });
  }

  const detected = detectImageMimeType(buffer);
  if (detected === null || !ALLOWED_MIME_TYPES.includes(detected)) {
    throw new ValidationError(t.miniapp.errorPhotoType, { detected });
  }
  return detected;
};

/** Arxiv fayli uchun bashorat qilinadigan, xavfsiz nom. */
export const buildStoredFilename = (plate: string, side: string, mimeType: string, now: Date): string => {
  const extension = EXTENSION_BY_MIME[mimeType] ?? 'jpg';
  const base = `${plate}_${side}_${now.getTime()}`.replace(UNSAFE_FILENAME_CHARS, '');
  return `${base.slice(0, FILENAME_MAX_LENGTH)}.${extension}`;
};

/** Bo'sh matnli maydon — "yuborilmagan" bilan bir xil ma'noda. */
const collectField = (
  accumulator: Record<string, string>,
  fieldname: string,
  value: unknown,
): Record<string, string> => {
  if (typeof value !== 'string' || value.trim().length === 0) return accumulator;
  return { ...accumulator, [fieldname]: value };
};

type ParsedParts = {
  readonly rawFields: Record<string, string>;
  readonly buffer: Buffer | null;
  readonly declaredMimeType: string;
  readonly filename: string;
};

const readParts = async (request: FastifyRequest): Promise<ParsedParts> => {
  let rawFields: Record<string, string> = {};
  let buffer: Buffer | null = null;
  let declaredMimeType = '';
  let filename = '';

  for await (const part of request.parts()) {
    if (part.type === 'file') {
      // Bir nechta fayl kelsa — birinchisidan keyingilari e'tiborsiz qoldiriladi,
      // lekin oqimni oxirigacha o'qimasak so'rov osilib qoladi.
      const partBuffer = await part.toBuffer();
      if (buffer === null) {
        buffer = partBuffer;
        declaredMimeType = part.mimetype;
        filename = part.filename;
      }
      continue;
    }
    rawFields = collectField(rawFields, part.fieldname, part.value);
  }

  return { rawFields, buffer, declaredMimeType, filename };
};

/** Fastify/busboy chegara xatolari — foydalanuvchiga tushunarli matnga aylantiriladi. */
const MULTIPART_ERROR_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  FST_REQ_FILE_TOO_LARGE: t.miniapp.errorPhotoTooLarge,
  FST_FILES_LIMIT: t.miniapp.errorFieldsInvalid,
  FST_FIELDS_LIMIT: t.miniapp.errorFieldsInvalid,
  FST_PARTS_LIMIT: t.miniapp.errorFieldsInvalid,
  FST_INVALID_MULTIPART_CONTENT_TYPE: t.miniapp.errorFieldsInvalid,
  FST_PROTO_VIOLATION: t.miniapp.errorFieldsInvalid,
});

const toMultipartError = (error: unknown): ValidationError | null => {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const code = String((error as { code: unknown }).code);
  const message = MULTIPART_ERROR_MESSAGES[code];
  return message ? new ValidationError(message, { multipartCode: code }) : null;
};

/**
 * So'rovni o'qiydi va tekshirilgan maydonlar + fayl buferini qaytaradi.
 * Har qanday nomuvofiqlik — `ValidationError` (foydalanuvchiga ko'rsatiladi).
 */
export const readUploadForm = async (request: FastifyRequest): Promise<UploadForm> => {
  if (!request.isMultipart()) throw new ValidationError(t.miniapp.errorFieldsInvalid);

  let parts: ParsedParts;
  try {
    parts = await readParts(request);
  } catch (error) {
    const mapped = toMultipartError(error);
    if (mapped) throw mapped;
    if (isAppError(error)) throw error;
    throw new ValidationError(t.miniapp.errorGeneric, { reason: 'multipart-read' });
  }

  if (parts.buffer === null) throw new ValidationError(t.miniapp.errorPhotoEmpty);

  const fields = fieldsSchema.safeParse(parts.rawFields);
  if (!fields.success) {
    throw new ValidationError(t.miniapp.errorFieldsInvalid, {
      issues: fields.error.issues.map((issue) => issue.path.join('.')),
    });
  }

  return Object.freeze({
    fields: Object.freeze(fields.data),
    buffer: parts.buffer,
    declaredMimeType: parts.declaredMimeType,
    filename: parts.filename,
  });
};
