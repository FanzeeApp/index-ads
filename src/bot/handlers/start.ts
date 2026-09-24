/**
 * /start, deep-link payloadlari va telefon orqali ulanish.
 * Nima uchun rol bazadan qayta tekshiriladi: referal endigina ulangan bo'lsa,
 * shu update dagi ctx.auth hali eski rolni ko'rsatib turadi.
 */
import type { Bot } from 'grammy';
import { z } from 'zod';
import type { User } from '@prisma/client';
import { describeError } from '../../core/errors.js';
import { childLogger } from '../../core/logger.js';
import { t } from '../../i18n/index.js';
import { escapeHtml } from '../../utils/html.js';
import { normalizePhone } from '../../utils/phone.js';
import { formatPlate } from '../../utils/plate.js';
import { findAdvertiserByTelegramId, linkAdvertiserUser } from '../../services/advertiserService.js';
import {
  claimPendingDriver,
  findDriverByTelegramId,
  setPhone,
  upsertUserFromTelegram,
  type TelegramUserInput,
} from '../../services/driverService.js';
import { consumeReferral, parseReferralPayload } from '../../services/referralService.js';
import { removeKeyboard } from '../keyboards/common.js';
import { requestPhoneKeyboard } from '../keyboards/driver.js';
import { showAdminMenu } from './admin/menu.js';
import { showAdvertiserMenu } from './advertiser/menu.js';
import { sendDriverMenu } from './driver/menu.js';
import type { BotContext } from '../bot.js';
import { authOf, isAdminRole, replySafe, safeHandler, userFacingText } from './guard.js';

const log = childLogger('bot:start');

const REFERRAL_PREFIX = 'ref_';
const ADVERTISER_PREFIX = 'adv_';
const ADVERTISER_PAYLOAD_PATTERN = /^adv_([A-Za-z0-9_-]{4,64})$/;

/** Telegram start payload uchun rasmiy chegara — 64 belgi, faqat [A-Za-z0-9_-]. */
const payloadSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

type TelegramFrom = NonNullable<BotContext['from']>;

const toUpsertInput = (from: TelegramFrom): TelegramUserInput => ({
  id: from.id,
  username: from.username,
  first_name: from.first_name,
  last_name: from.last_name,
  language_code: from.language_code,
});

const parseAdvertiserPayload = (payload: string): string | null =>
  ADVERTISER_PAYLOAD_PATTERN.exec(payload.trim())?.[1] ?? null;

// ─────────────────────────── Rolga qarab menyu ───────────────────────────

const sendGuestMenu = async (ctx: BotContext): Promise<void> => {
  await replySafe(ctx, t.start.welcomeUnknown, { reply_markup: requestPhoneKeyboard() });
};

const driverGreeting = (fullName: string | null, firstName: string | null): string =>
  t.start.welcomeDriver(escapeHtml(fullName ?? firstName ?? ''));

/** Foydalanuvchiga roliga mos menyuni ko'rsatadi. /start va fallback shuni chaqiradi. */
export const sendRoleMenu = async (ctx: BotContext): Promise<void> => {
  const telegramId = ctx.from?.id;
  if (telegramId === undefined) return;

  const { role } = authOf(ctx);

  if (isAdminRole(role)) {
    await replySafe(ctx, t.start.welcomeAdmin, { parse_mode: 'HTML' });
    await showAdminMenu(ctx);
    return;
  }

  if (role === 'ADVERTISER') {
    await showAdvertiserMenu(ctx);
    return;
  }

  const driver = await findDriverByTelegramId(telegramId);
  if (driver !== null) {
    await sendDriverMenu(ctx, driverGreeting(driver.fullName, driver.user.firstName));
    return;
  }

  const advertiser = await findAdvertiserByTelegramId(telegramId);
  if (advertiser !== null) {
    await replySafe(ctx, t.start.welcomeAdvertiser(escapeHtml(advertiser.companyName)), { parse_mode: 'HTML' });
    await showAdvertiserMenu(ctx);
    return;
  }

  await sendGuestMenu(ctx);
};

// ─────────────────────────── Deep-link oqimlari ───────────────────────────

const handleReferralPayload = async (ctx: BotContext, user: User, token: string): Promise<void> => {
  try {
    const { car } = await consumeReferral(token, user);
    await sendDriverMenu(ctx, t.referral.linked(escapeHtml(formatPlate(car.plateNumber))));
  } catch (error) {
    // Sabab aniq aytiladi: havola eskirgan, ishlatilgan yoki mashina band.
    log.warn({ userId: user.id, err: describeError(error) }, 'Referal havola ishlamadi');
    await replySafe(ctx, userFacingText(error, t.referral.invalid), { parse_mode: 'HTML' });
  }
};

