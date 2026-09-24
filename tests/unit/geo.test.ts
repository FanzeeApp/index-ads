import { describe, expect, test } from 'vitest';
import { haversineMeters, isValidPoint, isWithinRadius } from '../../src/utils/geo.js';

/** Toshkent markazidagi ikki nuqta — masofasi ma'lum (~1.5 km). */
const AMIR_TEMUR = { latitude: 41.311081, longitude: 69.279737 };
const CHORSU = { latitude: 41.326221, longitude: 69.234333 };

describe('haversineMeters', () => {
  test('bir xil nuqta uchun nol qaytaradi', () => {
    // Arrange / Act
    const distance = haversineMeters(AMIR_TEMUR, AMIR_TEMUR);

    // Assert
    expect(distance).toBe(0);
  });

  test('ma\'lum ikki nuqta orasidagi masofani metrda hisoblaydi', () => {
    // Act
    const distance = haversineMeters(AMIR_TEMUR, CHORSU);

    // Assert — haqiqiy masofa ~4.1 km, 5% xatolikka yo'l qo'yamiz
    expect(distance).toBeGreaterThan(3_900);
    expect(distance).toBeLessThan(4_400);
  });

  test('yaroqsiz koordinata uchun cheksizlik qaytaradi', () => {
    // Arrange
    const broken = { latitude: Number.NaN, longitude: 69.2 };

    // Act / Assert
    expect(haversineMeters(broken, CHORSU)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('isValidPoint', () => {
  test('chegaradan chiqqan kenglikni rad etadi', () => {
    expect(isValidPoint({ latitude: 91, longitude: 0 })).toBe(false);
  });

  test('to\'g\'ri koordinatani qabul qiladi', () => {
    expect(isValidPoint(AMIR_TEMUR)).toBe(true);
  });
});

describe('isWithinRadius', () => {
  test('radius nol bo\'lsa tekshiruv o\'chirilgan hisoblanadi', () => {
    expect(isWithinRadius(AMIR_TEMUR, CHORSU, 0)).toBe(true);
  });

  test('radiusdan uzoq nuqtani rad etadi', () => {
    expect(isWithinRadius(AMIR_TEMUR, CHORSU, 500)).toBe(false);
  });

  test('radius ichidagi nuqtani qabul qiladi', () => {
    expect(isWithinRadius(AMIR_TEMUR, CHORSU, 10_000)).toBe(true);
  });
});
