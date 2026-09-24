import { Prisma, CampaignStatus, CarStatus, CheckStatus, PlacementStatus } from '@prisma/client';
import type { Advertiser, Campaign } from '@prisma/client';
import { prisma } from '../db/client.js';
import { PAGE_SIZE } from '../config/constants.js';
import { NotFoundError, ValidationError } from '../core/errors.js';
import { t } from '../i18n/index.js';
import { buildPage, toSkip, type Page } from '../utils/pagination.js';
import { recordAudit } from './auditService.js';
import { getAdvertiserById } from './advertiserService.js';

export type CampaignWithCounts = Campaign & { advertiser: Advertiser; _count: { placements: number } };

export type CreateCampaignInput = {
  readonly advertiserId: string;
  readonly title: string;
  readonly description?: string;
  readonly checkIntervalDays?: number;
};

export type ListCampaignsOptions = {
  readonly page?: number;
  readonly advertiserId?: string;
  readonly status?: CampaignStatus;
};

export type CampaignStats = {
  readonly cars: number;
  readonly approved: number;
  readonly pending: number;
  readonly expired: number;
  readonly rate: number;
};

const MIN_CHECK_INTERVAL_DAYS = 1;
const MAX_CHECK_INTERVAL_DAYS = 60;
const PERCENT = 100;

const CAMPAIGN_INCLUDE = {
  advertiser: true,
  _count: { select: { placements: true } },
} satisfies Prisma.CampaignInclude;

export const createCampaign = async (input: CreateCampaignInput): Promise<Campaign> => {
  const title = input.title.trim();
  if (!title) throw new ValidationError(t.admin.campaignTitlePrompt);

  const interval = input.checkIntervalDays;
  if (interval !== undefined && (interval < MIN_CHECK_INTERVAL_DAYS || interval > MAX_CHECK_INTERVAL_DAYS)) {
    throw new ValidationError(t.admin.campaignIntervalInvalid, { checkIntervalDays: interval });
  }

  // Reklama beruvchi mavjudligini oldindan tekshiramiz — FK xatosi o'rniga tushunarli xabar.
  await getAdvertiserById(input.advertiserId);

  const campaign = await prisma.campaign.create({
    data: {
      advertiserId: input.advertiserId,
      title,
      description: input.description?.trim() || null,
      checkIntervalDays: interval ?? null,
    },
  });

  await recordAudit({
    action: 'campaign.create',
    entity: 'Campaign',
    entityId: campaign.id,
    meta: { title, advertiserId: input.advertiserId },
  });
  return campaign;
};

export const getCampaignById = async (id: string): Promise<Campaign> => {
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) throw new NotFoundError(t.common.notFound, { campaignId: id });
  return campaign;
};

/**
 * Mashinalarni kampaniyaga biriktiradi. Mavjud juftliklar takrorlanmaydi, avval
 * olib tashlangan joylashtirish qayta faollashtiriladi. nextCheckAt = hozir —
 * birinchi tekshiruv rejalashtiruvchining eng yaqin tsiklida yuboriladi.
 */
export const attachCars = async (campaignId: string, carIds: readonly string[]): Promise<number> => {
  await getCampaignById(campaignId);
  if (carIds.length === 0) return 0;

  const cars = await prisma.car.findMany({
    where: { id: { in: [...carIds] }, status: { not: CarStatus.ARCHIVED } },
    select: { id: true },
  });
  if (cars.length === 0) return 0;

  const ids = cars.map((car) => car.id);
  const now = new Date();

  const [created, revived] = await prisma.$transaction([
    prisma.placement.createMany({
      data: ids.map((carId) => ({ campaignId, carId, lastCheckAt: null, nextCheckAt: now })),
      skipDuplicates: true,
    }),
    prisma.placement.updateMany({
      where: { campaignId, carId: { in: ids }, status: { not: PlacementStatus.ACTIVE } },
      data: { status: PlacementStatus.ACTIVE, removedAt: null, nextCheckAt: now },
    }),
  ]);

  const attached = created.count + revived.count;
  await recordAudit({
    action: 'campaign.attachCars',
    entity: 'Campaign',
    entityId: campaignId,
    meta: { requested: carIds.length, attached },
  });
  return attached;
};

