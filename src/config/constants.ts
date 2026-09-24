/** Biznes-qoidalar va texnik chegaralar — sehrli sonlar shu yerda. */

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** Telegram global yuborish chegarasi ~30 xabar/sekund. Xavfsiz zaxira bilan. */
export const BROADCAST_RATE_PER_SECOND = 22;
export const BROADCAST_CONCURRENCY = 8;

/** Bir tekshiruvda talab qilinadigan rasmlar. Tartib — Mini App qadamlari tartibi. */
export const REQUIRED_SIDES = ['REAR', 'LEFT', 'RIGHT'] as const;
export type RequiredSide = (typeof REQUIRED_SIDES)[number];

/** Mini App yuklash tokenining amal qilish muddati. */
export const UPLOAD_SESSION_TTL_MS = 2 * HOUR_MS;

/** Referal havolaning amal qilish muddati. */
export const REFERRAL_TTL_MS = 30 * DAY_MS;

/** Yuklanadigan rasm uchun chegaralar. */
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
export const MIN_IMAGE_DIMENSION = 480;
export const ALLOWED_MIME_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp']);

/** Rejalashtiruvchi tsikllari. */
export const SCHEDULER_DISPATCH_CRON = '*/10 * * * *';
export const SCHEDULER_REMINDER_CRON = '*/15 * * * *';
export const SCHEDULER_EXPIRE_CRON = '*/20 * * * *';
export const SCHEDULER_DIGEST_CRON = '0 9 * * *';

/** Bir tsiklda qayta ishlanadigan yozuvlar chegarasi (1000+ mashina uchun bo'lakli). */
export const DISPATCH_BATCH_SIZE = 300;

/** Ro'yxatlarda sahifa hajmi. */
export const PAGE_SIZE = 8;

/** GPS mosligi chegarasi — etalon nuqtadan uzoqlik (metr). 0 => tekshirilmaydi. */
export const GEO_MATCH_RADIUS_M = 0;

/** O'zbekiston davlat raqami namunasi: 01A123BC / 01123ABC / 01A123B. */
export const PLATE_PATTERN = /^(?:[0-9]{2})(?:[A-Z]{1}[0-9]{3}[A-Z]{2}|[0-9]{3}[A-Z]{3}|[A-Z]{1}[0-9]{3}[A-Z]{1})$/;

export const CALLBACK_SEPARATOR = ':';
