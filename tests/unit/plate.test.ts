import { describe, expect, test } from 'vitest';
import {
  formatPlate,
  isValidPlate,
  normalizePlate,
  parsePlateList,
} from '../../src/utils/plate.js';

/**
 * O'zbekiston davlat raqamining uchta amaldagi shakli — operator qo'lda
 * kiritganda ham, referal havoladan kelganda ham shu namunalarga tushishi kerak.
 */
const VALID_PLATES = Object.freeze([
  '01A123BC', // viloyat + harf + 3 raqam + 2 harf
  '01123ABC', // viloyat + 3 raqam + 3 harf
  '01A123B', // viloyat + harf + 3 raqam + 1 harf
  '30Z999XY',
  '95555QQQ',
]);

describe('normalizePlate', () => {
  test('bo\'shliq, chiziqcha va nuqtani olib tashlaydi', () => {
    // Arrange — operator odatda ajratib yozadi
    const raw = '01 A 123-BC';

    // Act
    const normalized = normalizePlate(raw);

    // Assert
    expect(normalized).toBe('01A123BC');
  });

  test('kichik harflarni katta harfga o\'tkazadi', () => {
    // Act / Assert
    expect(normalizePlate('01a123bc')).toBe('01A123BC');
  });

  test('pastki chiziq bilan yozilgan raqamni ham tozalaydi', () => {
    expect(normalizePlate('01_A_123_BC')).toBe('01A123BC');
  });

  test('kirish qatorini o\'zgartirmaydi (yangi qator qaytaradi)', () => {
    // Arrange
    const raw = '01 a 123 bc';

    // Act
    const normalized = normalizePlate(raw);

    // Assert — manba o'zgarmadi, natija boshqa qiymat
    expect(raw).toBe('01 a 123 bc');
    expect(normalized).not.toBe(raw);
  });
});

describe('isValidPlate', () => {
  test.each(VALID_PLATES)('haqiqiy davlat raqamini qabul qiladi: %s', (plate) => {
    // Act / Assert
    expect(isValidPlate(plate)).toBe(true);
  });

  test('ajratgichlar bilan yozilgan haqiqiy raqamni ham qabul qiladi', () => {
    expect(isValidPlate('01 A 123 BC')).toBe(true);
  });

  test('kichik harf bilan yozilgan haqiqiy raqamni qabul qiladi', () => {
    expect(isValidPlate('30z999xy')).toBe(true);
  });

  test.each([
    ['bo\'sh qator', ''],
    ['faqat harflar', 'ABCDEFG'],
    ['juda qisqa', '01A12'],
    ['juda uzun', '01A123BCD'],
    ['viloyat kodi bitta raqam', '1A123BC'],
    ['kirill harflari', '01А123ВС'],
    ['maxsus belgilar', '01A123<script>'],
    ['SQL in\'eksiya urinishi', "01A123BC' OR 1=1--"],
  ])('yaroqsiz davlat raqami rad etiladi: %s', (_label, plate) => {
    // Act / Assert
    expect(isValidPlate(plate)).toBe(false);
  });
});

describe('formatPlate', () => {
  test('harfli shaklni bo\'laklarga ajratib ko\'rsatadi', () => {
    // Act
    const formatted = formatPlate('01A123BC');

    // Assert
    expect(formatted).toBe('01 A 123 BC');
  });

  test('harfsiz shaklda bo\'sh bo\'lakni tashlab yuboradi', () => {
    // Act
    const formatted = formatPlate('01123ABC');

    // Assert — ikkita bo'shliq ketma-ket kelmaydi
    expect(formatted).toBe('01 123 ABC');
    expect(formatted).not.toContain('  ');
  });

  test('qisqa dumli shaklni ham ajratadi', () => {
    expect(formatPlate('01A123B')).toBe('01 A 123 B');
  });

  test('namunaga tushmagan qiymatni me\'yorlashtirib qaytaradi', () => {
    // Arrange — yaroqsiz, lekin ko'rsatishga baribir nimadir kerak
    const formatted = formatPlate('xyz 12');

    // Assert
    expect(formatted).toBe('XYZ12');
  });
});

describe('parsePlateList', () => {
  test('vergul bilan ajratilgan ro\'yxatni tozalaydi', () => {
    // Arrange
    const raw = '01A123BC, 30Z999XY, 95555QQQ';

    // Act
    const plates = parsePlateList(raw);

    // Assert
    expect(plates).toEqual(['01A123BC', '30Z999XY', '95555QQQ']);
  });

  test('yangi qator va nuqta-vergulni ham ajratgich deb biladi', () => {
    // Arrange — admin ro'yxatni ustun qilib tashlashi mumkin
    const raw = '01A123BC\n30Z999XY;95555QQQ';

    // Act
    const plates = parsePlateList(raw);

    // Assert
    expect(plates).toHaveLength(3);
  });

  test('takrorlangan raqamlarni bir marta qaytaradi', () => {
    // Arrange — bir xil raqam turli yozuvda
    const raw = '01A123BC, 01 a 123 bc, 01-A-123-BC';

    // Act
    const plates = parsePlateList(raw);

    // Assert
    expect(plates).toEqual(['01A123BC']);
  });

  test('bo\'sh bo\'laklarni tashlab yuboradi', () => {
    // Arrange — ortiqcha vergullar
    const raw = ',,01A123BC,,,30Z999XY,,';

    // Act
    const plates = parsePlateList(raw);

    // Assert
    expect(plates).toEqual(['01A123BC', '30Z999XY']);
  });

  test('bo\'sh kiritma uchun bo\'sh ro\'yxat qaytaradi', () => {
    expect(parsePlateList('')).toEqual([]);
    expect(parsePlateList('   ,  , ')).toEqual([]);
  });
});
