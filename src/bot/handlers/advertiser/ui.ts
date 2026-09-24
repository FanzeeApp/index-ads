/**
 * Kabinet ekranini chizish.
 * Nima uchun: callbackdan kelgan bosishda yangi xabar to'plamaslik uchun joriy
 * xabar tahrirlanadi; tahrirlash imkonsiz bo'lsa (eski xabar, media) — yangisi
 * yuboriladi. Ekran chizilgach callback "aylanishi" albatta yopiladi.
 */
import { GrammyError, type InlineKeyboard } from 'grammy';
import { describeError } from '../../../core/errors.js';
import { childLogger } from '../../../core/logger.js';
import { MESSAGE_LIMIT, truncate } from '../../../utils/html.js';
import { answerSafe } from '../guard.js';
import type { BotContext } from '../../bot.js';

const log = childLogger('bot:advertiser');

const isNotModified = (error: unknown): boolean =>
  error instanceof GrammyError && error.description.includes('message is not modified');

/** Ikkala yuborish usuli (yangi xabar va tahrir) uchun bir xil qo'shimcha parametrlar. */
const buildExtra = (keyboard: InlineKeyboard) =>
  ({
    parse_mode: 'HTML' as const,
    reply_markup: keyboard,
    link_preview_options: { is_disabled: true },
  }) as const;

type ScreenExtra = ReturnType<typeof buildExtra>;

export const showScreen = async (
  ctx: BotContext,
  text: string,
  keyboard: InlineKeyboard,
): Promise<void> => {
  await render(ctx, truncate(text, MESSAGE_LIMIT), buildExtra(keyboard));
  await answerSafe(ctx);
};

const render = async (ctx: BotContext, body: string, extra: ScreenExtra): Promise<void> => {
  if (ctx.callbackQuery === undefined) {
    await ctx.reply(body, extra);
    return;
  }

  try {
    await ctx.editMessageText(body, extra);
  } catch (error) {
    if (isNotModified(error)) return;
    log.debug({ err: describeError(error) }, "ekran tahrirlanmadi — yangi xabar yuboriladi");
    await ctx.reply(body, extra);
  }
};
