import { createConversation } from '@grammyjs/conversations';
import { Composer, type Bot, type Middleware } from 'grammy';

import { childLogger } from '../../../core/logger.js';
import type { BotContext } from '../../bot.js';
import { requireAdmin } from '../../middlewares/auth.js';
import { adminGrantConversation } from './adminGrant.js';
import { registerAdminUserHandlers } from './admins.js';
import { advertiserCreateConversation, registerAdvertiserHandlers } from './advertisers.js';
import { broadcastConversation, registerBroadcastHandlers } from './broadcast.js';
import { campaignCarsConversation, campaignCreateConversation, registerCampaignHandlers } from './campaigns.js';
import { carAssignConversation, carCreateConversation } from './carCreate.js';
import { carSearchConversation, registerCarHandlers } from './cars.js';
import { checkRejectConversation, checkRunConversation, registerCheckHandlers } from './checks.js';
import { driverSearchConversation, registerDriverHandlers } from './drivers.js';
import { registerMenuHandlers, showAdminMenu } from './menu.js';
import { isAdminUpdate } from './routing.js';
import { CONVERSATION, CONVERSATION_IDLE_TTL_MS, type AdminConversation } from './shared.js';
import { registerDiagnosticsHandlers } from './diagnostics.js';
import { registerStatsHandlers } from './stats.js';

const log = childLogger('admin:router');

type AdminConversationFn = (conversation: AdminConversation, ctx: BotContext) => Promise<void>;

/**
 * Suhbat middleware'ini bitta joyda turga keltiramiz — `createConversation`
 * `C & ConversationFlavor` qaytaradi, `BotContext` esa uni allaqachon o'z ichiga oladi.
 */
const conversationMiddleware = (
  builder: AdminConversationFn,
  id: string,
): Middleware<BotContext> =>
  createConversation<BotContext>(builder, { id, maxMillisecondsToWait: CONVERSATION_IDLE_TTL_MS });

const registerConversations = (composer: Composer<BotContext>): void => {
  composer.use(conversationMiddleware(carCreateConversation, CONVERSATION.carCreate));
  composer.use(conversationMiddleware(carAssignConversation, CONVERSATION.carAssign));
  composer.use(conversationMiddleware(carSearchConversation, CONVERSATION.carSearch));
  composer.use(conversationMiddleware(driverSearchConversation, CONVERSATION.driverSearch));
  composer.use(conversationMiddleware(advertiserCreateConversation, CONVERSATION.advertiserCreate));
  composer.use(conversationMiddleware(campaignCreateConversation, CONVERSATION.campaignCreate));
  composer.use(conversationMiddleware(campaignCarsConversation, CONVERSATION.campaignCars));
  composer.use(conversationMiddleware(checkRejectConversation, CONVERSATION.checkReject));
  composer.use(conversationMiddleware(checkRunConversation, CONVERSATION.checkRun));
  composer.use(conversationMiddleware(broadcastConversation, CONVERSATION.broadcast));
  composer.use(conversationMiddleware(adminGrantConversation, CONVERSATION.adminGrant));
};

/**
 * Admin panelini botga ulaydi.
 *
 * Zanjir tartibi muhim:
 *   1) `filter` — faqat panelga tegishli yangilanishlar kiradi, qolgani
 *      keyingi handlerlarga (haydovchi, reklama beruvchi) o'tadi;
 *   2) `requireAdmin()` — buyruq ham, callback ham, suhbat davomi ham himoyalanadi;
 *   3) suhbatlar, so'ng bo'lim handlerlari.
 */
export const registerAdminHandlers = (bot: Bot<BotContext>): void => {
  const panel = new Composer<BotContext>();

  panel.use(requireAdmin());

  registerConversations(panel);

  registerMenuHandlers(panel);
  registerCarHandlers(panel);
  registerDriverHandlers(panel);
  registerAdvertiserHandlers(panel);
  registerCampaignHandlers(panel);
  registerCheckHandlers(panel);
  registerBroadcastHandlers(panel);
  registerStatsHandlers(panel);
  registerDiagnosticsHandlers(panel);
  registerAdminUserHandlers(panel);

  bot.filter(isAdminUpdate).use(panel);
  log.info('Admin panel handlerlari ulandi');
};

export { showAdminMenu };
