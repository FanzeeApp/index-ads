/**
 * "Hisobot" — tanlangan davr bo'yicha yakuniy ko'rsatkichlar.
 * Nima uchun: reklama beruvchiga bitta ekranda javob kerak — nechta mashina,
 * nechtasi tasdiqlangan, nechtasi javobsiz. Javobsiz mashinalar faqat davlat
 * raqami bilan ko'rsatiladi; haydovchi haqidagi ma'lumot bu yerda ham yopiq.
 */
import type { Composer } from 'grammy';
import { t } from '../../../i18n/index.js';
import { escapeHtml } from '../../../utils/html.js';
import { backButton, inlineGrid, menuButton } from '../../keyboards/common.js';
import type { InlineButton } from '../../keyboards/common.js';
import { safeHandler } from '../guard.js';
import { DATA, PATTERN, isReportPicker, readDays } from './callbacks.js';
import { REPORT_PERIOD_DAYS } from './constants.js';
import { requireAdvertiser } from './access.js';
import { buildPeriodReport, type PeriodReport } from './queries.js';
import { showScreen } from './ui.js';
import type { BotContext } from '../../bot.js';

/** Har qatorda ikkita tugma: davrlar bir qatorda, "orqaga/menyu" keyingisida. */
const BUTTONS_PER_ROW = 2;

const PERIOD_BUTTONS: readonly InlineButton[] = Object.freeze(
  REPORT_PERIOD_DAYS.map((days) => ({
    text: t.advertiser.reportPeriodButton(days),
    data: DATA.report(days),
  })),
);

const reportKeyboard = () =>
  inlineGrid([...PERIOD_BUTTONS, backButton(DATA.menu), menuButton()], BUTTONS_PER_ROW);

/** Davr tanlash ekrani. */
const showReportPicker = async (ctx: BotContext): Promise<void> => {
  await requireAdvertiser(ctx);
  await showScreen(ctx, t.advertiser.reportPickPeriod, reportKeyboard());
};

/** Tanlangan davr bo'yicha hisobot — so'rov faqat shu reklama beruvchi doirasida. */
const showReport = async (ctx: BotContext): Promise<void> => {
  const advertiser = await requireAdvertiser(ctx);
  const days = readDays(ctx);
  const report = await buildPeriodReport(advertiser.id, days);

  const text = [
    t.advertiser.reportTitle(report.days),
    '',
    t.advertiser.reportBody(report),
    '',
    renderMissed(report),
  ].join('\n');

  await showScreen(ctx, text, reportKeyboard());
};

/** Javobsiz mashinalar ro'yxati — uzun bo'lsa qolgani son bilan ko'rsatiladi. */
const renderMissed = (report: PeriodReport): string => {
  if (report.missedCars === 0) return t.advertiser.reportMissedNone;

  const plates = report.missedPlates.map((plate) => escapeHtml(plate)).join(', ');
  const hidden = report.missedCars - report.missedPlates.length;
  const tail = hidden > 0 ? `\n${t.advertiser.reportMissedMore(hidden)}` : '';

  return `${t.advertiser.reportMissedHeader}\n${plates}${tail}`;
};

/** Davr tanlanmagan bo'lsa — tanlov ekrani, tanlangan bo'lsa — hisobot. */
const routeReport = async (ctx: BotContext): Promise<void> => {
  if (isReportPicker(ctx)) {
    await showReportPicker(ctx);
    return;
  }
  await showReport(ctx);
};

/** Hisobot marshrutlarini ulaydi. */
export const registerReportHandlers = (composer: Composer<BotContext>): void => {
  composer.callbackQuery(PATTERN.report, safeHandler('advertiser:report', routeReport));
  composer.hears(t.advertiser.report, safeHandler('advertiser:report', showReportPicker));
};
