/**
 * Web qatlamining yagona xato formati.
 *
 * Nima uchun: Mini App faqat JSON tushunadi va foydalanuvchiga o'zbekcha xabar
 * ko'rsatishi kerak. Shu bilan birga ichki xatolar (stack, SQL, token) hech qachon
 * brauzerga chiqmasligi shart — shuning uchun faqat `userFacing` xatolar matni
 * uzatiladi, qolganlari umumiy xabarga almashtiriladi.
 */

import { isAppError } from '../core/errors.js';
import { t } from '../i18n/index.js';

export type ApiErrorBody = {
  readonly ok: false;
  readonly code: string;
  readonly message: string;
};

export type ApiErrorResponse = {
  readonly status: number;
  readonly body: ApiErrorBody;
};

const INTERNAL_STATUS = 500;
const INTERNAL_CODE = 'INTERNAL';
const MIN_ERROR_STATUS = 400;
const MAX_ERROR_STATUS = 599;

/**
 * Fastify va plaginlar xatolari `statusCode` maydonini olib yuradi (masalan,
 * noto'g'ri JSON — 400). Holat kodini saqlaymiz, lekin matnni umumiylashtiramiz.
 */
const readStatusCode = (error: unknown): number => {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) return INTERNAL_STATUS;
  const raw = (error as { statusCode: unknown }).statusCode;
  if (typeof raw !== 'number' || raw < MIN_ERROR_STATUS || raw > MAX_ERROR_STATUS) return INTERNAL_STATUS;
  return raw;
};

/** Xatoni HTTP holat kodi + xavfsiz JSON tanaga aylantiradi. */
export const toApiError = (error: unknown): ApiErrorResponse => {
  if (isAppError(error) && error.userFacing) {
    return Object.freeze({
      status: error.statusCode,
      body: Object.freeze({ ok: false as const, code: error.code, message: error.message }),
    });
  }

  return Object.freeze({
    status: readStatusCode(error),
    body: Object.freeze({ ok: false as const, code: INTERNAL_CODE, message: t.miniapp.errorGeneric }),
  });
};
