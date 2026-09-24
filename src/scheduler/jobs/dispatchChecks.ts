/**
 * Muddati kelgan joylashtirishlar uchun tekshiruv so'rovi yaratadi va
 * haydovchiga rasm so'rab xabar yuboradi.
 *
 * Nima uchun bo'lakli: taksoparkda 1000+ mashina bor, bitta tsiklda yuzlab
 * so'rov ochilishi mumkin. Yuborishning tezligini notifyService navbati
 * (22 msg/s) belgilaydi, biz esa faqat bir vaqtdagi ochiq amallar sonini
 * cheklaymiz — shunda xotira o'smaydi.
 */

import { DISPATCH_BATCH_SIZE } from '../../config/constants.js';
import { isAppError } from '../../core/errors.js';
import { childLogger } from '../../core/logger.js';
import { sendCheckPrompt } from '../../bot/handlers/driver/check.js';
import { createCheckRequest, duePlacements, type PlacementWithRelations } from '../../services/checkService.js';
import { processInChunks } from '../runJob.js';

const log = childLogger('scheduler:dispatch');

export const DISPATCH_JOB = 'dispatchChecks';

/**
 * Bitta joylashtirish: so'rov yaratiladi, so'ng haydovchiga xabar ketadi.
 *
 * Bir nechta nusxa (replica) bir vaqtda ishlaganda ham ikkilanish bo'lmaydi:
 * createCheckRequest ichidagi shartli updateMany (`nextCheckAt <= now` sharti
 * bilan) faqat bitta nusxaga "yutuq" beradi, qolganlari ConflictError oladi.
 * Shu sababli ConflictError — kutilgan holat, xato emas.
 *
 * TODO: nusxalar soni ortganda shartli yangilash o'rniga bazadagi qulfga
 * o'tish tavsiya etiladi — `SELECT ... FOR UPDATE SKIP LOCKED` bilan
 * joylashtirishlarni band qilib olish poygani butunlay yo'q qiladi va
 * bekorga urinishlarni kamaytiradi.
 */
const dispatchOne = async (placement: PlacementWithRelations): Promise<boolean> => {
  try {
    const check = await createCheckRequest(placement);
    return await sendCheckPrompt(check);
  } catch (error) {
    if (isAppError(error) && error.code === 'CONFLICT') {
      log.debug({ placementId: placement.id }, 'Joylashtirishni boshqa tsikl band qilib ulgurdi');
      return false;
    }
    throw error;
  }
};

/** Bitta tsikl. Qaytadigan son — muvaffaqiyatli yuborilgan so'rovlar soni. */
export const dispatchChecks = async (now: Date = new Date()): Promise<number> => {
  const placements = await duePlacements(now, DISPATCH_BATCH_SIZE);
  if (placements.length === 0) return 0;

  const outcome = await processInChunks(DISPATCH_JOB, placements, dispatchOne);

  if (outcome.failed > 0) {
    log.warn(
      { due: placements.length, sent: outcome.ok, failed: outcome.failed },
      "Ba'zi tekshiruv so'rovlari yetkazilmadi",
    );
  }

  return outcome.ok;
};
