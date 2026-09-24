import { CheckStatus, type Photo } from '@prisma/client';
import type { Composer } from 'grammy';
import type { InputMediaPhoto } from 'grammy/types';

import { DISPATCH_BATCH_SIZE, REQUIRED_SIDES } from '../../../config/constants.js';
import { describeError } from '../../../core/errors.js';
import { childLogger } from '../../../core/logger.js';
import { t } from '../../../i18n/index.js';
import { recordAudit } from '../../../services/auditService.js';
import {
  approveCheck,
  createCheckRequest,
  getCheckById,
  listChecks,
  rejectCheck,
  type CheckRequestFull,
  type PlacementWithRelations,
} from '../../../services/checkService.js';
import { sendMessageSafe } from '../../../services/notifyService.js';
import { reportCheckToAdvertiser } from '../../../services/reportService.js';
import { CAPTION_LIMIT, escapeHtml, truncate } from '../../../utils/html.js';
import { formatPlate } from '../../../utils/plate.js';
import { formatDateTime } from '../../../utils/time.js';
import type { BotContext } from '../../bot.js';
import { buildCallback, callbackPattern, CB } from '../../callbacks.js';
import { checkListKeyboard, checkReviewKeyboard, LIST_FILTER_ALL } from '../../keyboards/admin.js';
import { backKeyboard, type ListRow } from '../../keyboards/common.js';
import { sendCheckPrompt } from '../driver/check.js';
import { answerSafe, safeHandler } from '../guard.js';
import { activeCampaignOptions, activePlacementsForCampaign } from './adminQueries.js';
import { checkStatusLabel, displayName, safePlate, sideLabel } from './format.js';
import { askChoice, askConfirm, askText } from './prompts.js';
import {
  argAt,
  CONVERSATION,
  draw,
  enterConversation,
  FIRST_PAGE,
  pageArg,
  readDraftString,
  sendPanel,
  toListRows,
  withEmptyNotice,
  type AdminConversation,
} from './shared.js';

const log = childLogger('admin:checks');

/** `checkId` rad etish suhbatiga sessiya qoralamasi orqali uzatiladi. */
const CHECK_DRAFT_KEY = 'checkId';

type CheckFilter = CheckStatus | typeof LIST_FILTER_ALL;

const isCheckStatus = (value: string): value is CheckStatus =>
  Object.values(CheckStatus).includes(value as CheckStatus);

const readFilter = (ctx: BotContext): CheckFilter => {
  const raw = argAt(ctx, 0);
  return isCheckStatus(raw) ? raw : LIST_FILTER_ALL;
};

const driverNameOf = (check: CheckRequestFull): string =>
  check.car.driver === null
    ? t.admin.carNoDriver
    : displayName({
        fullName: check.car.driver.fullName,
        firstName: check.car.driver.user.firstName,
        lastName: check.car.driver.user.lastName,
        username: check.car.driver.user.username,
      });

const checkRow = (check: CheckRequestFull): ListRow => ({
  id: check.id,
  label: t.admin.checkList(
    formatPlate(check.car.plateNumber),
    check.campaign.title,
    checkStatusLabel(check.status),
  ),
});

// ─────────────────────────── Ro'yxat ───────────────────────────

const showCheckList = async (ctx: BotContext, filter: CheckFilter, page: number): Promise<void> => {
  const result = await listChecks(
    filter === LIST_FILTER_ALL ? { page } : { page, status: filter },
  );
  const rows = toListRows(result, checkRow);
  const header = t.admin.checksTitle(
    filter === LIST_FILTER_ALL ? t.kb.filterAll : checkStatusLabel(filter),
    result.totalItems,
  );

  await draw(
    ctx,
    'panel',
    withEmptyNotice(header, rows.length === 0, t.common.empty),
    checkListKeyboard(rows, result.page, result.totalPages, filter),
  );
};

// ─────────────────────────── Kartochka ───────────────────────────

/** Har bir tomondan eng oxirgi rasm — qayta yuborilgan bo'lsa yangisi ko'rsatiladi. */
const orderedPhotos = (photos: readonly Photo[]): readonly Photo[] =>
  REQUIRED_SIDES.flatMap((side) => {
    const latest = photos.filter((photo) => photo.side === side && photo.telegramFileId).at(-1);
    return latest ? [latest] : [];
  });

