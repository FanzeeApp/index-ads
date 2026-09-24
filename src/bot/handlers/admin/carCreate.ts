import { REQUIRED_SIDES } from '../../../config/constants.js';
import { NotFoundError } from '../../../core/errors.js';
import { t } from '../../../i18n/index.js';
import { recordAudit } from '../../../services/auditService.js';
import {
  addReferencePhoto,
  assignDriver,
  createCar,
  findCarByPlate,
  getCarById,
} from '../../../services/carService.js';
import {
  createPendingDriver,
  findDriverByPhone,
  findDriverByTelegramId,
  findDriverByUsername,
  type DriverWithUser,
} from '../../../services/driverService.js';
import { createCarReferral } from '../../../services/referralService.js';
import { escapeHtml } from '../../../utils/html.js';
import { normalizePhone, normalizeUsername } from '../../../utils/phone.js';
import { isValidPlate, normalizePlate } from '../../../utils/plate.js';
import type { BotContext } from '../../bot.js';
import { buildCallback, CB } from '../../callbacks.js';
import { backKeyboard } from '../../keyboards/common.js';
import { displayName, safePlate } from './format.js';
import { askChoice, askPhoto, askText } from './prompts.js';
import {
  MAX_INPUT_ATTEMPTS,
  readDraftString,
  sendPanel,
  type AdminConversation,
} from './shared.js';

/**
 * "Mashina qo'shish" oqimi — panelning o'zagi:
 * raqam → model → rang → 3 ta etalon rasm → haydovchini biriktirish.
 *
 * Bazaga har qanday murojaat `conversation.external()` ichida bo'lishi shart:
 * conversations plagini oqimni qayta o'ynatadi, tashqi amallar esa faqat bir marta bajarilishi kerak.
 */

const LINK_MANUAL = 'manual';
const LINK_REFERRAL = 'ref';
const LINK_SKIP = 'skip';

type DriverIdentifier =
  | { readonly kind: 'username'; readonly value: string }
  | { readonly kind: 'phone'; readonly value: string }
  | { readonly kind: 'telegramId'; readonly value: string };

type LinkOutcome =
  | { readonly kind: 'linked'; readonly name: string }
  | { readonly kind: 'pending'; readonly target: string }
  | { readonly kind: 'invalid' };

// ─────────────────────────── 1-qadam: davlat raqami ───────────────────────────

/** Formatni tekshiradi va bazada takrorlanmasligiga ishonch hosil qiladi. */
const askPlate = async (
  conversation: AdminConversation,
  ctx: BotContext,
): Promise<string | null> => {
  for (let attempt = 0; attempt < MAX_INPUT_ATTEMPTS; attempt += 1) {
    const raw = await askText(conversation, ctx, t.admin.carPlatePrompt, {
      validate: isValidPlate,
      invalidText: t.admin.carPlateInvalid,
    });
    if (raw === null) return null;

    const plate = normalizePlate(raw);
    const taken = await conversation.external(() => findCarByPlate(plate).then((car) => car !== null));
    if (!taken) return plate;

    await ctx.reply(t.admin.carPlateExists(safePlate(plate)), { parse_mode: 'HTML' });
  }

  await ctx.reply(t.admin.tooManyAttempts);
  return null;
};

// ─────────────────────────── 4-qadam: etalon rasmlar ───────────────────────────

/** Uchala tomonni ketma-ket so'raydi. `false` — admin oqimni to'xtatdi. */
const collectReferencePhotos = async (
  conversation: AdminConversation,
  ctx: BotContext,
  carId: string,
): Promise<boolean> => {
  await ctx.reply(t.admin.carPhotosPrompt, { parse_mode: 'HTML' });
  const total = REQUIRED_SIDES.length;

  for (const [index, side] of REQUIRED_SIDES.entries()) {
    const position = index + 1;
    const photo = await askPhoto(
      conversation,
      ctx,
      t.admin.carPhotoSidePrompt(t.side[side], position, total),
    );
    if (photo === null) return false;

    await conversation.external(() =>
      addReferencePhoto(carId, side, photo.fileId, photo.fileUniqueId).then(() => true),
    );
    await ctx.reply(t.admin.carPhotoReceived(position, total));
  }

  return true;
};

// ─────────────────────────── 5-qadam: haydovchi ───────────────────────────

/**
 * Kiritilgan matnni aniq turga ajratadi. Sof raqam Telegram ID deb qaraladi —
 * telefon uchun `+` yoki `998` prefiksi talab qilinadi (so'rov matnida yozilgan).
 */
const classifyIdentifier = (raw: string): DriverIdentifier | null => {
  const trimmed = raw.trim();

  if (trimmed.startsWith('@') || /t\.me\//i.test(trimmed)) {
    const username = normalizeUsername(trimmed);
    return username ? { kind: 'username', value: username } : null;
  }

  if (/^\d{5,15}$/.test(trimmed)) {
    if (!/^998\d{9}$/.test(trimmed)) return { kind: 'telegramId', value: trimmed };
    const phone = normalizePhone(trimmed);
    return phone ? { kind: 'phone', value: phone } : null;
  }

  const phone = normalizePhone(trimmed);
  if (phone) return { kind: 'phone', value: phone };

  const username = normalizeUsername(trimmed);
  return username ? { kind: 'username', value: username } : null;
};

const linkExisting = async (carId: string, driver: DriverWithUser): Promise<LinkOutcome> => {
  await assignDriver(carId, driver.id);
  return {
    kind: 'linked',
    name: displayName({
      fullName: driver.fullName,
      firstName: driver.user.firstName,
      lastName: driver.user.lastName,
      username: driver.user.username,
    }),
  };
};