const handleAdvertiserPayload = async (ctx: BotContext, user: User, code: string): Promise<void> => {
  try {
    const advertiser = await linkAdvertiserUser(code, user);
    await replySafe(ctx, t.advertiser.linked(escapeHtml(advertiser.companyName)), { parse_mode: 'HTML' });
    await showAdvertiserMenu(ctx);
  } catch (error) {
    log.warn({ userId: user.id, err: describeError(error) }, 'Reklama beruvchi taklifi ishlamadi');
    await replySafe(ctx, userFacingText(error, t.advertiser.inviteInvalid), { parse_mode: 'HTML' });
  }
};

const routePayload = async (ctx: BotContext, user: User, payload: string): Promise<void> => {
  if (payload.startsWith(REFERRAL_PREFIX)) {
    const token = parseReferralPayload(payload);
    if (token === null) {
      await replySafe(ctx, t.referral.invalid);
      return;
    }
    await handleReferralPayload(ctx, user, token);
    return;
  }

  if (payload.startsWith(ADVERTISER_PREFIX)) {
    const code = parseAdvertiserPayload(payload);
    if (code === null) {
      await replySafe(ctx, t.advertiser.inviteInvalid);
      return;
    }
    await handleAdvertiserPayload(ctx, user, code);
    return;
  }

  await replySafe(ctx, t.start.payloadInvalid);
  await sendRoleMenu(ctx);
};

const handleStart = async (ctx: BotContext): Promise<void> => {
  const from = ctx.from;
  if (from === undefined) return;

  const user = await upsertUserFromTelegram(toUpsertInput(from));
  const raw = typeof ctx.match === 'string' ? ctx.match.trim() : '';

  if (raw.length === 0) {
    await sendRoleMenu(ctx);
    return;
  }

  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) {
    await replySafe(ctx, t.start.payloadInvalid);
    await sendRoleMenu(ctx);
    return;
  }

  await routePayload(ctx, user, parsed.data);
};

// ─────────────────────────── Kontakt ───────────────────────────

/** Admin oldindan kiritgan yozuvga ulanadi; ulanmasa haydovchi kutish holatida qoladi. */
const finishContactLink = async (ctx: BotContext, from: TelegramFrom, user: User): Promise<void> => {
  const driver = await claimPendingDriver(user);
  if (driver === null) {
    await replySafe(ctx, t.start.notLinked);
    return;
  }

  const linked = await findDriverByTelegramId(from.id);
  const plate = linked?.cars[0]?.plateNumber;
  if (plate === undefined) {
    await sendDriverMenu(ctx, driverGreeting(driver.fullName, from.first_name));
    return;
  }
  await sendDriverMenu(ctx, t.referral.linked(escapeHtml(formatPlate(plate))));
};

/**
 * Telefon raqam orqali ulanish. FAQAT o'z raqami qabul qilinadi:
 * boshqa odamning kontaktini yuborib begona hisobni egallab olishning oldi olinadi.
 */
const handleContact = async (ctx: BotContext): Promise<void> => {
  const from = ctx.from;
  const contact = ctx.message?.contact;
  if (from === undefined || contact === undefined) return;

  if (contact.user_id !== from.id) {
    log.warn({ fromId: from.id }, "Begona kontakt yuborildi — rad etildi");
    await replySafe(ctx, t.start.phoneNotOwn, { reply_markup: requestPhoneKeyboard() });
    return;
  }

  const phone = normalizePhone(contact.phone_number);
  if (phone === null) {
    await replySafe(ctx, t.start.phoneInvalid, { reply_markup: requestPhoneKeyboard() });
    return;
  }

  const created = await upsertUserFromTelegram(toUpsertInput(from));
  const user = await setPhone(created.id, phone);
  await replySafe(ctx, t.start.phoneSaved, { reply_markup: removeKeyboard });

  await finishContactLink(ctx, from, user);
};

/** /start, /menu va kontakt oqimi. Rol handlerlaridan oldin ulanadi. */
export const registerStartHandlers = (bot: Bot<BotContext>): void => {
  bot.command('start', safeHandler('start', handleStart));
  bot.command('menu', safeHandler('start:menu', sendRoleMenu));
  bot.on('message:contact', safeHandler('start:contact', handleContact));
};
