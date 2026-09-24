import { CampaignStatus } from '@prisma/client';
import type { Composer } from 'grammy';

import { t } from '../../../i18n/index.js';
import { getAdvertiserById } from '../../../services/advertiserService.js';
import { recordAudit } from '../../../services/auditService.js';
import {
  attachCars,
  campaignStats,
  createCampaign,
  getCampaignById,
  listCampaigns,
  setCampaignStatus,
  type CampaignWithCounts,
} from '../../../services/campaignService.js';
import { escapeHtml } from '../../../utils/html.js';
import { formatPlate, parsePlateList } from '../../../utils/plate.js';
import type { BotContext } from '../../bot.js';
import { buildCallback, callbackPattern, CB } from '../../callbacks.js';
import { campaignCardKeyboard, campaignListKeyboard } from '../../keyboards/admin.js';
import { backKeyboard, type ListRow } from '../../keyboards/common.js';
import { answerSafe, safeHandler } from '../guard.js';
import { activeCarIds, advertiserOptions, resolvePlates } from './adminQueries.js';
import { campaignStatusLabel, safeText } from './format.js';
import { askChoice, askText } from './prompts.js';
import {
  argAt,
  CONVERSATION,
  draw,
  enterConversation,
  pageArg,
  readDraftString,
  sendPanel,
  toListRows,
  withEmptyNotice,
  type AdminConversation,
} from './shared.js';

/** Barcha faol mashinalarni biriktirish kalit so'zi (so'rov matnida ham shunday yozilgan). */
const ALL_CARS_TOKEN = 'HAMMASI';

const SKIP_TOKEN = '-';

const campaignRow = (campaign: CampaignWithCounts): ListRow => ({
  id: campaign.id,
  label: t.admin.campaignList(
    campaign.title,
    campaignStatusLabel(campaign.status),
    campaign._count.placements,
  ),
});

// ─────────────────────────── Ro'yxat ───────────────────────────

const showCampaignList = async (
  ctx: BotContext,
  page: number,
  advertiserId?: string,
): Promise<void> => {
  const result = await listCampaigns(advertiserId ? { page, advertiserId } : { page });
  const rows = toListRows(result, campaignRow);

  await draw(
    ctx,
    'panel',
    withEmptyNotice(t.admin.campaignsTitle(result.totalItems), rows.length === 0, t.common.empty),
    campaignListKeyboard(rows, result.page, result.totalPages),
  );
};

// ─────────────────────────── Kartochka ───────────────────────────

const showCampaignDetail = async (ctx: BotContext, campaignId: string): Promise<void> => {
  const campaign = await getCampaignById(campaignId);
  const [advertiser, stats] = await Promise.all([
    getAdvertiserById(campaign.advertiserId),
    campaignStats(campaignId),
  ]);

  const text = t.admin.campaignDetail({
    title: escapeHtml(campaign.title),
    advertiser: escapeHtml(advertiser.companyName),
    description: safeText(campaign.description),
    status: campaignStatusLabel(campaign.status),
    cars: stats.cars,
    approved: stats.approved,
    pending: stats.pending,
    expired: stats.expired,
    rate: stats.rate,
  });

  await draw(ctx, 'panel', text, campaignCardKeyboard(campaignId, campaign.status));
};

const isCampaignStatus = (value: string): value is CampaignStatus =>
  Object.values(CampaignStatus).includes(value as CampaignStatus);

/**
 * Callback javobi oddiy matn sifatida ko'rsatiladi (HTML qo'llanmaydi),
 * shuning uchun bu yerda faqat holat yorlig'i beriladi — batafsil matn kartochkada.
 */
const statusNotice = (status: CampaignStatus): string =>
  `${campaignStatusLabel(status)} — ${t.admin.actionDone}`;

// ─────────────────────────── Mashina tanlash ───────────────────────────

type CarSelection = {
  readonly carIds: readonly string[];
  readonly missingPlates: readonly string[];
};

/** "HAMMASI" — barcha faol mashinalar; aks holda kiritilgan davlat raqamlari. */
const selectCars = async (
  conversation: AdminConversation,
  ctx: BotContext,
): Promise<CarSelection | null> => {
  const raw = await askText(conversation, ctx, t.admin.campaignCarsPrompt);
  if (raw === null) return null;

  if (raw.trim().toUpperCase() === ALL_CARS_TOKEN) {
    const carIds = await conversation.external(() => activeCarIds());
    return { carIds, missingPlates: [] };
  }

  const plates = parsePlateList(raw);
  return conversation.external(() => resolvePlates(plates));
};

const reportMissingPlates = async (ctx: BotContext, plates: readonly string[]): Promise<void> => {
  if (plates.length === 0) return;
  const formatted = plates.map((plate) => escapeHtml(formatPlate(plate))).join(', ');
  await ctx.reply(t.admin.campaignMissingPlates(formatted), { parse_mode: 'HTML' });
};

// ─────────────────────────── Suhbat: qo'shish ───────────────────────────

const pickAdvertiser = async (
  conversation: AdminConversation,
  ctx: BotContext,
): Promise<string | null> => {
  const options = await conversation.external(() =>
    advertiserOptions().then((rows) =>
      rows.map((row) => ({ label: row.companyName, value: row.id })),
    ),
  );

  if (options.length === 0) {
    await ctx.reply(t.admin.campaignNoAdvertisers);
    return null;
  }

  return askChoice(conversation, ctx, t.admin.campaignAdvertiserPrompt, options);
};

