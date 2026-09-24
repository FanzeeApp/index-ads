/**
 * Tekshiruv oqimi: haydovchiga rasm so'rovini yuborish, javobni qabul qilish va
 * barcha 3 tomon to'lganda hisobotni tarqatish.
 *
 * Nima uchun bu yerda bot.api ishlatiladi: yuborilgan xabarning messageId si kerak
 * (keyin tugmalarni olib tashlash uchun), notifyService esa faqat true/false qaytaradi.
 * Shuning uchun yuborish o'z navbati orqali ketadi — Telegram limiti baribir saqlanadi.
 */
import { GrammyError, InlineKeyboard, type Bot } from 'grammy';
import PQueue from 'p-queue';
import { BROADCAST_CONCURRENCY, BROADCAST_RATE_PER_SECOND, REQUIRED_SIDES, type RequiredSide } from '../../../config/constants.js';
import { env } from '../../../config/env.js';
import { AppError, describeError } from '../../../core/errors.js';
import { childLogger } from '../../../core/logger.js';
import { prisma } from '../../../db/client.js';
import { t } from '../../../i18n/index.js';
import { MESSAGE_LIMIT, escapeHtml, truncate } from '../../../utils/html.js';
import { formatPlate } from '../../../utils/plate.js';
import { formatDateTime } from '../../../utils/time.js';
import {
  attachPhoto,
  getActiveCheckForDriver,
  getCheckById,
  type CheckRequestFull,
} from '../../../services/checkService.js';
import { notifyAdmins, sendMessageSafe } from '../../../services/notifyService.js';
import { reportCheckToAdvertiser } from '../../../services/reportService.js';
import { issueSession } from '../../../services/uploadSessionService.js';
import { CB, buildCallback, callbackPattern, tryParseCallback } from '../../callbacks.js';
import {
  checkPromptKeyboard,
  driverMenuKeyboard,
  refreshCheckLinkKeyboard,
} from '../../keyboards/driver.js';
import type { BotContext } from '../../bot.js';
import { answerSafe, authOf, isAdminRole, replySafe, safeHandler } from '../guard.js';

const log = childLogger('bot:driver:check');

const TELEGRAM_FORBIDDEN_CODE = 403;
const RATE_INTERVAL_MS = 1_000;

/** Rejalashtiruvchi bir tsiklda yuzlab so'rov yuboradi — navbat tezlikni ushlab turadi. */
const promptQueue = new PQueue({
  concurrency: BROADCAST_CONCURRENCY,
  intervalCap: BROADCAST_RATE_PER_SECOND,
  interval: RATE_INTERVAL_MS,
});

type SentMessage = Awaited<ReturnType<Bot<BotContext>['api']['sendMessage']>>;

/** Halqa importdan qochish uchun bot setter orqali beriladi (notifyService bilan bir xil uslub). */
let botRef: Bot<BotContext> | null = null;

export const setBotForDriverCheck = (bot: Bot<BotContext>): void => {
  botRef = bot;
};

const requireBot = (): Bot<BotContext> => {
  if (botRef === null) {
    throw new AppError('BOT_NOT_READY', 'Bot ulanmagan — setBotForDriverCheck() chaqirilmagan', {
      statusCode: 500,
    });
  }
  return botRef;
};

// ─────────────────────────── Yordamchilar ───────────────────────────

const driverTelegramId = (check: CheckRequestFull): bigint | null => check.car.driver?.user.telegramId ?? null;

const plateOf = (check: CheckRequestFull): string => escapeHtml(formatPlate(check.car.plateNumber));

const driverLabel = (check: CheckRequestFull): string => {
  const driver = check.car.driver;
  if (driver === null || driver === undefined) return t.common.notFound;
  if (driver.fullName !== null && driver.fullName.length > 0) return driver.fullName;

  const name = [driver.user.firstName, driver.user.lastName]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ');
  if (name.length > 0) return name;
  return driver.user.username === null ? driver.user.id : `@${driver.user.username}`;
};

/** Bir tomon uchun bir nechta rasm bo'lishi mumkin — shuning uchun tomonlar to'plami bo'yicha sanaymiz. */
const coveredSides = (check: CheckRequestFull): ReadonlySet<RequiredSide> =>
  new Set(check.photos.map((photo) => photo.side));

