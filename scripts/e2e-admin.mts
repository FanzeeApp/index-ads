/**
 * Admin boshqaruvining haqiqiy bazadagi sinovi (faqat ishlab chiqish).
 *
 * Testlar prisma ni mock qiladi — bu skript esa HAQIQIY PostgreSQL bilan
 * ishlaydi va xavfsizlik qoidalari (R1..R6) amalda bajarilishini isbotlaydi.
 */
import { Role } from '@prisma/client';
import { env } from '../src/config/env.js';
import { prisma } from '../src/db/client.js';
import {
  findGrantTarget,
  grantAdminRole,
  listAdmins,
  revokeAdminRole,
} from '../src/services/adminService.js';

if (env.NODE_ENV === 'production') {
  throw new Error('e2e-admin faqat ishlab chiqish muhitida ishlaydi');
}

const SUPER_ID = env.SUPER_ADMIN_IDS[0] ?? 5606183694;
const STAFF_ID = 700000001;
const OUTSIDER_ID = 700000002;
const ADVERTISER_ID = 700000003;

const upsertUser = (telegramId: number, username: string, role: Role) =>
  prisma.user.upsert({
    where: { telegramId: BigInt(telegramId) },
    update: { role, username },
    create: { telegramId: BigInt(telegramId), username, firstName: username, role },
  });

/** Amalni bajaradi va natijani bitta satrda ko'rsatadi. */
const attempt = async (label: string, expect: 'OK' | 'RAD', run: () => Promise<unknown>) => {
  try {
    await run();
    const mark = expect === 'OK' ? '✅' : '❌ KUTILMAGAN — RAD ETILISHI KERAK EDI';
    console.log(`${mark} ${label}`);
    return expect === 'OK';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const mark = expect === 'RAD' ? '✅' : '❌ KUTILMAGAN XATO';
    console.log(`${mark} ${label}\n      → ${message}`);
    return expect === 'RAD';
  }
};

const main = async () => {
  const superAdmin = await upsertUser(SUPER_ID, 'boss', Role.SUPERADMIN);
  const staff = await upsertUser(STAFF_ID, 'xodim', Role.DRIVER);
  const outsider = await upsertUser(OUTSIDER_ID, 'begona', Role.DRIVER);
  const advertiser = await upsertUser(ADVERTISER_ID, 'reklamachi', Role.ADVERTISER);
  // Botga kirmagan odam — telegramId yo'q
  const ghost = await prisma.user.create({ data: { username: 'arvoh', role: Role.DRIVER } });

  const results: boolean[] = [];
  console.log('── Qidiruv ──');
  for (const raw of ['@xodim', 'xodim', 'https://t.me/xodim', String(STAFF_ID)]) {
    const found = await findGrantTarget(raw);
    const ok = found?.id === staff.id;
    results.push(ok);
    console.log(`${ok ? '✅' : '❌'} findGrantTarget(${JSON.stringify(raw)})`);
  }

  console.log('\n── R1: faqat SUPERADMIN boshqaradi ──');
  results.push(
    await attempt('SUPERADMIN xodimga ADMIN beradi', 'OK', () =>
      grantAdminRole({ actor: superAdmin, targetUserId: staff.id, role: 'ADMIN' }),
    ),
  );
  const nowAdmin = await prisma.user.findUniqueOrThrow({ where: { id: staff.id } });
  results.push(
    await attempt('ADMIN boshqasiga huquq berishga urinadi', 'RAD', () =>
      grantAdminRole({ actor: nowAdmin, targetUserId: outsider.id, role: 'ADMIN' }),
    ),
  );
  results.push(
    await attempt('ADMIN boshqasidan huquq olishga urinadi', 'RAD', () =>
      revokeAdminRole({ actor: nowAdmin, targetUserId: staff.id }),
    ),
  );

  console.log('\n── R2: SUPERADMIN UI orqali berilmaydi ──');
  results.push(
    await attempt('SUPERADMIN roli berishga urinish', 'RAD', () =>
      // Qo'lda yig'ilgan callback ni taqlid qilamiz — tip tekshiruvini chetlab o'tamiz.
      grantAdminRole({ actor: superAdmin, targetUserId: outsider.id, role: 'SUPERADMIN' as never }),
    ),
  );

  console.log('\n── R3/R4: qulflangan va o\'zi ──');
  results.push(
    await attempt('env superadmindan huquq olishga urinish', 'RAD', () =>
      revokeAdminRole({ actor: superAdmin, targetUserId: superAdmin.id }),
    ),
  );

  console.log('\n── R5: botga kirmagan / noto\'g\'ri target ──');
  results.push(
    await attempt('telegramId yo\'q foydalanuvchiga grant', 'RAD', () =>
      grantAdminRole({ actor: superAdmin, targetUserId: ghost.id, role: 'ADMIN' }),
    ),
  );
  results.push(
    await attempt('reklama beruvchini admin qilish', 'RAD', () =>
      grantAdminRole({ actor: superAdmin, targetUserId: advertiser.id, role: 'ADMIN' }),
    ),
  );

  console.log('\n── Huquqni olib tashlash ──');
  results.push(
    await attempt('SUPERADMIN xodimdan huquqni oladi', 'OK', () =>
      revokeAdminRole({ actor: superAdmin, targetUserId: staff.id }),
    ),
  );
  const afterRevoke = await prisma.user.findUniqueOrThrow({ where: { id: staff.id } });
  const demoted = afterRevoke.role === Role.DRIVER;
  results.push(demoted);
  console.log(`${demoted ? '✅' : '❌'} Rol DRIVER ga qaytdi (hozir: ${afterRevoke.role})`);

  console.log('\n── Ro\'yxat va audit ──');
  const page = await listAdmins({ page: 1 });
  console.log(`✅ listAdmins: ${page.totalItems} ta xodim`);
  for (const admin of page.items) {
    console.log(`   ${admin.role.padEnd(10)} @${admin.username ?? '—'}  ${admin.isEnvSuperAdmin ? '🔒 env' : ''}`);
  }
  const audits = await prisma.auditLog.findMany({
    where: { action: { in: ['admin.grant', 'admin.revoke'] } },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  console.log(`✅ Audit yozuvlari: ${audits.length} ta`);
  for (const entry of audits) console.log(`   ${entry.action} → ${JSON.stringify(entry.meta)}`);

  const passed = results.filter(Boolean).length;
  console.log(`\n═══ NATIJA: ${passed}/${results.length} ═══`);

  await prisma.user.deleteMany({ where: { telegramId: { in: [BigInt(STAFF_ID), BigInt(OUTSIDER_ID), BigInt(ADVERTISER_ID)] } } });
  await prisma.user.delete({ where: { id: ghost.id } }).catch(() => undefined);
  await prisma.$disconnect();
  if (passed !== results.length) process.exit(1);
};

await main();
