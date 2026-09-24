import { describe, expect, test } from 'vitest';
import { CAPTION_LIMIT, MESSAGE_LIMIT, escapeHtml, truncate } from '../../src/utils/html.js';

describe('escapeHtml', () => {
  test('skript teglarini zararsizlantiradi', () => {
    // Arrange — haydovchi ismi sifatida kelgan XSS urinishi
    const malicious = '<script>alert(1)</script>';

    // Act
    const safe = escapeHtml(malicious);

    // Assert
    expect(safe).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(safe).not.toContain('<');
    expect(safe).not.toContain('>');
  });

  test('atribut ichidan chiqib ketishga yo\'l qo\'ymaydi', () => {
    // Arrange — <a href="..."> ichiga tushadigan qiymat
    const malicious = '" onclick="steal()';

    // Act
    const safe = escapeHtml(malicious);

    // Assert
    expect(safe).toBe('&quot; onclick=&quot;steal()');
    expect(safe).not.toContain('"');
  });

  test('ampersandni birinchi bo\'lib almashtiradi (ikki marta emas)', () => {
    // Arrange — allaqachon "entity"ga o'xshash matn
    const value = 'Tom & Jerry';

    // Act
    const safe = escapeHtml(value);

    // Assert
    expect(safe).toBe('Tom &amp; Jerry');
  });

  test('tayyor entity ni ham xom matn sifatida qochiradi', () => {
    // Arrange — foydalanuvchi "&lt;" deb yozgan bo'lsa u matn bo'lib qolishi kerak
    expect(escapeHtml('&lt;b&gt;')).toBe('&amp;lt;b&amp;gt;');
  });

  test('xavfsiz matnni o\'zgartirmaydi', () => {
    // Arrange — kirill, lotin, emoji va apostrof
    const value = 'Toshkent — 01 A 123 BC ✅ o\'zbek';

    // Act / Assert
    expect(escapeHtml(value)).toBe(value);
  });

  test('bo\'sh qator uchun bo\'sh qator qaytaradi', () => {
    expect(escapeHtml('')).toBe('');
  });

  test('barcha xavfli belgilarni bitta o\'tishda almashtiradi', () => {
    expect(escapeHtml('&<>"')).toBe('&amp;&lt;&gt;&quot;');
  });
});

describe('truncate', () => {
  test('chegaradan qisqa matnni o\'zgarishsiz qaytaradi', () => {
    expect(truncate('salom', 10)).toBe('salom');
  });

  test('aynan chegaraga teng matnni kesmaydi', () => {
    // Arrange — chegaraviy holat: uzunlik === max
    expect(truncate('salom', 5)).toBe('salom');
  });

  test('uzun matnni kesib ellipsis qo\'shadi', () => {
    // Act
    const result = truncate('abcdefghij', 5);

    // Assert — natija chegaradan oshmasligi kerak
    expect(result).toBe('abcd…');
    expect(result).toHaveLength(5);
  });

  test('caption chegarasidan oshgan matnni Telegram qabul qiladigan holga keltiradi', () => {
    // Arrange — 2000 belgilik izoh
    const long = 'a'.repeat(2_000);

    // Act
    const result = truncate(long, CAPTION_LIMIT);

    // Assert
    expect(result.length).toBeLessThanOrEqual(CAPTION_LIMIT);
    expect(result.endsWith('…')).toBe(true);
  });

  test('nol chegara uchun faqat ellipsis qoladi', () => {
    // Assert — salbiy slice hosil bo'lmasligi kafolatlanadi
    expect(truncate('abc', 0)).toBe('…');
  });
});

describe('Telegram chegaralari', () => {
  test('xabar va izoh chegaralari Telegram hujjatiga mos', () => {
    expect(MESSAGE_LIMIT).toBe(4_096);
    expect(CAPTION_LIMIT).toBe(1_024);
  });
});
