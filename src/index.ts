/**
 * Ilovaning yagona kirish nuqtasi.
 *
 * Nima uchun aynan shu tartib: sozlama → baza → bot → xizmatlar → HTTP → update
 * oqimi → rejalashtiruvchi. Har bir qadam oldingisiga tayanadi, shuning uchun
 * `await` majburiy: yarim ishga tushgan holatda Telegram update kelib qolsa, u
 * baza ulanishini yoki bot instansiyasini topa olmagan bo'lardi.
 *
 * Railway konteynerni to'xtatishda SIGTERM yuboradi va uzoq kutmaydi — shu
 * sababli bu yerda to'liq graceful shutdown va qattiq taymer bor.
 */

import { run, type RunnerHandle } from '@grammyjs/runner';
import type { Bot } from 'grammy';
import { createBot, type BotContext } from './bot/bot.js';
import { env } from './config/env.js';
import { describeError } from './core/errors.js';
import { childLogger } from './core/logger.js';
import { connectDatabase, disconnectDatabase } from './db/client.js';
import { t } from './i18n/index.js';
import { startScheduler, stopScheduler } from './scheduler/index.js';
import { setBotForNotify } from './services/notifyService.js';
import { setBotForStorage } from './services/storageService.js';
import { startServer, stopServer } from './web/server.js';

const log = childLogger('bootstrap');

/** Graceful shutdown shuncha kutadi; keyin jarayon majburan yopiladi. */
const SHUTDOWN_TIMEOUT_MS = 15_000;

/** Majburan yopilgan jarayon normal tugallanmagan — chiqish kodi ham shuni bildiradi. */
const EXIT_OK = 0;
const EXIT_FAILURE = 1;

/**
 * Faqat kerakli update turlari: ortiqchasi bekorga trafik va ishlov vaqtini yeydi.
 * `my_chat_member` kerak — haydovchi botni bloklaganini shu orqali bilamiz.
 */
const ALLOWED_UPDATES = Object.freeze([
  'message',
  'edited_message',
  'callback_query',
  'my_chat_member',
] as const);

/** Telegram buyruqlar menyusi (klaviatura yonidagi «/» ro'yxati). */
const BOT_COMMANDS = Object.freeze([
  { command: 'start', description: t.commands.start },
  { command: 'menu', description: t.commands.menu },
  { command: 'yordam', description: t.commands.help },
]);

type Runtime = {
  readonly bot: Bot<BotContext>;
  readonly runner: RunnerHandle | null;
};

let runtime: Runtime | null = null;
let isShuttingDown = false;

/** Diagnostika uchun kontekst. Token va webhook siri bu yerga hech qachon tushmaydi. */
const logStartupContext = (): void => {
  log.info(
    {
      nodeEnv: env.NODE_ENV,
      botMode: env.BOT_MODE,
      botUsername: env.BOT_USERNAME,
      host: env.HOST,
      port: env.PORT,
      admins: env.SUPER_ADMIN_IDS.length,
      archiveConfigured: env.ARCHIVE_CHAT_ID !== undefined,
      checkIntervalDays: env.CHECK_INTERVAL_DAYS,
      checkDeadlineHours: env.CHECK_DEADLINE_HOURS,
      photoValidationMode: env.PHOTO_VALIDATION_MODE,
    },
    'Ishga tushirilmoqda',
  );
};

/**
 * Webhook manzilida sir yo'lning bir qismi bo'ladi — begona so'rov hatto
 * marshrutga ham tushmaydi. Ikkinchi qatlam: Telegram yuboradigan
 * `secret_token` sarlavhasi (uni HTTP qatlami tekshiradi).
 */
const webhookUrl = (): string => `${env.PUBLIC_URL}/webhook/${env.WEBHOOK_SECRET}`;

/** Webhook rejimida update larni Fastify qabul qiladi, shuning uchun runner yo'q. */
const startWebhookMode = async (bot: Bot<BotContext>): Promise<null> => {
  await bot.api.setWebhook(webhookUrl(), {
    secret_token: env.WEBHOOK_SECRET,
    drop_pending_updates: false,
    allowed_updates: [...ALLOWED_UPDATES],
  });

  log.info({ publicUrl: env.PUBLIC_URL }, "Webhook o'rnatildi");
  return null;
};

