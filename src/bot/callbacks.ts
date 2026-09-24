import { z } from 'zod';
import { CALLBACK_SEPARATOR } from '../config/constants.js';
import { AppError, ValidationError } from '../core/errors.js';

/**
 * Telegram callback_data uchun 64 baytlik qattiq chegara qo'yadi.
 * Chegaradan oshgan tugma Telegram tomonidan rad etiladi va sabab ko'rinmaydi —
 * shuning uchun buni ishlab chiqish bosqichidayoq xato sifatida ushlaymiz.
 */
export const CALLBACK_DATA_MAX_BYTES = 64;
const MAX_ACTION_LENGTH = 32;
const MAX_PART_COUNT = 8;
const MAX_PART_LENGTH = 48;

/** Callback ichida ishlatiladigan amallar — klaviatura va handler bitta manbadan oladi. */
export const CB = Object.freeze({
  noop: 'noop',
  menu: 'menu',
  back: 'back',
  cancel: 'cancel',
  confirm: 'confirm',

  adminSettings: 'a.set',
  carList: 'car.ls',
  carOpen: 'car.op',
  carAdd: 'car.new',
  carAssign: 'car.as',
  carUnassign: 'car.un',
  carStatus: 'car.st',
  carArchive: 'car.ar',
  carReferral: 'car.rf',

  driverList: 'drv.ls',
  driverOpen: 'drv.op',
  driverUnlink: 'drv.ul',
  /** Haydovchi uchun: eskirgan Mini App havolasini yangilash. */
  driverCheckRefresh: 'drv.chk',

  advertiserList: 'adv.ls',
  advertiserOpen: 'adv.op',
  advertiserAdd: 'adv.new',
  advertiserInvite: 'adv.iv',
  advertiserCampaigns: 'adv.cm',
  /** Reklama beruvchi kabineti (o'z hisobi bo'yicha). */
  myCampaigns: 'my.cmp',
  advertiserFeed: 'adv.fd',
  advertiserReport: 'adv.rp',
  advertiserPhotos: 'adv.ph',

  campaignList: 'cmp.ls',
  campaignOpen: 'cmp.op',
  campaignAdd: 'cmp.new',
  campaignStatus: 'cmp.st',
  campaignCars: 'cmp.cr',

  checkList: 'chk.ls',
  checkOpen: 'chk.op',
  checkApprove: 'chk.ok',
  checkReject: 'chk.no',
  checkRun: 'chk.run',

  broadcastAudience: 'bc.aud',
  statsRefresh: 'st.rf',

  /** Admin boshqaruvi — faqat SUPERADMIN uchun. */
  adminList: 'adm.ls',
  adminOpen: 'adm.op',
  adminAdd: 'adm.new',
  adminRevoke: 'adm.rv',
  adminRevokeYes: 'adm.rvy',
  adminRole: 'adm.rl',
} as const);

export type CallbackAction = (typeof CB)[keyof typeof CB];

export type ParsedCallback = {
  readonly action: string;
  readonly parts: readonly string[];
};

const parsedSchema = z.object({
  action: z.string().min(1).max(MAX_ACTION_LENGTH),
  parts: z.array(z.string().max(MAX_PART_LENGTH)).max(MAX_PART_COUNT),
});

/** Dasturchi xatosi — foydalanuvchiga ko'rsatilmaydi, lekin loglanadi. */
const developerError = (message: string, meta: Record<string, unknown>): AppError =>
  new AppError('CALLBACK_BUILD', message, { userFacing: false, statusCode: 500, meta });

const assertSegment = (value: string, label: string): void => {
  if (value.length === 0) {
    throw developerError(`${label} bo'sh bo'lishi mumkin emas`, { label });
  }
  if (value.includes(CALLBACK_SEPARATOR)) {
    throw developerError(`${label} ichida ajratuvchi belgi bo'lmasligi kerak`, { label, value });
  }
};

/**
 * callback_data qatorini yig'adi: "action:part1:part2".
 * Har bir bo'lak tekshiriladi va umumiy uzunlik 64 baytdan oshmasligi kafolatlanadi.
 */
export const buildCallback = (action: string, ...parts: readonly (string | number)[]): string => {
  assertSegment(action, 'action');
  if (action.length > MAX_ACTION_LENGTH) {
    throw developerError('action juda uzun', { action, max: MAX_ACTION_LENGTH });
  }
  if (parts.length > MAX_PART_COUNT) {
    throw developerError('callback bo\'laklari juda ko\'p', { count: parts.length, max: MAX_PART_COUNT });
  }

  const encoded = parts.map((part) => String(part));
  encoded.forEach((part, index) => assertSegment(part, `part[${index}]`));

  const data = [action, ...encoded].join(CALLBACK_SEPARATOR);
  const bytes = Buffer.byteLength(data, 'utf8');
  if (bytes > CALLBACK_DATA_MAX_BYTES) {
    throw developerError('callback_data 64 baytdan oshib ketdi', { data, bytes });
  }
  return data;
};

/**
 * callback_data ni xavfsiz ajratadi. Telegram eski (deploy oldidan qolgan) tugmalarni ham
 * yuborishi mumkin, shuning uchun shakl zod bilan tekshiriladi.
 */
export const parseCallback = (data: string): ParsedCallback => {
  const segments = data.split(CALLBACK_SEPARATOR);
  const [action = '', ...parts] = segments;
  const result = parsedSchema.safeParse({ action, parts });

  if (!result.success) {
    throw new ValidationError('Tugma ma\'lumoti yaroqsiz', { data });
  }
  return Object.freeze({ action: result.data.action, parts: Object.freeze([...result.data.parts]) });
};

/** Xato tashlamaydigan variant — eski tugmalarni jimgina e'tiborsiz qoldirish uchun. */
export const tryParseCallback = (data: string | undefined): ParsedCallback | null => {
  if (!data) return null;
  try {
    return parseCallback(data);
  } catch {
    return null;
  }
};

/** Bo'lakni raqamga o'giradi; yaroqsiz bo'lsa zaxira qiymat qaytadi. */
export const callbackNumber = (parts: readonly string[], index: number, fallback: number): number => {
  const raw = parts[index];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * bot.callbackQuery(...) uchun namuna: amal nomi aynan mos kelsa yoki
 * undan keyin ajratuvchi kelsa ishlaydi.
 */
export const callbackPattern = (action: string): RegExp =>
  new RegExp(`^${escapeRegExp(action)}(?:${escapeRegExp(CALLBACK_SEPARATOR)}|$)`);
