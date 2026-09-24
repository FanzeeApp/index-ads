import type { Composer, InlineKeyboard } from 'grammy';

import { NotFoundError } from '../../../core/errors.js';
import { t } from '../../../i18n/index.js';
import { recordAudit } from '../../../services/auditService.js';
import { listDrivers, type DriverWithUser } from '../../../services/driverService.js';
import { escapeHtml } from '../../../utils/html.js';
import { formatPlate } from '../../../utils/plate.js';
import { formatDateTime } from '../../../utils/time.js';
import type { BotContext } from '../../bot.js';
import { buildCallback, callbackPattern, CB } from '../../callbacks.js';
import {
  backButton,
  inlineGrid,
  listKeyboard,
  menuButton,
  type InlineButton,
  type ListRow,
} from '../../keyboards/common.js';
import { answerSafe, safeHandler } from '../guard.js';
import {
  driverCompliance,
  loadDriverDetail,
  recentChecksForDriver,
  setUserBlocked,
  type DriverDetail,
  type RecentCheck,
} from './adminQueries.js';
import { checkStatusLabel, displayName, orDash, safePhone, safeUsername } from './format.js';
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
  setConversationDraft,
  setDraft,
  toListRows,
  withEmptyNotice,
  type AdminConversation,
  type DrawMode,
} from './shared.js';

const DRIVER_QUERY_KEY = 'driverQuery';

const driverName = (driver: DriverWithUser): string =>
  displayName({
    fullName: driver.fullName,
    firstName: driver.user.firstName,
    lastName: driver.user.lastName,
    username: driver.user.username,
  });

const driverRow = (driver: DriverWithUser): ListRow => ({
  id: driver.id,
  label: t.admin.driverList(
    driverName(driver),
    orDash(driver.phone ?? driver.user.phone),
    orDash(driver.cars.map((car) => formatPlate(car.plateNumber)).join(', ')),
  ),
});

// ─────────────────────────── Ro'yxat ───────────────────────────

const driverListKeyboard = (
  rows: readonly ListRow[],
  page: number,
  totalPages: number,
): InlineKeyboard =>
  listKeyboard({
    rows,
    openAction: CB.driverOpen,
    pagination: { action: CB.driverList, page, totalPages },
    footerRows: [
      [{ text: t.admin.search, data: buildCallback(ADMIN_CB.driverSearch) }, menuButton()],
    ],
  });

type DriverListView = {
  readonly rows: readonly ListRow[];
  readonly page: number;
  readonly totalPages: number;
  readonly totalItems: number;
};

const fetchDriverList = async (page: number, query: string): Promise<DriverListView> => {
  const result = await listDrivers(query ? { page, query } : { page });
  return {
    rows: toListRows(result, driverRow),
    page: result.page,
    totalPages: result.totalPages,
    totalItems: result.totalItems,
  };
};

const drawDriverList = async (
  ctx: BotContext,
  view: DriverListView,
  query: string,
  mode: DrawMode = 'panel',
): Promise<void> => {
  const header = query
    ? t.admin.driversSearchTitle(escapeHtml(query), view.totalItems)
    : t.admin.driversTitle(view.totalItems);

  await draw(
    ctx,
    mode,
    withEmptyNotice(header, view.rows.length === 0, t.common.empty),
    driverListKeyboard(view.rows, view.page, view.totalPages),
  );
};

const showDriverList = async (ctx: BotContext, page: number): Promise<void> => {
  const query = readDraftString(ctx, DRIVER_QUERY_KEY);
  await drawDriverList(ctx, await fetchDriverList(page, query), query);
};

// ─────────────────────────── Kartochka ───────────────────────────

const historyBlock = (checks: readonly RecentCheck[]): string => {
  if (checks.length === 0) return t.common.empty;
  return checks
    .map((check) =>
      t.admin.driverCheckLine(
        escapeHtml(formatPlate(check.plateNumber)),
        checkStatusLabel(check.status),
        formatDateTime(check.requestedAt),
      ),
    )
    .join('\n');
};

