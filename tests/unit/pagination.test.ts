import { describe, expect, test } from 'vitest';
import { PAGE_SIZE } from '../../src/config/constants.js';
import { buildPage, toSkip } from '../../src/utils/pagination.js';

/** Sahifadagi elementlar mazmuni muhim emas — faqat metama'lumot tekshiriladi. */
const rows = (count: number): readonly string[] =>
  Array.from({ length: count }, (_unused, index) => `row-${index + 1}`);

describe('buildPage', () => {
  test('bo\'sh ro\'yxat uchun ham bitta sahifa qaytaradi', () => {
    // Arrange — hech qanday mashina topilmagan holat
    const page = buildPage([], 0, 1);

    // Assert — foydalanuvchi "1/1" ni ko'radi, "1/0" emas
    expect(page).toEqual({
      items: [],
      page: 1,
      totalPages: 1,
      totalItems: 0,
      hasPrev: false,
      hasNext: false,
    });
  });

  test('elementlar bitta sahifaga sig\'sa keyingi sahifa bo\'lmaydi', () => {
    // Arrange
    const items = rows(PAGE_SIZE);

    // Act
    const page = buildPage(items, PAGE_SIZE, 1);

    // Assert
    expect(page.totalPages).toBe(1);
    expect(page.hasNext).toBe(false);
    expect(page.hasPrev).toBe(false);
  });

  test('to\'liq sahifadan bitta ortiq element ikkinchi sahifani ochadi', () => {
    // Arrange — chegaraviy holat: PAGE_SIZE + 1
    const page = buildPage(rows(PAGE_SIZE), PAGE_SIZE + 1, 1);

    // Assert
    expect(page.totalPages).toBe(2);
    expect(page.hasNext).toBe(true);
  });

  test('o\'rtadagi sahifada ikkala yo\'nalish ham ochiq bo\'ladi', () => {
    // Arrange — 3 sahifalik ro'yxatning 2-sahifasi
    const page = buildPage(rows(PAGE_SIZE), PAGE_SIZE * 3, 2);

    // Assert
    expect(page.page).toBe(2);
    expect(page.hasPrev).toBe(true);
    expect(page.hasNext).toBe(true);
  });

  test('chegaradan tashqaridagi sahifa oxirgi sahifagacha qisqartiriladi', () => {
    // Arrange — eski tugma bosildi, sahifa raqami allaqachon yo'q
    const page = buildPage(rows(2), 20, 99, 8);

    // Assert
    expect(page.page).toBe(3);
    expect(page.totalPages).toBe(3);
    expect(page.hasNext).toBe(false);
  });

  test('nol yoki manfiy sahifa birinchi sahifaga tenglashtiriladi', () => {
    // Act / Assert
    expect(buildPage(rows(3), 20, 0).page).toBe(1);
    expect(buildPage(rows(3), 20, -5).page).toBe(1);
  });

  test('sahifa hajmi berilmasa PAGE_SIZE ishlatiladi', () => {
    // Arrange — 2 * PAGE_SIZE element => aniq 2 sahifa
    const page = buildPage(rows(PAGE_SIZE), PAGE_SIZE * 2, 1);

    // Assert
    expect(page.totalPages).toBe(2);
  });

  test('berilgan sahifa hajmini hisobga oladi', () => {
    // Arrange — 25 element, sahifada 10 tadan => 3 sahifa
    const page = buildPage(rows(10), 25, 1, 10);

    // Assert
    expect(page.totalPages).toBe(3);
  });

  test('qaytarilgan sahifa kirish massivini nusxalamasdan uzatadi', () => {
    // Arrange
    const items = rows(3);

    // Act
    const page = buildPage(items, 3, 1);

    // Assert — ortiqcha nusxa yo'q, lekin tur darajasida readonly
    expect(page.items).toEqual(items);
  });
});

describe('toSkip', () => {
  test('birinchi sahifa uchun nol qaytaradi', () => {
    expect(toSkip(1)).toBe(0);
  });

  test('sahifa raqamini offsetga aylantiradi', () => {
    // Act — 3-sahifa, standart hajm
    const skip = toSkip(3);

    // Assert
    expect(skip).toBe(PAGE_SIZE * 2);
  });

  test('berilgan sahifa hajmi bilan hisoblaydi', () => {
    expect(toSkip(4, 10)).toBe(30);
  });

  test.each([0, -1, -100])('yaroqsiz sahifa raqami uchun nol qaytaradi: %s', (page) => {
    // Assert — SQL so'roviga manfiy OFFSET hech qachon tushmasligi kerak
    expect(toSkip(page)).toBe(0);
  });
});