const nextMissingSide = (check: CheckRequestFull): RequiredSide | null => {
  const covered = coveredSides(check);
  return REQUIRED_SIDES.find((side) => !covered.has(side)) ?? null;
};

const remainingSideCount = (check: CheckRequestFull): number => {
  const covered = coveredSides(check);
  return REQUIRED_SIDES.filter((side) => !covered.has(side)).length;
};

/** Kamera + havolani yangilash tugmalari bitta klaviaturada. */
const promptKeyboard = (webAppUrl: string, checkId: string): InlineKeyboard =>
  checkPromptKeyboard(webAppUrl).row().text(t.driver.refreshLink, buildCallback(CB.driverCheckRefresh, checkId));

/**
 * Bir martalik yuklash havolasini oladi. Havola yaratilmasa (PUBLIC_URL yo'q, sessiya xatosi)
 * haydovchi boshi berk ko'chada qolmasligi uchun "yangilash" tugmasi qaytadi.
 */
const keyboardForCheck = async (check: CheckRequestFull, telegramId: bigint): Promise<InlineKeyboard> => {
  try {
    const session = await issueSession(check.id, telegramId);
    return promptKeyboard(session.url, check.id);
  } catch (error) {
    log.error({ checkId: check.id, err: describeError(error) }, 'Yuklash sessiyasi yaratilmadi');
    return refreshCheckLinkKeyboard(check.id);
  }
};

// ─────────────────────────── Yuborish ───────────────────────────

const markUserBlocked = async (telegramId: bigint): Promise<void> => {
  try {
    await prisma.user.updateMany({ where: { telegramId }, data: { isBlocked: true } });
  } catch (error) {
    log.error({ err: describeError(error) }, 'Bloklangan foydalanuvchi belgilanmadi');
  }
};

const enqueuePrompt = async (
  telegramId: bigint,
  text: string,
  keyboard: InlineKeyboard,
): Promise<SentMessage | null> => {
  const sent = await promptQueue.add(async (): Promise<SentMessage | null> => {
    try {
      return await requireBot().api.sendMessage(Number(telegramId), text, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
        link_preview_options: { is_disabled: true },
      });
    } catch (error) {
      if (error instanceof GrammyError && error.error_code === TELEGRAM_FORBIDDEN_CODE) {
        await markUserBlocked(telegramId);
        log.warn({ telegramId: telegramId.toString() }, 'Haydovchi botni bloklagan');
        return null;
      }
      log.error({ telegramId: telegramId.toString(), err: describeError(error) }, "So'rov yuborilmadi");
      return null;
    }
  });
  return sent ?? null;
};

/** promptChatId/promptMessageId — javob kelgach tugmalarni olib tashlash uchun saqlanadi. */
const savePromptRef = async (checkId: string, chatId: number, messageId: number): Promise<void> => {
  try {
    await prisma.checkRequest.update({
      where: { id: checkId },
      data: { promptChatId: BigInt(chatId), promptMessageId: messageId },
    });
  } catch (error) {
    log.error({ checkId, err: describeError(error) }, 'Xabar identifikatori saqlanmadi');
  }
};

/**
 * Haydovchiga tekshiruv so'rovini yuboradi.
 * Rejalashtiruvchi (dispatchChecks) va admin paneli shu funksiyani chaqiradi.
 */
export const sendCheckPrompt = async (check: CheckRequestFull): Promise<boolean> => {
  const telegramId = driverTelegramId(check);
  if (telegramId === null) {
    log.warn({ checkId: check.id, plate: check.car.plateNumber }, 'Mashinaga haydovchi biriktirilmagan');
    return false;
  }
  if (check.car.driver?.user.isBlocked === true) {
    log.warn({ checkId: check.id }, 'Haydovchi botni bloklagan — so\'rov yuborilmadi');
    return false;
  }

  const keyboard = await keyboardForCheck(check, telegramId);
  const text = t.driver.checkPrompt(plateOf(check), escapeHtml(formatDateTime(check.dueAt)));
  const sent = await enqueuePrompt(telegramId, truncate(text, MESSAGE_LIMIT), keyboard);
  if (sent === null) return false;

  await savePromptRef(check.id, sent.chat.id, sent.message_id);
  return true;
};

