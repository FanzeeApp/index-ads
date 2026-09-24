/**
 * Haydovchi menyusi: biriktirilgan mashina, oxirgi tekshiruvlar va yordam.
 * Nima uchun prisma to'g'ridan-to'g'ri: bu faqat o'qish uchun, haydovchiga
 * tegishli tor ko'rinishlar — xizmat qatlamida alohida metod ochish ortiqcha bo'lardi.
 */
import type { Bot } from 'grammy';
import { prisma } from '../../../db/client.js';
import { t } from '../../../i18n/index.js';
import { MESSAGE_LIMIT, escapeHtml, truncate } from '../../../utils/html.js';
import { formatPlate } from '../../../utils/plate.js';
import { formatDateTime } from '../../../utils/time.js';
import { findDriverByTelegramId } from '../../../services/driverService.js';
import { driverMenuKeyboard } from '../../keyboards/driver.js';
import type { BotContext } from '../../bot.js';
import { replySafe, safeHandler } from '../guard.js';

/** "Tekshiruvlarim" ro'yxatida ko'rsatiladigan yozuvlar soni. */
const DRIVER_CHECKS_LIMIT = 10;
const CAMPAIGN_SEPARATOR = ', ';
const EMPTY_VALUE = '—';

/** Menyuni ko'rsatadi. `greeting` berilsa sarlavha o'rniga ishlatiladi. */
export const sendDriverMenu = async (ctx: BotContext, greeting?: string): Promise<void> => {
  await replySafe(ctx, greeting ?? t.driver.menuTitle, {
    parse_mode: 'HTML',
    reply_markup: driverMenuKeyboard(),
  });
};

/**
 * Mashinalar bo'yicha faol kampaniya nomlari — bitta so'rovda.
 * Har bir mashina uchun alohida so'rov (N+1) qilinmaydi.
 */
const activeCampaignTitles = async (carIds: readonly string[]): Promise<ReadonlyMap<string, readonly string[]>> => {
  if (carIds.length === 0) return new Map();

  const placements = await prisma.placement.findMany({
    where: { carId: { in: [...carIds] }, status: 'ACTIVE', campaign: { status: 'ACTIVE' } },
    select: { carId: true, campaign: { select: { title: true } } },
    orderBy: { installedAt: 'desc' },
  });

  return placements.reduce<Map<string, readonly string[]>>((acc, row) => {
    acc.set(row.carId, [...(acc.get(row.carId) ?? []), row.campaign.title]);
    return acc;
  }, new Map());
};

const campaignsLabel = (titles: readonly string[] | undefined): string =>
  titles === undefined || titles.length === 0 ? t.driver.noCampaigns : titles.join(CAMPAIGN_SEPARATOR);

const showMyCar = async (ctx: BotContext): Promise<void> => {
  const telegramId = ctx.from?.id;
  if (telegramId === undefined) return;

  const driver = await findDriverByTelegramId(telegramId);
  if (driver === null || driver.cars.length === 0) {
    await replySafe(ctx, t.driver.noCar, { reply_markup: driverMenuKeyboard() });
    return;
  }

  const titlesByCar = await activeCampaignTitles(driver.cars.map((car) => car.id));
  const cards = driver.cars.map((car) =>
    t.driver.carInfo(
      escapeHtml(formatPlate(car.plateNumber)),
      escapeHtml(car.model ?? EMPTY_VALUE),
      escapeHtml(campaignsLabel(titlesByCar.get(car.id))),
    ),
  );

  await replySafe(ctx, truncate(cards.join('\n\n'), MESSAGE_LIMIT), { parse_mode: 'HTML' });
};

const showMyChecks = async (ctx: BotContext): Promise<void> => {
  const telegramId = ctx.from?.id;
  if (telegramId === undefined) return;

  const driver = await findDriverByTelegramId(telegramId);
  if (driver === null) {
    await replySafe(ctx, t.driver.noCar, { reply_markup: driverMenuKeyboard() });
    return;
  }

  const checks = await prisma.checkRequest.findMany({
    where: { car: { driverId: driver.id } },
    orderBy: { requestedAt: 'desc' },
    take: DRIVER_CHECKS_LIMIT,
    select: { status: true, requestedAt: true, car: { select: { plateNumber: true } } },
  });

  if (checks.length === 0) {
    await replySafe(ctx, t.driver.checksEmpty);
    return;
  }

  const lines = checks.map((check) =>
    t.driver.checkListItem(
      escapeHtml(formatPlate(check.car.plateNumber)),
      t.status.check[check.status],
      formatDateTime(check.requestedAt),
    ),
  );

  await replySafe(ctx, truncate([t.driver.checksTitle, ...lines].join('\n'), MESSAGE_LIMIT), {
    parse_mode: 'HTML',
  });
};

const showHelp = async (ctx: BotContext): Promise<void> => {
  await replySafe(ctx, t.driver.helpText, { parse_mode: 'HTML', reply_markup: driverMenuKeyboard() });
};

/** Reply-klaviatura tugmalari — matn i18n dagi yorliqqa aynan mos kelganda ishlaydi. */
export const registerDriverMenuHandlers = (bot: Bot<BotContext>): void => {
  bot.hears(t.driver.myCar, safeHandler('driver:myCar', showMyCar));
  bot.hears(t.driver.myChecks, safeHandler('driver:myChecks', showMyChecks));
  bot.hears(t.driver.help, safeHandler('driver:help', showHelp));
};
