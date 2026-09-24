import { DAY_MS, HOUR_MS, MINUTE_MS } from '../config/constants.js';

const TASHKENT_TZ = 'Asia/Tashkent';

const dateFormatter = new Intl.DateTimeFormat('uz-UZ', {
  timeZone: TASHKENT_TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('uz-UZ', {
  timeZone: TASHKENT_TZ,
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export const formatDate = (date: Date): string => dateFormatter.format(date);
export const formatDateTime = (date: Date): string => dateTimeFormatter.format(date);

export const addDays = (date: Date, days: number): Date => new Date(date.getTime() + days * DAY_MS);
export const addHours = (date: Date, hours: number): Date => new Date(date.getTime() + hours * HOUR_MS);
export const addMinutes = (date: Date, minutes: number): Date => new Date(date.getTime() + minutes * MINUTE_MS);

export const hoursBetween = (from: Date, to: Date): number => (to.getTime() - from.getTime()) / HOUR_MS;
export const minutesBetween = (from: Date, to: Date): number => (to.getTime() - from.getTime()) / MINUTE_MS;

/** "3 soat 20 daqiqa" ko'rinishida qoldiq vaqt. */
export const formatRemaining = (until: Date, now: Date = new Date()): string => {
  const diffMs = until.getTime() - now.getTime();
  if (diffMs <= 0) return 'muddati tugagan';
  const totalMinutes = Math.floor(diffMs / MINUTE_MS);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} daqiqa`;
  if (minutes === 0) return `${hours} soat`;
  return `${hours} soat ${minutes} daqiqa`;
};

export const isPast = (date: Date, now: Date = new Date()): boolean => date.getTime() <= now.getTime();