const toAlbum = (check: CheckRequestFull, photos: readonly Photo[]): readonly InputMediaPhoto[] =>
  photos.flatMap((photo) => {
    if (photo.telegramFileId === null) return [];
    const caption = t.advertiser.photoCaption(
      safePlate(check.car.plateNumber),
      sideLabel(photo.side),
      formatDateTime(photo.takenAt ?? photo.createdAt),
    );
    return [
      {
        type: 'photo' as const,
        media: photo.telegramFileId,
        caption: truncate(caption, CAPTION_LIMIT),
        parse_mode: 'HTML' as const,
      },
    ];
  });

const showCheckDetail = async (ctx: BotContext, checkId: string): Promise<void> => {
  const check = await getCheckById(checkId);
  const photos = orderedPhotos(check.photos);

  if (photos.length > 0) {
    await ctx.replyWithMediaGroup([...toAlbum(check, photos)]);
  }

  const text = t.admin.checkReview(
    safePlate(check.car.plateNumber),
    escapeHtml(check.campaign.title),
    escapeHtml(driverNameOf(check)),
    formatDateTime(check.submittedAt ?? check.requestedAt),
  );
  const body = photos.length === 0 ? `${text}\n\n${t.admin.checkNoPhotos}` : text;

  // Ko'rib chiqish tugmalari faqat haydovchi rasm yuborgan tekshiruvda ma'noga ega.
  const keyboard =
    check.status === CheckStatus.SUBMITTED
      ? checkReviewKeyboard(check.id)
      : backKeyboard(buildCallback(CB.checkList, LIST_FILTER_ALL, FIRST_PAGE));

  await sendPanel(ctx, body, keyboard);
};

// ─────────────────────────── Haydovchi va reklama beruvchi ───────────────────────────

const notifyDriver = async (check: CheckRequestFull, text: string): Promise<void> => {
  const telegramId = check.car.driver?.user.telegramId;
  if (telegramId === undefined || telegramId === null) {
    log.warn({ checkId: check.id }, 'haydovchi Telegramga ulanmagan — xabar yuborilmadi');
    return;
  }
  await sendMessageSafe(telegramId, text, { parse_mode: 'HTML' });
};

/** Hisobot ikki marta ketmasligi uchun faqat hali yuborilmagan tekshiruv uzatiladi. */
const reportIfNeeded = async (check: CheckRequestFull): Promise<void> => {
  if (check.reportedAt !== null) return;
  await reportCheckToAdvertiser(check);
};

// ─────────────────────────── Suhbat: rad etish ───────────────────────────

export const checkRejectConversation = async (
  conversation: AdminConversation,
  ctx: BotContext,
): Promise<void> => {
  const checkId = await conversation.external(() => readDraftString(ctx, CHECK_DRAFT_KEY));
  if (!checkId) {
    await ctx.reply(t.common.notFound);
    return;
  }

  const reason = await askText(conversation, ctx, t.admin.checkRejectReason);
  if (reason === null) return;

  const reviewerId = ctx.auth.user?.id ?? '';
  const check = await conversation.external(async () => {
    const rejected = await rejectCheck(checkId, reviewerId, reason);
    await recordAudit({
      actorId: reviewerId,
      action: 'check.reject',
      entity: 'CheckRequest',
      entityId: checkId,
      meta: { reason },
    });
    await notifyDriver(
      rejected,
      t.driver.rejected(safePlate(rejected.car.plateNumber), escapeHtml(reason)),
    );
    return { plate: rejected.car.plateNumber };
  });

  await sendPanel(
    ctx,
    `${t.admin.checkRejected}\n${escapeHtml(formatPlate(check.plate))}`,
    backKeyboard(buildCallback(CB.checkList, LIST_FILTER_ALL, FIRST_PAGE)),
  );
};

// ─────────────────────────── Suhbat: qo'lda yuborish ───────────────────────────

/**
 * Joylashuv allaqachon kerakli bog'lanishlarni olib keladi, shuning uchun
 * `CheckRequestFull` ni qo'shimcha so'rovsiz yig'amiz.
 * Bitta haydovchidagi xato butun yuborishni to'xtatmasligi kerak.
 */
