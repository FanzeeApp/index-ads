import { createHmac } from 'node:crypto';
import { describe, expect, test, vi } from 'vitest';
import { ValidationError } from '../../src/core/errors.js';

/**
 * initData.ts maxfiy kalitni modul yuklanishida env.BOT_TOKEN dan hisoblaydi,
 * env esa process.env ni bir marta o'qib muzlatadi. Shuning uchun muhit
 * o'zgaruvchilari importlardan OLDIN qo'yilishi shart (vi.hoisted).
 * Token — testga atalgan soxta qiymat, haqiqiy bot tokeni emas.
 */
const { TEST_BOT_TOKEN } = vi.hoisted(() => {
  const TEST_BOT_TOKEN = '1234567890:TEST-ONLY-FAKE-TOKEN-FOR-HMAC-CHECKS';
  vi.stubEnv('BOT_TOKEN', TEST_BOT_TOKEN);
  vi.stubEnv('BOT_USERNAME', 'ads_test_bot');
  vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/test');
  vi.stubEnv('SUPER_ADMIN_IDS', '1000001');
  vi.stubEnv('LOG_LEVEL', 'fatal');
  return { TEST_BOT_TOKEN };
});

const { verifyInitData } = await import('../../src/web/security/initData.js');

/** Sobit "hozir" — auth_date tekshiruvi tizim soatiga bog'liq bo'lmasligi uchun. */
const NOW = new Date('2026-03-10T12:00:00.000Z');
const HOUR_SECONDS = 3_600;

const toUnixSeconds = (date: Date): string => String(Math.floor(date.getTime() / 1000));

const secondsBefore = (seconds: number): string =>
  toUnixSeconds(new Date(NOW.getTime() - seconds * 1000));

const DEFAULT_USER = Object.freeze({
  id: 555_000_111,
  first_name: 'Dilshod',
  username: 'dilshod_99',
  language_code: 'uz',
});

/**
 * Telegram rasmiy algoritmi bo'yicha imzo hisoblaydi — modulning o'z kodidan
 * mustaqil, ya'ni test haqiqiy HMAC ni tekshiradi, nusxasini emas.
 */
const sign = (fields: Readonly<Record<string, string>>, token: string = TEST_BOT_TOKEN): string => {
  const dataCheckString = Object.entries(fields)
    .filter(([key]) => key !== 'hash' && key !== 'signature')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  return createHmac('sha256', secret).update(dataCheckString).digest('hex');
};

const buildInitData = (
  fields: Readonly<Record<string, string>>,
  token: string = TEST_BOT_TOKEN,
): string => new URLSearchParams({ ...fields, hash: sign(fields, token) }).toString();

const validFields = (
  patch: Readonly<Record<string, string>> = {},
): Readonly<Record<string, string>> =>
  Object.freeze({
    auth_date: toUnixSeconds(NOW),
    query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
    user: JSON.stringify(DEFAULT_USER),
    ...patch,
  });

describe('verifyInitData — to\'g\'ri imzo', () => {
  test('haqiqiy HMAC bilan imzolangan initData ni qabul qiladi', () => {
    // Arrange
    const initData = buildInitData(validFields());

    // Act
    const verified = verifyInitData(initData, NOW);

    // Assert
    expect(verified.user.id).toBe(DEFAULT_USER.id);
    expect(verified.user.username).toBe('dilshod_99');
    expect(verified.authDate.getTime()).toBe(NOW.getTime());
  });

  test('start_param va query_id ni qaytaradi', () => {
    // Arrange — referal havola orqali kirgan haydovchi
    const initData = buildInitData(validFields({ start_param: 'ref_abc123' }));

    // Act
    const verified = verifyInitData(initData, NOW);

    // Assert
    expect(verified.startParam).toBe('ref_abc123');
    expect(verified.queryId).toBe('AAHdF6IQAAAAAN0XohDhrOrc');
  });

  test('ixtiyoriy maydonlar yo\'q bo\'lsa undefined qaytaradi', () => {
    // Arrange — faqat majburiy maydonlar
    const fields = { auth_date: toUnixSeconds(NOW), user: JSON.stringify(DEFAULT_USER) };

    // Act
    const verified = verifyInitData(buildInitData(fields), NOW);

    // Assert
    expect(verified.startParam).toBeUndefined();
    expect(verified.queryId).toBeUndefined();
  });

  test('Telegram qo\'shgan signature maydoni imzoni buzmaydi', () => {
    // Arrange — "signature" data_check_string dan chiqarib tashlanishi kerak
    const fields = validFields();
    const initData = new URLSearchParams({
      ...fields,
      signature: 'uchinchi-tomon-imzosi',
      hash: sign(fields),
    }).toString();

    // Act / Assert
    expect(() => verifyInitData(initData, NOW)).not.toThrow();
  });

  test('o\'zgarmas natija qaytaradi', () => {
    // Act
    const verified = verifyInitData(buildInitData(validFields()), NOW);

    // Assert
    expect(Object.isFrozen(verified)).toBe(true);
    expect(Object.isFrozen(verified.user)).toBe(true);
  });
});

