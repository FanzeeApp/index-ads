import type { CampaignStatus, CarStatus, CheckStatus } from '@prisma/client';
import type { InlineKeyboard } from 'grammy';
import { t } from '../../i18n/index.js';
import { GRANTABLE_ROLES, type GrantableRole } from '../../services/adminService.js';
import type { AppRole } from '../bot.js';
import { buildCallback, CB } from '../callbacks.js';
import {
  backButton,
  inlineGrid,
  listKeyboard,
  menuButton,
  type InlineButton,
  type ListRow,
} from './common.js';

/** Filtrsiz ro'yxat uchun bo'lak — callback arity doim bir xil bo'lishi kerak. */
export const LIST_FILTER_ALL = 'ALL';

/** Broadcast auditoriyasi kodlari — klaviatura va handler shu yerdan oladi. */
export const BROADCAST_AUDIENCE = Object.freeze({
  all: 'all',
  drivers: 'drv',
  advertisers: 'adv',
} as const);

export type BroadcastAudience = (typeof BROADCAST_AUDIENCE)[keyof typeof BROADCAST_AUDIENCE];

const FIRST_PAGE = 1;

/**
 * Admin panelining bosh menyusi. Har bir tugma darhol ro'yxatning 1-sahifasini ochadi.
 *
 * `role` berilmasa "Adminlar" tugmasi KO'RSATILMAYDI. Tugmani yashirish — faqat
 * qulaylik: haqiqiy himoya callback qatlamida (`requireRole('SUPERADMIN')`).
 */
export const adminMenuKeyboard = (role?: AppRole): InlineKeyboard =>
  inlineGrid(
    [
      { text: t.admin.cars, data: buildCallback(CB.carList, LIST_FILTER_ALL, FIRST_PAGE) },
      { text: t.admin.drivers, data: buildCallback(CB.driverList, FIRST_PAGE) },
      { text: t.admin.advertisers, data: buildCallback(CB.advertiserList, FIRST_PAGE) },
      { text: t.admin.campaigns, data: buildCallback(CB.campaignList, FIRST_PAGE) },
      { text: t.admin.checks, data: buildCallback(CB.checkList, LIST_FILTER_ALL, FIRST_PAGE) },
      { text: t.admin.stats, data: buildCallback(CB.statsRefresh) },
      { text: t.admin.broadcast, data: buildCallback(CB.broadcastAudience) },
      ...(role === 'SUPERADMIN'
        ? [{ text: t.admin.adminsButton, data: buildCallback(CB.adminList, FIRST_PAGE) }]
        : []),
      { text: t.admin.settings, data: buildCallback(CB.adminSettings) },
    ],
    2,
  );

// ───────────────────────────── Mashinalar ─────────────────────────────

const CAR_FILTERS: readonly CarStatus[] = Object.freeze(['ACTIVE', 'IDLE', 'MAINTENANCE']);

const carFilterRow = (): readonly InlineButton[] =>
  Object.freeze([
    { text: t.kb.filterAll, data: buildCallback(CB.carList, LIST_FILTER_ALL, FIRST_PAGE) },
    ...CAR_FILTERS.map((status) => ({
      text: t.status.car[status],
      data: buildCallback(CB.carList, status, FIRST_PAGE),
    })),
  ]);

/** `car.ls:<filter>:<page>` — filter CarStatus yoki 'ALL'. */
export const carListKeyboard = (
  rows: readonly ListRow[],
  page: number,
  totalPages: number,
  filter: CarStatus | typeof LIST_FILTER_ALL = LIST_FILTER_ALL,
): InlineKeyboard =>
  listKeyboard({
    rows,
    openAction: CB.carOpen,
    pagination: { action: CB.carList, page, totalPages, args: [filter] },
    footerRows: [
      carFilterRow(),
      [{ text: t.admin.carAdd, data: buildCallback(CB.carAdd) }, menuButton()],
    ],
  });

export const carCardKeyboard = (carId: string, hasDriver: boolean): InlineKeyboard => {
  const driverButton: InlineButton = hasDriver
    ? { text: t.kb.carUnassignDriver, data: buildCallback(CB.carUnassign, carId) }
    : { text: t.kb.carAssignDriver, data: buildCallback(CB.carAssign, carId) };

  return inlineGrid(
    [
      driverButton,
      { text: t.admin.carCreateReferral, data: buildCallback(CB.carReferral, carId) },
      { text: t.kb.carChangeStatus, data: buildCallback(CB.carStatus, carId) },
      { text: t.kb.carArchive, data: buildCallback(CB.carArchive, carId) },
      backButton(buildCallback(CB.carList, LIST_FILTER_ALL, FIRST_PAGE)),
    ],
    2,
  );
};