const linkPending = async (
  carId: string,
  input: { readonly username?: string; readonly phone?: string },
  target: string,
): Promise<LinkOutcome> => {
  const pending = await createPendingDriver(input);
  await assignDriver(carId, pending.id);
  return { kind: 'pending', target };
};

/** Bazaga murojaat qiladi — faqat `conversation.external()` ichidan chaqiriladi. */
const attachDriver = async (carId: string, raw: string): Promise<LinkOutcome> => {
  const identifier = classifyIdentifier(raw);
  if (identifier === null) return { kind: 'invalid' };

  if (identifier.kind === 'telegramId') {
    const driver = await findDriverByTelegramId(Number(identifier.value));
    return driver ? linkExisting(carId, driver) : { kind: 'invalid' };
  }

  if (identifier.kind === 'username') {
    const driver = await findDriverByUsername(identifier.value);
    if (driver) return linkExisting(carId, driver);
    return linkPending(carId, { username: identifier.value }, `@${identifier.value}`);
  }

  const driver = await findDriverByPhone(identifier.value);
  if (driver) return linkExisting(carId, driver);
  return linkPending(carId, { phone: identifier.value }, identifier.value);
};

/**
 * Nima uchun escapeHtml: ism/username haydovchining Telegram profilidan keladi,
 * ya'ni uni haydovchining O'ZI yozadi. `parse_mode: 'HTML'` bilan yuborilsa,
 * `<a href="...">` kabi teglar admin ko'radigan xabarga kirib qolardi.
 */
const reportLinkOutcome = async (
  ctx: BotContext,
  outcome: LinkOutcome,
  plate: string,
): Promise<void> => {
  if (outcome.kind === 'linked') {
    await ctx.reply(t.admin.driverLinked(escapeHtml(outcome.name), safePlate(plate)), {
      parse_mode: 'HTML',
    });
    return;
  }
  if (outcome.kind === 'pending') {
    await ctx.reply(t.admin.carDriverPending(escapeHtml(outcome.target)), { parse_mode: 'HTML' });
    return;
  }
  await ctx.reply(t.admin.driverNotFound);
};

const issueReferral = async (
  conversation: AdminConversation,
  ctx: BotContext,
  carId: string,
  plate: string,
): Promise<void> => {
  const actorId = ctx.auth.user?.id;
  const link = await conversation.external(() =>
    createCarReferral(carId, actorId).then((result) => result.link),
  );
  await ctx.reply(t.referral.created(link, safePlate(plate)), {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  });
};

/** Haydovchini biriktirish qadami — yaratish oqimi ham, alohida amal ham shuni ishlatadi. */
const linkDriver = async (
  conversation: AdminConversation,
  ctx: BotContext,
  carId: string,
  plate: string,
): Promise<void> => {
  const choice = await askChoice(conversation, ctx, t.admin.carDriverPrompt, [
    { label: t.admin.carLinkExisting, value: LINK_MANUAL },
    { label: t.admin.carCreateReferral, value: LINK_REFERRAL },
    { label: t.admin.carSkipDriver, value: LINK_SKIP },
  ]);

  if (choice === null || choice === LINK_SKIP) {
    await ctx.reply(t.admin.carDriverSkipped);
    return;
  }

  if (choice === LINK_REFERRAL) {
    await issueReferral(conversation, ctx, carId, plate);
    return;
  }

  const raw = await askText(conversation, ctx, t.admin.carDriverIdentifierPrompt);
  if (raw === null) return;

  const outcome = await conversation.external(() => attachDriver(carId, raw));
  await reportLinkOutcome(ctx, outcome, plate);
};

// ─────────────────────────── Oqimlar ───────────────────────────

export const carCreateConversation = async (
  conversation: AdminConversation,
  ctx: BotContext,
): Promise<void> => {
  const plate = await askPlate(conversation, ctx);
  if (plate === null) return;

  const model = await askText(conversation, ctx, t.admin.carModelPrompt);
  if (model === null) return;

  const color = await askText(conversation, ctx, t.admin.carColorPrompt);
  if (color === null) return;

  const actorId = ctx.auth.user?.id;
  const carId = await conversation.external(async () => {
    const car = await createCar({ plateNumber: plate, model, color });
    await recordAudit({
      actorId,
      action: 'car.create',
      entity: 'Car',
      entityId: car.id,
      meta: { plate },
    });
    return car.id;
  });

  const cardKeyboard = backKeyboard(buildCallback(CB.carOpen, carId));

  const photosDone = await collectReferencePhotos(conversation, ctx, carId);
  if (!photosDone) {
    await sendPanel(ctx, t.admin.carCreatedPartial(safePlate(plate)), cardKeyboard);
    return;
  }

  await linkDriver(conversation, ctx, carId, plate);
  await sendPanel(ctx, t.admin.carCreated(safePlate(plate)), cardKeyboard);
};

/** Mavjud mashinaga haydovchi biriktirish — kartochkadagi tugma shu oqimni ochadi. */
export const carAssignConversation = async (
  conversation: AdminConversation,
  ctx: BotContext,
): Promise<void> => {
  const carId = await conversation.external(() => readDraftString(ctx, 'carId'));
  if (!carId) {
    await ctx.reply(t.common.notFound);
    return;
  }

  const plate = await conversation.external(() => getCarById(carId).then((car) => car.plateNumber));
  if (!plate) throw new NotFoundError(t.common.notFound);

  await linkDriver(conversation, ctx, carId, plate);
  await sendPanel(ctx, t.admin.actionDone, backKeyboard(buildCallback(CB.carOpen, carId)));
};
