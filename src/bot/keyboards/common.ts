import { InlineKeyboard, Keyboard } from 'grammy';
import { t } from '../../i18n/index.js';
import { truncate } from '../../utils/html.js';
import { buildCallback, CB } from '../callbacks.js';

/** Uzun yorliq tugmani buzadi — qisqartiriladi. */
const BUTTON_LABEL_LIMIT = 48;

export type InlineButton = {
  readonly text: string;
  readonly data: string;
};

export type InlineRow = readonly InlineButton[];

/** Ro'yxat elementi — klaviatura xizmat turlariga bog'lanmasligi uchun eng sodda shakl. */
export type ListRow = {
  readonly id: string;
  readonly label: string;
};

export const NOOP_DATA = buildCallback(CB.noop);
export const MENU_DATA = buildCallback(CB.menu);
export const CANCEL_DATA = buildCallback(CB.cancel);

export const removeKeyboard = Object.freeze({ remove_keyboard: true } as const);

/** Ro'yxatni teng bo'laklarga ajratadi — kirish massivi o'zgarmaydi. */
const chunk = <T>(items: readonly T[], size: number): readonly (readonly T[])[] => {
  const step = Math.max(1, size);
  const rows: (readonly T[])[] = [];
  for (let index = 0; index < items.length; index += step) {
    rows.push(items.slice(index, index + step));
  }
  return rows;
};

/**
 * Qatorlardan inline klaviatura yig'adi. Bo'sh qatorlar tashlab ketiladi —
 * Telegram ularni tugmasiz qator sifatida ko'rsatib, tartibni buzadi.
 */
export const inlineRows = (rows: readonly InlineRow[]): InlineKeyboard =>
  InlineKeyboard.from(
    rows
      .filter((row) => row.length > 0)
      .map((row) => row.map((button) => InlineKeyboard.text(truncate(button.text, BUTTON_LABEL_LIMIT), button.data))),
  );

/** Tugmalarni qatorlarga bo'lib joylaydi (har qatorda `perRow` ta). */
export const inlineGrid = (buttons: readonly InlineButton[], perRow = 1): InlineKeyboard =>
  inlineRows(chunk(buttons, perRow));

export const menuButton = (): InlineButton => ({ text: t.common.menu, data: MENU_DATA });

export const backButton = (data: string = MENU_DATA): InlineButton => ({ text: t.common.back, data });

export const cancelButton = (data: string = CANCEL_DATA): InlineButton => ({ text: t.common.cancel, data });

/** Faqat "Orqaga" tugmasi bo'lgan klaviatura. */
export const backKeyboard = (data: string = MENU_DATA): InlineKeyboard => inlineGrid([backButton(data)]);

/** Tasdiqlash / bekor qilish juftligi. */
export const confirmKeyboard = (confirmData: string, cancelData: string = CANCEL_DATA): InlineKeyboard =>
  inlineGrid([{ text: t.common.confirm, data: confirmData }, { text: t.common.cancel, data: cancelData }], 2);

export type PaginationOptions = {
  readonly action: string;
  readonly page: number;
  readonly totalPages: number;
  /** Sahifa raqamidan OLDIN keladigan bo'laklar (filtr yoki ota-obyekt id si). */
  readonly args?: readonly (string | number)[];
};

/**
 * Sahifalash qatori: "◀️ Oldingi | Sahifa 2/5 | Keyingi ▶️".
 * Bitta sahifa bo'lsa — qator umuman chizilmaydi.
 */
export const paginationButtons = (options: PaginationOptions): InlineRow => {
  const { action, page, totalPages, args = [] } = options;
  if (totalPages <= 1) return Object.freeze([]);

  const prev: InlineRow = page > 1 ? [{ text: t.common.prev, data: buildCallback(action, ...args, page - 1) }] : [];
  const indicator: InlineButton = { text: t.common.page(page, totalPages), data: NOOP_DATA };
  const next: InlineRow =
    page < totalPages ? [{ text: t.common.next, data: buildCallback(action, ...args, page + 1) }] : [];

  return Object.freeze([...prev, indicator, ...next]);
};

export type ListKeyboardOptions = {
  readonly rows: readonly ListRow[];
  /** Element bosilganda yuboriladigan amal — `buildCallback(openAction, id, ...openArgs)`. */
  readonly openAction: string;
  /** Element id sidan KEYIN qo'shiladigan bo'laklar (masalan, boshlang'ich sahifa). */
  readonly openArgs?: readonly (string | number)[];
  readonly pagination?: PaginationOptions;
  /** Ro'yxat ostidagi qo'shimcha qatorlar (filtrlar, "qo'shish", "bosh menyu"). */
  readonly footerRows?: readonly InlineRow[];
};

/**
 * Admin va reklama beruvchi ro'yxatlari uchun yagona shablon:
 * elementlar ustma-ust, pastda sahifalash, so'ng qo'shimcha amallar.
 */
export const listKeyboard = (options: ListKeyboardOptions): InlineKeyboard => {
  const { rows, openAction, openArgs = [], pagination, footerRows = [] } = options;

  const itemRows: readonly InlineRow[] = rows.map((row) => [
    { text: row.label, data: buildCallback(openAction, row.id, ...openArgs) },
  ]);
  const pageRows: readonly InlineRow[] = pagination === undefined ? [] : [paginationButtons(pagination)];

  return inlineRows([...itemRows, ...pageRows, ...footerRows]);
};

/** Matnli (reply) klaviatura — doimiy menyular uchun. */
export const replyKeyboard = (rows: readonly (readonly string[])[]): Keyboard =>
  Keyboard.from(rows.filter((row) => row.length > 0).map((row) => row.map((label) => Keyboard.text(label))))
    .resized()
    .persistent();
