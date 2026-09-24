/**
 * Javob kutilayotgan tekshiruvlar bo'yicha haydovchilarga eslatma yuboradi.
 * Eslatma chegaralari CHECK_REMINDER_HOURS dan olinadi (masalan: 6 va 18 soat).
 */

import { DISPATCH_BATCH_SIZE } from '../../config/constants.js';
import { env } from '../../config/env.js';
import { childLogger } from '../../core/logger.js';
import { t } from '../../i18n/index.js';
import { MESSAGE_LIMIT, escapeHtml, truncate } from '../../utils/html.js';
import { formatPlate } from '../../utils/plate.js';
import { hoursBetween } from '../../utils/time.js';
import { markReminderSent, pendingRemindable, type CheckRequestFull } from '../../services/checkService.js';
import { sendMessageSafe } from '../../services/notifyService.js';
import { processInChunks } from '../runJob.js';

const log = childLogger('scheduler:remind');

export const REMIND_JOB = 'remindPending';

const safePlate = (check: CheckRequestFull): string => escapeHtml(formatPlate(check.car.plateNumber));

/** Muddat tugashiga qolgan soat — haydovchiga butun son ko'rinishida ko'rsatiladi. */
const hoursLeftUntilDue = (check: CheckRequestFull, now: Date): number =>
  Math.max(0, Math.round(hoursBetween(now, check.dueAt)));

/**
 * Nima uchun yetkazilmagan holatda ham hisoblagich oshiriladi: haydovchi botni
 * bloklagan yoki mashinaga haydovchi biriktirilmagan bo'lsa, so'rov har 15
 * daqiqada qayta tanlanib, cheksiz urinish (va log toshqini) hosil qilardi.
 * Vaqtinchalik tarmoq xatosi bo'lsa — hisoblagich oshmaydi, keyingi tsiklda
 * qayta uriniladi.
 */
const remindOne = async (check: CheckRequestFull, now: Date): Promise<boolean> => {
  const driverUser = check.car.driver?.user ?? null;

  if (driverUser === null || driverUser.telegramId === null) {
    log.warn({ checkId: check.id }, 'Eslatma yuborilmadi — haydovchi biriktirilmagan');
    await markReminderSent(check.id);
    return false;
  }

  if (driverUser.isBlocked) {
    log.warn({ checkId: check.id }, 'Eslatma yuborilmadi — haydovchi botni bloklagan');
    await markReminderSent(check.id);
    return false;
  }

  const text = t.driver.reminder(safePlate(check), hoursLeftUntilDue(check, now));
  const sent = await sendMessageSafe(driverUser.telegramId, truncate(text, MESSAGE_LIMIT), {
    parse_mode: 'HTML',
  });

  if (sent) await markReminderSent(check.id);
  return sent;
};

/** Bitta tsikl. Qaytadigan son — yuborilgan eslatmalar soni. */
export const remindPending = async (now: Date = new Date()): Promise<number> => {
  const checks = await pendingRemindable(now, env.CHECK_REMINDER_HOURS, DISPATCH_BATCH_SIZE);
  if (checks.length === 0) return 0;

  const outcome = await processInChunks(REMIND_JOB, checks, (check) => remindOne(check, now));

  if (outcome.failed > 0) {
    log.warn({ due: checks.length, sent: outcome.ok, failed: outcome.failed }, "Ba'zi eslatmalar yetkazilmadi");
  }

  return outcome.ok;
};
