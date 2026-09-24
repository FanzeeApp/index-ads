import type { Advertiser } from '@prisma/client';
import type { Composer } from 'grammy';

import { t } from '../../../i18n/index.js';
import {
  buildInviteLink,
  createAdvertiser,
  getAdvertiserById,
  listAdvertisers,
} from '../../../services/advertiserService.js';
import { recordAudit } from '../../../services/auditService.js';
import { escapeHtml } from '../../../utils/html.js';
import { isValidPhone, normalizePhone } from '../../../utils/phone.js';
import type { BotContext } from '../../bot.js';
import { buildCallback, callbackPattern, CB } from '../../callbacks.js';
import { advertiserCardKeyboard, advertiserListKeyboard } from '../../keyboards/admin.js';
import { backKeyboard, type ListRow } from '../../keyboards/common.js';
import { answerSafe, safeHandler } from '../guard.js';
import { advertiserSummary } from './adminQueries.js';
import { safePhone, safeText } from './format.js';
import { askText } from './prompts.js';
import {
  argAt,
  CONVERSATION,
  draw,
  enterConversation,
  pageArg,
  sendPanel,
  toListRows,
  withEmptyNotice,
  type AdminConversation,
} from './shared.js';

/** Ixtiyoriy maydonlarni o'tkazib yuborish belgisi. */
const SKIP_TOKEN = '-';

const optional = (value: string): string | undefined => (value === SKIP_TOKEN ? undefined : value);

const advertiserRow = (advertiser: Advertiser): ListRow => ({
  id: advertiser.id,
  label: t.admin.advertiserList(advertiser.companyName, advertiser.contactName ?? ''),
});

// ─────────────────────────── Ro'yxat ───────────────────────────

const showAdvertiserList = async (ctx: BotContext, page: number): Promise<void> => {
  const result = await listAdvertisers({ page });
  const rows = toListRows(result, advertiserRow);

  await draw(
    ctx,
    'panel',
    withEmptyNotice(t.admin.advertisersTitle(result.totalItems), rows.length === 0, t.common.empty),
    advertiserListKeyboard(rows, result.page, result.totalPages),
  );
};

// ─────────────────────────── Kartochka ───────────────────────────

const showAdvertiserDetail = async (ctx: BotContext, advertiserId: string): Promise<void> => {
  const [advertiser, summary] = await Promise.all([
    getAdvertiserById(advertiserId),
    advertiserSummary(advertiserId),
  ]);

  const text = t.admin.advertiserDetail({
    company: escapeHtml(advertiser.companyName),
    contact: safeText(advertiser.contactName),
    phone: safePhone(advertiser.contactPhone),
    linked: advertiser.userId ? t.common.yes : t.common.no,
    campaigns: summary.campaigns,
    activeCampaigns: summary.activeCampaigns,
    cars: summary.cars,
  });

  await draw(ctx, 'panel', text, advertiserCardKeyboard(advertiserId));
};

/** Taklif havolasi — reklama beruvchi hisobotlarni shu orqali ko'ra boshlaydi. */
const inviteText = (companyName: string, inviteCode: string | null): string => {
  const safeCompany = escapeHtml(companyName);
  if (inviteCode === null) return t.admin.advertiserNoInvite(safeCompany);
  return t.admin.advertiserCreated(safeCompany, inviteCode, buildInviteLink(inviteCode));
};

// ─────────────────────────── Suhbat: qo'shish ───────────────────────────

type CreatedAdvertiser = {
  readonly id: string;
  readonly companyName: string;
  readonly inviteCode: string | null;
};

export const advertiserCreateConversation = async (
  conversation: AdminConversation,
  ctx: BotContext,
): Promise<void> => {
  const companyName = await askText(conversation, ctx, t.admin.advertiserNamePrompt);
  if (companyName === null) return;

  const contactName = await askText(conversation, ctx, t.admin.advertiserContactPrompt);
  if (contactName === null) return;

  const phone = await askText(conversation, ctx, t.admin.advertiserPhonePrompt, {
    validate: (value) => value === SKIP_TOKEN || isValidPhone(value),
    invalidText: t.admin.phoneInvalid,
  });
  if (phone === null) return;

  const rawPhone = optional(phone);
  const actorId = ctx.auth.user?.id;

  const created = await conversation.external(async (): Promise<CreatedAdvertiser> => {
    const advertiser = await createAdvertiser({
      companyName,
      contactName: optional(contactName),
      contactPhone: rawPhone ? (normalizePhone(rawPhone) ?? rawPhone) : undefined,
    });
    await recordAudit({
      actorId,
      action: 'advertiser.create',
      entity: 'Advertiser',
      entityId: advertiser.id,
      meta: { companyName },
    });
    return {
      id: advertiser.id,
      companyName: advertiser.companyName,
      inviteCode: advertiser.inviteCode,
    };
  });

  await sendPanel(
    ctx,
    inviteText(created.companyName, created.inviteCode),
    backKeyboard(buildCallback(CB.advertiserOpen, created.id)),
  );
};

// ─────────────────────────── Handlerlar ───────────────────────────

export const registerAdvertiserHandlers = (composer: Composer<BotContext>): void => {
  composer.callbackQuery(
    callbackPattern(CB.advertiserList),
    safeHandler('admin:advertisers:list', async (ctx) => {
      await answerSafe(ctx);
      await showAdvertiserList(ctx, pageArg(ctx, 0));
    }),
  );

  composer.callbackQuery(
    callbackPattern(CB.advertiserOpen),
    safeHandler('admin:advertisers:open', async (ctx) => {
      await answerSafe(ctx);
      await showAdvertiserDetail(ctx, argAt(ctx, 0));
    }),
  );

  composer.callbackQuery(
    callbackPattern(CB.advertiserAdd),
    safeHandler('admin:advertisers:add', async (ctx) => {
      await answerSafe(ctx);
      await enterConversation(ctx, CONVERSATION.advertiserCreate);
    }),
  );

  composer.callbackQuery(
    callbackPattern(CB.advertiserInvite),
    safeHandler('admin:advertisers:invite', async (ctx) => {
      const advertiserId = argAt(ctx, 0);
      const advertiser = await getAdvertiserById(advertiserId);
      await answerSafe(ctx);
      await sendPanel(
        ctx,
        inviteText(advertiser.companyName, advertiser.inviteCode),
        backKeyboard(buildCallback(CB.advertiserOpen, advertiserId)),
      );
    }),
  );
};
