import type { User } from '@prisma/client';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../src/core/errors.js';

/**
 * `adminService` — bot ichidan admin qo'shish/olib tashlashning xavfsizlik qoidalari.
 *
 * Eng muhim xossa: qoidalar SERVIS ichida majburlanadi. Handler qatlamidagi
 * `requireRole('SUPERADMIN')` chetlab o'tilsa ham (eski tugma, suhbat qayta
 * o'ynatilishi, kelajakdagi yangi chaqiruv nuqtasi) huquq berilmasligi kerak.
 * Baza to'liq mock qilinadi — testlar Postgres'siz ishlaydi.
 */

const ENV_SUPER_ADMIN_ID = '5606183694';

vi.stubEnv('BOT_TOKEN', '111111111:TEST_TOKEN_FOR_UNIT_TESTS_abcdefgh');
vi.stubEnv('BOT_USERNAME', 'unit_test_bot');
vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/test');
vi.stubEnv('SUPER_ADMIN_IDS', ENV_SUPER_ADMIN_ID);
vi.stubEnv('BOT_MODE', 'polling');

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../src/db/client.js', () => ({ prisma: prismaMock }));

let service: typeof import('../../src/services/adminService.js');

beforeAll(async () => {
  service = await import('../../src/services/adminService.js');
});

beforeEach(() => {
  // `clearMocks` faqat chaqiruvlar tarixini tozalaydi — "Once" navbati va
  // qaytariladigan qiymatlar testdan testga o'tib ketmasligi uchun to'liq reset.
  prismaMock.user.findUnique.mockReset();
  prismaMock.user.findFirst.mockReset();
  prismaMock.user.findMany.mockReset();
  prismaMock.user.count.mockReset();
  prismaMock.user.update.mockReset();
  prismaMock.auditLog.create.mockReset();
  prismaMock.$transaction.mockReset();

  // Tranzaksiya ikki shaklda ishlatiladi: massiv (ro'yxat/sanoq) va callback (yozish).
  prismaMock.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: unknown) => Promise<unknown>)(prismaMock)
      : Promise.all(arg as readonly Promise<unknown>[]),
  );
  prismaMock.auditLog.create.mockResolvedValue({ id: 'audit-1' });
});

const makeUser = (over: Partial<User> = {}): User => ({
  id: 'user-1',
  telegramId: 100n,
  username: null,
  firstName: 'Ism',
  lastName: null,
  phone: null,
  languageCode: 'uz',
  role: 'DRIVER',
  isBlocked: false,
  lastSeenAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...over,
});

/** Railway ro'yxatidagi superadmin — huquqi bot orqali o'zgartirilmaydi. */
const envSuperAdmin = (over: Partial<User> = {}): User =>
  makeUser({ id: 'env-sa', telegramId: BigInt(ENV_SUPER_ADMIN_ID), role: 'SUPERADMIN', ...over });

/** Bazada SUPERADMIN, lekin env ro'yxatida yo'q — aktor sifatida ishlatiladi. */
const dbSuperAdmin = (over: Partial<User> = {}): User =>
  makeUser({ id: 'db-sa', telegramId: 999n, role: 'SUPERADMIN', ...over });

