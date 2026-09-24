import { Prisma, Role } from '@prisma/client';
import type { Advertiser, User } from '@prisma/client';
import { nanoid } from 'nanoid';
import { prisma } from '../db/client.js';
import { env } from '../config/env.js';
import { PAGE_SIZE } from '../config/constants.js';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../core/errors.js';
import { t } from '../i18n/index.js';
import { normalizePhone } from '../utils/phone.js';
import { buildPage, toSkip, type Page } from '../utils/pagination.js';
import { recordAudit } from './auditService.js';

export type AdvertiserWithUser = Advertiser & { user: User | null };

export type CreateAdvertiserInput = {
  readonly companyName: string;
  readonly contactName?: string;
  readonly contactPhone?: string;
};

export type ListAdvertisersOptions = {
  readonly page?: number;
  readonly query?: string;
};

const INVITE_CODE_LENGTH = 10;
/** nanoid to'qnashuvi deyarli imkonsiz, ammo cheksiz tsikl ham bo'lmasligi kerak. */
const MAX_INVITE_CODE_ATTEMPTS = 5;

const ADVERTISER_INCLUDE = { user: true } satisfies Prisma.AdvertiserInclude;

const generateInviteCode = async (): Promise<string> => {
  for (let attempt = 0; attempt < MAX_INVITE_CODE_ATTEMPTS; attempt += 1) {
    const code = nanoid(INVITE_CODE_LENGTH);
    const taken = await prisma.advertiser.findUnique({ where: { inviteCode: code } });
    if (!taken) return code;
  }
  throw new AppError('INVITE_CODE_COLLISION', t.common.error, { userFacing: true, statusCode: 500 });
};

export const buildInviteLink = (code: string): string => `https://t.me/${env.BOT_USERNAME}?start=adv_${code}`;

export const createAdvertiser = async (input: CreateAdvertiserInput): Promise<Advertiser> => {
  const companyName = input.companyName.trim();
  if (!companyName) throw new ValidationError(t.admin.advertiserNamePrompt);

  const contactPhone = input.contactPhone ? normalizePhone(input.contactPhone) : null;
  if (input.contactPhone && !contactPhone) {
    throw new ValidationError(t.admin.driverPhoneInvalid, { contactPhone: input.contactPhone });
  }

  const inviteCode = await generateInviteCode();
  const advertiser = await prisma.advertiser.create({
    data: { companyName, contactName: input.contactName?.trim() || null, contactPhone, inviteCode },
  });

  await recordAudit({
    action: 'advertiser.create',
    entity: 'Advertiser',
    entityId: advertiser.id,
    meta: { companyName },
  });
  return advertiser;
};

export const getAdvertiserById = async (id: string): Promise<Advertiser> => {
  const advertiser = await prisma.advertiser.findUnique({ where: { id } });
  if (!advertiser) throw new NotFoundError(t.common.notFound, { advertiserId: id });
  return advertiser;
};

export const findByInviteCode = async (code: string): Promise<Advertiser | null> => {
  const normalized = code.trim();
  if (!normalized) return null;
  return prisma.advertiser.findUnique({ where: { inviteCode: normalized } });
};

/**
 * Taklif kodi bo'yicha reklama beruvchini Telegram foydalanuvchiga ulaydi.
 * Kod o'chirilmaydi — u faqat bitta hisobga bog'lanadi, boshqasi kelsa rad etiladi.
 */
export const linkAdvertiserUser = async (inviteCode: string, user: User): Promise<Advertiser> => {
  const advertiser = await findByInviteCode(inviteCode);
  if (!advertiser) throw new ValidationError(t.advertiser.inviteInvalid, { inviteCode });
  if (advertiser.userId === user.id) return advertiser;
  if (advertiser.userId) throw new ConflictError(t.advertiser.inviteInvalid, { advertiserId: advertiser.id });

  const alreadyLinked = await prisma.advertiser.findUnique({ where: { userId: user.id } });
  if (alreadyLinked) throw new ConflictError(t.advertiser.inviteInvalid, { advertiserId: alreadyLinked.id });

  const linked = await prisma.$transaction(async (tx) => {
    const updated = await tx.advertiser.update({ where: { id: advertiser.id }, data: { userId: user.id } });
    // Admin/operator rolini pasaytirmaymiz — faqat oddiy foydalanuvchini ko'taramiz.
    if (user.role === Role.DRIVER) {
      await tx.user.update({ where: { id: user.id }, data: { role: Role.ADVERTISER } });
    }
    return updated;
  });

  await recordAudit({
    actorId: user.id,
    action: 'advertiser.link',
    entity: 'Advertiser',
    entityId: linked.id,
  });
  return linked;
};

export const findAdvertiserByTelegramId = async (telegramId: number | bigint): Promise<AdvertiserWithUser | null> =>
  prisma.advertiser.findFirst({
    where: { user: { telegramId: BigInt(telegramId) } },
    include: ADVERTISER_INCLUDE,
  });

const buildAdvertiserWhere = (opts: ListAdvertisersOptions): Prisma.AdvertiserWhereInput => {
  const search = opts.query?.trim();
  if (!search) return {};

  const phone = normalizePhone(search);
  return {
    OR: [
      { companyName: { contains: search, mode: 'insensitive' } },
      { contactName: { contains: search, mode: 'insensitive' } },
      { inviteCode: search },
      ...(phone ? [{ contactPhone: phone }] : []),
    ],
  };
};

export const listAdvertisers = async (opts: ListAdvertisersOptions): Promise<Page<Advertiser>> => {
  const page = opts.page ?? 1;
  const where = buildAdvertiserWhere(opts);

  const [items, total] = await prisma.$transaction([
    prisma.advertiser.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: toSkip(page),
      take: PAGE_SIZE,
    }),
    prisma.advertiser.count({ where }),
  ]);

  return buildPage<Advertiser>(items, total, page);
};
