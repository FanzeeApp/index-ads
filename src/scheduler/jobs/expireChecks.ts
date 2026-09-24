/**
 * Muddati o'tgan tekshiruvlarni yopadi va uch tomonni xabardor qiladi:
 * haydovchi, reklama beruvchi va adminlar.
 *
 * Adminlarga har bir mashina uchun alohida xabar YUBORILMAYDI — bitta tsiklda
 * o'nlab mashina muddatni o'tkazib yuborishi mumkin, bu esa admin chatini
 * spamga aylantiradi. Shuning uchun jamlangan bitta xabar yuboriladi.
 */

import { DISPATCH_BATCH_SIZE } from '../../config/constants.js';
import { childLogger } from '../../core/logger.js';
import { t } from '../../i18n/index.js';
import { MESSAGE_LIMIT, escapeHtml, truncate } from '../../utils/html.js';
import { formatPlate } from '../../utils/plate.js';
import { expireOverdueChecks, type CheckRequestFull } from '../../services/checkService.js';
import { notifyAdmins, sendMessageSafe } from '../../services/notifyService.js';
import { reportMissedCheck } from '../../services/reportService.js';
import { processInChunks } from '../runJob.js';

const log = childLogger('scheduler:expire');

export const EXPIRE_JOB = 'expireChecks';

/** Admin xabarida ko'rsatiladigan mashinalar soni — qolgani faqat son bilan. */
const ADMIN_DIGEST_LIMIT = 20;

const safePlate = (check: CheckRequestFull): string => escapeHtml(formatPlate(check.car.plateNumber));

/** Haydovchi nomi: to'liq ism → Telegram ismi → username → "biriktirilmagan". */
const driverLabel = (check: CheckRequestFull): string => {
  const driver = check.car.driver;
  if (!driver) return t.scheduler.driverUnknown;
  const name = driver.fullName ?? driver.user.firstName ?? driver.user.username;
  return escapeHtml(name ?? t.scheduler.driverUnknown);
};

/** Haydovchiga "muddat tugadi" xabari. Bloklangan foydalanuvchi — kutilgan holat. */
const notifyDriver = async (check: CheckRequestFull): Promise<boolean> => {
  const driverUser = check.car.driver?.user ?? null;
  if (driverUser === null || driverUser.telegramId === null || driverUser.isBlocked) return false;

  return sendMessageSafe(driverUser.telegramId, t.driver.expired(safePlate(check)), { parse_mode: 'HTML' });
};

/** Reklama beruvchiga javobsiz tekshiruv haqida xabar — hisobot xizmati orqali. */
const notifyAdvertiser = async (check: CheckRequestFull): Promise<boolean> => reportMissedCheck(check);

/** Barcha javobsiz mashinalar uchun bitta jamlangan admin xabari. */
const buildAdminDigest = (checks: readonly CheckRequestFull[]): string => {
  const shown = checks.slice(0, ADMIN_DIGEST_LIMIT);
  const lines = shown.map((check) =>
    t.scheduler.expiredDigestItem(safePlate(check), escapeHtml(check.campaign.title), driverLabel(check)),
  );
  const rest = checks.length - shown.length;
  const tail = rest > 0 ? t.scheduler.expiredDigestMore(rest) : '';

  return truncate(`${t.scheduler.expiredDigestTitle(checks.length)}\n${lines.join('\n')}${tail}`, MESSAGE_LIMIT);
};

/** Bitta tsikl. Qaytadigan son — yopilgan tekshiruvlar soni. */
export const expireChecks = async (now: Date = new Date()): Promise<number> => {
  const expired = await expireOverdueChecks(now, DISPATCH_BATCH_SIZE);
  if (expired.length === 0) return 0;

  const drivers = await processInChunks(EXPIRE_JOB, expired, notifyDriver);
  const advertisers = await processInChunks(EXPIRE_JOB, expired, notifyAdvertiser);

  await notifyAdmins(buildAdminDigest(expired), { parse_mode: 'HTML' });

  log.info(
    {
      expired: expired.length,
      driversNotified: drivers.ok,
      advertisersNotified: advertisers.ok,
      failed: drivers.failed + advertisers.failed,
    },
    "Muddati o'tgan tekshiruvlar bo'yicha xabarlar yuborildi",
  );

  return expired.length;
};