const dispatchOne = async (placement: PlacementWithRelations): Promise<boolean> => {
  try {
    const check = await createCheckRequest(placement);
    const full: CheckRequestFull = {
      ...check,
      photos: [],
      car: placement.car,
      campaign: placement.campaign,
    };
    return await sendCheckPrompt(full);
  } catch (error) {
    log.error(
      { err: describeError(error), placementId: placement.id },
      "qo'lda tekshiruv yuborilmadi",
    );
    return false;
  }
};

const dispatchCampaign = async (campaignId: string, actorId: string | undefined): Promise<number> => {
  const placements = await activePlacementsForCampaign(campaignId, DISPATCH_BATCH_SIZE);

  // Ketma-ket: 300 ta parallel yozuv baza ulanishlar havzasini tugatib qo'yadi.
  let sent = 0;
  for (const placement of placements) {
    const delivered = await dispatchOne(placement);
    if (delivered) sent += 1;
  }

  await recordAudit({
    actorId,
    action: 'check.manualDispatch',
    entity: 'Campaign',
    entityId: campaignId,
    meta: { placements: placements.length, sent },
  });

  return sent;
};

export const checkRunConversation = async (
  conversation: AdminConversation,
  ctx: BotContext,
): Promise<void> => {
  const options = await conversation.external(() =>
    activeCampaignOptions().then((rows) => rows.map((row) => ({ label: row.title, value: row.id }))),
  );
  if (options.length === 0) {
    await ctx.reply(t.admin.checkForceNoCampaigns);
    return;
  }

  const campaignId = await askChoice(conversation, ctx, t.admin.checkForceCampaignPrompt, options);
  if (campaignId === null) return;

  const total = await conversation.external(() =>
    activePlacementsForCampaign(campaignId, DISPATCH_BATCH_SIZE).then(
      (placements) => placements.length,
    ),
  );
  if (total === 0) {
    await ctx.reply(t.admin.campaignNoCars);
    return;
  }

  const confirmed = await askConfirm(conversation, ctx, t.admin.checkForceConfirm(total));
  if (!confirmed) {
    await ctx.reply(t.common.cancelled);
    return;
  }

  await ctx.reply(t.admin.checkForceStarted);

  const actorId = ctx.auth.user?.id;
  const sent = await conversation.external(() => dispatchCampaign(campaignId, actorId));

  await sendPanel(
    ctx,
    t.admin.checkSentManual(sent),
    backKeyboard(buildCallback(CB.campaignOpen, campaignId)),
  );
};

// ─────────────────────────── Handlerlar ───────────────────────────

export const registerCheckHandlers = (composer: Composer<BotContext>): void => {
  composer.callbackQuery(
    callbackPattern(CB.checkList),
    safeHandler('admin:checks:list', async (ctx) => {
      await answerSafe(ctx);
      await showCheckList(ctx, readFilter(ctx), pageArg(ctx, 1));
    }),
  );

  composer.callbackQuery(
    callbackPattern(CB.checkOpen),
    safeHandler('admin:checks:open', async (ctx) => {
      await answerSafe(ctx);
      await showCheckDetail(ctx, argAt(ctx, 0));
    }),
  );

  composer.callbackQuery(
    callbackPattern(CB.checkApprove),
    safeHandler('admin:checks:approve', async (ctx) => {
      const checkId = argAt(ctx, 0);
      const reviewerId = ctx.auth.user?.id ?? '';
      const check = await approveCheck(checkId, reviewerId);

      await recordAudit({
        actorId: reviewerId,
        action: 'check.approve',
        entity: 'CheckRequest',
        entityId: checkId,
      });
      await notifyDriver(check, t.driver.approved(safePlate(check.car.plateNumber)));
      await reportIfNeeded(check);

      await answerSafe(ctx, t.admin.checkApproved);
      await showCheckList(ctx, CheckStatus.SUBMITTED, FIRST_PAGE);
    }),
  );

  composer.callbackQuery(
    callbackPattern(CB.checkReject),
    safeHandler('admin:checks:reject', async (ctx) => {
      await answerSafe(ctx);
      await enterConversation(ctx, CONVERSATION.checkReject, { [CHECK_DRAFT_KEY]: argAt(ctx, 0) });
    }),
  );

  composer.callbackQuery(
    callbackPattern(CB.checkRun),
    safeHandler('admin:checks:run', async (ctx) => {
      await answerSafe(ctx);
      await enterConversation(ctx, CONVERSATION.checkRun);
    }),
  );
};