/**
 * Joylashtirish o'chirilmaydi, balki REMOVED holatiga o'tadi — tekshiruvlar tarixi
 * (CheckRequest) kaskad bilan yo'qolmasligi kerak.
 */
export const detachCar = async (campaignId: string, carId: string): Promise<void> => {
  const { count } = await prisma.placement.updateMany({
    where: { campaignId, carId, status: { not: PlacementStatus.REMOVED } },
    data: { status: PlacementStatus.REMOVED, removedAt: new Date(), nextCheckAt: null },
  });
  if (count === 0) return;

  await recordAudit({ action: 'campaign.detachCar', entity: 'Campaign', entityId: campaignId, meta: { carId } });
};

const buildStatusData = (status: CampaignStatus, now: Date, current: Campaign): Prisma.CampaignUpdateInput => ({
  status,
  ...(status === CampaignStatus.ACTIVE && !current.startsAt ? { startsAt: now } : {}),
  ...(status === CampaignStatus.FINISHED ? { endsAt: now } : {}),
});

/**
 * Holat o'zgarishi joylashtirishlarga ham ta'sir qiladi: ACTIVE bo'lganda tekshiruv
 * darhol navbatga qo'yiladi, aks holda nextCheckAt tozalanadi va rejalashtiruvchi
 * bu kampaniyani umuman tanlamaydi.
 */
export const setCampaignStatus = async (campaignId: string, status: CampaignStatus): Promise<Campaign> => {
  const campaign = await getCampaignById(campaignId);
  if (campaign.status === status) return campaign;

  const now = new Date();
  const activating = status === CampaignStatus.ACTIVE;

  const [updated] = await prisma.$transaction([
    prisma.campaign.update({ where: { id: campaignId }, data: buildStatusData(status, now, campaign) }),
    prisma.placement.updateMany({
      where: { campaignId, status: PlacementStatus.ACTIVE },
      data: { nextCheckAt: activating ? now : null },
    }),
  ]);

  await recordAudit({
    action: 'campaign.setStatus',
    entity: 'Campaign',
    entityId: campaignId,
    meta: { from: campaign.status, to: status },
  });
  return updated;
};

const buildCampaignWhere = (opts: ListCampaignsOptions): Prisma.CampaignWhereInput => ({
  ...(opts.advertiserId ? { advertiserId: opts.advertiserId } : {}),
  ...(opts.status ? { status: opts.status } : {}),
});

export const listCampaigns = async (opts: ListCampaignsOptions): Promise<Page<CampaignWithCounts>> => {
  const page = opts.page ?? 1;
  const where = buildCampaignWhere(opts);

  const [items, total] = await prisma.$transaction([
    prisma.campaign.findMany({
      where,
      include: CAMPAIGN_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: toSkip(page),
      take: PAGE_SIZE,
    }),
    prisma.campaign.count({ where }),
  ]);

  return buildPage<CampaignWithCounts>(items, total, page);
};

/** rate — yakunlangan tekshiruvlar ichida tasdiqlanganlar ulushi (foizda). */
export const campaignStats = async (campaignId: string): Promise<CampaignStats> => {
  const [cars, pending, approved, rejected, expired] = await prisma.$transaction([
    prisma.placement.count({ where: { campaignId, status: PlacementStatus.ACTIVE } }),
    prisma.checkRequest.count({ where: { campaignId, status: CheckStatus.PENDING } }),
    prisma.checkRequest.count({ where: { campaignId, status: CheckStatus.APPROVED } }),
    prisma.checkRequest.count({ where: { campaignId, status: CheckStatus.REJECTED } }),
    prisma.checkRequest.count({ where: { campaignId, status: CheckStatus.EXPIRED } }),
  ]);

  const decided = approved + rejected + expired;
  const rate = decided === 0 ? 0 : Math.round((approved / decided) * PERCENT);
  return { cars, pending, approved, expired, rate };
};
