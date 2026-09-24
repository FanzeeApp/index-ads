/**
 * Demo ma'lumotlar. Ishga tushirish: `npm run seed`
 *
 * Idempotent: faqat `upsert` va "bor-yo'qligini tekshirib yaratish" ishlatiladi,
 * shuning uchun bir necha marta chaqirilsa ham dublikat paydo bo'lmaydi —
 * Railway da deploy dan keyin xavfsiz qayta ishga tushiraverish mumkin.
 *
 * Bu skript ishlab chiqarish ma'lumotlarini O'CHIRMAYDI va O'ZGARTIRMAYDI:
 * u faqat o'zi yaratadigan demo yozuvlarga tegadi.
 */

import type { Advertiser, Campaign, Car, User } from '@prisma/client';
import { env } from '../src/config/env.js';
import { childLogger } from '../src/core/logger.js';
import { prisma, connectDatabase, disconnectDatabase } from '../src/db/client.js';
import { addDays } from '../src/utils/time.js';

const log = childLogger('seed');

/** Demo yozuvlarni qayta topish uchun barqaror kalitlar. */
const DEMO_INVITE_CODE = 'DEMO2024';
const DEMO_CAMPAIGN_TITLE = 'Demo reklama kampaniyasi';

/** O'zbekiston davlat raqamlari: 01 — Toshkent sh., 10 — Toshkent vil., 30 — Samarqand. */
const DEMO_CARS = Object.freeze([
  { plateNumber: '01A123BC', model: 'Chevrolet Cobalt', color: 'Oq' },
  { plateNumber: '10B456CD', model: 'Chevrolet Nexia 3', color: 'Kumush' },
  { plateNumber: '30C789EF', model: 'Chevrolet Lacetti', color: 'Qora' },
]);

/** Birinchi SUPER_ADMIN_IDS — tizimning egasi. env tekshiruvi bo'shligiga yo'l qo'ymaydi. */
const superAdminTelegramId = (): bigint => BigInt(env.SUPER_ADMIN_IDS[0] as number);

const seedSuperAdmin = async (): Promise<User> => {
  const telegramId = superAdminTelegramId();

  // Mavjud foydalanuvchining ismi/username ini bosib yozmaymiz — faqat rolni kafolatlaymiz.
  return prisma.user.upsert({
    where: { telegramId },
    update: { role: 'SUPERADMIN', isBlocked: false },
    create: { telegramId, role: 'SUPERADMIN', firstName: 'Super admin', languageCode: 'uz' },
  });
};

const seedAdvertiser = async (): Promise<Advertiser> =>
  prisma.advertiser.upsert({
    where: { inviteCode: DEMO_INVITE_CODE },
    update: {},
    create: {
      companyName: 'Demo Reklama MChJ',
      contactName: 'Aziz Karimov',
      contactPhone: '+998901234567',
      inviteCode: DEMO_INVITE_CODE,
      notes: 'Namuna uchun yaratilgan yozuv.',
    },
  });

/** Campaign da takrorlanmas kalit yo'q — nom + reklama beruvchi juftligi bo'yicha qidiramiz. */
const seedCampaign = async (advertiserId: string): Promise<Campaign> => {
  const existing = await prisma.campaign.findFirst({
    where: { advertiserId, title: DEMO_CAMPAIGN_TITLE },
  });
  if (existing) return existing;

  return prisma.campaign.create({
    data: {
      advertiserId,
      title: DEMO_CAMPAIGN_TITLE,
      description: 'Taksi yon eshiklari va orqa oynasidagi brend yopishtirmasi.',
      status: 'ACTIVE',
      startsAt: new Date(),
      checkIntervalDays: env.CHECK_INTERVAL_DAYS,
    },
  });
};

const seedCars = async (): Promise<readonly Car[]> =>
  Promise.all(
    DEMO_CARS.map((car) =>
      prisma.car.upsert({
        where: { plateNumber: car.plateNumber },
        update: {},
        create: { ...car, status: 'ACTIVE', notes: 'Demo mashina.' },
      }),
    ),
  );

/**
 * Joylashtirishlar darhol tekshiruv yog'dirmasligi uchun `nextCheckAt` kelajakka
 * qo'yiladi: demo bazada ham rejalashtiruvchi odatdagidek, davriy ishlaydi.
 */
const seedPlacements = async (campaignId: string, cars: readonly Car[]): Promise<number> => {
  const nextCheckAt = addDays(new Date(), env.CHECK_INTERVAL_DAYS);

  const results = await Promise.all(
    cars.map((car) =>
      prisma.placement.upsert({
        where: { campaignId_carId: { campaignId, carId: car.id } },
        update: {},
        create: { campaignId, carId: car.id, status: 'ACTIVE', nextCheckAt },
      }),
    ),
  );

  return results.length;
};

const main = async (): Promise<void> => {
  await connectDatabase();

  const admin = await seedSuperAdmin();
  const advertiser = await seedAdvertiser();
  const campaign = await seedCampaign(advertiser.id);
  const cars = await seedCars();
  const placements = await seedPlacements(campaign.id, cars);

  log.info(
    {
      adminTelegramId: admin.telegramId?.toString(),
      advertiser: advertiser.companyName,
      inviteLink: `https://t.me/${env.BOT_USERNAME}?start=adv_${DEMO_INVITE_CODE}`,
      campaign: campaign.title,
      cars: cars.map((car) => car.plateNumber),
      placements,
    },
    'Demo ma\'lumotlar tayyor',
  );

  log.info(
    "Keyingi qadam: botda /start bosing, «Mashinalar» bo'limidan demo mashinaga " +
      'haydovchi biriktiring yoki referal havola yarating — shundan keyin ' +
      'rejalashtiruvchi tekshiruv yubora boshlaydi.',
  );
};

main()
  .catch((error: unknown) => {
    log.error({ err: error instanceof Error ? error.message : String(error) }, 'Seed bajarilmadi');
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