const driverCardKeyboard = (driver: DriverDetail): InlineKeyboard => {
  const blockButton: InlineButton = driver.isBlocked
    ? { text: t.admin.driverUnblock, data: buildCallback(ADMIN_CB.driverUnblock, driver.id) }
    : { text: t.admin.driverBlock, data: buildCallback(ADMIN_CB.driverBlock, driver.id) };

  return inlineGrid(
    [blockButton, backButton(buildCallback(CB.driverList, FIRST_PAGE)), menuButton()],
    2,
  );
};

const showDriverDetail = async (ctx: BotContext, driverId: string): Promise<void> => {
  const driver = await loadDriverDetail(driverId);
  if (driver === null) throw new NotFoundError(t.common.notFound);

  const [compliance, checks] = await Promise.all([
    driverCompliance(driverId),
    recentChecksForDriver(driverId),
  ]);

  const text = t.admin.driverDetail({
    name: escapeHtml(displayName({ fullName: driver.fullName, username: driver.username })),
    username: safeUsername(driver.username),
    phone: safePhone(driver.phone),
    linked: driver.isLinked ? t.common.yes : t.common.no,
    blocked: driver.isBlocked ? t.common.yes : t.common.no,
    cars: orDash(driver.plates.map((plate) => escapeHtml(formatPlate(plate))).join(', ')),
    approved: compliance.approved,
    expired: compliance.expired,
    pending: compliance.pending,
    rate: compliance.rate,
    history: historyBlock(checks),
  });

  await draw(ctx, 'panel', text, driverCardKeyboard(driver));
};

const setBlocked = async (ctx: BotContext, driverId: string, blocked: boolean): Promise<void> => {
  const driver = await loadDriverDetail(driverId);
  if (driver === null) throw new NotFoundError(t.common.notFound);

  await setUserBlocked(driver.userId, blocked);
  await recordAudit({
    actorId: ctx.auth.user?.id,
    action: blocked ? 'driver.block' : 'driver.unblock',
    entity: 'Driver',
    entityId: driverId,
  });

  const name = displayName({ fullName: driver.fullName, username: driver.username });
  await answerSafe(ctx, blocked ? t.admin.driverBlocked(name) : t.admin.driverUnblocked(name));
  await showDriverDetail(ctx, driverId);
};

// ─────────────────────────── Suhbat: qidiruv ───────────────────────────

export const driverSearchConversation = async (
  conversation: AdminConversation,
  ctx: BotContext,
): Promise<void> => {
  const query = await askText(conversation, ctx, t.admin.searchPrompt);
  if (query === null) return;

  setConversationDraft(conversation, { [DRIVER_QUERY_KEY]: query });
  const view = await conversation.external(() => fetchDriverList(FIRST_PAGE, query));
  await drawDriverList(ctx, view, query, 'fresh');
};

// ─────────────────────────── Handlerlar ───────────────────────────

export const registerDriverHandlers = (composer: Composer<BotContext>): void => {
  composer.callbackQuery(
    callbackPattern(CB.driverList),
    safeHandler('admin:drivers:list', async (ctx) => {
      await answerSafe(ctx);
      if (pageArg(ctx, 0) === FIRST_PAGE) setDraft(ctx, { [DRIVER_QUERY_KEY]: '' });
      await showDriverList(ctx, pageArg(ctx, 0));
    }),
  );

  composer.callbackQuery(
    callbackPattern(ADMIN_CB.driverSearch),
    safeHandler('admin:drivers:search', async (ctx) => {
      await answerSafe(ctx);
      await enterConversation(ctx, CONVERSATION.driverSearch);
    }),
  );

  composer.callbackQuery(
    callbackPattern(CB.driverOpen),
    safeHandler('admin:drivers:open', async (ctx) => {
      await answerSafe(ctx);
      await showDriverDetail(ctx, argAt(ctx, 0));
    }),
  );

  composer.callbackQuery(
    callbackPattern(ADMIN_CB.driverBlock),
    safeHandler('admin:drivers:block', async (ctx) => {
      await setBlocked(ctx, argAt(ctx, 0), true);
    }),
  );

  composer.callbackQuery(
    callbackPattern(ADMIN_CB.driverUnblock),
    safeHandler('admin:drivers:unblock', async (ctx) => {
      await setBlocked(ctx, argAt(ctx, 0), false);
    }),
  );
};
