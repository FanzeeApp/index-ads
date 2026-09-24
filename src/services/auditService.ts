import type { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { childLogger } from '../core/logger.js';
import { describeError } from '../core/errors.js';

const log = childLogger('audit');

export type AuditInput = {
  readonly actorId?: string;
  readonly action: string;
  readonly entity?: string;
  readonly entityId?: string;
  readonly meta?: Record<string, unknown>;
};

/**
 * Meta ichida BigInt (masalan telegramId) uchrashi mumkin — JSON uni seriyalay olmaydi,
 * shuning uchun matnga aylantiramiz. Aks holda butun audit yozuvi yo'qoladi.
 */
const toJsonMeta = (meta: Record<string, unknown>): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(meta, (_key, value) => (typeof value === 'bigint' ? value.toString() : value)));

/**
 * Audit yozuvi — kim, nima qilgani. Audit yozilmasa ham asosiy biznes-amal
 * bekor qilinmaydi: xato yutilmaydi, balki batafsil kontekst bilan logga tushadi.
 */
export const recordAudit = async (input: AuditInput): Promise<void> => {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        entity: input.entity ?? null,
        entityId: input.entityId ?? null,
        meta: input.meta ? toJsonMeta(input.meta) : undefined,
      },
    });
  } catch (error: unknown) {
    log.error(
      { action: input.action, entity: input.entity, entityId: input.entityId, reason: describeError(error) },
      'Audit yozuvini saqlab bo\'lmadi',
    );
  }
};
