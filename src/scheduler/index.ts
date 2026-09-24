/**
 * Rejalashtiruvchi: botning "yuragi" — tekshiruv so'rovlarini yuborish,
 * eslatma berish, muddatni yopish, kunlik hisobot va tozalash.
 *
 * BOT_MODE (polling/webhook) ga bog'liq emas: har ikkala rejimda ham bir xil
 * ishlaydi, chunki vazifalar Telegram update lariga emas, vaqtga bog'langan.
 *
 * Bir nechta nusxa (replica) ishga tushirilsa ikkilanish bo'lmaydi:
 * createCheckRequest ichidagi shartli yangilash bitta joylashtirishni faqat
 * bitta nusxaga beradi (qolganlari ConflictError oladi va jim o'tadi).
 *
 * TODO: nusxalar soni ortganda bazadagi qulfga o'tish kerak —
 * `SELECT ... FOR UPDATE SKIP LOCKED` bilan navbatdagi joylashtirishlarni
 * band qilib olish bekorga urinishlarni butunlay yo'q qiladi. Shu bilan birga
 * kunlik hisobot (dailyDigest) kabi "bir marta" ishlashi shart bo'lgan
 * vazifalar uchun umumiy taqsimlangan qulf (masalan, Postgres advisory lock)
 * joriy qilinadi.
 */

import { schedule, validate, type ScheduledTask } from 'node-cron';
import {
  SCHEDULER_DIGEST_CRON,
  SCHEDULER_DISPATCH_CRON,
  SCHEDULER_EXPIRE_CRON,
  SCHEDULER_REMINDER_CRON,
} from '../config/constants.js';
import { describeError } from '../core/errors.js';
import { childLogger } from '../core/logger.js';
import { CLEANUP_JOB, cleanup } from './jobs/cleanup.js';
import { DIGEST_JOB, dailyDigest } from './jobs/dailyDigest.js';
import { DISPATCH_JOB, dispatchChecks } from './jobs/dispatchChecks.js';
import { EXPIRE_JOB, expireChecks } from './jobs/expireChecks.js';
import { REMIND_JOB, remindPending } from './jobs/remindPending.js';
import { runJob } from './runJob.js';

const log = childLogger('scheduler');

/** Barcha vaqtlar O'zbekiston bo'yicha — haydovchilar kechasi bezovta qilinmasin. */
const TIMEZONE = 'Asia/Tashkent';

/** Tozalash jadvalining o'z cron i yo'q: har soat, yumaloq daqiqada emas. */
const CLEANUP_CRON = '17 * * * *';

type JobSpec = {
  readonly name: string;
  readonly cron: string;
  readonly run: () => Promise<number>;
};

const JOBS: readonly JobSpec[] = Object.freeze([
  { name: DISPATCH_JOB, cron: SCHEDULER_DISPATCH_CRON, run: () => dispatchChecks() },
  { name: REMIND_JOB, cron: SCHEDULER_REMINDER_CRON, run: () => remindPending() },
  { name: EXPIRE_JOB, cron: SCHEDULER_EXPIRE_CRON, run: () => expireChecks() },
  { name: DIGEST_JOB, cron: SCHEDULER_DIGEST_CRON, run: () => dailyDigest() },
  { name: CLEANUP_JOB, cron: CLEANUP_CRON, run: () => cleanup() },
]);

/** Ishga tushirilgan jadvallar — stopScheduler uchun. Har o'zgarishda yangi massiv. */
let tasks: readonly ScheduledTask[] = [];

/** Noto'g'ri cron ifodasi bilan ishga tushmaymiz — tezda va aniq yiqilamiz. */
const assertCronExpressionsValid = (): void => {
  const invalid = JOBS.filter((job) => !validate(job.cron)).map((job) => `${job.name} (${job.cron})`);
  if (invalid.length > 0) {
    throw new Error(`Cron ifodalari noto'g'ri: ${invalid.join(', ')}`);
  }
};

/**
 * Jadvallarni ishga tushiradi. Takroriy chaqiruv e'tiborsiz qoldiriladi —
 * aks holda bir vazifa ikki marta rejalashtirilib, xabarlar ikkilanardi.
 */
export const startScheduler = (): void => {
  if (tasks.length > 0) {
    log.warn('Rejalashtiruvchi allaqachon ishlayapti — qayta ishga tushirilmadi');
    return;
  }

  assertCronExpressionsValid();

  tasks = JOBS.map((job) =>
    schedule(
      job.cron,
      () => {
        void runJob(job.name, job.run);
      },
      { scheduled: true, timezone: TIMEZONE },
    ),
  );

  log.info({ jobs: JOBS.map((job) => `${job.name}@${job.cron}`), timezone: TIMEZONE }, 'Rejalashtiruvchi ishga tushdi');
};

/**
 * Barcha jadvallarni to'xtatadi (graceful shutdown). Ketayotgan tsikl o'z
 * ishini oxirigacha bajaradi — bu yerda faqat yangi chaqiruvlar to'xtatiladi.
 */
export const stopScheduler = (): void => {
  if (tasks.length === 0) return;

  for (const task of tasks) {
    try {
      task.stop();
    } catch (error) {
      log.error({ err: describeError(error) }, "Jadvalni to'xtatishda xato");
    }
  }

  tasks = [];
  log.info("Rejalashtiruvchi to'xtatildi");
};