/** `car.st:<carId>:<CarStatus>` */
export const carStatusKeyboard = (carId: string): InlineKeyboard =>
  inlineGrid(
    [
      ...CAR_FILTERS.map((status) => ({
        text: t.status.car[status],
        data: buildCallback(CB.carStatus, carId, status),
      })),
      backButton(buildCallback(CB.carOpen, carId)),
    ],
    2,
  );

export const carArchiveConfirmKeyboard = (carId: string): InlineKeyboard =>
  inlineGrid(
    [
      { text: t.common.confirm, data: buildCallback(CB.carArchive, carId, 'yes') },
      { text: t.common.cancel, data: buildCallback(CB.carOpen, carId) },
    ],
    2,
  );

// ───────────────────────────── Haydovchilar ─────────────────────────────

/** `drv.ls:<page>` */
export const driverListKeyboard = (
  rows: readonly ListRow[],
  page: number,
  totalPages: number,
): InlineKeyboard =>
  listKeyboard({
    rows,
    openAction: CB.driverOpen,
    pagination: { action: CB.driverList, page, totalPages },
    footerRows: [[menuButton()]],
  });

export const driverCardKeyboard = (driverId: string, carId: string | null): InlineKeyboard => {
  const unlink: readonly InlineButton[] =
    carId === null ? [] : [{ text: t.kb.driverUnlink, data: buildCallback(CB.carUnassign, carId) }];

  return inlineGrid(
    [...unlink, backButton(buildCallback(CB.driverList, FIRST_PAGE))],
    2,
  );
};

// ───────────────────────── Reklama beruvchilar ─────────────────────────

/** `adv.ls:<page>` */
export const advertiserListKeyboard = (
  rows: readonly ListRow[],
  page: number,
  totalPages: number,
): InlineKeyboard =>
  listKeyboard({
    rows,
    openAction: CB.advertiserOpen,
    pagination: { action: CB.advertiserList, page, totalPages },
    footerRows: [
      [{ text: t.admin.advertiserAdd, data: buildCallback(CB.advertiserAdd) }, menuButton()],
    ],
  });

export const advertiserCardKeyboard = (advertiserId: string): InlineKeyboard =>
  inlineGrid(
    [
      { text: t.kb.advertiserCampaigns, data: buildCallback(CB.advertiserCampaigns, advertiserId) },
      { text: t.kb.advertiserInviteLink, data: buildCallback(CB.advertiserInvite, advertiserId) },
      backButton(buildCallback(CB.advertiserList, FIRST_PAGE)),
    ],
    2,
  );

// ───────────────────────────── Kampaniyalar ─────────────────────────────

const CAMPAIGN_TRANSITIONS: readonly CampaignStatus[] = Object.freeze(['ACTIVE', 'PAUSED', 'FINISHED']);

const CAMPAIGN_TRANSITION_LABELS: Readonly<Record<CampaignStatus, string>> = Object.freeze({
  DRAFT: t.status.campaign.DRAFT,
  ACTIVE: t.kb.campaignStart,
  PAUSED: t.kb.campaignPause,
  FINISHED: t.kb.campaignFinish,
});

/** `cmp.ls:<page>` */
export const campaignListKeyboard = (
  rows: readonly ListRow[],
  page: number,
  totalPages: number,
): InlineKeyboard =>
  listKeyboard({
    rows,
    openAction: CB.campaignOpen,
    pagination: { action: CB.campaignList, page, totalPages },
    footerRows: [
      [{ text: t.admin.campaignAdd, data: buildCallback(CB.campaignAdd) }, menuButton()],
    ],
  });

/** `cmp.st:<campaignId>:<CampaignStatus>` — joriy holat tugmasi ko'rsatilmaydi. */
export const campaignCardKeyboard = (campaignId: string, status: CampaignStatus): InlineKeyboard =>
  inlineGrid(
    [
      ...CAMPAIGN_TRANSITIONS.filter((next) => next !== status).map((next) => ({
        text: CAMPAIGN_TRANSITION_LABELS[next],
        data: buildCallback(CB.campaignStatus, campaignId, next),
      })),
      { text: t.kb.campaignAttachCars, data: buildCallback(CB.campaignCars, campaignId) },
      backButton(buildCallback(CB.campaignList, FIRST_PAGE)),
    ],
    2,
  );

// ───────────────────────────── Tekshiruvlar ─────────────────────────────

const CHECK_FILTERS: readonly CheckStatus[] = Object.freeze(['PENDING', 'SUBMITTED', 'EXPIRED']);