export const campaignCreateConversation = async (
  conversation: AdminConversation,
  ctx: BotContext,
): Promise<void> => {
  const advertiserId = await pickAdvertiser(conversation, ctx);
  if (advertiserId === null) return;

  const title = await askText(conversation, ctx, t.admin.campaignTitlePrompt);
  if (title === null) return;

  const description = await askText(conversation, ctx, t.admin.campaignDescPrompt);
  if (description === null) return;

  const selection = await selectCars(conversation, ctx);
  if (selection === null) return;

  await reportMissingPlates(ctx, selection.missingPlates);
  if (selection.carIds.length === 0) {
    await ctx.reply(t.admin.campaignNoCars);
    return;
  }

  const actorId = ctx.auth.user?.id;
  const created = await conversation.external(async () => {
    const campaign = await createCampaign({
      advertiserId,
      title,
      description: description === SKIP_TOKEN ? undefined : description,
    });
    const attached = await attachCars(campaign.id, selection.carIds);
    await recordAudit({
      actorId,
      action: 'campaign.create',
      entity: 'Campaign',
      entityId: campaign.id,
      meta: { title, cars: attached },
    });
    return { id: campaign.id, attached };
  });

  await sendPanel(
    ctx,
    t.admin.campaignCreated(escapeHtml(title), created.attached),
    backKeyboard(buildCallback(CB.campaignOpen, created.id)),
  );
};

/** Mavjud kampaniyaga qo'shimcha mashina biriktirish. */
export const campaignCarsConversation = async (
  conversation: AdminConversation,
  ctx: BotContext,
): Promise<void> => {
  const campaignId = await conversation.external(() => readDraftString(ctx, 'campaignId'));
  if (!campaignId) {
    await ctx.reply(t.common.notFound);
    return;
  }

  const selection = await selectCars(conversation, ctx);
  if (selection === null) return;

  await reportMissingPlates(ctx, selection.missingPlates);
  if (selection.carIds.length === 0) {
    await ctx.reply(t.admin.campaignNoCars);
    return;
  }

  const actorId = ctx.auth.user?.id;
  const attached = await conversation.external(async () => {
    const count = await attachCars(campaignId, selection.carIds);
    await recordAudit({
      actorId,
      action: 'campaign.attachCars',
      entity: 'Campaign',
      entityId: campaignId,
      meta: { cars: count },
    });
    return count;
  });

  await sendPanel(
    ctx,
    t.admin.campaignCarsAttached(attached),
    backKeyboard(buildCallback(CB.campaignOpen, campaignId)),
  );
};

// ─────────────────────────── Handlerlar ───────────────────────────

const registerListHandlers = (composer: Composer<BotContext>): void => {
  composer.callbackQuery(
    callbackPattern(CB.campaignList),
    safeHandler('admin:campaigns:list', async (ctx) => {
      await answerSafe(ctx);
      await showCampaignList(ctx, pageArg(ctx, 0));
    }),
  );

  composer.callbackQuery(
    callbackPattern(CB.advertiserCampaigns),
    safeHandler('admin:campaigns:byAdvertiser', async (ctx) => {
      await answerSafe(ctx);
      await showCampaignList(ctx, pageArg(ctx, 1), argAt(ctx, 0));
    }),
  );

  composer.callbackQuery(
    callbackPattern(CB.campaignOpen),
    safeHandler('admin:campaigns:open', async (ctx) => {
      await answerSafe(ctx);
      await showCampaignDetail(ctx, argAt(ctx, 0));
    }),
  );
};

const registerEditHandlers = (composer: Composer<BotContext>): void => {
  composer.callbackQuery(
    callbackPattern(CB.campaignAdd),
    safeHandler('admin:campaigns:add', async (ctx) => {
      await answerSafe(ctx);
      await enterConversation(ctx, CONVERSATION.campaignCreate);
    }),
  );

  composer.callbackQuery(
    callbackPattern(CB.campaignCars),
    safeHandler('admin:campaigns:cars', async (ctx) => {
      await answerSafe(ctx);
      await enterConversation(ctx, CONVERSATION.campaignCars, { campaignId: argAt(ctx, 0) });
    }),
  );

  composer.callbackQuery(
    callbackPattern(CB.campaignStatus),
    safeHandler('admin:campaigns:status', async (ctx) => {
      const campaignId = argAt(ctx, 0);
      const status = argAt(ctx, 1);
      if (!isCampaignStatus(status)) {
        await answerSafe(ctx, t.common.error, true);
        return;
      }

      await setCampaignStatus(campaignId, status);
      await recordAudit({
        actorId: ctx.auth.user?.id,
        action: 'campaign.status',
        entity: 'Campaign',
        entityId: campaignId,
        meta: { status },
      });

      await answerSafe(ctx, statusNotice(status));
      await showCampaignDetail(ctx, campaignId);
    }),
  );
};

export const registerCampaignHandlers = (composer: Composer<BotContext>): void => {
  registerListHandlers(composer);
  registerEditHandlers(composer);
};
