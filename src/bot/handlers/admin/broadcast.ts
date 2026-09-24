import type { Composer } from 'grammy';

import { t } from '../../../i18n/index.js';
import { recordAudit } from '../../../services/auditService.js';
import { broadcast } from '../../../services/notifyService.js';
import { escapeHtml, MESSAGE_LIMIT, truncate } from '../../../utils/html.js';
import type { BotContext } from '../../bot.js';
import { callbackPattern, CB } from '../../callbacks.js';
import { broadcastAudienceKeyboard, BROADCAST_AUDIENCE } from '../../keyboards/admin.js';
import { backKeyboard } from '../../keyboards/common.js';
import { answerSafe, safeHandler } from '../guard.js';
import { audienceChatIds, type BroadcastAudience } from './adminQueries.js';
import { askConfirm, askText } from './prompts.js';
import {
  argAt,
  CONVERSATION,
  enterConversation,
  readDraftString,
  renderPanel,
  sendPanel,
  type AdminConversation,
} from './shared.js';

/** Ko'rib chiqishda ko'rsatiladigan matn uzunligi — to'liq matn baribir yuboriladi. */
const PREVIEW_LIMIT = 600;

const AUDIENCE_DRAFT_KEY = 'broadcastAudience';

/** Klaviatura kodlarini so'rov filtriga bog'laydi. */
const AUDIENCE_BY_CODE: Readonly<Record<string, BroadcastAudience>> = Object.freeze({
  [BROADCAST_AUDIENCE.all]: 'ALL',
  [BROADCAST_AUDIENCE.drivers]: 'DRIVERS',
  [BROADCAST_AUDIENCE.advertisers]: 'ADVERTISERS',
});

const toAudience = (code: string): BroadcastAudience | null => AUDIENCE_BY_CODE[code] ?? null;

/** Bazadagi satrlarni Telegram chat id lariga aylantiradi. */
const toChatIds = (raw: readonly string[]): readonly bigint[] =>
  raw.flatMap((value) => {
    try {
      return [BigInt(value)];
    } catch {
      return [];
    }
  });

export const broadcastConversation = async (
  conversation: AdminConversation,
  ctx: BotContext,
): Promise<void> => {
  const audienceCode = await conversation.external(() => readDraftString(ctx, AUDIENCE_DRAFT_KEY));
  const audience = toAudience(audienceCode);
  if (audience === null) {
    await ctx.reply(t.admin.broadcastNoAudience);
    return;
  }

  const message = await askText(conversation, ctx, t.admin.broadcastPrompt, {
    validate: (value) => value.length <= MESSAGE_LIMIT,
    invalidText: t.admin.broadcastTooLong(MESSAGE_LIMIT),
  });
  if (message === null) return;

  const chatIds = await conversation.external(() => audienceChatIds(audience));
  if (chatIds.length === 0) {
    await ctx.reply(t.admin.broadcastNoAudience);
    return;
  }

  await ctx.reply(t.admin.broadcastPreview(escapeHtml(truncate(message, PREVIEW_LIMIT)), chatIds.length), {
    parse_mode: 'HTML',
  });

  const confirmed = await askConfirm(conversation, ctx, t.admin.broadcastConfirm(chatIds.length));
  if (!confirmed) {
    await ctx.reply(t.common.cancelled);
    return;
  }

  // Yuborish uzoq davom etadi — admin darhol javob oladi.
  await ctx.reply(t.admin.broadcastStarted(chatIds.length));

  const actorId = ctx.auth.user?.id;
  // Matn foydalanuvchi yozgani uchun parse_mode ATAYLAB o'chiriladi:
  // `sendMessageSafe` standart holda 'HTML' qo'yadi, `<` kabi belgi esa
  // butun yuborishni (barcha qabul qiluvchilar uchun) buzib qo'yardi.
  const result = await conversation.external(async () => {
    const outcome = await broadcast(toChatIds(chatIds), message, { parse_mode: undefined });
    await recordAudit({ actorId, action: 'broadcast.send', meta: { audience, ...outcome } });
    return outcome;
  });

  await sendPanel(ctx, t.admin.broadcastDone(result.sent, result.failed), backKeyboard());
};

export const registerBroadcastHandlers = (composer: Composer<BotContext>): void => {
  composer.callbackQuery(
    callbackPattern(CB.broadcastAudience),
    safeHandler('admin:broadcast', async (ctx) => {
      await answerSafe(ctx);
      const code = argAt(ctx, 0);

      if (code === '') {
        await renderPanel(ctx, t.admin.broadcastAudience, broadcastAudienceKeyboard());
        return;
      }

      if (toAudience(code) === null) {
        await answerSafe(ctx, t.common.error, true);
        return;
      }

      await enterConversation(ctx, CONVERSATION.broadcast, { [AUDIENCE_DRAFT_KEY]: code });
    }),
  );
};
