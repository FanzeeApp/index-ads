import type { Bot } from 'grammy';
import type { BotContext } from '../../bot.js';
import { registerDriverCheckHandlers } from './check.js';
import { registerDriverMenuHandlers } from './menu.js';

/**
 * Haydovchi oqimi: menyu tugmalari va tekshiruv (foto) jarayoni.
 * Fallback handlerlaridan OLDIN ulanishi shart — aks holda ular bu xabarlarni yutib yuboradi.
 */
export const registerDriverHandlers = (bot: Bot<BotContext>): void => {
  registerDriverMenuHandlers(bot);
  registerDriverCheckHandlers(bot);
};

export { sendDriverMenu } from './menu.js';
export { onCheckSubmitted, sendCheckPrompt, setBotForDriverCheck } from './check.js';
