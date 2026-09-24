/**
 * Reklama beruvchilarga kunlik jamlangan hisobot.
 * Mazmunni reportService shakllantiradi — bu yerda faqat cron bilan bog'lash.
 */

import { sendDailyDigest } from '../../services/reportService.js';

export const DIGEST_JOB = 'dailyDigest';

/** Bitta tsikl. Qaytadigan son — yuborilgan hisobotlar soni. */
export const dailyDigest = async (): Promise<number> => sendDailyDigest();