const checkFilterRow = (): readonly InlineButton[] =>
  Object.freeze([
    { text: t.kb.filterAll, data: buildCallback(CB.checkList, LIST_FILTER_ALL, FIRST_PAGE) },
    ...CHECK_FILTERS.map((status) => ({
      text: t.status.check[status],
      data: buildCallback(CB.checkList, status, FIRST_PAGE),
    })),
  ]);

/** `chk.ls:<filter>:<page>` — filter CheckStatus yoki 'ALL'. */
export const checkListKeyboard = (
  rows: readonly ListRow[],
  page: number,
  totalPages: number,
  filter: CheckStatus | typeof LIST_FILTER_ALL = LIST_FILTER_ALL,
): InlineKeyboard =>
  listKeyboard({
    rows,
    openAction: CB.checkOpen,
    pagination: { action: CB.checkList, page, totalPages, args: [filter] },
    footerRows: [
      checkFilterRow(),
      [{ text: t.admin.checkForceRun, data: buildCallback(CB.checkRun) }, menuButton()],
    ],
  });

/** Tekshiruvni tasdiqlash / rad etish. */
export const checkReviewKeyboard = (checkId: string): InlineKeyboard =>
  inlineGrid(
    [
      { text: t.admin.checkApprove, data: buildCallback(CB.checkApprove, checkId) },
      { text: t.admin.checkReject, data: buildCallback(CB.checkReject, checkId) },
      backButton(buildCallback(CB.checkList, LIST_FILTER_ALL, FIRST_PAGE)),
    ],
    2,
  );

// ─────────────────────── Xabar yuborish va statistika ───────────────────────

/** `bc.aud:<BroadcastAudience>` */
export const broadcastAudienceKeyboard = (): InlineKeyboard =>
  inlineGrid(
    [
      { text: t.admin.broadcastAll, data: buildCallback(CB.broadcastAudience, BROADCAST_AUDIENCE.all) },
      { text: t.admin.broadcastDrivers, data: buildCallback(CB.broadcastAudience, BROADCAST_AUDIENCE.drivers) },
      {
        text: t.admin.broadcastAdvertisers,
        data: buildCallback(CB.broadcastAudience, BROADCAST_AUDIENCE.advertisers),
      },
      menuButton(),
    ],
    1,
  );

export const statsKeyboard = (): InlineKeyboard =>
  inlineGrid([{ text: t.kb.refresh, data: buildCallback(CB.statsRefresh) }, menuButton()], 2);

// ───────────────────────────── Adminlar ─────────────────────────────

const GRANTABLE_ROLE_LABELS: Readonly<Record<GrantableRole, string>> = Object.freeze({
  ADMIN: t.admin.adminRoleAdmin,
  OPERATOR: t.admin.adminRoleOperator,
});

/** `adm.ls:<page>` */
export const adminListKeyboard = (
  rows: readonly ListRow[],
  page: number,
  totalPages: number,
): InlineKeyboard =>
  listKeyboard({
    rows,
    openAction: CB.adminOpen,
    pagination: { action: CB.adminList, page, totalPages },
    footerRows: [[{ text: t.admin.adminAdd, data: buildCallback(CB.adminAdd) }, menuButton()]],
  });

/**
 * Admin kartochkasi. `locked` — superadmin (env yoki DB): unda o'zgartirish
 * tugmalari umuman chizilmaydi, chunki bu huquq Railway sozlamalarida turadi.
 */
export const adminDetailKeyboard = (userId: string, locked: boolean): InlineKeyboard => {
  const actions: readonly InlineButton[] = locked
    ? []
    : [
        { text: t.admin.adminChangeRole, data: buildCallback(CB.adminRole, userId) },
        { text: t.admin.adminRevoke, data: buildCallback(CB.adminRevoke, userId) },
      ];

  return inlineGrid(
    [...actions, backButton(buildCallback(CB.adminList, FIRST_PAGE)), menuButton()],
    2,
  );
};

/** `adm.rl:<userId>:<GrantableRole>` — SUPERADMIN bu ro'yxatda yo'q. */
export const adminRoleKeyboard = (userId: string): InlineKeyboard =>
  inlineGrid(
    [
      ...GRANTABLE_ROLES.map((role) => ({
        text: GRANTABLE_ROLE_LABELS[role],
        data: buildCallback(CB.adminRole, userId, role),
      })),
      backButton(buildCallback(CB.adminOpen, userId)),
    ],
    2,
  );

export const adminRevokeConfirmKeyboard = (userId: string): InlineKeyboard =>
  inlineGrid(
    [
      { text: t.common.confirm, data: buildCallback(CB.adminRevokeYes, userId) },
      { text: t.common.cancel, data: buildCallback(CB.adminOpen, userId) },
    ],
    2,
  );
