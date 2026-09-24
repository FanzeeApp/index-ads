import 'dotenv/config';
import { z } from 'zod';

const csvNumbers = z
  .string()
  .default('')
  .transform((raw) =>
    raw
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .map((part) => Number(part)),
  )
  .pipe(z.array(z.number().int().positive()));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  BOT_TOKEN: z.string().min(20, 'BOT_TOKEN yaroqsiz — @BotFather dan oling'),
  BOT_USERNAME: z.string().min(3).transform((value) => value.replace(/^@/, '')),
  BOT_MODE: z.enum(['polling', 'webhook']).default('polling'),
  PUBLIC_URL: z.string().url().optional(),
  WEBHOOK_SECRET: z.string().min(16).optional(),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL majburiy'),

  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),

  SUPER_ADMIN_IDS: csvNumbers,
  ARCHIVE_CHAT_ID: z.coerce.number().int().optional(),

  CHECK_INTERVAL_DAYS: z.coerce.number().int().min(1).max(60).default(3),
  CHECK_DEADLINE_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  CHECK_REMINDER_HOURS: csvNumbers.default('6,18'),
  PHOTO_VALIDATION_MODE: z.enum(['strict', 'lenient', 'off']).default('lenient'),
  PHOTO_MAX_AGE_MINUTES: z.coerce.number().int().min(1).max(10_080).default(120),
});

export type Env = Readonly<z.infer<typeof envSchema>>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Muhit o'zgaruvchilari noto'g'ri sozlangan:\n${details}`);
  }

  const env = parsed.data;

  if (env.BOT_MODE === 'webhook') {
    if (!env.PUBLIC_URL) {
      throw new Error("BOT_MODE=webhook bo'lsa PUBLIC_URL majburiy");
    }
    if (!env.WEBHOOK_SECRET) {
      throw new Error("BOT_MODE=webhook bo'lsa WEBHOOK_SECRET majburiy (32+ belgi tavsiya etiladi)");
    }
  }

  if (env.SUPER_ADMIN_IDS.length === 0) {
    throw new Error('SUPER_ADMIN_IDS bo\'sh — kamida bitta Telegram ID kiriting');
  }

  return Object.freeze(env);
}

export const env: Env = loadEnv();
export const isProduction = env.NODE_ENV === 'production';
