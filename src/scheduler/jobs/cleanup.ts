/**
 * Eskirgan yozuvlarni tozalaydi: amal muddati tugagan yuklash sessiyalari va
 * ishlatilmay qolgan referal havolalar.
 *
 * Nima uchun kerak: yuklash tokeni 2 soat, referal havola 30 kun yashaydi.
 * Ularni o'z vaqtida yopmasak, eski token bilan Mini App ochilishi mumkin va
 * jadval bekorga o'sib boraveradi.
 */

import { childLogger } from '../../core/logger.js';
import { expireStaleReferrals } from '../../services/referralService.js';
import { purgeExpired } from '../../services/uploadSessionService.js';

const log = childLogger('scheduler:cleanup');

export const CLEANUP_JOB = 'cleanup';

/** Bitta tsikl. Qaytadigan son — tozalangan yozuvlarning umumiy soni. */
export const cleanup = async (now: Date = new Date()): Promise<number> => {
  const [sessions, referrals] = await Promise.all([purgeExpired(now), expireStaleReferrals(now)]);

  if (sessions > 0 || referrals > 0) {
    log.info({ sessions, referrals }, 'Eskirgan yozuvlar tozalandi');
  }

  return sessions + referrals;
};
