import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  addDays,
  addHours,
  addMinutes,
  formatDate,
  formatDateTime,
  formatRemaining,
  hoursBetween,
  isPast,
  minutesBetween,
} from '../../src/utils/time.js';

/** Sobit tayanch nuqta — testlar kalendar yoki mintaqaga bog'liq bo'lmasligi uchun. */
const BASE = new Date('2026-03-10T08:00:00.000Z');

describe('addDays', () => {
  test('berilgan kun sonini qo\'shadi', () => {
    // Act — tekshiruv oralig'i odatda 3 kun
    const result = addDays(BASE, 3);

    // Assert
    expect(result.toISOString()).toBe('2026-03-13T08:00:00.000Z');
  });

  test('manfiy qiymat bilan orqaga suradi', () => {
    expect(addDays(BASE, -1).toISOString()).toBe('2026-03-09T08:00:00.000Z');
  });

  test('kirish sanasini o\'zgartirmaydi', () => {
    // Arrange
    const original = new Date(BASE.getTime());

    // Act
    const shifted = addDays(original, 5);

    // Assert — yangi obyekt qaytdi, manba joyida qoldi
    expect(original.toISOString()).toBe(BASE.toISOString());
    expect(shifted).not.toBe(original);
  });
});

describe('addHours', () => {
  test('tekshiruv muddatini soatlab suradi', () => {
    // Act — CHECK_DEADLINE_HOURS standart qiymati 24
    const deadline = addHours(BASE, 24);

    // Assert
    expect(deadline.toISOString()).toBe('2026-03-11T08:00:00.000Z');
  });

  test('yarim kunlik surilishda sana chegarasidan o\'tadi', () => {
    expect(addHours(BASE, 18).toISOString()).toBe('2026-03-11T02:00:00.000Z');
  });
});

describe('addMinutes', () => {
  test('daqiqalarni qo\'shadi', () => {
    expect(addMinutes(BASE, 90).toISOString()).toBe('2026-03-10T09:30:00.000Z');
  });
});

describe('hoursBetween va minutesBetween', () => {
  test('ikki sana orasidagi farqni soatda qaytaradi', () => {
    // Act
    const hours = hoursBetween(BASE, addHours(BASE, 7));

    // Assert
    expect(hours).toBe(7);
  });

  test('o\'tgan sana uchun manfiy farq qaytaradi', () => {
    expect(minutesBetween(BASE, addMinutes(BASE, -45))).toBe(-45);
  });

  test('butun bo\'lmagan farqni kasr son bilan qaytaradi', () => {
    expect(hoursBetween(BASE, addMinutes(BASE, 30))).toBe(0.5);
  });
});

describe('formatRemaining', () => {
  test('soat va daqiqani birga ko\'rsatadi', () => {
    // Arrange — muddatgacha 3 soat 20 daqiqa
    const until = addMinutes(BASE, 200);

    // Act
    const text = formatRemaining(until, BASE);

    // Assert
    expect(text).toBe('3 soat 20 daqiqa');
  });

  test('bir soatdan kam qolganda faqat daqiqani ko\'rsatadi', () => {
    // Act
    const text = formatRemaining(addMinutes(BASE, 45), BASE);

    // Assert
    expect(text).toBe('45 daqiqa');
  });

  test('daqiqalar qoldig\'i nol bo\'lganda faqat soatni ko\'rsatadi', () => {
    expect(formatRemaining(addHours(BASE, 2), BASE)).toBe('2 soat');
  });

  test('muddat o\'tgan bo\'lsa tugaganini aytadi', () => {
    // Act
    const text = formatRemaining(addMinutes(BASE, -1), BASE);

    // Assert
    expect(text).toBe('muddati tugagan');
  });

  test('aynan muddat payti ham tugagan hisoblanadi', () => {
    // Arrange — diffMs = 0 chegaraviy holat
    expect(formatRemaining(BASE, BASE)).toBe('muddati tugagan');
  });

  test('now berilmasa tizim vaqtidan foydalanadi', () => {
    // Arrange — tizim soatini muzlatamiz, test flaky bo'lmasin
    vi.useFakeTimers();
    vi.setSystemTime(BASE);

    // Act
    const text = formatRemaining(addHours(BASE, 5));

    // Assert
    expect(text).toBe('5 soat');
    vi.useRealTimers();
  });
});

describe('isPast', () => {
  test('o\'tgan sana uchun true qaytaradi', () => {
    expect(isPast(addHours(BASE, -1), BASE)).toBe(true);
  });

  test('kelajakdagi sana uchun false qaytaradi', () => {
    expect(isPast(addHours(BASE, 1), BASE)).toBe(false);
  });

  test('aynan hozirgi payt o\'tgan hisoblanadi', () => {
    // Assert — muddat tugashini kechiktirmaslik uchun chegara "<=" bo'lishi kerak
    expect(isPast(BASE, BASE)).toBe(true);
  });

  describe('now berilmagan holat', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(BASE);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    test('tizim vaqtiga nisbatan solishtiradi', () => {
      expect(isPast(addMinutes(BASE, -10))).toBe(true);
      expect(isPast(addMinutes(BASE, 10))).toBe(false);
    });
  });
});

describe('formatDate va formatDateTime', () => {
  test('sanani Toshkent vaqt mintaqasida ko\'rsatadi', () => {
    // Arrange — UTC bo'yicha 1-yanvar 20:00, Toshkentda esa allaqachon 2-yanvar
    const lateEvening = new Date('2026-01-01T20:00:00.000Z');

    // Act
    const formatted = formatDate(lateEvening);

    // Assert — ajratgich ICU versiyasiga bog'liq, sana raqamlari esa bog'liq emas
    expect(formatted).toMatch(/^02\D+01\D+2026$/);
  });

  test('sana va vaqtni 24 soatlik formatda ko\'rsatadi', () => {
    // Arrange — Toshkent UTC+5, demak 01:00 bo'lishi kerak
    const lateEvening = new Date('2026-01-01T20:00:00.000Z');

    // Act
    const formatted = formatDateTime(lateEvening);

    // Assert
    expect(formatted).toContain('01:00');
    expect(formatted).not.toMatch(/AM|PM/i);
  });
});
