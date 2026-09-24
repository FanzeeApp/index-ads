import { CarStatus } from '@prisma/client';
import type { Composer, InlineKeyboard } from 'grammy';

import { NotFoundError } from '../../../core/errors.js';
import { t } from '../../../i18n/index.js';
import { recordAudit } from '../../../services/auditService.js';
import {
  archiveCar,
  listCars,
  setCarStatus,
  unassignDriver,
  type CarWithDriver,
} from '../../../services/carService.js';
import { createCarReferral } from '../../../services/referralService.js';
import { escapeHtml } from '../../../utils/html.js';
import { formatPlate } from '../../../utils/plate.js';
import { formatDate } from '../../../utils/time.js';
import type { BotContext } from '../../bot.js';
import { buildCallback, callbackPattern, CB } from '../../callbacks.js';
import {
  carArchiveConfirmKeyboard,
  carCardKeyboard,
  carStatusKeyboard,
  LIST_FILTER_ALL,
} from '../../keyboards/admin.js';
import {
  backKeyboard,
  listKeyboard,
  menuButton,
  type InlineRow,
  type ListRow,
} from '../../keyboards/common.js';
import { answerSafe, safeHandler } from '../guard.js';
import { loadCarDetail } from './adminQueries.js';
import { carStatusLabel, displayName, safePhone, safePlate, safeText } from './format.js';
import { askText } from './prompts.js';
import {
  ADMIN_CB,
  argAt,
  CONVERSATION,
  draw,
  enterConversation,
  FIRST_PAGE,
  pageArg,
  readDraftString,
  sendPanel,
  setConversationDraft,
  setDraft,
  toListRows,
  withEmptyNotice,
  type AdminConversation,
  type DrawMode,
} from './shared.js';

/** Qidiruv so'zi sessiyada saqlanadi — sahifalash tugmalari uni yo'qotmasligi uchun. */
const CAR_QUERY_KEY = 'carQuery';

/** `car.ar:<carId>:yes` — arxivlashni tasdiqlash bo'lagi. */
const ARCHIVE_CONFIRM = 'yes';

/** Ro'yxat filtrida ko'rsatiladigan holatlar (arxiv alohida qidiriladi). */
const CAR_FILTERS: readonly CarStatus[] = Object.freeze([
  CarStatus.ACTIVE,
  CarStatus.IDLE,
  CarStatus.MAINTENANCE,
]);

type CarFilter = CarStatus | typeof LIST_FILTER_ALL;

const isCarStatus = (value: string): value is CarStatus =>
  Object.values(CarStatus).includes(value as CarStatus);

const readFilter = (ctx: BotContext): CarFilter => {
  const raw = argAt(ctx, 0);
  return isCarStatus(raw) ? raw : LIST_FILTER_ALL;
};

const driverShort = (car: CarWithDriver): string => {
  if (car.driver === null) return t.admin.carNoDriver;
  return displayName({
    fullName: car.driver.fullName,
    firstName: car.driver.user?.firstName,
    lastName: car.driver.user?.lastName,
    username: car.driver.user?.username,
  });
};

const carRow = (car: CarWithDriver): ListRow => ({
  id: car.id,
  label: t.admin.carList(formatPlate(car.plateNumber), carStatusLabel(car.status), driverShort(car)),
});

// ─────────────────────────── Ro'yxat ───────────────────────────

const carFilterRow = (): InlineRow => [
  { text: t.kb.filterAll, data: buildCallback(CB.carList, LIST_FILTER_ALL, FIRST_PAGE) },
  ...CAR_FILTERS.map((status) => ({
    text: t.status.car[status],
    data: buildCallback(CB.carList, status, FIRST_PAGE),
  })),
];

/**
 * Umumiy `listKeyboard` shablonidan foydalanamiz, lekin pastki qatorga
 * "qidirish" tugmasi qo'shiladi — 1000+ mashinada sahifalab izlash amalda ishlamaydi.
 */
const carListKeyboard = (
  rows: readonly ListRow[],
  page: number,
  totalPages: number,
  filter: CarFilter,
): InlineKeyboard =>
  listKeyboard({
    rows,
    openAction: CB.carOpen,
    pagination: { action: CB.carList, page, totalPages, args: [filter] },
    footerRows: [
      carFilterRow(),
      [
        { text: t.admin.carAdd, data: buildCallback(CB.carAdd) },
        { text: t.admin.search, data: buildCallback(ADMIN_CB.carSearch) },
      ],
      [menuButton()],
    ],
  });