/** Polling rejimi — mahalliy ishlab chiqish uchun. */
const startPollingMode = async (bot: Bot<BotContext>): Promise<RunnerHandle> => {
  // Avval webhook o'chiriladi: aks holda getUpdates 409 Conflict qaytaradi.
  await bot.api.deleteWebhook({ drop_pending_updates: false });

  const handle = run(bot, {
    runner: { fetch: { allowed_updates: [...ALLOWED_UPDATES] } },
  });

  log.info('Polling rejimi ishga tushdi');
  return handle;
};

/** Menyu ikkinchi darajali: u o'rnatilmasa ham bot to'liq ishlaydi. */
const publishCommands = async (bot: Bot<BotContext>): Promise<void> => {
  try {
    await bot.api.setMyCommands([...BOT_COMMANDS]);
  } catch (error) {
    log.warn({ err: describeError(error) }, "Buyruqlar menyusini o'rnatib bo'lmadi");
  }
};

const bootstrap = async (): Promise<void> => {
  logStartupContext();

  await connectDatabase();

  const bot = createBot();
  setBotForNotify(bot);
  setBotForStorage(bot);

  // botInfo webhook rejimida ham kerak: grammY update ni bot nomi bilan qayta ishlaydi.
  await bot.init();

  await startServer(bot);

  const runner = env.BOT_MODE === 'webhook' ? await startWebhookMode(bot) : await startPollingMode(bot);

  startScheduler();
  await publishCommands(bot);

  runtime = Object.freeze({ bot, runner });
  log.info({ username: bot.botInfo.username }, 'Bot ishga tushdi');
};

/** To'xtatish bosqichi xatosi jim yutilmaydi, lekin zanjirni uzmaydi. */
const step = async (name: string, action: () => Promise<void> | void): Promise<void> => {
  try {
    await action();
  } catch (error) {
    log.error({ step: name, err: describeError(error) }, "To'xtatish bosqichida xato");
  }
};

/** Polling da runner, webhook da esa botning o'zi to'xtatiladi. */
const stopUpdates = async (current: Runtime): Promise<void> => {
  if (current.runner) {
    await current.runner.stop();
    return;
  }
  await current.bot.stop();
};

/**
 * Tartib teskari: avval yangi ish kelishi to'xtatiladi (jadval, update oqimi,
 * HTTP), keyingina baza uziladi — shunda ketayotgan so'rov yarmida qolmaydi.
 */
const shutdown = async (reason: string, exitCode: number = EXIT_OK): Promise<void> => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  log.info({ reason }, "To'xtatilmoqda");

  // Biror bosqich osilib qolsa ham konteyner abadiy yopilmay qolmasligi kerak.
  const hardStop = setTimeout(() => {
    log.error({ timeoutMs: SHUTDOWN_TIMEOUT_MS }, "Xavfsiz to'xtatish cho'zildi — majburan yopilmoqda");
    process.exit(EXIT_FAILURE);
  }, SHUTDOWN_TIMEOUT_MS);
  hardStop.unref();

  const current = runtime;
  await step('rejalashtiruvchi', () => stopScheduler());
  if (current) await step('update oqimi', () => stopUpdates(current));
  await step('HTTP server', () => stopServer());
  await step('baza', () => disconnectDatabase());

  clearTimeout(hardStop);
  log.info("To'xtatildi");
  process.exit(exitCode);
};

const registerProcessHandlers = (): void => {
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));

  // Ushlanmagan promise jarayonni o'ldirmaydi, lekin jim ham qolmaydi.
  process.on('unhandledRejection', (reason) => {
    log.error({ err: describeError(reason) }, 'Ushlanmagan promise rad etildi');
  });

  // Ushlanmagan istisnodan keyin holat noaniq — xavfsiz to'xtatish yagona to'g'ri yo'l.
  process.on('uncaughtException', (error) => {
    log.fatal({ err: describeError(error) }, "Ushlanmagan istisno — xavfsiz to'xtatilmoqda");
    void shutdown('uncaughtException', EXIT_FAILURE);
  });
};

registerProcessHandlers();

bootstrap().catch((error) => {
  log.fatal({ err: describeError(error) }, "Ishga tushirib bo'lmadi");
  process.exit(EXIT_FAILURE);
});
