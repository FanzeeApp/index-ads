import { describeError } from '../../../core/errors.js';
import { childLogger } from '../../../core/logger.js';
import { t } from '../../../i18n/index.js';
import {
  findGrantTarget,
  findUserByTelegramId,
  grantAdminRole,
  GRANTABLE_ROLES,
  isSuperAdminActor,
  type GrantableRole,
} from '../../../services/adminService.js';
import { escapeHtml } from '../../../utils/html.js';
import type { BotContext } from '../../bot.js';
import { buildCallback, CB } from '../../callbacks.js';
import { backKeyboard, cancelButton, inlineGrid } from '../../keyboards/common.js';
import { userFacingText } from '../guard.js';
import { adminWho, isGrantableRole, notifyGranted, roleLabel } from './admins.js';
import { askChoice, askConfirm, isCancel } from './prompts.js';
import {
  FIRST_PAGE,
  MAX_INPUT_ATTEMPTS,
  sendPanel,
  type AdminConversation,
} from './shared.js';

/**
 * "Admin qo'shish" suhbati.
 *
 * Suhbat ichida `ctx.auth` ga tayanib bo'lmaydi — qayta o'ynatishda u
 * to'ldirilmagan bo'lishi mumkin. Shuning uchun aktor har safar Telegram ID
 * bo'yicha bazadan o'qiladi va superadminligi qayta tekshiriladi (R1).
 */

const log = childLogger('admin:adminGrant');

type GrantTargetView = {
  readonly id: string;
  readonly who: string;
};

type GrantOutcome =
  | { readonly ok: true; readonly who: string }
  | { readonly ok: false; readonly reason: string };

/** Suhbat ichidan qaytadigan qiymat oddiy bo'lishi shart — `User` da BigInt bor. */
const findTargetView = async (raw: string): Promise<GrantTargetView | null> => {
  const user = await findGrantTarget(raw);
  return user === null ? null : { id: user.id, who: adminWho(user) };
};

/** Forward qilingan xabardan muallifning ID si (u maxfiylikni yopmagan bo'lsa). */
const forwardedUserId = (ctx: BotContext): number | null => {
  const origin = ctx.message?.forward_origin;
  return origin !== undefined && origin.type === 'user' ? origin.sender_user.id : null;
};

const readTargetInput = (ctx: BotContext): string => {
  const forwarded = forwardedUserId(ctx);
  if (forwarded !== null) return String(forwarded);
  return ctx.message?.text?.trim() ?? '';
};

const askGrantTarget = async (
  conversation: AdminConversation,
  ctx: BotContext,
): Promise<GrantTargetView | null> => {
  await ctx.reply(t.admin.adminAddPrompt, {
    parse_mode: 'HTML',
    reply_markup: inlineGrid([cancelButton()]),
  });

  let attempts = 0;
  while (attempts < MAX_INPUT_ATTEMPTS) {
    const update = await conversation.waitFor(['message', 'callback_query:data'], {
      otherwise: (other) => other.reply(t.admin.expectedText),
    });
    if (isCancel(update)) {
      await update.reply(t.common.cancelled);
      return null;
    }
    // Eski tugma bosilgan bo'lsa urinish sarflanmaydi.
    if (update.callbackQuery !== undefined) {
      await update.answerCallbackQuery();
      continue;
    }

    attempts += 1;
    const raw = readTargetInput(update);
    const found = raw === '' ? null : await conversation.external(() => findTargetView(raw));
    if (found !== null) return found;

    if (attempts < MAX_INPUT_ATTEMPTS) {
      await update.reply(`${t.admin.adminNotFound}\n\n${t.admin.adminNotStarted}`);
    }
  }

  await ctx.reply(t.admin.tooManyAttempts);
  return null;
};

const askGrantRole = async (
  conversation: AdminConversation,
  ctx: BotContext,
  who: string,
): Promise<GrantableRole | null> => {
  const answer = await askChoice(
    conversation,
    ctx,
    t.admin.adminPickRole(escapeHtml(who)),
    GRANTABLE_ROLES.map((role) => ({ label: roleLabel(role), value: role })),
  );
  return answer !== null && isGrantableRole(answer) ? answer : null;
};

const grantFromConversation = async (
  actorTelegramId: number,
  targetUserId: string,
  role: GrantableRole,
): Promise<GrantOutcome> => {
  try {
    const actor = await findUserByTelegramId(actorTelegramId);
    if (actor === null || !isSuperAdminActor(actor)) return { ok: false, reason: t.common.forbidden };

    const updated = await grantAdminRole({ actor, targetUserId, role });
    await notifyGranted(updated, role);
    return { ok: true, who: adminWho(updated) };
  } catch (error) {
    log.warn({ targetUserId, role, err: describeError(error) }, 'Admin huquqi berilmadi');
    return { ok: false, reason: userFacingText(error) };
  }
};

export const adminGrantConversation = async (
  conversation: AdminConversation,
  ctx: BotContext,
): Promise<void> => {
  const actorTelegramId = ctx.from?.id;
  if (actorTelegramId === undefined) return;

  const allowed = await conversation.external(async () =>
    isSuperAdminActor(await findUserByTelegramId(actorTelegramId)),
  );
  if (!allowed) {
    await ctx.reply(t.common.forbidden);
    return;
  }

  const target = await askGrantTarget(conversation, ctx);
  if (target === null) return;

  const role = await askGrantRole(conversation, ctx, target.who);
  if (role === null) return;

  const confirmed = await askConfirm(
    conversation,
    ctx,
    t.admin.adminGrantConfirm(escapeHtml(target.who), roleLabel(role)),
  );
  if (!confirmed) {
    await ctx.reply(t.common.cancelled);
    return;
  }

  const outcome = await conversation.external(() =>
    grantFromConversation(actorTelegramId, target.id, role),
  );
  if (!outcome.ok) {
    await ctx.reply(outcome.reason);
    return;
  }

  await sendPanel(
    ctx,
    t.admin.adminGranted(escapeHtml(outcome.who), roleLabel(role)),
    backKeyboard(buildCallback(CB.adminList, FIRST_PAGE)),
  );
};
