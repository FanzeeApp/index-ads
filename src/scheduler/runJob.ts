/**
 * Rejalashtirilgan vazifalarning umumiy o'rovi.
 *
 * Nima uchun: cron chaqiruvi "atib ketgan" (fire-and-forget) va'da bo'lgani uchun
 * undagi xato hech kim tomonidan ushlanmasa, jarayon butunlay yiqilishi mumkin.
 * Shuningdek sekin tsikl (1000+ mashina) keyingi tsikl boshlanishidan oldin
 * tugamasligi mumkin — shuning uchun har bir vazifa uchun qulf kerak.
 */

import { describeError } from '../core/errors.js';
import { childLogger } from '../core/logger.js';

const log = childLogger('scheduler:job');

/**
 * Bir vaqtda ishlayotgan vazifalar nomi. Mutatsiya qilinmaydi — har o'zgarishda
 * yangi to'plam yaratiladi (to'plam kichik: vazifalar soni o'nlab emas, birlik).
 */
let runningJobs: ReadonlySet<string> = new Set<string>();

const markRunning = (name: string): void => {
  runningJobs = new Set([...runningJobs, name]);
};

const markIdle = (name: string): void => {
  runningJobs = new Set([...runningJobs].filter((job) => job !== name));
};

/** Diagnostika uchun: hozir qaysi vazifalar ketyapti. */
export const activeJobs = (): readonly string[] => [...runningJobs];

/**
 * Vazifani xavfsiz ishga tushiradi: qulflaydi, davomiylikni o'lchaydi,
 * qayta ishlangan yozuvlar sonini loglaydi va HAR QANDAY xatoni ushlaydi.
 * `fn` qayta ishlangan yozuvlar sonini qaytaradi.
 */
export const runJob = async (name: string, fn: () => Promise<number>): Promise<void> => {
  if (runningJobs.has(name)) {
    log.warn({ job: name }, "Oldingi tsikl hali tugamagan — bu tsikl o'tkazib yuborildi");
    return;
  }

  markRunning(name);
  const startedAt = Date.now();
  log.debug({ job: name }, 'Vazifa boshlandi');

  try {
    const processed = await fn();
    log.info({ job: name, processed, durationMs: Date.now() - startedAt }, 'Vazifa yakunlandi');
  } catch (error) {
    log.error(
      { job: name, durationMs: Date.now() - startedAt, err: describeError(error) },
      'Vazifa xato bilan tugadi — jarayon davom etadi',
    );
  } finally {
    markIdle(name);
  }
};

/**
 * Bir tsiklda parallel bajariladigan amallar soni.
 * Nima uchun bo'lakli: 300 ta yozuvni bir vaqtda Promise.allSettled ga bersak,
 * 300 ta ochiq Telegram/Prisma so'rovi xotirada yig'iladi. Kichik bo'laklar
 * xotirani barqaror ushlaydi, tezlikni esa notifyService navbati belgilaydi.
 */
export const SCHEDULER_CHUNK_SIZE = 50;

export type ChunkOutcome = {
  readonly ok: number;
  readonly failed: number;
};

/**
 * Ro'yxatni bo'laklab qayta ishlaydi. Bitta element yiqilsa butun tsikl
 * to'xtamaydi — xato loglanadi va keyingi elementga o'tiladi.
 * `handler` amal muvaffaqiyatli bo'lganini (masalan, xabar yetkazilganini) qaytaradi.
 */
export const processInChunks = async <T>(
  jobName: string,
  items: readonly T[],
  handler: (item: T) => Promise<boolean>,
  chunkSize: number = SCHEDULER_CHUNK_SIZE,
): Promise<ChunkOutcome> => {
  let ok = 0;
  let failed = 0;

  for (let start = 0; start < items.length; start += chunkSize) {
    const settled = await Promise.allSettled(items.slice(start, start + chunkSize).map(handler));

    for (const outcome of settled) {
      if (outcome.status === 'fulfilled' && outcome.value) {
        ok += 1;
        continue;
      }
      failed += 1;
      if (outcome.status === 'rejected') {
        log.error({ job: jobName, err: describeError(outcome.reason) }, 'Element qayta ishlanmadi');
      }
    }
  }

  return Object.freeze({ ok, failed });
};
