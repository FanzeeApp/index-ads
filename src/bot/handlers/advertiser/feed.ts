/**
 * "Jonli hisobot" — kampaniya bo'yicha oxirgi tasdiqlangan tekshiruvlar va rasmlari.
 * Nima uchun: reklama beruvchi reklamasi hozir mashinada turganiga o'z ko'zi bilan
 * ishonch hosil qiladi. Ekranda faqat mashina raqami va vaqt — haydovchining
 * shaxsiy ma'lumoti (telefon, username, ism) hech qachon ko'rsatilmaydi.
 */
import type { Composer } from 'grammy';
import { ForbiddenError, ValidationError } from '../../../core/errors.js';
import { t } from '../../../i18n/index.js';
import { listCampaigns, type CampaignWithCounts } from '../../../services/campaignService.js';
import { sendMediaGroupSafe } from '../../../services/notifyService.js';
import { escapeHtml } from '../../../utils/html.js';
import { formatDateTime } from '../../../utils/time.js';
import { backButton, listKeyboard, menuButton } from '../../keyboards/common.js';
import type { ListRow } from '../../keyboards/common.js';
import { answerSafe, replySafe, safeHandler } from '../guard.js';
import { ACTION, DATA, PATTERN, isFeedPicker, readId, readPage } from './callbacks.js';
import { FIRST_PAGE, LIVE_FEED_LIMIT } from './constants.js';
import { assertOwnsCampaign, requireAdvertiser } from './access.js';
import { findCheckPhotos, findRecentApprovedChecks } from './queries.js';
import type { CheckPhotoSet, FeedEntry } from './queries.js';
import { showScreen } from './ui.js';
import type { BotContext } from '../../bot.js';

/** Kampaniya tanlash ekrani — jonli hisobot qaysi kampaniya bo'yicha ko'riladi. */
const showFeedPicker = async (ctx: BotContext, page: number): Promise<void> => {
  const advertiser = await requireAdvertiser(ctx);
  const result = await listCampaigns({ page, advertiserId: advertiser.id });

  const text = result.items.length === 0 ? t.advertiser.noCampaigns : t.advertiser.pickCampaign;
  const keyboard = listKeyboard({
    rows: result.items.map(toCampaignRow),
    openAction: ACTION.feed,
    pagination: {
      action: ACTION.feed,
      page: result.page,
      totalPages: result.totalPages,
      args: ACTION.feedPickerArgs,
    },
    footerRows: [[backButton(DATA.menu), menuButton()]],
  });

  await showScreen(ctx, text, keyboard);
};

const toCampaignRow = (campaign: CampaignWithCounts): ListRow => ({
  id: campaign.id,
  label: `${t.status.campaign[campaign.status]} ${campaign.title}`,
});

/** Tanlangan kampaniya bo'yicha oxirgi tasdiqlangan tekshiruvlar. */
const showFeed = async (ctx: BotContext): Promise<void> => {
  const advertiser = await requireAdvertiser(ctx);
  const campaignId = readId(ctx);
  // IDOR himoyasi: kampaniya aynan shu reklama beruvchiniki ekani qayta tekshiriladi.
  const campaign = await assertOwnsCampaign(advertiser.id, campaignId);

  const entries = await findRecentApprovedChecks(advertiser.id, campaign.id, LIVE_FEED_LIMIT);
  const header = t.advertiser.feedTitle(escapeHtml(campaign.title));
  const body =
    entries.length === 0
      ? t.advertiser.feedEmpty
      : `${t.advertiser.feedHint}\n\n${entries.map(renderEntry).join('\n')}`;

  const keyboard = listKeyboard({
    rows: entries.map(toPhotoRow),
    openAction: ACTION.photos,
    footerRows: [[backButton(DATA.feedPicker(FIRST_PAGE)), menuButton()]],
  });

  await showScreen(ctx, `${header}\n\n${body}`, keyboard);
};

const renderEntry = (entry: FeedEntry): string =>
  t.advertiser.feedItem(escapeHtml(entry.plateNumber), formatDateTime(entry.confirmedAt));

const toPhotoRow = (entry: FeedEntry): ListRow => ({
  id: entry.checkId,
  label: t.advertiser.feedPhotoButton(entry.plateNumber, formatDateTime(entry.confirmedAt)),
});

/** Rasmlarni yuboradi va oxirida callback "aylanishi"ni yopadi. */
const sendCheckPhotos = async (ctx: BotContext): Promise<void> => {
  await deliverPhotos(ctx);
  await answerSafe(ctx);
};

/** Tanlangan tekshiruv rasmlarini albom qilib yuboradi. */
const deliverPhotos = async (ctx: BotContext): Promise<void> => {
  const advertiser = await requireAdvertiser(ctx);
  const checkId = readId(ctx);

  // So'rovning o'zi advertiserId bilan cheklangan — begona tekshiruv umuman qaytmaydi.
  const photoSet = await findCheckPhotos(advertiser.id, checkId);
  if (photoSet === null) throw new ForbiddenError(t.common.forbidden, { checkId });

  if (photoSet.photos.length === 0) {
    await replySafe(ctx, t.advertiser.photosEmpty);
    return;
  }

  const chatId = ctx.chat?.id;
  if (chatId === undefined) throw new ValidationError(t.common.error, { reason: 'chat aniqlanmadi' });

  const sent = await sendMediaGroupSafe(chatId, buildAlbum(photoSet));
  if (!sent) await replySafe(ctx, t.advertiser.photosFailed);
};

/** Albom: tomonlar tartibida, izohda mashina raqami va vaqt (oddiy matn — HTML emas). */
const buildAlbum = (photoSet: CheckPhotoSet): readonly { fileId: string; caption: string }[] =>
  photoSet.photos.map((photo) => ({
    fileId: photo.fileId,
    caption: t.advertiser.photoCaption(
      photoSet.plateNumber,
      t.side[photo.side],
      formatDateTime(photoSet.confirmedAt),
    ),
  }));

/**
 * Jonli hisobotning ikki ekrani bitta amalni bo'lishadi, shuning uchun
 * marker bo'yicha ajratiladi (kampaniya tanlash yoki tanlangan kampaniya lentasi).
 */
const routeFeed = async (ctx: BotContext): Promise<void> => {
  if (isFeedPicker(ctx)) {
    await showFeedPicker(ctx, readPage(ctx, 1));
    return;
  }
  await showFeed(ctx);
};

/** Jonli hisobot marshrutlarini ulaydi. */
export const registerFeedHandlers = (composer: Composer<BotContext>): void => {
  composer.callbackQuery(PATTERN.feed, safeHandler('advertiser:feed', routeFeed));
  composer.callbackQuery(PATTERN.photos, safeHandler('advertiser:photos', sendCheckPhotos));
  composer.hears(
    t.advertiser.liveFeed,
    safeHandler('advertiser:feed', (ctx) => showFeedPicker(ctx, FIRST_PAGE)),
  );
};
