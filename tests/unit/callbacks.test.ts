import { describe, expect, test } from 'vitest';
import {
  CALLBACK_DATA_MAX_BYTES,
  CB,
  buildCallback,
  callbackNumber,
  callbackPattern,
  parseCallback,
  tryParseCallback,
} from '../../src/bot/callbacks.js';
import { ValidationError } from '../../src/core/errors.js';

describe('buildCallback', () => {
  test('amal va bo\'laklarni ikki nuqta bilan birlashtiradi', () => {
    // Act
    const data = buildCallback(CB.carOpen, 12, 'ACTIVE');

    // Assert
    expect(data).toBe('car.op:12:ACTIVE');
  });

  test('bo\'laksiz amal uchun faqat amal nomini qaytaradi', () => {
    expect(buildCallback(CB.menu)).toBe('menu');
  });

  test('sonli bo\'lakni matnga o\'giradi', () => {
    expect(buildCallback(CB.checkOpen, 7)).toBe('chk.op:7');
  });

  test('chegaraga aynan teng callback_data ga ruxsat beradi', () => {
    // Arrange — 64 baytga to'liq to'ldiramiz: 'x' + ':' + 62 bayt
    const part = 'a'.repeat(CALLBACK_DATA_MAX_BYTES - 2);

    // Act
    const data = buildCallback('x', part);

    // Assert
    expect(Buffer.byteLength(data, 'utf8')).toBe(CALLBACK_DATA_MAX_BYTES);
  });

  test('64 baytdan oshgan callback_data uchun xato tashlaydi', () => {
    // Arrange — bir bayt ortiq
    const part = 'a'.repeat(CALLBACK_DATA_MAX_BYTES - 1);

    // Act / Assert
    expect(() => buildCallback('x', part)).toThrow(/64 baytdan/);
  });

  test('uzunlikni belgilarda emas, baytlarda o\'lchaydi', () => {
    // Arrange — 33 belgi, lekin 64 bayt (kirill harflari 2 baytdan)
    const cyrillic = 'ы'.repeat(31);
    const data = buildCallback('x', cyrillic);
    expect(data.length).toBeLessThan(CALLBACK_DATA_MAX_BYTES);
    expect(Buffer.byteLength(data, 'utf8')).toBe(CALLBACK_DATA_MAX_BYTES);

    // Act / Assert — yana bitta harf qo'shilsa 66 bayt bo'lib chegaradan oshadi
    expect(() => buildCallback('x', 'ы'.repeat(32))).toThrow(/64 baytdan/);
  });

  test('bo\'sh amal nomini rad etadi', () => {
    expect(() => buildCallback('')).toThrow(/bo'sh bo'lishi mumkin emas/);
  });

  test('bo\'lak ichida ajratuvchi bo\'lsa rad etadi', () => {
    // Arrange — ":" bo'lak ichiga tushsa parseCallback noto'g'ri bo'ladi
    expect(() => buildCallback(CB.carOpen, 'a:b')).toThrow(/ajratuvchi/);
  });

  test('bo\'sh bo\'lakni rad etadi', () => {
    expect(() => buildCallback(CB.carOpen, '')).toThrow(/bo'sh bo'lishi mumkin emas/);
  });

  test('juda uzun amal nomini rad etadi', () => {
    expect(() => buildCallback('a'.repeat(33))).toThrow(/juda uzun/);
  });

  test('bo\'laklar soni chegarasidan oshsa rad etadi', () => {
    // Arrange — 9 ta bo'lak, ruxsat 8 ta
    const parts = Array.from({ length: 9 }, (_unused, index) => String(index));

    // Act / Assert
    expect(() => buildCallback('x', ...parts)).toThrow(/juda ko'p/);
  });

  test('dasturchi xatosi foydalanuvchiga ko\'rsatilmaydi', () => {
    // Act
    let caught: unknown;
    try {
      buildCallback(CB.carOpen, 'a:b');
    } catch (error) {
      caught = error;
    }

    // Assert — userFacing=false, ya'ni matn chatga chiqmaydi
    expect(caught).toMatchObject({ code: 'CALLBACK_BUILD', userFacing: false });
  });
});

describe('parseCallback', () => {
  test('amal va bo\'laklarni qaytaradi', () => {
    // Act
    const parsed = parseCallback('car.op:12:ACTIVE');

    // Assert
    expect(parsed.action).toBe('car.op');
    expect(parsed.parts).toEqual(['12', 'ACTIVE']);
  });

  test('bo\'laksiz callback uchun bo\'sh massiv qaytaradi', () => {
    // Act
    const parsed = parseCallback('menu');

    // Assert
    expect(parsed).toEqual({ action: 'menu', parts: [] });
  });

  test('buildCallback natijasini teskari o\'giradi', () => {
    // Arrange
    const data = buildCallback(CB.campaignStatus, 42, 'PAUSED');

    // Act
    const parsed = parseCallback(data);

    // Assert
    expect(parsed).toEqual({ action: 'cmp.st', parts: ['42', 'PAUSED'] });
  });

  test('o\'zgarmas natija qaytaradi', () => {
    // Act
    const parsed = parseCallback('car.op:12');

    // Assert — handler tasodifan o'zgartira olmasligi kerak
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.parts)).toBe(true);
  });

  test('bo\'sh callback_data ni rad etadi', () => {
    expect(() => parseCallback('')).toThrow(ValidationError);
  });

  test('juda uzun bo\'lakni rad etadi', () => {
    // Arrange — 49 belgi, ruxsat 48
    expect(() => parseCallback(`x:${'a'.repeat(49)}`)).toThrow(ValidationError);
  });

  test('bo\'laklar soni chegarasidan oshsa rad etadi', () => {
    // Arrange — 9 ta bo'lak
    const data = ['x', ...Array.from({ length: 9 }, () => 'p')].join(':');

    // Act / Assert
    expect(() => parseCallback(data)).toThrow(ValidationError);
  });

  test('xato foydalanuvchiga ko\'rsatiladigan o\'zbekcha matn beradi', () => {
    expect(() => parseCallback('')).toThrow(/Tugma ma'lumoti yaroqsiz/);
  });
});

