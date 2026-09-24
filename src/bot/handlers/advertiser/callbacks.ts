/**
 * Kabinetning callback_data shartnomasi.
 * Nima uchun alohida: qurish ham, o'qish ham bitta joyda bo'lsa, tugma bilan
 * handler hech qachon bir-biridan uzilib qolmaydi. Umumiy kodek
 * (`src/bot/callbacks.ts`) 64 baytlik chegarani o'zi tekshiradi.
 */
import { z } from 'zod';
import { CB, buildCallback, callbackPattern, tryParseCallback } from '../../callbacks.js';
import { ValidationError } from '../../../core/errors.js';
import { t } from '../../../i18n/index.js';
import { MAX_PAGE, REPORT_PERIOD_DAYS } from './constants.js';
import type { BotContext } from '../../bot.js';

/**
 * Kabinet bosh ekrani uchun amal. `CB` da mos qiymat yo'q, shuning uchun
 * shu yerda — "my.*" (o'z hisobi) nomlanishi saqlangan holda e'lon qilinadi.
 */
export const CABINET_MENU_ACTION = 'my.mn';

/**
 * Jonli hisobotda ikki ekran bitta amalni bo'lishadi: kampaniya tanlash va
 * tanlangan kampaniya lentasi. Bir belgili marker ularni ajratadi —
 * kampaniya id si (cuid) hech qachon bitta harfga teng bo'lmaydi.
 */
const PICKER_MARKER = 'p';

/** Kabinetga tegishli barcha amallar — router filtri shu ro'yxatga tayanadi. */
export const CABINET_ACTIONS: ReadonlySet<string> = new Set([
  CABINET_MENU_ACTION,
  CB.myCampaigns,
  CB.advertiserFeed,
  CB.advertiserReport,
  CB.advertiserPhotos,
]);

/** Tugmalar uchun callback_data. */
export const DATA = Object.freeze({
  menu: buildCallback(CABINET_MENU_ACTION),
  campaigns: (page: number): string => buildCallback(CB.myCampaigns, page),
  feedPicker: (page: number): string => buildCallback(CB.advertiserFeed, PICKER_MARKER, page),
  feed: (campaignId: string): string => buildCallback(CB.advertiserFeed, campaignId),
  photos: (checkId: string): string => buildCallback(CB.advertiserPhotos, checkId),
  reportPicker: buildCallback(CB.advertiserReport),
  report: (days: number): string => buildCallback(CB.advertiserReport, days),
});

/** Sahifalash uchun amal nomlari (umumiy klaviatura yordamchilariga uzatiladi). */
export const ACTION = Object.freeze({
  campaigns: CB.myCampaigns,
  feed: CB.advertiserFeed,
  photos: CB.advertiserPhotos,
  feedPickerArgs: Object.freeze([PICKER_MARKER]),
});

export const PATTERN = Object.freeze({
  menu: callbackPattern(CABINET_MENU_ACTION),
  campaigns: callbackPattern(CB.myCampaigns),
  feed: callbackPattern(CB.advertiserFeed),
  photos: callbackPattern(CB.advertiserPhotos),
  report: callbackPattern(CB.advertiserReport),
});

const EMPTY_PARTS: readonly string[] = Object.freeze([]);

/** Callback bo'laklari. Yaroqsiz (eski deploydan qolgan) tugma — bo'sh ro'yxat. */
const partsOf = (ctx: BotContext): readonly string[] =>
  tryParseCallback(ctx.callbackQuery?.data)?.parts ?? EMPTY_PARTS;

const parseOrThrow = <T>(schema: z.ZodType<T>, raw: unknown, reason: string): T => {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(t.common.error, { reason });
  return parsed.data;
};

/** cuid identifikatorlari — faqat kichik harf va raqam. */
const idSchema = z.string().regex(/^[a-z0-9]{8,40}$/);
const pageSchema = z.coerce.number().int().min(1).max(MAX_PAGE);
const daysSchema = z.coerce
  .number()
  .int()
  .refine((value): boolean => REPORT_PERIOD_DAYS.some((allowed) => allowed === value));

/** Belgilangan o'rindagi identifikatorni o'qiydi va tekshiradi. */
export const readId = (ctx: BotContext, index = 0): string =>
  parseOrThrow(idSchema, partsOf(ctx)[index], 'callback id yaroqsiz');

/** Sahifa raqami — yo'q bo'lsa birinchi sahifa, yaroqsiz bo'lsa xato. */
export const readPage = (ctx: BotContext, index = 0, fallback = 1): number => {
  const raw = partsOf(ctx)[index];
  if (raw === undefined) return fallback;
  return parseOrThrow(pageSchema, raw, 'callback sahifasi yaroqsiz');
};

/** Hisobot davri — faqat ruxsat etilgan qiymatlar qabul qilinadi. */
export const readDays = (ctx: BotContext): number =>
  parseOrThrow(daysSchema, partsOf(ctx)[0], 'callback davri yaroqsiz');

/** Jonli hisobotda kampaniya tanlash ekrani so'ralganmi. */
export const isFeedPicker = (ctx: BotContext): boolean => partsOf(ctx)[0] === PICKER_MARKER;

/** Hisobotda davr tanlash ekrani so'ralganmi (davr hali ko'rsatilmagan). */
export const isReportPicker = (ctx: BotContext): boolean => partsOf(ctx).length === 0;

/** Shu callback kabinetga tegishlimi — router filtri uchun. */
export const isCabinetCallback = (data: string | undefined): boolean => {
  const parsed = tryParseCallback(data);
  return parsed !== null && CABINET_ACTIONS.has(parsed.action);
};
