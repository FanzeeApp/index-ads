/**
 * Reklama beruvchiga hisobot yetkazish — loyihaning asosiy qiymati.
 * Haydovchi rasm yuborishi bilan reklama beruvchi "REKLAMA FAOL" xabarini va
 * joriy rasmlarni ko'radi; javob bo'lmasa — ogohlantirish oladi.
 *
 * Yuborish har doim notifyService orqali (limit va bloklanganlar shu yerda hal bo'ladi).
 */

import { prisma } from '../db/client.js';
import { DAY_MS } from '../config/constants.js';
import { describeError } from '../core/errors.js';
import { childLogger } from '../core/logger.js';
import { t } from '../i18n/index.js';
import { escapeHtml } from '../utils/html.js';
import { formatPlate } from '../utils/plate.js';
import { formatDateTime } from '../utils/time.js';
import { checkStats, currentPhotos, markReported, type CheckRequestFull } from './checkService.js';
import { notifyAdmins, sendMediaGroupSafe, sendMessageSafe, type MediaItem } from './notifyService.js';
import { countCars } from './carService.js';
import { countDrivers } from './driverService.js';
import { listCampaigns } from './campaignService.js';

const log = childLogger('report');

/** Admin statistikasi qaysi oraliq uchun hisoblanadi (i18n matnidagi "oxirgi 30 kun"). */
const STATS_WINDOW_DAYS = 30;

export type AdminStats = {
  readonly cars: number;
  readonly activeCars: number;
  readonly drivers: number;
  readonly linkedDrivers: number;
  readonly campaigns: number;
  readonly pending: number;
  readonly submitted: number;
  readonly expired: number;
  readonly complianceRate: number;
};

const advertiserChatId = (check: CheckRequestFull): bigint | null =>
  check.campaign.advertiser.user?.telegramId ?? null;

const driverLabel = (check: CheckRequestFull): string => {
  const driver = check.car.driver;
  if (!driver) return '—';
  return driver.fullName ?? driver.user.firstName ?? driver.user.username ?? '—';
};

/** Hisobot yuborilganini belgilash — bu qadam xato bersa ham hisobot yuborilgan hisoblanadi. */
const markReportedSafe = async (checkId: string): Promise<void> => {
  try {
    await markReported(checkId);
  } catch (error) {
    log.error({ checkId, reason: describeError(error) }, 'reportedAt belgilanmadi');
  }
};

const buildPhotoAlbum = (check: CheckRequestFull, plate: string): readonly MediaItem[] =>
  currentPhotos(check).flatMap((photo) =>
    photo.telegramFileId
      ? [
          {
            fileId: photo.telegramFileId,
            caption: t.advertiser.photoCaption(
              escapeHtml(plate),
              t.side[photo.side],
              formatDateTime(photo.takenAt ?? photo.createdAt),
            ),
          },
        ]
      : [],
  );

/**
 * Tasdiqlangan (yoki yuborilgan) tekshiruvni reklama beruvchiga uzatadi.
 * Reklama beruvchi Telegramga ulanmagan bo'lsa — bu xato emas, shunchaki false.
 */
export const reportCheckToAdvertiser = async (check: CheckRequestFull): Promise<boolean> => {
  const chatId = advertiserChatId(check);
  const plate = formatPlate(check.car.plateNumber);

  if (chatId === null) {
    log.info({ checkId: check.id, plate }, "Reklama beruvchi Telegramga ulanmagan — hisobot yuborilmadi");
    return false;
  }

  const when = formatDateTime(check.submittedAt ?? check.reviewedAt ?? check.requestedAt);
  const text = t.advertiser.checkReport(escapeHtml(plate), escapeHtml(check.campaign.title), when);
  const textSent = await sendMessageSafe(chatId, text);

  const album = buildPhotoAlbum(check, plate);
  if (album.length === 0) {
    log.warn({ checkId: check.id }, 'Tekshiruvda yuboriladigan rasm topilmadi');
  }
  const albumSent = album.length > 0 ? await sendMediaGroupSafe(chatId, album) : false;

  if (textSent || albumSent) {
    await markReportedSafe(check.id);
    return true;
  }

  return false;
};

