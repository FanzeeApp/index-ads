import type { StorageAdapter } from 'grammy';
import { DAY_MS } from '../../config/constants.js';
import { describeError } from '../../core/errors.js';
import { childLogger } from '../../core/logger.js';
import { prisma } from '../../db/client.js';

/**
 * grammY sessiyasini PostgreSQL da saqlaydi.
 *
 * Nega kerak: standart `MemorySessionStorage` holatni jarayon xotirasida
 * tutadi. Railway har deploy'da konteynerni qaytadan ishga tushiradi, ya'ni
 * barcha sessiya va yarim tugallangan suhbatlar yo'qolardi — foydalanuvchi
 * eski xabardagi tugmani bosganda hech narsa sodir bo'lmasdi va xato ham
 * yozilmasdi. Baza esa deploy'lar orasida saqlanib qoladi.
 *
 * Saqlash xatolari oqimni to'xtatmaydi: sessiya yo'qolgani — noqulaylik,
 * lekin xabarni umuman qayta ishlamaslikdan afzal. Shuning uchun xatolar
 * ushlanadi va loglanadi.
 */

const log = childLogger('bot:session-store');

/** Shu muddatdan keyin tegilmagan sessiya eskirgan hisoblanadi. */
export const SESSION_TTL_MS = 7 * DAY_MS;

export const createPrismaSessionStorage = <T>(): StorageAdapter<T> => ({
  read: async (key: string): Promise<T | undefined> => {
    try {
      const row = await prisma.botSession.findUnique({ where: { key } });
      if (row === null) return undefined;
      return JSON.parse(row.value) as T;
    } catch (error) {
      log.error({ key, reason: describeError(error) }, "Sessiyani o'qib bo'lmadi");
      return undefined;
    }
  },

  write: async (key: string, value: T): Promise<void> => {
    try {
      const serialized = JSON.stringify(value);
      await prisma.botSession.upsert({
        where: { key },
        create: { key, value: serialized },
        update: { value: serialized },
      });
    } catch (error) {
      log.error({ key, reason: describeError(error) }, 'Sessiyani saqlab bo\'lmadi');
    }
  },

  delete: async (key: string): Promise<void> => {
    try {
      await prisma.botSession.delete({ where: { key } });
    } catch {
      // Yozuv allaqachon yo'q bo'lishi mumkin — bu xato emas.
    }
  },
});

/** Eskirgan sessiyalarni o'chiradi; `cleanup` vazifasi chaqiradi. */
export const purgeStaleSessions = async (now: Date = new Date()): Promise<number> => {
  const cutoff = new Date(now.getTime() - SESSION_TTL_MS);
  const result = await prisma.botSession.deleteMany({ where: { updatedAt: { lt: cutoff } } });
  return result.count;
};
