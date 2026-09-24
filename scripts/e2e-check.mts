/**
 * To'liq oqim sinovi (mahalliy): mashina → kampaniya → tekshiruv → Mini App
 * yuklashi. Haqiqiy HMAC imzo yasaladi, shuning uchun bu server xavfsizlik
 * zanjirining ham sinovidir. Faqat ishlab chiqishda ishlatiladi.
 */
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { prisma } from '../src/db/client.js';
import { env } from '../src/config/env.js';

// Bu skript bazaga sinov yozuvlarini qo'shadi — ishlab chiqarishda ishlamaydi.
if (env.NODE_ENV === 'production') {
  throw new Error("e2e-check faqat ishlab chiqish muhitida ishlaydi (NODE_ENV=production topildi)");
}

const BASE_URL = `http://${env.HOST === '0.0.0.0' ? '127.0.0.1' : env.HOST}:${env.PORT}`;
const TELEGRAM_ID = 555000111;
const PLATE = '01Z999ZZ';

const buildInitData = (telegramId: number): string => {
  const fields: Record<string, string> = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: telegramId, first_name: 'Test', username: 'testdriver' }),
  };
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(env.BOT_TOKEN).digest();
  const hash = createHmac('sha256', secret).update(dataCheckString).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
};

const seed = async () => {
  const user = await prisma.user.upsert({
    where: { telegramId: BigInt(TELEGRAM_ID) },
    update: {},
    create: { telegramId: BigInt(TELEGRAM_ID), firstName: 'Test', username: 'testdriver', role: 'DRIVER' },
  });
  const driver = await prisma.driver.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, fullName: 'Test Haydovchi' },
  });
  const car = await prisma.car.upsert({
    where: { plateNumber: PLATE },
    update: { driverId: driver.id, status: 'ACTIVE' },
    create: { plateNumber: PLATE, model: 'Cobalt', driverId: driver.id, status: 'ACTIVE' },
  });
  const advertiser = await prisma.advertiser.upsert({
    where: { inviteCode: 'E2ETESTCODE' },
    update: {},
    create: { companyName: 'Test Reklama MChJ', inviteCode: 'E2ETESTCODE' },
  });
  const campaign = await prisma.campaign.create({
    data: { advertiserId: advertiser.id, title: 'E2E kampaniya', status: 'ACTIVE' },
  });
  const placement = await prisma.placement.create({
    data: { campaignId: campaign.id, carId: car.id, status: 'ACTIVE', nextCheckAt: new Date() },
  });
  const check = await prisma.checkRequest.create({
    data: {
      placementId: placement.id,
      carId: car.id,
      campaignId: campaign.id,
      status: 'PENDING',
      dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
  const session = await prisma.uploadSession.create({
    data: {
      token: 'e2etoken' + '0'.repeat(24),
      checkRequestId: check.id,
      telegramId: BigInt(TELEGRAM_ID),
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    },
  });
  return { check, session, campaign, placement };
};

const uploadSide = async (token: string, side: string, initData: string, jpeg: Buffer) => {
  const form = new FormData();
  form.append('token', token);
  form.append('side', side);
  form.append('initData', initData);
  form.append('captureMode', 'live');
  form.append('clientTakenAt', new Date().toISOString());
  form.append('file', new Blob([jpeg], { type: 'image/jpeg' }), `${side.toLowerCase()}.jpg`);
  const response = await fetch(`${BASE_URL}/api/upload`, { method: 'POST', body: form });
  return { status: response.status, body: await response.json() };
};

const main = async () => {
  const jpeg = readFileSync(process.argv[2] ?? '/tmp/fake.jpg');
  const { check, session } = await seed();
  const initData = buildInitData(TELEGRAM_ID);

  console.log(`Tekshiruv: ${check.id}\nToken: ${session.token}\n`);

  for (const side of ['REAR', 'LEFT', 'RIGHT']) {
    const result = await uploadSide(session.token, side, initData, jpeg);
    console.log(`${side.padEnd(6)} → HTTP ${result.status} ${JSON.stringify(result.body)}`);
  }

  // Boshqa foydalanuvchi bir xil token bilan (IDOR sinovi)
  const foreign = await uploadSide(session.token, 'REAR', buildInitData(999888777), jpeg);
  console.log(`\nIDOR sinovi (begona telegramId) → HTTP ${foreign.status} ${JSON.stringify(foreign.body)}`);

  const final = await prisma.checkRequest.findUniqueOrThrow({
    where: { id: check.id },
    include: { photos: true },
  });
  console.log(`\nYakuniy holat: ${final.status}`);
  console.log(`Rasmlar: ${final.photos.length} ta`);
  for (const photo of final.photos) {
    console.log(`  ${photo.side.padEnd(6)} verdict=${photo.verdict} note=${photo.verdictNote ?? '—'}`);
  }
  await prisma.$disconnect();
};

await main();