describe('grantAdminRole — kim huquq bera oladi (R1)', () => {
  test('ADMIN rolidagi foydalanuvchi huquq bera olmaydi', async () => {
    // Arrange
    const actor = makeUser({ id: 'adm', telegramId: 200n, role: 'ADMIN' });

    // Act
    const act = service.grantAdminRole({ actor, targetUserId: 'user-2', role: 'ADMIN' });

    // Assert — bazaga umuman bormaydi
    await expect(act).rejects.toBeInstanceOf(ForbiddenError);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  test('OPERATOR rolidagi foydalanuvchi huquqni olib tashlay olmaydi', async () => {
    // Arrange
    const actor = makeUser({ id: 'opr', telegramId: 300n, role: 'OPERATOR' });

    // Act
    const act = service.revokeAdminRole({ actor, targetUserId: 'user-2' });

    // Assert
    await expect(act).rejects.toBeInstanceOf(ForbiddenError);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  test('superadmin ADMIN huquqini bera oladi va bu audit jurnaliga yoziladi', async () => {
    // Arrange
    const target = makeUser({ id: 'user-2', telegramId: 555n, role: 'DRIVER' });
    prismaMock.user.findUnique.mockResolvedValue(target);
    prismaMock.user.update.mockResolvedValue({ ...target, role: 'ADMIN' });

    // Act
    const updated = await service.grantAdminRole({
      actor: envSuperAdmin(),
      targetUserId: 'user-2',
      role: 'ADMIN',
    });

    // Assert
    expect(updated.role).toBe('ADMIN');
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-2' },
      data: { role: 'ADMIN' },
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
  });
});

describe('grantAdminRole — qanday huquq berilishi mumkin (R2)', () => {
  test('UI orqali SUPERADMIN berishga urinish ish vaqtida rad etiladi', async () => {
    // Arrange — tip tekshiruvi chetlab o'tilgan holat (eski tugma, qo'lda yig'ilgan callback)
    const role = 'SUPERADMIN' as unknown as 'ADMIN';

    // Act
    const act = service.grantAdminRole({ actor: envSuperAdmin(), targetUserId: 'user-2', role });

    // Assert
    await expect(act).rejects.toBeInstanceOf(ForbiddenError);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  test('GRANTABLE_ROLES faqat ADMIN va OPERATOR dan iborat', () => {
    expect([...service.GRANTABLE_ROLES]).toEqual(['ADMIN', 'OPERATOR']);
  });
});

describe('grantAdminRole — kimga berilmaydi', () => {
  test('botga kirmagan (telegramId=null) foydalanuvchiga berilmaydi (R5)', async () => {
    // Arrange
    prismaMock.user.findUnique.mockResolvedValue(makeUser({ id: 'user-2', telegramId: null }));

    // Act
    const act = service.grantAdminRole({
      actor: envSuperAdmin(),
      targetUserId: 'user-2',
      role: 'ADMIN',
    });

    // Assert
    await expect(act).rejects.toBeInstanceOf(ValidationError);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  test('reklama beruvchiga admin huquqi berilmaydi', async () => {
    // Arrange
    prismaMock.user.findUnique.mockResolvedValue(
      makeUser({ id: 'user-2', telegramId: 555n, role: 'ADVERTISER' }),
    );

    // Act
    const act = service.grantAdminRole({
      actor: envSuperAdmin(),
      targetUserId: 'user-2',
      role: 'ADMIN',
    });

    // Assert
    await expect(act).rejects.toBeInstanceOf(ForbiddenError);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  test('allaqachon shu rolda bo\'lsa ConflictError qaytadi', async () => {
    // Arrange
    prismaMock.user.findUnique.mockResolvedValue(
      makeUser({ id: 'user-2', telegramId: 555n, role: 'ADMIN' }),
    );

    // Act
    const act = service.grantAdminRole({
      actor: envSuperAdmin(),
      targetUserId: 'user-2',
      role: 'ADMIN',
    });

    // Assert
    await expect(act).rejects.toBeInstanceOf(ConflictError);
  });

  test('env superadminni pasaytirishga urinish rad etiladi (R3)', async () => {
    // Arrange — nishon Railway ro'yxatida
    prismaMock.user.findUnique.mockResolvedValue(envSuperAdmin({ id: 'user-2' }));

    // Act
    const act = service.grantAdminRole({
      actor: dbSuperAdmin(),
      targetUserId: 'user-2',
      role: 'OPERATOR',
    });

    // Assert
    await expect(act).rejects.toBeInstanceOf(ForbiddenError);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});

describe('revokeAdminRole', () => {
  test('env ro\'yxatidagi superadmindan huquq olib tashlanmaydi (R3)', async () => {
    // Arrange
    prismaMock.user.findUnique.mockResolvedValue(envSuperAdmin({ id: 'user-2' }));

    // Act
    const act = service.revokeAdminRole({ actor: dbSuperAdmin(), targetUserId: 'user-2' });

    // Assert — xabar Railway sozlamalariga yo'naltiradi
    await expect(act).rejects.toThrowError(/Railway/);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  test('foydalanuvchi o\'zidan huquqni ola olmaydi (R4)', async () => {
    // Arrange
    const actor = dbSuperAdmin();
    prismaMock.user.findUnique.mockResolvedValue(actor);

    // Act
    const act = service.revokeAdminRole({ actor, targetUserId: actor.id });

    // Assert
    await expect(act).rejects.toThrowError(/zingizdan/);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  test('admin huquqi olinganda foydalanuvchi DRIVER ga qaytadi', async () => {
    // Arrange
    const target = makeUser({ id: 'user-2', telegramId: 555n, role: 'ADMIN' });
    prismaMock.user.findUnique.mockResolvedValue(target);
    prismaMock.user.update.mockResolvedValue({ ...target, role: 'DRIVER' });

    // Act
    const updated = await service.revokeAdminRole({ actor: envSuperAdmin(), targetUserId: 'user-2' });

    // Assert
    expect(updated.role).toBe('DRIVER');
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-2' },
      data: { role: 'DRIVER' },
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
  });

  test('admin bo\'lmagan foydalanuvchi uchun NotFoundError', async () => {
    // Arrange
    prismaMock.user.findUnique.mockResolvedValue(makeUser({ id: 'user-2', role: 'DRIVER' }));

    // Act
    const act = service.revokeAdminRole({ actor: envSuperAdmin(), targetUserId: 'user-2' });

    // Assert
    await expect(act).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('findGrantTarget', () => {
  test('raqamli Telegram ID bo\'yicha topadi', async () => {
    // Arrange
    const found = makeUser({ id: 'user-2', telegramId: 5606183694n });
    prismaMock.user.findUnique.mockResolvedValue(found);

    // Act
    const result = await service.findGrantTarget(' 5606183694 ');

    // Assert
    expect(result?.id).toBe('user-2');
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { telegramId: 5606183694n },
    });
  });

  test('@username bo\'yicha topadi', async () => {
    // Arrange
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.findFirst.mockResolvedValue(makeUser({ id: 'user-3', username: 'Admin_User' }));

    // Act
    const result = await service.findGrantTarget('@Admin_User');

    // Assert — qidiruv kichik harfda va faqat botga kirganlar orasidan
    expect(result?.id).toBe('user-3');
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
      where: {
        username: { equals: 'admin_user', mode: 'insensitive' },
        telegramId: { not: null },
      },
    });
  });

  test('t.me havolasi bo\'yicha topadi', async () => {
    // Arrange
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.findFirst.mockResolvedValue(makeUser({ id: 'user-4', username: 'admin_user' }));

    // Act
    const result = await service.findGrantTarget('https://t.me/admin_user');

    // Assert
    expect(result?.id).toBe('user-4');
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
      where: {
        username: { equals: 'admin_user', mode: 'insensitive' },
        telegramId: { not: null },
      },
    });
  });

  test('telefon raqam bo\'yicha topadi', async () => {
    // Arrange
    prismaMock.user.findFirst.mockResolvedValue(makeUser({ id: 'user-5', phone: '+998901234567' }));

    // Act — probel va qavslar tozalanadi, @username sifatida o'qilmaydi
    const result = await service.findGrantTarget('+998 90 123 45 67');

    // Assert
    expect(result?.id).toBe('user-5');
    expect(prismaMock.user.findFirst).toHaveBeenLastCalledWith({
      where: { phone: '+998901234567', telegramId: { not: null } },
    });
  });

  test('hech qayerdan topilmasa null qaytadi — yangi yozuv YARATILMAYDI', async () => {
    // Arrange
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.findFirst.mockResolvedValue(null);

    // Act
    const result = await service.findGrantTarget('@notexists_user');

    // Assert
    expect(result).toBeNull();
  });

  test('bo\'sh matn uchun bazaga murojaat qilinmaydi', async () => {
    // Act
    const result = await service.findGrantTarget('   ');

    // Assert
    expect(result).toBeNull();
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });
});

describe('listAdmins va countAdmins', () => {
  test('ro\'yxat env superadminni alohida belgilaydi', async () => {
    // Arrange
    const rows = [envSuperAdmin(), makeUser({ id: 'a1', telegramId: 777n, role: 'ADMIN' })];
    prismaMock.user.findMany.mockResolvedValue(rows);
    prismaMock.user.count.mockResolvedValue(rows.length);

    // Act
    const page = await service.listAdmins({ page: 1 });

    // Assert
    expect(page.totalItems).toBe(2);
    expect(page.items[0]?.isEnvSuperAdmin).toBe(true);
    expect(page.items[1]?.isEnvSuperAdmin).toBe(false);
  });

  test('sanoq har bir rol bo\'yicha alohida qaytadi', async () => {
    // Arrange
    prismaMock.user.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3);

    // Act
    const counts = await service.countAdmins();

    // Assert
    expect(counts).toEqual({ superadmins: 1, admins: 2, operators: 3 });
  });
});

describe('findAdminUser — kartochka faqat xodimlar uchun', () => {
  test('xodimni env belgisi bilan qaytaradi va so\'rovni rol bo\'yicha cheklaydi', async () => {
    // Arrange
    prismaMock.user.findFirst.mockResolvedValue(envSuperAdmin({ id: 'user-2' }));

    // Act
    const admin = await service.findAdminUser('user-2');

    // Assert — xom `findUnique` emas: rol filtri so'rovning o'zida
    expect(admin?.isEnvSuperAdmin).toBe(true);
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'user-2', role: { in: ['SUPERADMIN', 'ADMIN', 'OPERATOR'] } },
    });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  test('xodim bo\'lmagan foydalanuvchi uchun null qaytadi (eskirgan tugma)', async () => {
    // Arrange — huquqi allaqachon olib tashlangan odam: baza rol filtriga tushmaydi
    prismaMock.user.findFirst.mockResolvedValue(null);

    // Act
    const admin = await service.findAdminUser('user-2');

    // Assert — kartochka ochilmaydi, demak xom "DRIVER" yorlig'i ham ko'rinmaydi
    expect(admin).toBeNull();
  });
});

describe('audit jurnali (R6)', () => {
  test('BigInt telegramId audit metasiga matn sifatida tushadi', async () => {
    // Arrange — JSON BigInt ni seriyalay olmaydi, yozuv yo'qolmasligi kerak
    const target = makeUser({ id: 'user-2', telegramId: 7654321098n, role: 'DRIVER' });
    prismaMock.user.findUnique.mockResolvedValue(target);
    prismaMock.user.update.mockResolvedValue({ ...target, role: 'OPERATOR' });

    // Act
    await service.grantAdminRole({
      actor: envSuperAdmin(),
      targetUserId: 'user-2',
      role: 'OPERATOR',
    });

    // Assert
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'env-sa',
        action: 'admin.grant',
        entity: 'User',
        entityId: 'user-2',
        meta: { role: 'OPERATOR', telegramId: '7654321098' },
      },
    });
  });

  test('huquq olinganda oldingi rol ham yoziladi', async () => {
    // Arrange
    const target = makeUser({ id: 'user-2', telegramId: 555n, role: 'ADMIN' });
    prismaMock.user.findUnique.mockResolvedValue(target);
    prismaMock.user.update.mockResolvedValue({ ...target, role: 'DRIVER' });

    // Act
    await service.revokeAdminRole({ actor: envSuperAdmin(), targetUserId: 'user-2' });

    // Assert
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'env-sa',
        action: 'admin.revoke',
        entity: 'User',
        entityId: 'user-2',
        meta: { previousRole: 'ADMIN', telegramId: '555' },
      },
    });
  });
});

describe('isSuperAdminActor', () => {
  test('env ro\'yxatidagi ID superadmin hisoblanadi', () => {
    expect(service.isSuperAdminActor(envSuperAdmin({ role: 'DRIVER' }))).toBe(true);
  });

  test('bazadagi SUPERADMIN roli ham yetarli', () => {
    expect(service.isSuperAdminActor(dbSuperAdmin())).toBe(true);
  });

  test('ADMIN va null superadmin emas', () => {
    expect(service.isSuperAdminActor(makeUser({ role: 'ADMIN' }))).toBe(false);
    expect(service.isSuperAdminActor(null)).toBe(false);
  });
});
