import type { InlineKeyboard } from 'grammy';

import { CALLBACK_SEPARATOR, PAGE_SIZE } from '../../../config/constants.js';
import { describeError } from '../../../core/errors.js';
import { childLogger } from '../../../core/logger.js';
import { t } from '../../../i18n/index.js';
import { MESSAGE_LIMIT, truncate } from '../../../utils/html.js';
import type { BotContext } from '../../bot.js';
import { buildCallback } from '../../callbacks.js';
import {
  CANCEL_DATA,
  cancelButton,
  inlineGrid,
  inlineRows,
  type InlineButton,
  type InlineRow,
} from '../../keyboards/common.js';
import { ADMIN_CB, MAX_INPUT_ATTEMPTS, type AdminConversation } from './shared.js';

const log = childLogger('admin:prompts');

/** Matn orqali bekor qilish — tugma ishlamay qolgan holatlar uchun zaxira. */
const CANCEL_COMMANDS: readonly string[] = Object.freeze(['/cancel', '/bekor', '/stop']);

/**
 * Tanlov tugmalarining amali — boshqa handlerlar bilan to'qnashmaydi.
 * Marshrutlash filtri uni admin amali sifatida taniydi (`ADMIN_ONLY_ACTIONS`).
 */
const CHOICE_ACTION = ADMIN_CB.choice;

/** Ichki sahifalash qiymatlari; chaqiruvchi qiymatlari bu prefiksdan boshlanmasligi kerak. */
const PAGE_VALUE_PREFIX = '__p';

export type ChoiceOption = {
  readonly label: string;
  readonly value: string;
};

const cancelOnlyKeyboard = (): InlineKeyboard => inlineGrid([cancelButton()]);

const isCancel = (ctx: BotContext): boolean => {
  const data = ctx.callbackQuery?.data;
  if (data !== undefined) return data === CANCEL_DATA;
  const text = ctx.message?.text?.trim().toLowerCase() ?? '';
  return CANCEL_COMMANDS.includes(text);
};

/** Bosilgan tugmani olib tashlaydi — bir tanlov ikki marta bosilmasin. */
const dropKeyboard = async (ctx: BotContext): Promise<void> => {
  if (ctx.callbackQuery === undefined) return;
  try {
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({ reply_markup: undefined });
  } catch (error) {
    log.debug({ err: describeError(error) }, "tugmalarni olib tashlab bo'lmadi");
  }
};

const sendPrompt = async (ctx: BotContext, text: string, keyboard: InlineKeyboard): Promise<void> => {
  await ctx.reply(truncate(text, MESSAGE_LIMIT), {
    parse_mode: 'HTML',
    reply_markup: keyboard,
    link_preview_options: { is_disabled: true },
  });
};

const finishCancelled = async (ctx: BotContext): Promise<null> => {
  await dropKeyboard(ctx);
  await ctx.reply(t.common.cancelled);
  return null;
};

const finishExhausted = async (ctx: BotContext): Promise<null> => {
  await ctx.reply(t.admin.tooManyAttempts);
  return null;
};

// ─────────────────────────── Matn so'rash ───────────────────────────

export type AskTextOptions = {
  readonly validate?: (value: string) => boolean;
  readonly invalidText?: string;
  readonly maxAttempts?: number;
};

/**
 * Matn kutadi. Noto'g'ri kiritishda qayta so'raydi, chegaradan keyin oqimni to'xtatadi.
 * `null` — foydalanuvchi bekor qildi yoki urinishlar tugadi.
 */
export const askText = async (
  conversation: AdminConversation,
  ctx: BotContext,
  prompt: string,
  options: AskTextOptions = {},
): Promise<string | null> => {
  const maxAttempts = options.maxAttempts ?? MAX_INPUT_ATTEMPTS;
  await sendPrompt(ctx, prompt, cancelOnlyKeyboard());

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const update = await conversation.waitFor(['message:text', 'callback_query:data'], {
      otherwise: (other) => other.reply(t.admin.expectedText),
    });
    if (isCancel(update)) return finishCancelled(update);

    const value = update.message?.text?.trim() ?? '';
    const accepted = value.length > 0 && (options.validate?.(value) ?? true);
    if (accepted) return value;

    const isLastAttempt = attempt === maxAttempts - 1;
    if (isLastAttempt) break;
    await update.reply(options.invalidText ?? t.admin.expectedText);
  }

  return finishExhausted(ctx);
};

// ─────────────────────────── Rasm so'rash ───────────────────────────

export type AskedPhoto = {
  readonly fileId: string;
  readonly fileUniqueId: string;
};