describe('tryParseCallback', () => {
  test('to\'g\'ri callback uchun natija qaytaradi', () => {
    expect(tryParseCallback('car.op:12')).toEqual({ action: 'car.op', parts: ['12'] });
  });

  test('undefined uchun null qaytaradi', () => {
    expect(tryParseCallback(undefined)).toBeNull();
  });

  test('eski yoki buzilgan tugma uchun null qaytaradi', () => {
    // Arrange — deploy oldidan qolgan yaroqsiz tugma
    expect(tryParseCallback(`x:${'a'.repeat(49)}`)).toBeNull();
    expect(tryParseCallback('')).toBeNull();
  });
});

describe('callbackNumber', () => {
  test('bo\'lakni songa o\'giradi', () => {
    expect(callbackNumber(['12', 'ACTIVE'], 0, 1)).toBe(12);
  });

  test('bo\'lak yo\'q bo\'lsa zaxira qiymat qaytaradi', () => {
    expect(callbackNumber([], 0, 5)).toBe(5);
  });

  test('son bo\'lmagan bo\'lak uchun zaxira qiymat qaytaradi', () => {
    // Arrange — "abc" => NaN, sahifa raqami buzilmasligi kerak
    expect(callbackNumber(['abc'], 0, 1)).toBe(1);
  });

  test('cheksizlikni ham rad etadi', () => {
    expect(callbackNumber(['Infinity'], 0, 1)).toBe(1);
  });
});

describe('callbackPattern', () => {
  test('aynan mos amalga javob beradi', () => {
    expect(callbackPattern(CB.carList).test('car.ls')).toBe(true);
  });

  test('bo\'laklari bor callbackga javob beradi', () => {
    expect(callbackPattern(CB.carList).test('car.ls:2')).toBe(true);
  });

  test('prefiksi bir xil boshqa amalni ushlab qolmaydi', () => {
    // Arrange — 'car.op' namunasi 'car.open' ni ushlamasligi kerak
    expect(callbackPattern(CB.carOpen).test('car.open:1')).toBe(false);
  });

  test('nuqtani har qanday belgi sifatida talqin qilmaydi', () => {
    // Assert — regexp maxsus belgilari qochirilgan
    expect(callbackPattern(CB.carOpen).test('carXop:1')).toBe(false);
  });
});

describe('CB lug\'ati', () => {
  test('o\'zgarmas (muzlatilgan) bo\'ladi', () => {
    expect(Object.isFrozen(CB)).toBe(true);
  });

  test('barcha amal nomlari chegaraga sig\'adi va ajratuvchisiz bo\'ladi', () => {
    // Assert — har bir amal bo'laklar bilan birga 64 baytga sig'ishi kerak
    for (const action of Object.values(CB)) {
      expect(action.length).toBeLessThanOrEqual(32);
      expect(action).not.toContain(':');
    }
  });

  test('amal nomlari takrorlanmaydi', () => {
    // Arrange — ikki handler bitta callbackni ushlab qolmasligi uchun
    const values = Object.values(CB);

    // Assert
    expect(new Set(values).size).toBe(values.length);
  });
});
