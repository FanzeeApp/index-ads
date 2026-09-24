/**
 * Reklama beruvchi kabinetining chegaralari.
 * Nima uchun: ekran hajmi va davrlar biznes qarori — ular kod ichida emas,
 * shu yerda nomlangan holda turadi.
 */

/** Jonli hisobotda ko'rsatiladigan oxirgi tasdiqlangan tekshiruvlar soni. */
export const LIVE_FEED_LIMIT = 10;

/** Hisobot uchun tanlanadigan davrlar (kun). Faqat shu qiymatlar qabul qilinadi. */
export const REPORT_PERIOD_DAYS = Object.freeze([7, 30] as const);

/** Hisobotda ro'yxatlanadigan javobsiz mashinalar soni (qolgani "yana N ta"). */
export const MISSED_PLATES_LIMIT = 30;

/** Sahifalash uchun yuqori chegara — callback ichidan kelgan son shu bilan cheklanadi. */
export const MAX_PAGE = 999;

/** Ro'yxatlar shu sahifadan boshlanadi. */
export const FIRST_PAGE = 1;
