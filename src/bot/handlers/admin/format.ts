import type { CampaignStatus, CarStatus, CheckStatus, PhotoSide } from '@prisma/client';

import { t } from '../../../i18n/index.js';
import { escapeHtml } from '../../../utils/html.js';
import { formatPhone } from '../../../utils/phone.js';
import { formatPlate } from '../../../utils/plate.js';

/** Bo'sh maydonlar o'rniga ko'rsatiladigan belgi. */
export const DASH = '—';

export const orDash = (value: string | null | undefined): string =>
  value === null || value === undefined || value.trim().length === 0 ? DASH : value;

/** Ismni tuzadi: to'liq ism → Telegram ismi → @username → DASH. */
export type NameParts = {
  readonly fullName?: string | null;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
  readonly username?: string | null;
};

export const displayName = (parts: NameParts): string => {
  const telegramName = [parts.firstName, parts.lastName].filter(Boolean).join(' ').trim();
  const candidate = parts.fullName?.trim() || telegramName || (parts.username ? `@${parts.username}` : '');
  return orDash(candidate);
};

// ─────────────────────────── Holat yorliqlari ───────────────────────────

export const carStatusLabel = (status: CarStatus): string => t.status.car[status];
export const checkStatusLabel = (status: CheckStatus): string => t.status.check[status];
export const campaignStatusLabel = (status: CampaignStatus): string => t.status.campaign[status];
export const sideLabel = (side: PhotoSide): string => t.side[side];

// ─────────────────────────── Xavfsiz HTML ───────────────────────────

/** Davlat raqami — ko'rinishi chiroyli va HTML uchun xavfsiz. */
export const safePlate = (plate: string): string => escapeHtml(formatPlate(plate));

export const safePhone = (phone: string | null | undefined): string =>
  phone ? escapeHtml(formatPhone(phone)) : DASH;

export const safeText = (value: string | null | undefined): string => escapeHtml(orDash(value));

export const safeUsername = (username: string | null | undefined): string =>
  username ? escapeHtml(`@${username.replace(/^@/, '')}`) : DASH;
