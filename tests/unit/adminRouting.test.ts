import { beforeAll, describe, expect, test, vi } from 'vitest';

/**
 * Admin panelining MARSHRUTLASH filtri (`isAdminUpdate`).
 *
 * Nima uchun alohida test: filtr xato ishlasa hech qanday xato loglanmaydi —
 * yangilanish shunchaki panelga kirmaydi va suhbat "javobsiz" qotadi. Bunday
 * nosozlikni faqat shu darajadagi test ushlaydi.
 */

vi.stubEnv('BOT_TOKEN', '111111111:TEST_TOKEN_FOR_UNIT_TESTS_abcdefgh');
vi.stubEnv('BOT_USERNAME', 'unit_test_bot');
vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/test');
vi.stubEnv('SUPER_ADMIN_IDS', '5606183694');
vi.stubEnv('BOT_MODE', 'polling');

let routing: typeof import('../../src/bot/handlers/admin/routing.js');
let callbacks: typeof import('../../src/bot/callbacks.js');

beforeAll(async () => {
  routing = await import('../../src/bot/handlers/admin/routing.js');
  callbacks = await import('../../src/bot/callbacks.js');
});

/**
 * conversations plagini faol suhbatlarni sessiyaga "listify" qilingan MASSIV
 * ko'rinishida yozadi — quyidagi shakl plaginning haqiqiy chiqishidan olingan.
 * Shuning uchun `ctx.session.conversation` dan suhbat NOMINI o'qib bo'lmaydi;
 * yagona to'g'ri manba — plaginning `ctx.conversation.active()` API si.
 */
const LISTIFIED_SESSION_STATE = Object.freeze([
  ['', 1, 2],
  'admin_admin_grant',
  [3],
  ['', 4, 5],
  'last',
  1_700_000_000_000,
]);

type CtxOptions = {
  readonly activeConversations?: Readonly<Record<string, number>>;
  readonly text?: string;
  readonly callbackData?: string;
  readonly isAdmin?: boolean;
  readonly brokenSession?: boolean;
};

const makeCtx = (opts: CtxOptions) => {
  const active = opts.activeConversations ?? {};
  const conversation = {
    active: async (): Promise<Record<string, number>> => {
      if (opts.brokenSession === true) throw new Error('sessiya kaliti yo\'q');
      return active;
    },
  };

  return {
    session: { conversation: Object.keys(active).length === 0 ? undefined : LISTIFIED_SESSION_STATE },
    conversation,
    message: opts.text === undefined ? undefined : { text: opts.text },
    callbackQuery: opts.callbackData === undefined ? undefined : { data: opts.callbackData },
    auth: { user: null, role: opts.isAdmin === true ? 'ADMIN' : 'DRIVER', isAdmin: opts.isAdmin === true },
  } as unknown as import('../../src/bot/bot.js').BotContext;
};

const ACTIVE_GRANT = Object.freeze({ admin_admin_grant: 1 });

describe('isAdminUpdate — faol suhbat', () => {
  test('faol admin suhbati matnli xabarni panelga yo\'naltiradi', async () => {
    // Arrange: admin "Admin qo'shish" suhbatida turib @username yozmoqda.
    const ctx = makeCtx({ activeConversations: ACTIVE_GRANT, text: '@yangi_admin', isAdmin: true });

    // Act
    const routed = await routing.isAdminUpdate(ctx);

    // Assert: aks holda suhbat kiritilgan matnni umuman ko'rmaydi.
    expect(routed).toBe(true);
  });

  test('huquqi olib tashlangan xodimning tugallanmagan suhbati uni panelda ushlab qolmaydi', async () => {
    // Arrange: suhbat sessiyada qolgan, lekin odam endi admin emas.
    const ctx = makeCtx({ activeConversations: ACTIVE_GRANT, text: 'Salom', isAdmin: false });

    // Act
    const routed = await routing.isAdminUpdate(ctx);

    // Assert: panelga kirsa `requireAdmin()` har bir xabarga rad javobini berardi.
    expect(routed).toBe(false);
  });

  test('sessiya mavjud bo\'lmaganda yiqilmaydi', async () => {
    // Arrange
    const ctx = makeCtx({ brokenSession: true, text: 'kanal posti' });

    // Act & Assert
    await expect(routing.isAdminUpdate(ctx)).resolves.toBe(false);
  });
});

describe('isAdminUpdate — tugma va buyruqlar', () => {
  test('admin callbacki roldan qat\'i nazar panelga kiradi', async () => {
    // Arrange: ruxsatsiz urinish `requireAdmin()` da aniq rad javobini olishi kerak.
    const ctx = makeCtx({ callbackData: callbacks.buildCallback(callbacks.CB.adminList, '1'), isAdmin: false });

    // Act & Assert
    await expect(routing.isAdminUpdate(ctx)).resolves.toBe(true);
  });

  test('umumiy tugma faqat admin uchun panelga kiradi', async () => {
    // Arrange
    const asDriver = makeCtx({ callbackData: callbacks.buildCallback(callbacks.CB.menu), isAdmin: false });
    const asAdmin = makeCtx({ callbackData: callbacks.buildCallback(callbacks.CB.menu), isAdmin: true });

    // Act & Assert
    await expect(routing.isAdminUpdate(asDriver)).resolves.toBe(false);
    await expect(routing.isAdminUpdate(asAdmin)).resolves.toBe(true);
  });

  test('/admin buyrug\'i panelga kiradi, oddiy matn esa kirmaydi', async () => {
    // Arrange & Act & Assert
    await expect(routing.isAdminUpdate(makeCtx({ text: '/admin' }))).resolves.toBe(true);
    await expect(routing.isAdminUpdate(makeCtx({ text: '/panel@ads_bot' }))).resolves.toBe(true);
    await expect(routing.isAdminUpdate(makeCtx({ text: 'shunchaki matn' }))).resolves.toBe(false);
  });
});