describe('verifyInitData — imzo xatolari', () => {
  test('buzilgan hash rad etiladi', () => {
    // Arrange — to'g'ri formatdagi, lekin noto'g'ri imzo
    const fields = validFields();
    const initData = new URLSearchParams({ ...fields, hash: 'a'.repeat(64) }).toString();

    // Act / Assert
    expect(() => verifyInitData(initData, NOW)).toThrow(/imzosi mos emas/);
  });

  test('imzodan keyin o\'zgartirilgan ma\'lumot rad etiladi', () => {
    // Arrange — hujumchi user.id ni almashtirmoqchi
    const original = validFields();
    const tampered = new URLSearchParams({
      ...original,
      user: JSON.stringify({ ...DEFAULT_USER, id: 999_999_999 }),
      hash: sign(original),
    }).toString();

    // Act / Assert
    expect(() => verifyInitData(tampered, NOW)).toThrow(/imzosi mos emas/);
  });

  test('boshqa bot tokeni bilan imzolangan initData rad etiladi', () => {
    // Arrange
    const initData = buildInitData(validFields(), '9999999999:ANOTHER-FAKE-BOT-TOKEN-VALUE');

    // Act / Assert
    expect(() => verifyInitData(initData, NOW)).toThrow(/imzosi mos emas/);
  });

  test('hash umuman yo\'q bo\'lsa rad etiladi', () => {
    // Arrange
    const initData = new URLSearchParams(validFields()).toString();

    // Act / Assert
    expect(() => verifyInitData(initData, NOW)).toThrow(/imzosi yo'q/);
  });

  test('hash formati noto\'g\'ri bo\'lsa rad etiladi', () => {
    // Arrange — 64 ta o'n oltilik belgi emas
    const initData = new URLSearchParams({ ...validFields(), hash: 'qisqa-hash' }).toString();

    // Act / Assert
    expect(() => verifyInitData(initData, NOW)).toThrow(/imzosi yo'q/);
  });

  test('katta harfli hash ham qabul qilinadi', () => {
    // Arrange — ba'zi mijozlar hash ni katta harfda yuborishi mumkin
    const fields = validFields();
    const initData = new URLSearchParams({
      ...fields,
      hash: sign(fields).toUpperCase(),
    }).toString();

    // Act / Assert
    expect(() => verifyInitData(initData, NOW)).not.toThrow();
  });
});

describe('verifyInitData — auth_date', () => {
  test('24 soatdan eski auth_date rad etiladi', () => {
    // Arrange — 25 soat oldingi sessiya
    const initData = buildInitData(validFields({ auth_date: secondsBefore(25 * HOUR_SECONDS) }));

    // Act / Assert
    expect(() => verifyInitData(initData, NOW)).toThrow(/muddati tugagan/);
  });

  test('24 soat ichidagi auth_date qabul qilinadi', () => {
    // Arrange — chegaraga yaqin, lekin ichkarida
    const initData = buildInitData(validFields({ auth_date: secondsBefore(24 * HOUR_SECONDS - 60) }));

    // Act / Assert
    expect(() => verifyInitData(initData, NOW)).not.toThrow();
  });

  test('kelajakdagi auth_date rad etiladi', () => {
    // Arrange — 10 daqiqa kelajak, toqat chegarasi 5 daqiqa
    const initData = buildInitData(validFields({ auth_date: secondsBefore(-600) }));

    // Act / Assert
    expect(() => verifyInitData(initData, NOW)).toThrow(/kelajakda/);
  });

  test('kichik soat farqiga toqat qiladi', () => {
    // Arrange — 1 daqiqa oldinda
    const initData = buildInitData(validFields({ auth_date: secondsBefore(-60) }));

    // Act / Assert
    expect(() => verifyInitData(initData, NOW)).not.toThrow();
  });

  test('son bo\'lmagan auth_date rad etiladi', () => {
    // Arrange — imzo to'g'ri, lekin qiymat yaroqsiz
    const initData = buildInitData(validFields({ auth_date: 'bugun' }));

    // Act / Assert
    expect(() => verifyInitData(initData, NOW)).toThrow(/auth_date yaroqsiz/);
  });
});

describe('verifyInitData — user maydoni', () => {
  test('buzilgan user JSON rad etiladi', () => {
    // Arrange — imzo to'g'ri, JSON esa yarim
    const initData = buildInitData(validFields({ user: '{"id":555000111' }));

    // Act / Assert
    expect(() => verifyInitData(initData, NOW)).toThrow(/JSON buzilgan/);
  });

  test('user maydoni yo\'q bo\'lsa rad etiladi', () => {
    // Arrange
    const initData = buildInitData({ auth_date: toUnixSeconds(NOW) });

    // Act / Assert
    expect(() => verifyInitData(initData, NOW)).toThrow(/foydalanuvchi/);
  });

  test('manfiy id li user rad etiladi', () => {
    // Arrange — Telegram id doim musbat butun son
    const initData = buildInitData(validFields({ user: JSON.stringify({ id: -5 }) }));

    // Act / Assert
    expect(() => verifyInitData(initData, NOW)).toThrow(/maydonlari yaroqsiz/);
  });

  test('id o\'rniga matn kelsa rad etiladi', () => {
    // Arrange
    const initData = buildInitData(validFields({ user: JSON.stringify({ id: '555000111' }) }));

    // Act / Assert
    expect(() => verifyInitData(initData, NOW)).toThrow(/maydonlari yaroqsiz/);
  });
});

describe('verifyInitData — kirish qatori', () => {
  test('bo\'sh initData rad etiladi', () => {
    expect(() => verifyInitData('', NOW)).toThrow(/initData yaroqsiz/);
  });

  test('haddan tashqari uzun initData rad etiladi', () => {
    // Arrange — 8192 baytdan katta kiritma (xotira/DoS himoyasi)
    expect(() => verifyInitData('a'.repeat(8_193), NOW)).toThrow(/initData yaroqsiz/);
  });

  test('xatolar foydalanuvchiga ko\'rsatiladigan ValidationError bo\'ladi', () => {
    // Act
    let caught: unknown;
    try {
      verifyInitData('', NOW);
    } catch (error) {
      caught = error;
    }

    // Assert
    expect(caught).toBeInstanceOf(ValidationError);
    expect(caught).toMatchObject({ code: 'VALIDATION', userFacing: true, statusCode: 400 });
  });
});