// ─────────────────────────── Javob kelgandan keyin ───────────────────────────

const notifyDriverSubmitted = async (check: CheckRequestFull): Promise<void> => {
  const telegramId = driverTelegramId(check);
  if (telegramId === null) return;
  await sendMessageSafe(telegramId, t.driver.submitted, { reply_markup: driverMenuKeyboard() });
};

/** Havola bir martalik — javob kelgach so'rov xabaridagi tugmalar olib tashlanadi. */
const clearPromptButtons = async (check: CheckRequestFull): Promise<void> => {
  if (check.promptChatId === null || check.promptMessageId === null) return;
  try {
    await requireBot().api.editMessageReplyMarkup(Number(check.promptChatId), check.promptMessageId, {});
  } catch (error) {
    log.debug({ checkId: check.id, err: describeError(error) }, "So'rov xabari tahrirlanmadi");
  }
};

/** Adminlar ko'rib chiqish kartasini oladi; rasmlar admin panelining tekshiruv bo'limida ochiladi. */
const notifyAdminsForReview = async (check: CheckRequestFull): Promise<void> => {
  const card = t.admin.checkReview(
    plateOf(check),
    escapeHtml(check.campaign.title),
    escapeHtml(driverLabel(check)),
    formatDateTime(check.submittedAt ?? check.requestedAt),
  );
  await notifyAdmins(truncate(card, MESSAGE_LIMIT));
};

/** Bir bosqich yiqilsa qolganlari baribir bajariladi — xato jim yutilmaydi, loglanadi. */
const runStep = async (checkId: string, step: string, action: () => Promise<void>): Promise<void> => {
  try {
    await action();
  } catch (error) {
    log.error({ checkId, step, err: describeError(error) }, 'Yakuniy bosqich bajarilmadi');
  }
};

/**
 * Barcha 3 rasm qabul qilingach chaqiriladi.
 * Web qatlami (upload route) buni dinamik import bilan chaqiradi, shuning uchun
 * hech qachon xato tashlamaydi — aks holda yuklash javobi buzilardi.
 */
export const onCheckSubmitted = async (checkId: string): Promise<void> => {
  let check: CheckRequestFull;
  try {
    check = await getCheckById(checkId);
  } catch (error) {
    log.error({ checkId, err: describeError(error) }, 'Tekshiruv topilmadi — hisobot yuborilmadi');
    return;
  }

  await runStep(checkId, 'driver', () => notifyDriverSubmitted(check));
  await runStep(checkId, 'prompt', () => clearPromptButtons(check));
  await runStep(checkId, 'admins', () => notifyAdminsForReview(check));
  await runStep(checkId, 'advertiser', async () => {
    await reportCheckToAdvertiser(check);
  });
};

// ─────────────────────────── Handlerlar ───────────────────────────

type PhotoSize = NonNullable<NonNullable<BotContext['message']>['photo']>[number];

/** Telegram eng katta o'lchamni oxirgi elementda beradi — sifat uchun shuni olamiz. */
const largestSize = (sizes: readonly PhotoSize[]): PhotoSize | undefined => sizes[sizes.length - 1];

/** Rasmni biriktiradi va oqimni davom ettiradi (qolgan tomonlar yoki yakuniy hisobot). */
const acceptFallbackPhoto = async (
  ctx: BotContext,
  check: CheckRequestFull,
  telegramId: number,
  photo: PhotoSize,
  side: RequiredSide,
): Promise<void> => {
  const result = await attachPhoto(check.id, {
    side,
    origin: 'TELEGRAM',
    telegramFileId: photo.file_id,
    fileUniqueId: photo.file_unique_id,
    width: photo.width,
    height: photo.height,
    sizeBytes: photo.file_size,
    verdict: env.PHOTO_VALIDATION_MODE === 'off' ? 'SKIPPED' : 'SUSPECT_NO_EXIF',
    verdictNote: t.driver.photoNoteFallback,
  });

  if (result.allSidesReceived) {
    await replySafe(ctx, t.driver.photoAllSaved);
    await onCheckSubmitted(check.id);
    return;
  }

  const keyboard = await keyboardForCheck(result.check, BigInt(telegramId));
  await replySafe(
    ctx,
    `${t.driver.photoSaved(t.side[side], remainingSideCount(result.check))}\n\n${t.driver.fallbackHint}`,
    { parse_mode: 'HTML', reply_markup: keyboard },
  );
};