type CarListView = {
  readonly rows: readonly ListRow[];
  readonly page: number;
  readonly totalPages: number;
  readonly totalItems: number;
};

const fetchCarList = async (filter: CarFilter, page: number, query: string): Promise<CarListView> => {
  const result = await listCars({
    page,
    ...(filter === LIST_FILTER_ALL ? {} : { status: filter }),
    ...(query ? { query } : {}),
  });
  return {
    rows: toListRows(result, carRow),
    page: result.page,
    totalPages: result.totalPages,
    totalItems: result.totalItems,
  };
};

const drawCarList = async (
  ctx: BotContext,
  view: CarListView,
  filter: CarFilter,
  query: string,
  mode: DrawMode = 'panel',
): Promise<void> => {
  const header = query
    ? t.admin.carsSearchTitle(escapeHtml(query), view.totalItems)
    : t.admin.carsTitle(view.totalItems);

  await draw(
    ctx,
    mode,
    withEmptyNotice(header, view.rows.length === 0, t.common.empty),
    carListKeyboard(view.rows, view.page, view.totalPages, filter),
  );
};

const showCarList = async (ctx: BotContext, filter: CarFilter, page: number): Promise<void> => {
  const query = readDraftString(ctx, CAR_QUERY_KEY);
  await drawCarList(ctx, await fetchCarList(filter, page, query), filter, query);
};

// ─────────────────────────── Kartochka ───────────────────────────

const showCarDetail = async (ctx: BotContext, carId: string): Promise<void> => {
  const car = await loadCarDetail(carId);
  if (car === null) throw new NotFoundError(t.common.notFound);

  const driverName =
    car.driver === null
      ? t.admin.carNoDriver
      : escapeHtml(
          displayName({
            fullName: car.driver.fullName,
            username: car.driver.username ?? car.driver.pendingUsername,
          }),
        );

  const text = t.admin.carDetail({
    plate: safePlate(car.plateNumber),
    model: safeText(car.model),
    color: safeText(car.color),
    status: carStatusLabel(car.status),
    driver: driverName,
    phone: safePhone(car.driver?.phone ?? car.driver?.pendingPhone),
    campaigns: car.activeCampaigns,
    photos: car.referencePhotos,
    created: formatDate(car.createdAt),
  });

  await draw(ctx, 'panel', text, carCardKeyboard(car.id, car.driver !== null));
};

// ─────────────────────────── Suhbat: qidiruv ───────────────────────────

export const carSearchConversation = async (
  conversation: AdminConversation,
  ctx: BotContext,
): Promise<void> => {
  const query = await askText(conversation, ctx, t.admin.carSearchPrompt);
  if (query === null) return;

  setConversationDraft(conversation, { [CAR_QUERY_KEY]: query });
  const view = await conversation.external(() => fetchCarList(LIST_FILTER_ALL, FIRST_PAGE, query));
  await drawCarList(ctx, view, LIST_FILTER_ALL, query, 'fresh');
};

// ─────────────────────────── Handlerlar ───────────────────────────

const registerListHandlers = (composer: Composer<BotContext>): void => {
  composer.callbackQuery(
    callbackPattern(CB.carList),
    safeHandler('admin:cars:list', async (ctx) => {
      await answerSafe(ctx);
      // Filtrga qaytilganda eski qidiruv natijasi chalkashtirmasligi uchun tozalanadi.
      if (pageArg(ctx, 1) === FIRST_PAGE) setDraft(ctx, { [CAR_QUERY_KEY]: '' });
      await showCarList(ctx, readFilter(ctx), pageArg(ctx, 1));
    }),
  );

  composer.callbackQuery(
    callbackPattern(ADMIN_CB.carSearch),
    safeHandler('admin:cars:search', async (ctx) => {
      await answerSafe(ctx);
      await enterConversation(ctx, CONVERSATION.carSearch);
    }),
  );

  composer.callbackQuery(
    callbackPattern(CB.carOpen),
    safeHandler('admin:cars:open', async (ctx) => {
      await answerSafe(ctx);
      await showCarDetail(ctx, argAt(ctx, 0));
    }),
  );

  composer.callbackQuery(
    callbackPattern(CB.carAdd),
    safeHandler('admin:cars:add', async (ctx) => {
      await answerSafe(ctx);
      await enterConversation(ctx, CONVERSATION.carCreate);
    }),
  );
};

