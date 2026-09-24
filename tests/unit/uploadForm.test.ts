import { describe, expect, test } from 'vitest';
import {
  assertImageBuffer,
  buildStoredFilename,
  detectImageMimeType,
} from '../../src/web/routes/uploadForm.js';
import { toApiError } from '../../src/web/httpError.js';
import { ForbiddenError, AppError } from '../../src/core/errors.js';
import { MAX_UPLOAD_BYTES } from '../../src/config/constants.js';

/** Haqiqiy fayl sarlavhalari — Content-Type ga ishonmaslik shu yerda tekshiriladi. */
const withPadding = (header: readonly number[]): Buffer =>
  Buffer.concat([Buffer.from(header), Buffer.alloc(16)]);

const JPEG = withPadding([0xff, 0xd8, 0xff, 0xe0]);
const PNG = withPadding([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)]);
const HEIC = Buffer.concat([Buffer.alloc(4), Buffer.from('ftyp'), Buffer.from('heic'), Buffer.alloc(8)]);

describe('detectImageMimeType', () => {
  test('JPEG sarlavhasini taniydi', () => {
    expect(detectImageMimeType(JPEG)).toBe('image/jpeg');
  });

  test('PNG sarlavhasini taniydi', () => {
    expect(detectImageMimeType(PNG)).toBe('image/png');
  });

  test('WEBP va HEIC sarlavhalarini taniydi', () => {
    expect(detectImageMimeType(WEBP)).toBe('image/webp');
    expect(detectImageMimeType(HEIC)).toBe('image/heic');
  });

  test('rasm bo\'lmagan fayl uchun null qaytaradi', () => {
    // Arrange — ".jpg" nomi bilan yuborilgan HTML/skript fayli
    const script = Buffer.from('<!DOCTYPE html><script>alert(1)</script>');

    // Act / Assert
    expect(detectImageMimeType(script)).toBeNull();
  });

  test('juda qisqa bufer uchun null qaytaradi', () => {
    expect(detectImageMimeType(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});

describe('assertImageBuffer', () => {
  test('ruxsat etilgan format uchun MIME turini qaytaradi', () => {
    expect(assertImageBuffer(JPEG)).toBe('image/jpeg');
  });

  test('bo\'sh bufer uchun xato tashlaydi', () => {
    expect(() => assertImageBuffer(Buffer.alloc(0))).toThrow(/bo'sh/i);
  });

  test('chegaradan katta fayl uchun xato tashlaydi', () => {
    // Arrange — chegaradan bitta bayt katta, to'g'ri sarlavhali "rasm"
    const oversized = Buffer.concat([JPEG, Buffer.alloc(MAX_UPLOAD_BYTES)]);

    // Act / Assert
    expect(() => assertImageBuffer(oversized)).toThrow(/hajmi/i);
  });

  test('rasm bo\'lmagan faylni rad etadi', () => {
    expect(() => assertImageBuffer(Buffer.from('GIF89a--------------'))).toThrow(/rasm fayli/i);
  });
});

describe('buildStoredFilename', () => {
  test('kengaytmani MIME turidan oladi', () => {
    // Act
    const name = buildStoredFilename('01A123BC', 'REAR', 'image/png', new Date(1_700_000_000_000));

    // Assert
    expect(name).toBe('01A123BC_REAR_1700000000000.png');
  });

  test('yo\'l ajratgichlari va nuqtalarni tashlab yuboradi', () => {
    // Arrange — zararli davlat raqami
    const name = buildStoredFilename('../../etc/passwd', 'LEFT', 'image/jpeg', new Date(0));

    // Assert — natijada faqat xavfsiz belgilar va bitta kengaytma qoladi
    expect(name).toBe('etcpasswd_LEFT_0.jpg');
    expect(name).not.toContain('/');
    expect(name).not.toContain('..');
  });

  test('noma\'lum MIME uchun jpg kengaytmasini beradi', () => {
    expect(buildStoredFilename('01A123BC', 'RIGHT', 'image/unknown', new Date(0))).toMatch(/\.jpg$/);
  });
});

describe('toApiError', () => {
  test('foydalanuvchiga ko\'rsatiladigan xato matnini saqlaydi', () => {
    // Act
    const mapped = toApiError(new ForbiddenError('⛔️ Ruxsat yo\'q'));

    // Assert
    expect(mapped.status).toBe(403);
    expect(mapped.body).toEqual({ ok: false, code: 'FORBIDDEN', message: '⛔️ Ruxsat yo\'q' });
  });

  test('ichki xato tafsilotlarini oshkor qilmaydi', () => {
    // Arrange — ichki xato, userFacing emas
    const internal = new AppError('DB', 'connection to 10.0.0.1:5432 refused', { statusCode: 500 });

    // Act
    const mapped = toApiError(internal);

    // Assert
    expect(mapped.status).toBe(500);
    expect(mapped.body.code).toBe('INTERNAL');
    expect(mapped.body.message).not.toContain('10.0.0.1');
  });

  test('Fastify xatosining holat kodini saqlaydi', () => {
    // Arrange — plaginlar xatosi shu shaklda keladi
    const fastifyError = Object.assign(new Error('Bad Request'), { statusCode: 400 });

    // Act / Assert
    expect(toApiError(fastifyError).status).toBe(400);
  });

  test('noma\'lum qiymat uchun 500 qaytaradi', () => {
    expect(toApiError('nimadir').status).toBe(500);
  });
});
