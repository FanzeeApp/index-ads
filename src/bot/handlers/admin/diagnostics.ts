import type { Composer } from 'grammy';
import { prisma } from '../../../db/client.js';
import { describeError } from '../../../core/errors.js';
import { childLogger } from '../../../core/logger.js';
import { env } from '../../../config/env.js';
import { escapeHtml } from '../../../utils/html.js';
import { formatDateTime } from '../../../utils/time.js';
import type { BotContext } from '../../bot.js';
import { safeHandler } from '../guard.js';

/**
 * `/diag` — botning o'zini o'zi tekshirishi.
 *
 * Nega kerak: "tugmalar ishlamayapti" holatida eng muhim savol —
 * Telegram yangilanishlarni umuman yetkazyaptimi. Bunga faqat
 * `getWebhookInfo` javob beradi, u esa bot tokenini talab qiladi.
 * Buyruq shu ma'lumotni bevosita adminga chiqaradi, shunda token
 * hech qayerga ko'chirilmaydi va sabab bir bosishda ko'rinadi.
 */

const log = childLogger('admin:diag');

const OK = '✅';
const WARN = '⚠️';
const FAIL = '❌';

/** Telegram xato sanasini o'qiladigan ko'rinishga keltiradi. */
const formatErrorDate = (unixSeconds: number | undefined): string =>
  unixSeconds === undefined ? '—' : formatDateTime(new Date(unixSeconds * 1000));

const webhookSection = async (ctx: BotContext): Promise<string> => {
  try {
    const info = await ctx.api.getWebhookInfo();
    const expected = `${env.PUBLIC_URL ?? ''}/webhook/`;
    const url = info.url ?? '';
    const urlOk = url.length > 0 && url.startsWith(expected);

    const lines = [
      `${urlOk ? OK : FAIL} <b>Webhook</b>`,
      `   Manzil: ${url.length > 0 ? 'o\'rnatilgan' : '<b>O\'RNATILMAGAN</b>'}`,
      `   Mos keladi: ${urlOk ? 'ha' : '<b>YO\'Q — PUBLIC_URL tekshiring</b>'}`,
      `   Navbatdagi yangilanishlar: ${info.pending_update_count}`,
    ];

    if (info.last_error_message !== undefined) {
      lines.push(
        `   ${FAIL} Oxirgi xato: <code>${escapeHtml(info.last_error_message)}</code>`,
        `   Vaqti: ${formatErrorDate(info.last_error_date)}`,
      );
    } else {
      lines.push(`   ${OK} Yetkazishda xato yo'q`);
    }

    if (info.pending_update_count > 0) {
      lines.push(`   ${WARN} Navbat bo'sh emas — yangilanishlar qayta ishlanmayapti`);
    }
    return lines.join('\n');
  } catch (error) {
    return `${FAIL} <b>Webhook</b>\n   Ma'lumot olinmadi: <code>${escapeHtml(describeError(error))}</code>`;
  }
};

const identitySection = async (ctx: BotContext): Promise<string> => {
  try {
    const me = await ctx.api.getMe();
    const matches = me.username === env.BOT_USERNAME;
    return [
      `${matches ? OK : FAIL} <b>Bot</b>`,
      `   @${escapeHtml(me.username ?? '—')} (id ${me.id})`,
      matches ? '' : `   ${FAIL} BOT_USERNAME sozlamasi (${escapeHtml(env.BOT_USERNAME)}) mos emas — referal havolalar buziladi`,
    ]
      .filter((line) => line.length > 0)
      .join('\n');
  } catch (error) {
    return `${FAIL} <b>Bot</b>\n   Token ishlamayapti: <code>${escapeHtml(describeError(error))}</code>`;
  }
};

const databaseSection = async (): Promise<string> => {
  try {
    const [cars, drivers, campaigns, pending, sessions] = await prisma.$transaction([
      prisma.car.count(),
      prisma.driver.count(),
      prisma.campaign.count({ where: { status: 'ACTIVE' } }),
      prisma.checkRequest.count({ where: { status: 'PENDING' } }),
      prisma.botSession.count(),
    ]);
    return [
      `${OK} <b>Ma'lumotlar bazasi</b>`,
      `   Mashinalar: ${cars} · Haydovchilar: ${drivers}`,
      `   Faol kampaniyalar: ${campaigns} · Kutilayotgan tekshiruvlar: ${pending}`,
      `   Saqlangan sessiyalar: ${sessions}`,
    ].join('\n');
  } catch (error) {
    return `${FAIL} <b>Ma'lumotlar bazasi</b>\n   <code>${escapeHtml(describeError(error))}</code>`;
  }
};

const configSection = (): string =>
  [
    `${env.ARCHIVE_CHAT_ID === undefined ? WARN : OK} <b>Sozlamalar</b>`,
    `   Rejim: ${env.BOT_MODE}`,
    `   Rasm arxivi: ${env.ARCHIVE_CHAT_ID === undefined ? 'SOZLANMAGAN — rasmlar saqlanmaydi' : 'sozlangan'}`,
    `   Tekshiruv: har ${env.CHECK_INTERVAL_DAYS} kun, ${env.CHECK_DEADLINE_HOURS} soat muddat`,
    `   Rasm tekshiruvi: ${env.PHOTO_VALIDATION_MODE}`,
  ].join('\n');

export const registerDiagnosticsHandlers = (composer: Composer<BotContext>): void => {
  composer.command(
    ['diag', 'tekshir'],
    safeHandler('admin:diag', async (ctx: BotContext) => {
      log.info({ userId: ctx.from?.id }, 'Tashxis so\'raldi');
      const [identity, webhook, database] = await Promise.all([
        identitySection(ctx),
        webhookSection(ctx),
        databaseSection(),
      ]);
      await ctx.reply([identity, webhook, database, configSection()].join('\n\n'), {
        parse_mode: 'HTML',
      });
    }),
  );
};
