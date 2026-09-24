/**
 * Kabinetning kirish nazorati.
 * Nima uchun: reklama beruvchi FAQAT o'z ma'lumotini ko'rishi shart. Shuning uchun
 * har bir so'rovda kabinet egasi Telegram ID bo'yicha qaytadan aniqlanadi va
 * so'ralgan kampaniya unga tegishliligi QAYTA tekshiriladi (IDOR himoyasi).
 * Admin/superadmin ham istisno emas: boshqa reklama beruvchining ma'lumotini
 * ular bu kabinetdan emas, admin paneldan ko'radi.
 */
import type { Campaign } from '@prisma/client';
import { ForbiddenError, NotFoundError } from '../../../core/errors.js';
import { childLogger } from '../../../core/logger.js';
import { t } from '../../../i18n/index.js';
import { findAdvertiserByTelegramId, type AdvertiserWithUser } from '../../../services/advertiserService.js';
import { getCampaignById } from '../../../services/campaignService.js';
import type { BotContext } from '../../bot.js';

const log = childLogger('bot:advertiser:access');

/**
 * Joriy foydalanuvchining reklama beruvchi hisobi.
 * Hisob yo'q yoki faol emas bo'lsa — kirish taqiqlanadi (ko'rsatiladigan xato).
 */
export const requireAdvertiser = async (ctx: BotContext): Promise<AdvertiserWithUser> => {
  const telegramId = ctx.from?.id;
  if (telegramId === undefined) throw new ForbiddenError(t.common.forbidden);

  const advertiser = await findAdvertiserByTelegramId(telegramId);
  if (advertiser === null || !advertiser.isActive) {
    throw new ForbiddenError(t.advertiser.notLinked, { telegramId });
  }
  return advertiser;
};

/**
 * Kampaniya shu reklama beruvchiga tegishliligini tekshiradi.
 * Mavjud bo'lmagan kampaniya ham "ruxsat yo'q" deb qaytariladi — tashqaridan
 * ID larni sanab, qaysi biri bor-yo'qligini bilib olishga yo'l qo'ymaslik uchun.
 */
export const assertOwnsCampaign = async (advertiserId: string, campaignId: string): Promise<Campaign> => {
  const campaign = await loadCampaign(campaignId);

  if (campaign === null || campaign.advertiserId !== advertiserId) {
    log.warn({ advertiserId, campaignId }, "Begona kampaniyaga murojaat rad etildi");
    throw new ForbiddenError(t.common.forbidden, { campaignId });
  }
  return campaign;
};

const loadCampaign = async (campaignId: string): Promise<Campaign | null> => {
  try {
    return await getCampaignById(campaignId);
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
};
