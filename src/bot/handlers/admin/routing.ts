import { childLogger } from '../../../core/logger.js';
import type { BotContext } from '../../bot.js';
import { tryParseCallback } from '../../callbacks.js';
import { authOf } from '../guard.js';
import { ADMIN_CONVERSATION_PREFIX, ADMIN_ONLY_ACTIONS, SHARED_ACTIONS } from './shared.js';

/**
 * Admin panelining marshrutlash filtri.
 *
 * Bu yerda RUXSAT berilmaydi — faqat yangilanish panelga tegishlimi, shu hal
 * qilinadi. Ruxsatni `requireAdmin()` va servis qatlami beradi.
 */

const log = childLogger('admin:router');

/** Panelni ochuvchi buyruqlar. */
const ADMIN_COMMAND_PATTERN = /^\/(admin|panel)(@[\w_]+)?(\s|$)/i;

/**
 * Faol suhbatlar FAQAT plaginning o'z API si orqali o'qiladi.
 *
 * `ctx.session.conversation` ni to'g'ridan-to'g'ri o'qib bo'lmaydi: conversations
 * plagini holatni sessiyaga "listify" qilingan MASSIV ko'rinishida yozadi
 * (`[["",1,2],"admin_car_create",...]`) va uni faqat o'zining sessiya
 * yordamchisi qayta ochadi. Massiv ustida `Object.keys()` suhbat nomlarini emas,
 * indekslarni ("0", "1", …) qaytaradi — ya'ni har qanday tekshiruv jim yolg'on
 * beradi va suhbat kiritilgan matnni umuman ko'rmay qoladi.
 */
const hasActiveAdminConversation = async (ctx: BotContext): Promise<boolean> => {
  try {
    const active = await ctx.conversation.active();
    return Object.keys(active).some((id) => id.startsWith(ADMIN_CONVERSATION_PREFIX));
  } catch (error) {
    // Sessiya kaliti yo'q yangilanishlar (masalan kanal postlari) — panelga aloqasi yo'q.
    log.debug({ err: String(error) }, 'sessiya mavjud emas');
    return false;
  }
};

/**
 * Yangilanish admin paneliga tegishlimi?
 *
 *  • faol admin suhbati HAR QANDAY yangilanishni kutadi — matn, rasm va tanlov
 *    tugmalarini ham; lekin faqat odamda huquq turgan ekan. Huquqi olib
 *    tashlangan xodimning tugallanmagan suhbati aks holda uni botdan butunlay
 *    uzib qo'yardi: `requireAdmin()` uning har bir xabariga rad javobini berib,
 *    haydovchi menyusiga ham o'tkazmay qo'yardi;
 *  • admin amallari roldan qat'i nazar panelga kiradi, shunda ruxsatsiz urinish
 *    `requireAdmin()` da aniq rad javobini oladi;
 *  • umumiy tugmalar (bosh menyu, bekor qilish) esa faqat admin uchun
 *    yo'naltiriladi — aks holda haydovchi va reklama beruvchining "Bosh menyu"
 *    tugmasi admin paneliga tushib qolardi.
 */
export const isAdminUpdate = async (ctx: BotContext): Promise<boolean> => {
  if (await hasActiveAdminConversation(ctx)) return authOf(ctx).isAdmin;

  const parsed = tryParseCallback(ctx.callbackQuery?.data);
  if (parsed !== null) {
    if (ADMIN_ONLY_ACTIONS.has(parsed.action)) return true;
    return SHARED_ACTIONS.has(parsed.action) && authOf(ctx).isAdmin;
  }

  return ADMIN_COMMAND_PATTERN.test(ctx.message?.text ?? '');
};
