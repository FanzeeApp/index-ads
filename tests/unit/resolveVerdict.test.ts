import { beforeAll, describe, expect, test, vi } from 'vitest';

/**
 * `resolveVerdict` — rasm ishonchliligining yakuniy hakami.
 *
 * Eng muhim xossa: jonli kamera kadri canvas orqali yaratilgani uchun unda EXIF
 * BO'LMAYDI. Oddiy "EXIF yo'q → shubhali" qoidasi eng ishonchli yo'lni noto'g'ri
 * belgilagan bo'lardi — bu testlar shu teskarilik tuzatilganini qo'riqlaydi.
 */

vi.stubEnv('BOT_TOKEN', '111111111:TEST_TOKEN_FOR_UNIT_TESTS_abcdefgh');
vi.stubEnv('BOT_USERNAME', 'unit_test_bot');
vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/test');
vi.stubEnv('SUPER_ADMIN_IDS', '1');
vi.stubEnv('BOT_MODE', 'polling');

type Verdict = { verdict: string; note?: string };
let resolveVerdict: (
  freshness: Verdict,
  captureMode: 'live' | 'fallback',
  clientTakenAt: Date | undefined,
  now: Date,
) => Verdict;

beforeAll(async () => {
  const module = await import('../../src/web/routes/upload.js');
  resolveVerdict = module.resolveVerdict as typeof resolveVerdict;
});

const NOW = new Date('2026-09-24T12:00:00.000Z');
const justNow = new Date(NOW.getTime() - 30_000);
const longAgo = new Date(NOW.getTime() - 60 * 60 * 1000);

describe('jonli kamera kadri (captureMode=live)', () => {
  test('EXIF yo\'qligi sababli qo\'yilgan shubha OK ga aylantiriladi', () => {
    // Arrange — canvas kadri: EXIF hech qachon bo'lmaydi
    const freshness = { verdict: 'SUSPECT_NO_EXIF', note: 'EXIF topilmadi' };

    // Act
    const result = resolveVerdict(freshness, 'live', justNow, NOW);

    // Assert
    expect(result.verdict).toBe('OK');
    expect(result.note).toContain('jonli kamera');
  });

  test('olingan vaqt ko\'rsatilmagan kadr shubhali deb belgilanadi', () => {
    // Arrange
    const freshness = { verdict: 'SUSPECT_NO_EXIF' };

    // Act
    const result = resolveVerdict(freshness, 'live', undefined, NOW);

    // Assert
    expect(result.verdict).toBe('SUSPECT_NO_EXIF');
    expect(result.note).toContain("vaqt ko'rsatilmagan");
  });

  test('15 daqiqadan ko\'p kechikkan kadr SUSPECT_OLD bo\'ladi', () => {
    // Arrange — kadr bir soat oldin olingan
    const freshness = { verdict: 'SUSPECT_NO_EXIF' };

    // Act
    const result = resolveVerdict(freshness, 'live', longAgo, NOW);

    // Assert
    expect(result.verdict).toBe('SUSPECT_OLD');
  });

  test('15 daqiqa chegarasi ichidagi kadr qabul qilinadi', () => {
    // Arrange — chegaradan bir oz beri
    const freshness = { verdict: 'SUSPECT_NO_EXIF' };
    const almostLate = new Date(NOW.getTime() - 14 * 60 * 1000);

    // Act
    const result = resolveVerdict(freshness, 'live', almostLate, NOW);

    // Assert
    expect(result.verdict).toBe('OK');
  });

  test('EXIF bilan bog\'liq bo\'lmagan boshqa shubhalar saqlanadi', () => {
    // Arrange — GPS yo'qligi alohida masala, u yashirilmasligi kerak
    const freshness = { verdict: 'SUSPECT_GEO', note: 'GPS yo\'q' };

    // Act
    const result = resolveVerdict(freshness, 'live', justNow, NOW);

    // Assert
    expect(result.verdict).toBe('SUSPECT_GEO');
    expect(result.note).toBe('GPS yo\'q');
  });
});

describe('zaxira yo\'l (captureMode=fallback)', () => {
  test('shubhali rasmga galereya ehtimoli izohi qo\'shiladi', () => {
    // Arrange
    const freshness = { verdict: 'SUSPECT_NO_EXIF', note: 'EXIF topilmadi' };

    // Act
    const result = resolveVerdict(freshness, 'fallback', justNow, NOW);

    // Assert
    expect(result.verdict).toBe('SUSPECT_NO_EXIF');
    expect(result.note).toContain('EXIF topilmadi');
    expect(result.note).toContain('galereyadan olingan');
  });

  test('izohsiz shubhaga ham ogohlantirish qo\'shiladi', () => {
    // Arrange
    const freshness = { verdict: 'SUSPECT_OLD' };

    // Act
    const result = resolveVerdict(freshness, 'fallback', justNow, NOW);

    // Assert
    expect(result.note).toContain('galereyadan olingan');
  });

  test('EXIF to\'liq va yangi bo\'lsa o\'zgarishsiz OK qoladi', () => {
    // Arrange — haqiqiy kameradan EXIF bilan kelgan rasm
    const freshness = { verdict: 'OK' };

    // Act
    const result = resolveVerdict(freshness, 'fallback', justNow, NOW);

    // Assert
    expect(result.verdict).toBe('OK');
    expect(result.note).toBeUndefined();
  });
});