const registerStatusHandlers = (composer: Composer<BotContext>): void => {
  composer.callbackQuery(
    callbackPattern(CB.carStatus),
    safeHandler('admin:cars:status', async (ctx) => {
      const carId = argAt(ctx, 0);
      const status = argAt(ctx, 1);

      if (status === '') {
        await answerSafe(ctx);
        const car = await loadCarDetail(carId);
        if (car === null) throw new NotFoundError(t.common.notFound);
        await draw(
          ctx,
          'panel',
          t.admin.carStatusPrompt(safePlate(car.plateNumber)),
          carStatusKeyboard(carId),
        );
        return;
      }

      if (!isCarStatus(status)) {
        await answerSafe(ctx, t.common.error, true);
        return;
      }

      const car = await setCarStatus(carId, status);
      await recordAudit({
        actorId: ctx.auth.user?.id,
        action: 'car.status',
        entity: 'Car',
        entityId: carId,
        meta: { status },
      });
      await answerSafe(
        ctx,
        t.admin.carStatusUpdated(formatPlate(car.plateNumber), carStatusLabel(status)),
      );
      await showCarDetail(ctx, carId);
    }),
  );
};

const registerDriverLinkHandlers = (composer: Composer<BotContext>): void => {
  composer.callbackQuery(
    callbackPattern(CB.carAssign),
    safeHandler('admin:cars:assign', async (ctx) => {
      await answerSafe(ctx);
      await enterConversation(ctx, CONVERSATION.carAssign, { carId: argAt(ctx, 0) });
    }),
  );

  composer.callbackQuery(
    callbackPattern(CB.carUnassign),
    safeHandler('admin:cars:unassign', async (ctx) => {
      const carId = argAt(ctx, 0);
      const car = await unassignDriver(carId);
      await recordAudit({
        actorId: ctx.auth.user?.id,
        action: 'car.unassignDriver',
        entity: 'Car',
        entityId: carId,
      });
      await answerSafe(ctx, t.admin.driverUnlinked(formatPlate(car.plateNumber)));
      await showCarDetail(ctx, carId);
    }),
  );

  composer.callbackQuery(
    callbackPattern(CB.carReferral),
    safeHandler('admin:cars:referral', async (ctx) => {
      const carId = argAt(ctx, 0);
      const car = await loadCarDetail(carId);
      if (car === null) throw new NotFoundError(t.common.notFound);

      const { link } = await createCarReferral(carId, ctx.auth.user?.id);
      await answerSafe(ctx);
      await sendPanel(
        ctx,
        t.referral.created(link, safePlate(car.plateNumber)),
        backKeyboard(buildCallback(CB.carOpen, carId)),
      );
    }),
  );
};

const registerArchiveHandlers = (composer: Composer<BotContext>): void => {
  composer.callbackQuery(
    callbackPattern(CB.carArchive),
    safeHandler('admin:cars:archive', async (ctx) => {
      const carId = argAt(ctx, 0);
      const car = await loadCarDetail(carId);
      if (car === null) throw new NotFoundError(t.common.notFound);

      if (argAt(ctx, 1) !== ARCHIVE_CONFIRM) {
        await answerSafe(ctx);
        await draw(
          ctx,
          'panel',
          t.admin.carDeleteConfirm(safePlate(car.plateNumber)),
          carArchiveConfirmKeyboard(carId),
        );
        return;
      }

      await archiveCar(carId);
      await recordAudit({
        actorId: ctx.auth.user?.id,
        action: 'car.archive',
        entity: 'Car',
        entityId: carId,
      });
      await answerSafe(ctx, t.admin.carArchived(formatPlate(car.plateNumber)));
      await showCarList(ctx, LIST_FILTER_ALL, FIRST_PAGE);
    }),
  );
};

export const registerCarHandlers = (composer: Composer<BotContext>): void => {
  registerListHandlers(composer);
  registerStatusHandlers(composer);
  registerDriverLinkHandlers(composer);
  registerArchiveHandlers(composer);
};
