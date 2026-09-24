import { InlineKeyboard, Keyboard } from 'grammy';
import { AppError } from '../../core/errors.js';
import { t } from '../../i18n/index.js';
import { buildCallback, CB } from '../callbacks.js';
import { inlineGrid, menuButton, replyKeyboard } from './common.js';

/** Telegram Mini App faqat HTTPS havolani qabul qiladi. */
const WEB_APP_URL_PREFIX = 'https://';

/** Haydovchining doimiy menyusi — matnli tugmalar, chatda doim ko'rinib turadi. */
export const driverMenuKeyboard = (): Keyboard =>
  replyKeyboard([
    [t.driver.myCar, t.driver.myChecks],
    [t.driver.help],
  ]);

/** Telefon raqamini so'rash — faqat kontakt tugmasi orqali (qo'lda yozilgan raqam ishonchsiz). */
export const requestPhoneKeyboard = (): Keyboard =>
  new Keyboard().requestContact(t.start.sharePhoneButton).resized().oneTime();

/**
 * Tekshiruv xabarining tugmasi. Kamera FAQAT Mini App orqali ochiladi —
 * shuning uchun bu yerda `webApp` ishlatiladi, oddiy url emas.
 */
export const checkPromptKeyboard = (webAppUrl: string): InlineKeyboard => {
  if (!webAppUrl.startsWith(WEB_APP_URL_PREFIX)) {
    throw new AppError('WEBAPP_URL', 'Mini App havolasi HTTPS bo\'lishi shart', {
      userFacing: false,
      statusCode: 500,
      meta: { webAppUrl },
    });
  }
  return new InlineKeyboard().webApp(t.driver.openCamera, webAppUrl);
};

/** Havola eskirgan bo'lsa — yangi yuklash sessiyasini so'rash tugmasi. */
export const refreshCheckLinkKeyboard = (checkId: string): InlineKeyboard =>
  inlineGrid([{ text: t.driver.refreshLink, data: buildCallback(CB.driverCheckRefresh, checkId) }]);

/** Haydovchi uchun qisqa inline menyu (xabar ostida). */
export const driverInlineMenuKeyboard = (): InlineKeyboard => inlineGrid([menuButton()]);
