import { beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * env moduli yuklanishida haqiqiy process.env ni talab qiladi va qiymati
 * muzlatiladi. Rejimlarni (off/strict/lenient) sinash uchun uni almashtiramiz:
 * holat mutatsiya qilinmaydi — har safar yangi muzlatilgan obyekt qo'yiladi.
 */
const envState = vi.hoisted(() => {
  const DEFAULTS = Object.freeze({
    PHOTO_VALIDATION_MODE: 'lenient' as 'strict' | 'lenient' | 'off',
    PHOTO_MAX_AGE_MINUTES: 120,
  });

  let current = DEFAULTS;

  return {
    get value() {
      return current;
    },
    reset: (): void => {
      current = DEFAULTS;
    },
    apply: (patch: Partial<typeof DEFAULTS>): void => {
      current = Object.freeze({ ...current, ...patch });
    },
  };
});

vi.mock('../../src/config/env.js', () => ({
  env: {
    get PHOTO_VALIDATION_MODE() {
      return envState.value.PHOTO_VALIDATION_MODE;
    },
    get PHOTO_MAX_AGE_MINUTES() {
      return envState.value.PHOTO_MAX_AGE_MINUTES;
    },
    LOG_LEVEL: 'silent',
    NODE_ENV: 'test',
  },
  // true => logger pino-pretty transportini ishlatmaydi (testda ortiqcha oqim kerak emas).
  isProduction: true,
}));

const { readPhotoMetadata, validatePhotoFreshness } = await import('../../src/utils/exif.js');
const { t } = await import('../../src/i18n/index.js');
type PhotoMetadata = Awaited<ReturnType<typeof readPhotoMetadata>>;

/** Sobit "hozir" — testlar tizim soatiga bog'liq bo'lmasligi uchun. */
const NOW = new Date('2026-03-10T12:00:00.000Z');

const minutesAgo = (minutes: number): Date => new Date(NOW.getTime() - minutes * 60_000);

const TASHKENT_POINT = Object.freeze({ latitude: 41.311081, longitude: 69.279737 });

const metadata = (patch: Partial<PhotoMetadata> = {}): PhotoMetadata => Object.freeze({ ...patch });

beforeEach(() => {
  envState.reset();
});

describe('validatePhotoFreshness — off rejimi', () => {
  test('tekshiruv o\'chirilganda hukm chiqarmaydi', () => {
    // Arrange
    envState.apply({ PHOTO_VALIDATION_MODE: 'off' });

    // Act — hatto ochiq-oydin eski rasm ham
    const result = validatePhotoFreshness(metadata({ takenAt: minutesAgo(5_000) }), undefined, NOW);

    // Assert
    expect(result).toEqual({ verdict: 'SKIPPED' });
  });
});

describe('validatePhotoFreshness — EXIF yo\'q', () => {
  test('strict rejimda qat\'iy ogohlantirish beradi', () => {
    // Arrange
    envState.apply({ PHOTO_VALIDATION_MODE: 'strict' });

    // Act
    const result = validatePhotoFreshness(metadata(), undefined, NOW);

    // Assert
    expect(result.verdict).toBe('SUSPECT_NO_EXIF');
    expect(result.note).toBe(t.note.noExifStrict);
  });

  test('lenient rejimda yumshoq ogohlantirish beradi', () => {
    // Act
    const result = validatePhotoFreshness(metadata(), undefined, NOW);

    // Assert
    expect(result.verdict).toBe('SUSPECT_NO_EXIF');
    expect(result.note).toBe(t.note.noExifLenient);
  });
});

describe('validatePhotoFreshness — eski rasm', () => {
  test('ruxsat etilgan yoshdan katta rasmni shubhali deb belgilaydi', () => {
    // Arrange — chegara 120 daqiqa, rasm 200 daqiqalik
    const meta = metadata({ takenAt: minutesAgo(200), ...TASHKENT_POINT });

    // Act
    const result = validatePhotoFreshness(meta, undefined, NOW);

    // Assert — adminga necha daqiqa ekani ko'rsatiladi
    expect(result.verdict).toBe('SUSPECT_OLD');
    expect(result.note).toBe(t.note.tooOld(200));
  });

  test('chegaraga aynan teng yosh hali ham qabul qilinadi', () => {
    // Arrange — 120 daqiqa, ">" solishtiruvi chegarani o'tkazib yuboradi
    const meta = metadata({ takenAt: minutesAgo(120), ...TASHKENT_POINT });

    // Act / Assert
    expect(validatePhotoFreshness(meta, undefined, NOW).verdict).toBe('OK');
  });

  test('sozlamadagi chegara o\'zgarsa hukm ham o\'zgaradi', () => {
    // Arrange — chegarani 30 daqiqaga tushiramiz
    envState.apply({ PHOTO_MAX_AGE_MINUTES: 30 });
    const meta = metadata({ takenAt: minutesAgo(45), ...TASHKENT_POINT });

    // Act / Assert
    expect(validatePhotoFreshness(meta, undefined, NOW).verdict).toBe('SUSPECT_OLD');
  });

  test('eski mijoz vaqti ham shubhali deb belgilanadi', () => {
    // Arrange — EXIF yo'q, lekin Mini App vaqti ham eski
    const result = validatePhotoFreshness(metadata(), minutesAgo(300), NOW);

    // Assert — "EXIF yo'q" emas, aynan "eski" hukmi chiqadi
    expect(result.verdict).toBe('SUSPECT_OLD');
    expect(result.note).toBe(t.note.tooOld(300));
  });
});

describe('validatePhotoFreshness — kelajakdagi vaqt', () => {
  test('qurilma soati sezilarli oldinda bo\'lsa shubhali deb belgilaydi', () => {
    // Arrange — 60 daqiqa kelajak, toqat chegarasi 10 daqiqa
    const meta = metadata({ takenAt: minutesAgo(-60), ...TASHKENT_POINT });

    // Act
    const result = validatePhotoFreshness(meta, undefined, NOW);

    // Assert
    expect(result.verdict).toBe('SUSPECT_OLD');
    expect(result.note).toBe(t.note.futureTime);
  });

  test('kichik soat farqiga toqat qiladi', () => {
    // Arrange — 5 daqiqa oldinda, bu normal nosozlik
    const meta = metadata({ takenAt: minutesAgo(-5), ...TASHKENT_POINT });

    // Act / Assert
    expect(validatePhotoFreshness(meta, undefined, NOW).verdict).toBe('OK');
  });
});

describe('validatePhotoFreshness — mijoz vaqtiga tayanish', () => {
  test('EXIF vaqti yo\'q, mijoz vaqti yangi bo\'lsa zaif dalil deb belgilaydi', () => {
    // Arrange — galereyadan olingan, EXIF tozalangan rasm shunday ko'rinadi
    const result = validatePhotoFreshness(metadata({ ...TASHKENT_POINT }), minutesAgo(2), NOW);

    // Assert
    expect(result.verdict).toBe('SUSPECT_NO_EXIF');
    expect(result.note).toBe(t.note.clientTimeFallback);
  });
});

describe('validatePhotoFreshness — GPS', () => {
  test('strict rejimda koordinatasiz rasmni shubhali deb belgilaydi', () => {
    // Arrange
    envState.apply({ PHOTO_VALIDATION_MODE: 'strict' });
    const meta = metadata({ takenAt: minutesAgo(3) });

    // Act
    const result = validatePhotoFreshness(meta, undefined, NOW);

    // Assert
    expect(result.verdict).toBe('SUSPECT_GEO');
    expect(result.note).toBe(t.note.noGeo);
  });

  test('lenient rejimda koordinatasiz rasm ham qabul qilinadi', () => {
    // Act
    const result = validatePhotoFreshness(metadata({ takenAt: minutesAgo(3) }), undefined, NOW);

    // Assert
    expect(result).toEqual({ verdict: 'OK' });
  });

  test('faqat bitta koordinata bo\'lsa to\'liq emas hisoblanadi', () => {
    // Arrange — longitude yo'q
    envState.apply({ PHOTO_VALIDATION_MODE: 'strict' });
    const meta = metadata({ takenAt: minutesAgo(3), latitude: 41.31 });

    // Act / Assert
    expect(validatePhotoFreshness(meta, undefined, NOW).verdict).toBe('SUSPECT_GEO');
  });

  test('strict rejimda yangi va koordinatali rasm to\'liq o\'tadi', () => {
    // Arrange
    envState.apply({ PHOTO_VALIDATION_MODE: 'strict' });
    const meta = metadata({ takenAt: minutesAgo(1), ...TASHKENT_POINT });

    // Act
    const result = validatePhotoFreshness(meta, undefined, NOW);

    // Assert
    expect(result).toEqual({ verdict: 'OK' });
    expect(result.note).toBeUndefined();
  });
});

describe('readPhotoMetadata', () => {
  /**
   * Minimal JPEG + EXIF (APP1/TIFF). Haqiqiy rasm faylini repozitoriyga
   * qo'shmaslik uchun sarlavhani qo'lda yig'amiz — exifr aynan shuni o'qiydi.
   */
  const buildJpegWithExif = (): Buffer => {
    const MAKE = 'TestCam\0';
    const DATE = '2026:03:10 13:00:00\0';
    const IFD0_OFFSET = 8;
    const ENTRY_COUNT = 4;
    const ENTRY_SIZE = 12;
    const DATA_OFFSET = IFD0_OFFSET + 2 + ENTRY_COUNT * ENTRY_SIZE + 4;

    const tiff = Buffer.alloc(DATA_OFFSET + MAKE.length + DATE.length);
    tiff.write('II', 0, 'ascii');
    tiff.writeUInt16LE(0x002a, 2);
    tiff.writeUInt32LE(IFD0_OFFSET, 4);
    tiff.writeUInt16LE(ENTRY_COUNT, IFD0_OFFSET);

    const writeEntry = (index: number, tag: number, type: number, count: number, value: number): void => {
      const at = IFD0_OFFSET + 2 + index * ENTRY_SIZE;
      tiff.writeUInt16LE(tag, at);
      tiff.writeUInt16LE(type, at + 2);
      tiff.writeUInt32LE(count, at + 4);
      tiff.writeUInt32LE(value, at + 8);
    };

    // Teglar o'sish tartibida bo'lishi shart (TIFF spetsifikatsiyasi).
    writeEntry(0, 0x0100, 3, 1, 1920); // ImageWidth (SHORT, qiymat joyida)
    writeEntry(1, 0x0101, 3, 1, 1080); // ImageHeight
    writeEntry(2, 0x010f, 2, MAKE.length, DATA_OFFSET); // Make (ASCII, ko'rsatkich)
    writeEntry(3, 0x0132, 2, DATE.length, DATA_OFFSET + MAKE.length); // ModifyDate
    tiff.writeUInt32LE(0, IFD0_OFFSET + 2 + ENTRY_COUNT * ENTRY_SIZE); // keyingi IFD yo'q
    tiff.write(MAKE, DATA_OFFSET, 'ascii');
    tiff.write(DATE, DATA_OFFSET + MAKE.length, 'ascii');

    const exifHeader = Buffer.from('Exif\0\0', 'ascii');
    const app1Body = Buffer.concat([exifHeader, tiff]);
    const app1 = Buffer.alloc(4);
    app1.writeUInt16BE(0xffe1, 0);
    app1.writeUInt16BE(app1Body.length + 2, 2);

    return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, app1Body, Buffer.from([0xff, 0xd9])]);
  };

  test('EXIF maydonlarini o\'qiydi', async () => {
    // Arrange
    const jpeg = buildJpegWithExif();

    // Act
    const meta = await readPhotoMetadata(jpeg);

    // Assert
    expect(meta.make).toBe('TestCam');
    expect(meta.width).toBe(1920);
    expect(meta.height).toBe(1080);
    expect(meta.takenAt).toBeInstanceOf(Date);
  });

  test('EXIF yo\'q faylda bo\'sh metama\'lumot qaytaradi', async () => {
    // Arrange — EXIF segmentisiz eng kichik JPEG
    const bare = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

    // Act
    const meta = await readPhotoMetadata(bare);

    // Assert
    expect(meta).toEqual({});
  });

  test('rasm bo\'lmagan bufer uchun xato tashlamaydi', async () => {
    // Arrange — tasodifiy baytlar; exifr xato tashlashi mumkin, biz uni ushlaymiz
    const garbage = Buffer.from('bu rasm emas, shunchaki matn', 'utf8');

    // Act
    const meta = await readPhotoMetadata(garbage);

    // Assert
    expect(meta).toEqual({});
  });

  test('qaytarilgan metama\'lumot o\'zgarmas bo\'ladi', async () => {
    // Act
    const meta = await readPhotoMetadata(buildJpegWithExif());

    // Assert
    expect(Object.isFrozen(meta)).toBe(true);
  });
});