/**
 * Zaxira yo'l: haydovchi rasmni to'g'ridan-to'g'ri chatga yuborsa.
 * 'strict' rejimda rad etiladi (Telegram EXIF ni o'chiradi — galereya ehtimolini ajratib bo'lmaydi),
 * aks holda qabul qilinadi, lekin SUSPECT_NO_EXIF deb belgilanadi.
 */
const handleFallbackPhoto = async (ctx: BotContext): Promise<void> => {
  const telegramId = ctx.from?.id;
  const sizes = ctx.message?.photo;
  if (telegramId === undefined || sizes === undefined) return;

  const photo = largestSize(sizes);
  if (photo === undefined) return;

  const check = await getActiveCheckForDriver(telegramId);
  if (check === null) {
    // Admin etalon rasm yuklayotgan bo'lishi mumkin — unga ortiqcha xabar bermaymiz.
    if (isAdminRole(authOf(ctx).role)) return;
    await replySafe(ctx, t.driver.noPendingChecks, { reply_markup: driverMenuKeyboard() });
    return;
  }

  if (env.PHOTO_VALIDATION_MODE === 'strict') {
    const keyboard = await keyboardForCheck(check, BigInt(telegramId));
    await replySafe(ctx, t.driver.photoRejectedStrict, { parse_mode: 'HTML', reply_markup: keyboard });
    return;
  }

  const side = nextMissingSide(check);
  if (side === null) {
    await replySafe(ctx, t.driver.checkAlreadyDone);
    return;
  }

  await acceptFallbackPhoto(ctx, check, telegramId, photo, side);
};

/** Mini App havolasi 2 soatda eskiradi, muddat esa 24 soat — haydovchi yangisini oladi. */
const handleRefresh = async (ctx: BotContext): Promise<void> => {
  const telegramId = ctx.from?.id;
  const parsed = tryParseCallback(ctx.callbackQuery?.data);
  const checkId = parsed?.parts[0];
  if (telegramId === undefined || checkId === undefined) {
    await answerSafe(ctx, t.common.error, true);
    return;
  }

  const check = await getCheckById(checkId);
  if (driverTelegramId(check) !== BigInt(telegramId)) {
    log.warn({ checkId, telegramId }, 'Begona tekshiruvga murojaat rad etildi');
    await answerSafe(ctx, t.driver.checkNotYours, true);
    return;
  }
  if (check.status !== 'PENDING') {
    await answerSafe(ctx, t.driver.checkAlreadyDone, true);
    return;
  }

  const keyboard = await keyboardForCheck(check, BigInt(telegramId));
  try {
    await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
  } catch (error) {
    log.debug({ checkId, err: describeError(error) }, 'Klaviatura yangilanmadi');
  }
  await answerSafe(ctx, t.driver.linkRefreshed);
};

/** /tekshiruv — haydovchi faol so'rovni qaytadan chaqirib oladi. */
const handleCheckCommand = async (ctx: BotContext): Promise<void> => {
  const telegramId = ctx.from?.id;
  if (telegramId === undefined) return;

  const check = await getActiveCheckForDriver(telegramId);
  if (check === null) {
    await replySafe(ctx, t.driver.noPendingChecks, { reply_markup: driverMenuKeyboard() });
    return;
  }

  const delivered = await sendCheckPrompt(check);
  if (!delivered) await replySafe(ctx, t.driver.linkFailed);
};

export const registerDriverCheckHandlers = (bot: Bot<BotContext>): void => {
  setBotForDriverCheck(bot);
  bot.command('tekshiruv', safeHandler('driver:checkCommand', handleCheckCommand));
  bot.callbackQuery(callbackPattern(CB.driverCheckRefresh), safeHandler('driver:refresh', handleRefresh));
  bot.on('message:photo', safeHandler('driver:fallbackPhoto', handleFallbackPhoto));
};
