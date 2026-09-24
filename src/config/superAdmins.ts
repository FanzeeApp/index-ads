import { env } from './env.js';

/**
 * `env.SUPER_ADMIN_IDS` ustidan yagona darvoza.
 *
 * Nima uchun alohida modul: superadmin ro'yxati uch joyda kerak — auth
 * middleware (rolni aniqlash), driverService (/start da rolni ko'tarish) va
 * adminService (huquq berish qoidalari). Ro'yxat MATN ko'rinishida saqlanadi:
 * bazadagi `BigInt` va Telegram beradigan `number` ni bir xil solishtirish uchun.
 */
const SUPER_ADMIN_KEYS: ReadonlySet<string> = new Set(env.SUPER_ADMIN_IDS.map((id) => String(id)));

/**
 * Telegram ID Railway sozlamalaridagi superadminlar ro'yxatidami?
 * Bu huquq bot orqali berilmaydi va OLINMAYDI — faqat muhit o'zgaruvchisi hal qiladi.
 */
export const isEnvSuperAdmin = (telegramId: bigint | number | null | undefined): boolean =>
  telegramId !== null && telegramId !== undefined && SUPER_ADMIN_KEYS.has(telegramId.toString());
