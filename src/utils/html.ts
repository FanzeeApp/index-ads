const ENTITIES: Readonly<Record<string, string>> = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
});

/** Telegram HTML parse_mode uchun foydalanuvchi matnini xavfsizlashtiradi. */
export const escapeHtml = (value: string): string => value.replace(/[&<>"]/g, (char) => ENTITIES[char] ?? char);

/** Matnni Telegram chegarasiga moslaydi (xabar 4096, caption 1024). */
export const truncate = (value: string, max: number): string =>
  value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`;

export const MESSAGE_LIMIT = 4096;
export const CAPTION_LIMIT = 1024;
