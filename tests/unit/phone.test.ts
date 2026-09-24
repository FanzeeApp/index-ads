import { describe, expect, test } from 'vitest';
import {
  formatPhone,
  isValidPhone,
  normalizePhone,
  normalizeUsername,
} from '../../src/utils/phone.js';

describe('normalizePhone', () => {
  test('9 xonali mahalliy raqamga +998 prefiksini qo\'shadi', () => {
    // Arrange — haydovchi ko'pincha kodsiz yozadi
    const raw = '901234567';

    // Act
    const normalized = normalizePhone(raw);

    // Assert
    expect(normalized).toBe('+998901234567');
  });

  test('ajratgichlar bilan yozilgan raqamni tozalaydi', () => {
    // Act / Assert
    expect(normalizePhone('+998 (90) 123-45-67')).toBe('+998901234567');
  });

  test('998 bilan boshlanuvchi 12 xonali raqamni qabul qiladi', () => {
    expect(normalizePhone('998901234567')).toBe('+998901234567');
  });

  test('oldida ortiqcha nol bo\'lgan raqamdan nolni olib tashlaydi', () => {
    // Arrange — "0998..." ko'rinishi eski daftarlardan keladi
    const normalized = normalizePhone('0998901234567');

    // Assert
    expect(normalized).toBe('+998901234567');
  });

  test('xorijiy raqamni ham xalqaro shaklda qaytaradi', () => {
    // Arrange — 11 xonali AQSh raqami
    const normalized = normalizePhone('+1 202 555 0143');

    // Assert
    expect(normalized).toBe('+12025550143');
  });

  test.each([
    ['juda qisqa', '12345'],
    ['raqamsiz matn', 'telefon yo\'q'],
    ['bo\'sh qator', ''],
    ['juda uzun', '1234567890123456'],
  ])('yaroqsiz telefon raqami uchun null qaytaradi: %s', (_label, raw) => {
    // Act / Assert
    expect(normalizePhone(raw)).toBeNull();
  });
});

describe('isValidPhone', () => {
  test('me\'yorlashtirish mumkin bo\'lgan raqamni haqiqiy deb biladi', () => {
    expect(isValidPhone('90 123 45 67')).toBe(true);
  });

  test('me\'yorlashtirib bo\'lmaydigan raqamni rad etadi', () => {
    expect(isValidPhone('123')).toBe(false);
  });
});

describe('formatPhone', () => {
  test('O\'zbekiston raqamini o\'qishga qulay bo\'laklarga ajratadi', () => {
    // Act
    const formatted = formatPhone('901234567');

    // Assert
    expect(formatted).toBe('+998 90 123 45 67');
  });

  test('allaqachon xalqaro shaklda yozilgan raqamni ham ajratadi', () => {
    expect(formatPhone('+998901234567')).toBe('+998 90 123 45 67');
  });

  test('O\'zbekiston raqami bo\'lmasa kiritmani o\'zgarishsiz qaytaradi', () => {
    // Arrange — xorijiy raqam uchun bizda ajratish qoidasi yo'q
    const raw = '+1 202 555 0143';

    // Act / Assert
    expect(formatPhone(raw)).toBe(raw);
  });

  test('yaroqsiz raqamni o\'zgarishsiz qaytaradi', () => {
    expect(formatPhone('telefon yo\'q')).toBe('telefon yo\'q');
  });
});

describe('normalizeUsername', () => {
  test('@ belgisini olib tashlab kichik harfga o\'tkazadi', () => {
    // Act
    const username = normalizeUsername('@Dilshod_99');

    // Assert
    expect(username).toBe('dilshod_99');
  });

  test('t.me havolasidan username ajratib oladi', () => {
    // Arrange — admin ko'pincha havolani to'liq tashlaydi
    const username = normalizeUsername('https://t.me/Dilshod_99');

    // Assert
    expect(username).toBe('dilshod_99');
  });

  test('atrofdagi bo\'shliqlarni tozalaydi', () => {
    expect(normalizeUsername('   @Test_User   ')).toBe('test_user');
  });

  test.each([
    ['juda qisqa', '@abc'],
    ['chiziqcha bor', 'bad-name'],
    ['bo\'shliq bor', 'ikki soz'],
    ['33 belgidan uzun', `@${'a'.repeat(33)}`],
    ['bo\'sh qator', ''],
    ['HTML in\'eksiya urinishi', '<b>admin</b>'],
  ])('yaroqsiz username rad etiladi: %s', (_label, raw) => {
    // Act / Assert
    expect(normalizeUsername(raw)).toBeNull();
  });

  test('chegaraviy uzunliklarni to\'g\'ri hal qiladi', () => {
    // Arrange — 5 belgi ruxsat, 4 belgi yo'q; 32 belgi ruxsat
    // Act / Assert
    expect(normalizeUsername('abcde')).toBe('abcde');
    expect(normalizeUsername('abcd')).toBeNull();
    expect(normalizeUsername('a'.repeat(32))).toBe('a'.repeat(32));
  });
});
