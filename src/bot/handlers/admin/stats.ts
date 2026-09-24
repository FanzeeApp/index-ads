import type { Composer } from 'grammy';

import { t } from '../../../i18n/index.js';
import { buildAdminStats } from '../../../services/reportService.js';
import type { BotContext } from '../../bot.js';
import { callbackPattern, CB } from '../../callbacks.js';
import { statsKeyboard } from '../../keyboards/admin.js';
import { answerSafe, safeHandler } from '../guard.js';
import { renderPanel } from './shared.js';

/** Umumiy ko'rsatkichlar — reportService yagona hisoblash manbai. */
const showStats = async (ctx: BotContext): Promise<void> => {
  const stats = await buildAdminStats();
  await renderPanel(ctx, `${t.admin.statsTitle}\n\n${t.admin.statsBody(stats)}`, statsKeyboard());
};

export const registerStatsHandlers = (composer: Composer<BotContext>): void => {
  composer.callbackQuery(
    callbackPattern(CB.statsRefresh),
    safeHandler('admin:stats', async (ctx) => {
      await answerSafe(ctx);
      await showStats(ctx);
    }),
  );
};
