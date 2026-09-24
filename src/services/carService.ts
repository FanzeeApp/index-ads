import { Prisma, CarStatus, PhotoOrigin, PlacementStatus } from '@prisma/client';
import type { Car, Driver, Photo, PhotoSide, User } from '@prisma/client';
import { prisma } from '../db/client.js';
import { ConflictError, NotFoundError, ValidationError } from '../core/errors.js';
import { t } from '../i18n/index.js';
import { formatPlate, isValidPlate, normalizePlate } from '../utils/plate.js';
import { buildPage, toSkip, type Page } from '../utils/pagination.js';
import { PAGE_SIZE } from '../config/constants.js';
import { recordAudit } from './auditService.js';

export type CarWithDriver = Car & { driver: (Driver & { user: User | null }) | null };

export type CreateCarInput = {
  readonly plateNumber: string;
  readonly model?: string;
  readonly color?: string;
  readonly notes?: string;
};

export type ListCarsOptions = {
  readonly page?: number;
  readonly status?: CarStatus;
  readonly query?: string;
};

/** Ro'yxat va kartochkalarda haydovchi bilan birga chiqadi — N+1 so'rovlarni oldini oladi. */
const CAR_INCLUDE = { driver: { include: { user: true } } } satisfies Prisma.CarInclude;

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

const buildCarWhere = (opts: ListCarsOptions): Prisma.CarWhereInput => {
  const search = opts.query?.trim();
  if (!search) return opts.status ? { status: opts.status } : {};

  const plate = normalizePlate(search);
  return {
    ...(opts.status ? { status: opts.status } : {}),
    OR: [
      { plateNumber: { contains: plate } },
      { model: { contains: search, mode: 'insensitive' } },
      { driver: { fullName: { contains: search, mode: 'insensitive' } } },
      { driver: { user: { username: { contains: search, mode: 'insensitive' } } } },
    ],
  };
};

/** Yangi mashina. Raqam me'yorlashtiriladi va O'zbekiston formatiga tekshiriladi. */
export const createCar = async (input: CreateCarInput): Promise<Car> => {
  const plateNumber = normalizePlate(input.plateNumber);
  if (!isValidPlate(plateNumber)) {
    throw new ValidationError(t.admin.carPlateInvalid, { plateNumber });
  }

  try {
    const car = await prisma.car.create({
      data: {
        plateNumber,
        model: input.model?.trim() || null,
        color: input.color?.trim() || null,
        notes: input.notes?.trim() || null,
      },
    });
    await recordAudit({ action: 'car.create', entity: 'Car', entityId: car.id, meta: { plateNumber } });
    return car;
  } catch (error: unknown) {
    // Unikal indeks — bir vaqtda ikki admin bir raqamni kiritgan holat ham shu yerga tushadi.
    if (isUniqueViolation(error)) {
      throw new ConflictError(t.admin.carPlateExists(formatPlate(plateNumber)), { plateNumber });
    }
    throw error;
  }
};

export const findCarByPlate = async (plate: string): Promise<Car | null> =>
  prisma.car.findUnique({ where: { plateNumber: normalizePlate(plate) } });

export const getCarById = async (id: string): Promise<Car> => {
  const car = await prisma.car.findUnique({ where: { id } });
  if (!car) throw new NotFoundError(t.common.notFound, { carId: id });
  return car;
};

export const listCars = async (opts: ListCarsOptions): Promise<Page<CarWithDriver>> => {
  const page = opts.page ?? 1;
  const where = buildCarWhere(opts);

  const [items, total] = await prisma.$transaction([
    prisma.car.findMany({
      where,
      include: CAR_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: toSkip(page),
      take: PAGE_SIZE,
    }),
    prisma.car.count({ where }),
  ]);

  return buildPage<CarWithDriver>(items, total, page);
};

/** Mashinaga haydovchi biriktiradi. Band mashinani qayta biriktirish taqiqlanadi. */
export const assignDriver = async (carId: string, driverId: string): Promise<Car> => {
  const car = await getCarById(carId);
  if (car.driverId === driverId) return car;
  if (car.driverId) {
    throw new ConflictError(t.referral.carTaken(formatPlate(car.plateNumber)), { carId, driverId });
  }

  const driver = await prisma.driver.findUnique({ where: { id: driverId } });
  if (!driver) throw new NotFoundError(t.admin.driverNotFound, { driverId });

  const updated = await prisma.car.update({ where: { id: carId }, data: { driverId } });
  await recordAudit({ action: 'car.assignDriver', entity: 'Car', entityId: carId, meta: { driverId } });
  return updated;
};

export const unassignDriver = async (carId: string): Promise<Car> => {
  const car = await getCarById(carId);
  if (!car.driverId) return car;

  const updated = await prisma.car.update({ where: { id: carId }, data: { driverId: null } });
  await recordAudit({
    action: 'car.unassignDriver',
    entity: 'Car',
    entityId: carId,
    meta: { driverId: car.driverId },
  });
  return updated;
};

export const setCarStatus = async (carId: string, status: CarStatus): Promise<Car> => {
  const car = await getCarById(carId);
  if (car.status === status) return car;

  const updated = await prisma.car.update({ where: { id: carId }, data: { status } });
  await recordAudit({
    action: 'car.setStatus',
    entity: 'Car',
    entityId: carId,
    meta: { from: car.status, to: status },
  });
  return updated;
};

/**
 * Mashina avtoparkdan chiqariladi. Faol joylashtirishlar to'xtatiladi va nextCheckAt
 * tozalanadi — aks holda rejalashtiruvchi arxivlangan mashinaga tekshiruv yuborishda davom etadi.
 */
export const archiveCar = async (carId: string): Promise<Car> => {
  const car = await getCarById(carId);

  const [updated] = await prisma.$transaction([
    prisma.car.update({ where: { id: carId }, data: { status: CarStatus.ARCHIVED, driverId: null } }),
    prisma.placement.updateMany({
      where: { carId, status: PlacementStatus.ACTIVE },
      data: { status: PlacementStatus.SUSPENDED, nextCheckAt: null },
    }),
  ]);

  await recordAudit({
    action: 'car.archive',
    entity: 'Car',
    entityId: carId,
    meta: { plateNumber: car.plateNumber },
  });
  return updated;
};

/** Admin yuklagan etalon rasm — keyin haydovchi rasmlari shunga solishtiriladi. */
export const addReferencePhoto = async (
  carId: string,
  side: PhotoSide,
  fileId: string,
  fileUniqueId?: string,
): Promise<Photo> => {
  await getCarById(carId);

  const photo = await prisma.photo.create({
    data: {
      carId,
      side,
      origin: PhotoOrigin.ADMIN,
      telegramFileId: fileId,
      fileUniqueId: fileUniqueId ?? null,
    },
  });
  await recordAudit({ action: 'car.addReferencePhoto', entity: 'Photo', entityId: photo.id, meta: { carId, side } });
  return photo;
};

/** Statistika uchun: arxivlanganlar umumiy songa kirmaydi. */
export const countCars = async (): Promise<{ total: number; active: number }> => {
  const [total, active] = await prisma.$transaction([
    prisma.car.count({ where: { status: { not: CarStatus.ARCHIVED } } }),
    prisma.car.count({ where: { status: CarStatus.ACTIVE } }),
  ]);
  return { total, active };
};
