/**
 * Kabinet menyusi va "Kampaniyalarim" ekrani.
 * Nima uchun: reklama beruvchi uchun kirish nuqtasi — bu yerda faqat o'zining
 * kampaniyalari va ularning ko'rsatkichlari ko'rinadi.
 */
import type { Composer } from 'grammy';
import { t } from '../../../i18n/index.js';
import { campaignStats, listCampaigns, type CampaignWithCounts } from '../../../services/campaignService.js';
import { escapeHtml } from '../../../utils/html.js';
import { backButton, inlineGrid, listKeyboard, menuButton } from '../../keyboards/common.js';
import type { InlineButton, ListRow } from '../../keyboards/common.js';
import { safeHandler } from '../guard.js';
import { ACTION, DATA, PATTERN, readPage } from './callbacks.js';
import { FIRST_PAGE } from './constants.js';
import { requireAdvertiser } from './access.js';
import { showScreen } from './ui.js';
import type { BotContext } from '../../bot.js';

const MENU_BUTTONS: readonly InlineButton[] = Object.freeze([
  { text: t.advertiser.myCampaigns, data: DATA.campaigns(FIRST_PAGE) },
  { text: t.advertiser.liveFeed, data: DATA.feedPicker(FIRST_PAGE) },
  { text: t.advertiser.report, data: DATA.reportPicker },
]);

/** Kabinet bosh ekrani. Boshqa modullar (masalan /start) ham shuni chaqirishi mumkin. */
export const showAdvertiserMenu = async (ctx: BotContext): Promise<void> => {
  const advertiser = await requireAdvertiser(ctx);
  const text = `${t.advertiser.menuTitle}\n\n🏢 ${escapeHtml(advertiser.companyName)}`;
  await showScreen(ctx, text, inlineGrid([...MENU_BUTTONS, menuButton()]));
};

/** Kampaniyalar ro'yxati: har biri uchun kartochka, tugmasi esa jonli hisobotni ochadi. */
const showCampaigns = async (ctx: BotContext, page: number): Promise<void> => {
  const advertiser = await requireAdvertiser(ctx);
  const result = await listCampaigns({ page, advertiserId: advertiser.id });
  const cards = await Promise.all(result.items.map(renderCard));

  const header = `${t.advertiser.campaignsTitle}\n${t.common.page(result.page, result.totalPages)}`;
  const body = cards.length === 0 ? t.advertiser.noCampaigns : cards.join('\n\n');

  const keyboard = listKeyboard({
    rows: result.items.map(toListRow),
    openAction: ACTION.feed,
    pagination: { action: ACTION.campaigns, page: result.page, totalPages: result.totalPages },
    footerRows: [[backButton(DATA.menu), menuButton()]],
  });

  await showScreen(ctx, `${header}\n\n${body}`, keyboard);
};

const renderCard = async (campaign: CampaignWithCounts): Promise<string> => {
  const stats = await campaignStats(campaign.id);
  return t.advertiser.campaignCard(escapeHtml(campaign.title), stats.cars, stats.approved, stats.rate);
};

const toListRow = (campaign: CampaignWithCounts): ListRow => ({
  id: campaign.id,
  label: `${t.status.campaign[campaign.status]} ${campaign.title}`,
});

/** Menyu marshrutlarini ulaydi (matnli tugma ham, inline tugma ham). */
export const registerMenuHandlers = (composer: Composer<BotContext>): void => {
  composer.callbackQuery(PATTERN.menu, safeHandler('advertiser:menu', showAdvertiserMenu));
  composer.callbackQuery(
    PATTERN.campaigns,
    safeHandler('advertiser:campaigns', (ctx) => showCampaigns(ctx, readPage(ctx))),
  );
  composer.hears(
    t.advertiser.myCampaigns,
    safeHandler('advertiser:campaigns', (ctx) => showCampaigns(ctx, FIRST_PAGE)),
  );
};