/** Rasm kutadi. Faqat `message:photo` qabul qilinadi — hujjat/fayl emas. */
export const askPhoto = async (
  conversation: AdminConversation,
  ctx: BotContext,
  prompt: string,
): Promise<AskedPhoto | null> => {
  await sendPrompt(ctx, prompt, cancelOnlyKeyboard());

  for (let attempt = 0; attempt < MAX_INPUT_ATTEMPTS; attempt += 1) {
    const update = await conversation.waitFor(['message:photo', 'callback_query:data'], {
      otherwise: (other) => other.reply(t.admin.expectedPhoto),
    });
    if (isCancel(update)) return finishCancelled(update);

    // Telegram rasmni bir necha o'lchamda yuboradi — oxirgisi eng sifatlisi.
    const largest = update.message?.photo?.at(-1);
    if (largest) return { fileId: largest.file_id, fileUniqueId: largest.file_unique_id };

    const isLastAttempt = attempt === MAX_INPUT_ATTEMPTS - 1;
    if (isLastAttempt) break;
    await update.reply(t.admin.expectedPhoto);
  }

  return finishExhausted(ctx);
};

// ─────────────────────────── Tanlov so'rash ───────────────────────────

const choiceButton = (option: ChoiceOption): InlineButton => ({
  text: option.label,
  data: buildCallback(CHOICE_ACTION, option.value),
});

const choiceRows = (
  options: readonly ChoiceOption[],
  page: number,
  totalPages: number,
): readonly InlineRow[] => {
  const slice = options.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const optionRows: readonly InlineRow[] = slice.map((option) => [choiceButton(option)]);
  const cancelRow: InlineRow = [cancelButton()];

  if (totalPages <= 1) return [...optionRows, cancelRow];

  const prev: InlineRow =
    page > 1 ? [choiceButton({ label: t.common.prev, value: `${PAGE_VALUE_PREFIX}${page - 1}` })] : [];
  const next: InlineRow =
    page < totalPages
      ? [choiceButton({ label: t.common.next, value: `${PAGE_VALUE_PREFIX}${page + 1}` })]
      : [];
  const indicator = choiceButton({
    label: t.common.page(page, totalPages),
    value: `${PAGE_VALUE_PREFIX}${page}`,
  });

  return [...optionRows, [...prev, indicator, ...next], cancelRow];
};

/** `buildCallback` bo'sh bo'lakni rad etadi, shuning uchun prefiks qo'lda yig'iladi. */
const CHOICE_PREFIX = `${CHOICE_ACTION}${CALLBACK_SEPARATOR}`;

const readChoice = (ctx: BotContext): string | null => {
  const data = ctx.callbackQuery?.data ?? '';
  return data.startsWith(CHOICE_PREFIX) ? data.slice(CHOICE_PREFIX.length) : null;
};

/**
 * Tugmalardan bittasini tanlashni kutadi. Variantlar ko'p bo'lsa o'zi sahifalaydi;
 * sahifa almashtirish urinish sifatida hisoblanmaydi.
 */
export const askChoice = async (
  conversation: AdminConversation,
  ctx: BotContext,
  prompt: string,
  options: readonly ChoiceOption[],
): Promise<string | null> => {
  const totalPages = Math.max(1, Math.ceil(options.length / PAGE_SIZE));
  let page = 1;
  await sendPrompt(ctx, prompt, inlineRows(choiceRows(options, page, totalPages)));

  for (;;) {
    const update = await conversation.waitFor('callback_query:data', {
      otherwise: (other) => other.reply(t.admin.expectedChoice),
    });
    if (isCancel(update)) return finishCancelled(update);

    const value = readChoice(update);
    if (value === null) continue;

    if (!value.startsWith(PAGE_VALUE_PREFIX)) {
      await dropKeyboard(update);
      return value;
    }

    page = Number.parseInt(value.slice(PAGE_VALUE_PREFIX.length), 10) || 1;
    await update.answerCallbackQuery();
    await update.editMessageReplyMarkup({
      reply_markup: inlineRows(choiceRows(options, page, totalPages)),
    });
  }
};

const CONFIRM_YES = 'y';
const CONFIRM_NO = 'n';

/** Ha/Yo'q so'raydi. Bekor qilish ham "yo'q" deb hisoblanadi. */
export const askConfirm = async (
  conversation: AdminConversation,
  ctx: BotContext,
  prompt: string,
): Promise<boolean> => {
  const answer = await askChoice(conversation, ctx, prompt, [
    { label: t.common.confirm, value: CONFIRM_YES },
    { label: t.common.cancel, value: CONFIRM_NO },
  ]);
  return answer === CONFIRM_YES;
};
