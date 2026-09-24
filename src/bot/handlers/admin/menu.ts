import type { Composer } from 'grammy';

import { env } from '../../../config/env.js';
import { t } from '../../../i18n/index.js';
import type { BotContext } from '../../bot.js';
import { CB, callbackPattern } from '../../callbacks.js';
import { adminMenuKeyboard } from '../../keyboards/admin.js';
import { backKeyboard } from '../../keyboards/common.js';
import { answerSafe, safeHandler } from '../guard.js';
import { renderPanel } from './shared.js';

/**
 * Admin panelining ildiz menyusi.
 * `start.ts` ham shu funksiyani chaqiradi — panelga yagona kirish nuqtasi.
 */
export const showAdminMenu = async (ctx: BotContext): Promise<void> => {
  await renderPanel(ctx, t.admin.menuTitle, adminMenuKeyboard());
};

/** Sozlamalar hozircha faqat ko'rish uchun — qiymatlar muhit o'zgaruvchilaridan keladi. */
const showSettings = async (ctx: BotContext): Promise<void> => {
  await renderPanel(
    ctx,
    t.admin.settingsBody({
      intervalDays: env.CHECK_INTERVAL_DAYS,
      deadlineHours: env.CHECK_DEADLINE_HOURS,
      reminderHours: env.CHECK_REMINDER_HOURS.join(', '),
      validationMode: env.PHOTO_VALIDATION_MODE,
      photoMaxAgeMinutes: env.PHOTO_MAX_AGE_MINUTES,
    }),
    backKeyboard(),
  );
};

export const registerMenuHandlers = (composer: Composer<BotContext>): void => {
  composer.command(
    ['admin', 'panel'],
    safeHandler('admin:menu', async (ctx) => {
      await showAdminMenu(ctx);
    }),
  );

  composer.callbackQuery(
    callbackPattern(CB.menu),
    safeHandler('admin:menu', async (ctx) => {
      await answerSafe(ctx);
      await showAdminMenu(ctx);
    }),
  );

  composer.callbackQuery(
    callbackPattern(CB.adminSettings),
    safeHandler('admin:settings', async (ctx) => {
      await answerSafe(ctx);
      await showSettings(ctx);
    }),
  );

  // Sahifa ko'rsatkichi kabi "tugmasiz" tugmalar — faqat soatni to'xtatamiz.
  composer.callbackQuery(
    callbackPattern(CB.noop),
    safeHandler('admin:noop', async (ctx) => {
      await answerSafe(ctx);
    }),
  );

  composer.callbackQuery(
    callbackPattern(CB.cancel),
    safeHandler('admin:cancel', async (ctx) => {
      await answerSafe(ctx, t.common.cancelled);
    }),
  );
};
