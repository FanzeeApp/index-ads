import { autoRetry } from '@grammyjs/auto-retry';
import { conversations, type ConversationFlavor } from '@grammyjs/conversations';
import type { User } from '@prisma/client';
import { Bot, type Context, type SessionFlavor } from 'grammy';
import { env } from '../config/env.js';
import { describeError } from '../core/errors.js';
import { childLogger } from '../core/logger.js';
import { registerAdminHandlers } from './handlers/admin/index.js';
import { registerAdvertiserHandlers } from './handlers/advertiser/index.js';
import { registerDriverHandlers } from './handlers/driver/index.js';
import { registerFallbackHandlers } from './handlers/fallback.js';
import { registerStartHandlers } from './handlers/start.js';
import { authMiddleware } from './middlewares/auth.js';
import { errorBoundary } from './middlewares/errorBoundary.js';
import { rateLimit } from './middlewares/rateLimit.js';
import { createSessionMiddleware } from './middlewares/session.js';
import { updateLog } from './middlewares/updateLog.js';

const log = childLogger('bot:core');

/** Telegram vaqtincha xatolarida qayta urinish chegaralari. */
const AUTO_RETRY_MAX_ATTEMPTS = 3;
const AUTO_RETRY_MAX_DELAY_SECONDS = 60;

/** Ko'p qadamli suhbatlar va ro'yxatlarning vaqtinchalik holati. */
export type SessionData = {
  step?: string;
  draft?: Record<string, unknown>;
  page?: number;
};

export type AppRole = 'SUPERADMIN' | 'ADMIN' | 'OPERATOR' | 'ADVERTISER' | 'DRIVER' | 'GUEST';

export type AuthState = {
  readonly user: User | null;
  readonly role: AppRole;
  readonly isAdmin: boolean;
};

/** auth middleware `ctx.auth` ni shu shaklda to'ldiradi. */
export type AuthFlavor = { auth: AuthState };

export type BotContext = Context & SessionFlavor<SessionData> & ConversationFlavor & AuthFlavor;

/** Handler modullari shu imzoga ega bo'ladi. */
export type HandlerRegistrar = (bot: Bot<BotContext>) => void;

export const bot: Bot<BotContext> = new Bot<BotContext>(env.BOT_TOKEN);

bot.api.config.use(
  autoRetry({
    maxRetryAttempts: AUTO_RETRY_MAX_ATTEMPTS,
    maxDelaySeconds: AUTO_RETRY_MAX_DELAY_SECONDS,
  }),
);

/**
 * Oxirgi himoya chizig'i: errorBoundary ushlamagan (masalan, uning o'zida yuz bergan)
 * xato ham jim qolmasligi kerak.
 */
bot.catch((botError) => {
  log.error(
    { userId: botError.ctx?.from?.id, reason: describeError(botError.error) },
    "Ushlanmagan bot xatosi",
  );
});

/** Middleware ikki marta ulanib qolmasligi uchun — createBot() idempotent. */
let isWired = false;

/**
 * Middleware va handlerlarni belgilangan tartibda ulaydi.
 * Tartib muhim: xato chegarasi eng tashqarida, rol aniqlash esa handlerlardan oldin.
 */
export const createBot = (): Bot<BotContext> => {
  if (isWired) return bot;
  isWired = true;

  // Eng birinchi: har bir yangilanish qayd etilsin (xato bo'lsa ham).
  bot.use(updateLog());
  bot.use(errorBoundary());
  bot.use(rateLimit());
  bot.use(createSessionMiddleware());
  bot.use(conversations<BotContext>());
  bot.use(authMiddleware());

  registerStartHandlers(bot);
  registerAdminHandlers(bot);
  registerAdvertiserHandlers(bot);
  registerDriverHandlers(bot);

  registerFallbackHandlers(bot);

  log.info({ mode: env.BOT_MODE, username: env.BOT_USERNAME }, 'Bot yig\'ildi');
  return bot;
};
