import type { InlineKeyboard } from 'grammy';
import { t } from '../../i18n/index.js';
import { buildCallback, CB } from '../callbacks.js';
import { backButton, inlineGrid, listKeyboard, menuButton, type ListRow } from './common.js';

const FIRST_PAGE = 1;

/**
 * Kampaniya ro'yxatining rejimi — sarlavha va keyingi qadam shunga qarab tanlanadi.
 * Callback shakli doim bir xil: `my.cmp:<mode>:<page>`.
 */
export const CAMPAIGN_PICK_MODE = Object.freeze({
  list: 'list',
  feed: 'feed',
  report: 'report',
} as const);

export type CampaignPickMode = (typeof CAMPAIGN_PICK_MODE)[keyof typeof CAMPAIGN_PICK_MODE];

/** Hisobot davrlari (kun). 0 — "davrni so'rash", callback arity o'zgarmasligi uchun. */
export const REPORT_PERIOD_ASK = 0;
export const REPORT_PERIODS: readonly number[] = Object.freeze([7, 30, 90]);

/** Reklama beruvchi kabinetining bosh menyusi. */
export const advertiserMenuKeyboard = (): InlineKeyboard =>
  inlineGrid(
    [
      {
        text: t.advertiser.myCampaigns,
        data: buildCallback(CB.myCampaigns, CAMPAIGN_PICK_MODE.list, FIRST_PAGE),
      },
      {
        text: t.advertiser.liveFeed,
        data: buildCallback(CB.myCampaigns, CAMPAIGN_PICK_MODE.feed, FIRST_PAGE),
      },
      {
        text: t.advertiser.report,
        data: buildCallback(CB.myCampaigns, CAMPAIGN_PICK_MODE.report, FIRST_PAGE),
      },
    ],
    1,
  );

/**
 * Kampaniyalar ro'yxati. `list`/`feed` rejimida element jonli hisobotni ochadi
 * (`adv.fd:<campaignId>:1`), `report` rejimida davr so'raladi (`adv.rp:<campaignId>:0`).
 */
export const campaignPickKeyboard = (
  rows: readonly ListRow[],
  page: number,
  totalPages: number,
  mode: CampaignPickMode = CAMPAIGN_PICK_MODE.list,
): InlineKeyboard => {
  const isReport = mode === CAMPAIGN_PICK_MODE.report;
  return listKeyboard({
    rows,
    openAction: isReport ? CB.advertiserReport : CB.advertiserFeed,
    openArgs: [isReport ? REPORT_PERIOD_ASK : FIRST_PAGE],
    pagination: { action: CB.myCampaigns, page, totalPages, args: [mode] },
    footerRows: [[menuButton()]],
  });
};

/** `adv.rp:<campaignId>:<days>` */
export const reportPeriodKeyboard = (campaignId: string): InlineKeyboard =>
  inlineGrid(
    [
      ...REPORT_PERIODS.map((days) => ({
        text: t.advertiser.reportPeriodButton(days),
        data: buildCallback(CB.advertiserReport, campaignId, days),
      })),
      backButton(buildCallback(CB.myCampaigns, CAMPAIGN_PICK_MODE.report, FIRST_PAGE)),
    ],
    REPORT_PERIODS.length,
  );

/**
 * Jonli hisobot ro'yxati: har bir element — tasdiqlangan tekshiruv,
 * bosilganda `adv.ph:<checkId>` orqali rasmlar albomi yuboriladi.
 */
export const feedKeyboard = (
  rows: readonly ListRow[],
  campaignId: string,
  page: number,
  totalPages: number,
): InlineKeyboard =>
  listKeyboard({
    rows,
    openAction: CB.advertiserPhotos,
    pagination: { action: CB.advertiserFeed, page, totalPages, args: [campaignId] },
    footerRows: [
      [
        backButton(buildCallback(CB.myCampaigns, CAMPAIGN_PICK_MODE.feed, FIRST_PAGE)),
        menuButton(),
      ],
    ],
  });
