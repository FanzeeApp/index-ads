import { PLATE_PATTERN } from '../config/constants.js';

/** Davlat raqamini me'yorlashtiradi: bo'shliq/chiziqcha olib tashlanadi, katta harfga o'tkaziladi. */
export const normalizePlate = (raw: string): string => raw.replace(/[\s\-_.]/g, '').toUpperCase();

export const isValidPlate = (raw: string): boolean => PLATE_PATTERN.test(normalizePlate(raw));

/** Ko'rsatish uchun ajratilgan shakl: 01 A 123 BC */
export const formatPlate = (raw: string): string => {
  const plate = normalizePlate(raw);
  const match = /^(\d{2})([A-Z]?)(\d{3})([A-Z]{1,3})$/.exec(plate);
  if (!match) return plate;
  const [, region, letter, digits, tail] = match;
  return [region, letter, digits, tail].filter(Boolean).join(' ');
};

/** Vergul/bo'shliq bilan ajratilgan ro'yxatni tozalab qaytaradi (dublikatsiz). */
export const parsePlateList = (raw: string): readonly string[] =>
  Array.from(
    new Set(
      raw
        .split(/[,\n;]+/)
        .map(normalizePlate)
        .filter((plate) => plate.length > 0),
    ),
  );
