import { session, type MiddlewareFn } from 'grammy';
import type { BotContext, SessionData } from '../bot.js';
import { createPrismaSessionStorage } from './sessionStorage.js';

/** Yangi suhbat uchun bo'sh sessiya. Mavjud sessiyaga tegilmaydi. */
const initialSession = (): SessionData => ({});

/**
 * Sessiya kaliti foydalanuvchi bo'yicha olinadi: bot faqat shaxsiy chatlarda ishlaydi,
 * callback_query da esa `ctx.chat` bo'lmasligi mumkin, `ctx.from` esa doim mavjud.
 */
const resolveSessionKey = (ctx: Omit<BotContext, 'session'>): string | undefined =>
  ctx.from === undefined ? undefined : String(ctx.from.id);

/**
 * Sessiya PostgreSQL da saqlanadi.
 *
 * Xotiradagi saqlash (grammY ning standarti) Railway uchun yaramaydi: har
 * deploy konteynerni qayta ishga tushiradi va barcha holat o'chadi. Natijada
 * foydalanuvchi eski xabardagi tugmani bosganda hech narsa bo'lmaydi —
 * "tugmalar ishlamay qoldi" muammosining aynan shu sababi.
 */
export const createSessionMiddleware = (): MiddlewareFn<BotContext> =>
  session<SessionData, BotContext>({
    initial: initialSession,
    getSessionKey: resolveSessionKey,
    storage: createPrismaSessionStorage<SessionData>(),
  });

/**
 * Sessiyani tozalaydi. Mavjud obyekt o'zgartirilmaydi — yangi nusxa yoziladi,
 * shunda conversations plagini saqlagan maydonlar ham joyida qoladi.
 */
export const resetSession = (ctx: BotContext): void => {
  ctx.session = { ...ctx.session, step: undefined, draft: undefined, page: undefined };
};