/** Muddati o'tgan tekshiruv: reklama beruvchi ham, adminlar ham xabardor bo'ladi. */
export const reportMissedCheck = async (check: CheckRequestFull): Promise<boolean> => {
  const plate = formatPlate(check.car.plateNumber);
  const campaignTitle = escapeHtml(check.campaign.title);

  await notifyAdmins(t.admin.checkMissedNotice(escapeHtml(plate), campaignTitle, escapeHtml(driverLabel(check))));

  const chatId = advertiserChatId(check);
  if (chatId === null) {
    log.info({ checkId: check.id, plate }, 'Reklama beruvchi Telegramga ulanmagan — ogohlantirish yuborilmadi');
    return false;
  }

  const sent = await sendMessageSafe(chatId, t.advertiser.checkMissing(escapeHtml(plate), campaignTitle));
  if (sent) await markReportedSafe(check.id);
  return sent;
};

type DigestTally = { readonly ok: number; readonly missing: number };

const EMPTY_TALLY: DigestTally = Object.freeze({ ok: 0, missing: 0 });

const tallyByCampaign = (
  rows: readonly { campaignId: string; status: string; _count: { _all: number } }[],
): ReadonlyMap<string, DigestTally> => {
  const tally = new Map<string, DigestTally>();

  for (const row of rows) {
    const current = tally.get(row.campaignId) ?? EMPTY_TALLY;
    const count = row._count._all;

    if (row.status === 'APPROVED' || row.status === 'SUBMITTED') {
      tally.set(row.campaignId, { ok: current.ok + count, missing: current.missing });
    } else if (row.status === 'EXPIRED' || row.status === 'REJECTED') {
      tally.set(row.campaignId, { ok: current.ok, missing: current.missing + count });
    }
  }

  return tally;
};

/**
 * Kunlik yakun — har bir faol kampaniya bo'yicha oxirgi 24 soat.
 * Harakat bo'lmagan kampaniyalar o'tkazib yuboriladi (keraksiz xabar bermaslik uchun).
 */
export const sendDailyDigest = async (now: Date = new Date()): Promise<number> => {
  const since = new Date(now.getTime() - DAY_MS);

  const campaigns = await prisma.campaign.findMany({
    where: { status: 'ACTIVE', advertiser: { user: { telegramId: { not: null }, isBlocked: false } } },
    include: { advertiser: { include: { user: true } }, _count: { select: { placements: true } } },
  });
  if (campaigns.length === 0) return 0;

  const rows = await prisma.checkRequest.groupBy({
    by: ['campaignId', 'status'],
    where: { campaignId: { in: campaigns.map((campaign) => campaign.id) }, updatedAt: { gte: since } },
    _count: { _all: true },
  });
  const tally = tallyByCampaign(rows);

  const results = await Promise.all(
    campaigns.map(async (campaign) => {
      const chatId = campaign.advertiser.user?.telegramId;
      if (chatId === null || chatId === undefined) return false;

      const stats = tally.get(campaign.id) ?? EMPTY_TALLY;
      if (stats.ok === 0 && stats.missing === 0) return false;

      return sendMessageSafe(
        chatId,
        t.advertiser.dailyDigest(
          escapeHtml(campaign.title),
          stats.ok,
          stats.missing,
          campaign._count.placements,
        ),
      );
    }),
  );

  const sent = results.filter((ok) => ok).length;
  log.info({ campaigns: campaigns.length, sent }, 'Kunlik hisobot yuborildi');
  return sent;
};

/** Admin paneldagi umumiy ko'rsatkichlar — barcha raqamlar xizmatlardan olinadi. */
export const buildAdminStats = async (): Promise<AdminStats> => {
  const [cars, drivers, campaigns, checks] = await Promise.all([
    countCars(),
    countDrivers(),
    listCampaigns({ status: 'ACTIVE' }),
    checkStats(STATS_WINDOW_DAYS),
  ]);

  return {
    cars: cars.total,
    activeCars: cars.active,
    drivers: drivers.total,
    linkedDrivers: drivers.linked,
    campaigns: campaigns.totalItems,
    pending: checks.pending,
    submitted: checks.submitted,
    expired: checks.expired,
    complianceRate: checks.complianceRate,
  };
};
