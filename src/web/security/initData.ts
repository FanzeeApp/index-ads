import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { ValidationError } from '../../core/errors.js';

/**
 * Telegram Mini App `initData` ni tekshiradi.
 * Rasmiy algoritm:
 *   secret  = HMAC_SHA256(key = "WebAppData", msg = bot_token)
 *   hash    = HMAC_SHA256(key = secret,       msg = data_check_string)
 * `data_check_string` — "hash" dan tashqari barcha maydonlar `key=value`
 * ko'rinishida, kalit bo'yicha alifbo tartibida, `\n` bilan birlashtirilgan.
 *
 * @see https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */

const webAppUserSchema = z.object({
  id: z.number().int().positive(),
  is_bot: z.boolean().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  language_code: z.string().optional(),
});

export type WebAppUser = Readonly<z.infer<typeof webAppUserSchema>>;

export type VerifiedInitData = {
  readonly user: WebAppUser;
  readonly authDate: Date;
  readonly startParam?: string;
  readonly queryId?: string;
};

/** initData ning eng katta ruxsat etilgan "yoshi" — takroriy hujumlarni cheklaydi. */
const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;

const secretKey = createHmac('sha256', 'WebAppData').update(env.BOT_TOKEN).digest();

const buildDataCheckString = (params: URLSearchParams): string =>
  Array.from(params.entries())
    .filter(([key]) => key !== 'hash' && key !== 'signature')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

const hashesMatch = (expectedHex: string, actualHex: string): boolean => {
  if (expectedHex.length !== actualHex.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expectedHex, 'hex'), Buffer.from(actualHex, 'hex'));
  } catch {
    return false;
  }
};

export const verifyInitData = (rawInitData: string, now: Date = new Date()): VerifiedInitData => {
  if (typeof rawInitData !== 'string' || rawInitData.length === 0 || rawInitData.length > 8192) {
    throw new ValidationError('initData yaroqsiz');
  }

  const params = new URLSearchParams(rawInitData);

  const providedHash = params.get('hash');
  if (!providedHash || !/^[0-9a-f]{64}$/i.test(providedHash)) {
    throw new ValidationError('initData imzosi yo\'q');
  }

  const expectedHash = createHmac('sha256', secretKey).update(buildDataCheckString(params)).digest('hex');
  if (!hashesMatch(expectedHash, providedHash.toLowerCase())) {
    throw new ValidationError('initData imzosi mos emas');
  }

  const authDateRaw = Number(params.get('auth_date'));
  if (!Number.isFinite(authDateRaw) || authDateRaw <= 0) {
    throw new ValidationError('initData: auth_date yaroqsiz');
  }

  const authDate = new Date(authDateRaw * 1000);
  const ageSeconds = (now.getTime() - authDate.getTime()) / 1000;
  if (ageSeconds > MAX_AUTH_AGE_SECONDS) {
    throw new ValidationError('Sessiya muddati tugagan — botga qaytib qayta urinib ko\'ring');
  }
  // Kelajakdagi sana — soat nosozligi yoki qalbakilashtirish belgisi.
  if (ageSeconds < -300) {
    throw new ValidationError('initData: auth_date kelajakda');
  }

  const rawUser = params.get('user');
  if (!rawUser) throw new ValidationError('initData: foydalanuvchi maʼlumoti yo\'q');

  let parsedUser: unknown;
  try {
    parsedUser = JSON.parse(rawUser);
  } catch {
    throw new ValidationError('initData: foydalanuvchi JSON buzilgan');
  }

  const user = webAppUserSchema.safeParse(parsedUser);
  if (!user.success) throw new ValidationError('initData: foydalanuvchi maydonlari yaroqsiz');

  return Object.freeze({
    user: Object.freeze(user.data),
    authDate,
    startParam: params.get('start_param') ?? undefined,
    queryId: params.get('query_id') ?? undefined,
  });
};
