/**
 * Geografik masofa hisobi — rasm GPS nuqtasi etalon nuqtaga mos kelishini
 * tekshirish uchun. Tashqi kutubxonasiz, chunki bizga faqat bitta formula kerak.
 */

/** O'rtacha Yer radiusi (metr, IUGG). */
const EARTH_RADIUS_M = 6_371_008.8;

const DEGREES_TO_RADIANS = Math.PI / 180;

export type GeoPoint = {
  readonly latitude: number;
  readonly longitude: number;
};

const toRadians = (degrees: number): number => degrees * DEGREES_TO_RADIANS;

/** Koordinata haqiqiy son va ruxsat etilgan oraliqda ekanini tekshiradi. */
export const isValidPoint = (point: GeoPoint): boolean =>
  Number.isFinite(point.latitude) &&
  Number.isFinite(point.longitude) &&
  Math.abs(point.latitude) <= 90 &&
  Math.abs(point.longitude) <= 180;

/**
 * Ikki nuqta orasidagi masofa (metr) — haversine formulasi.
 * Shahar masshtabidagi masofalar uchun aniqligi yetarli.
 */
export const haversineMeters = (from: GeoPoint, to: GeoPoint): number => {
  if (!isValidPoint(from) || !isValidPoint(to)) return Number.POSITIVE_INFINITY;

  const latDelta = toRadians(to.latitude - from.latitude);
  const lonDelta = toRadians(to.longitude - from.longitude);
  const fromLat = toRadians(from.latitude);
  const toLat = toRadians(to.latitude);

  const a =
    Math.sin(latDelta / 2) ** 2 + Math.cos(fromLat) * Math.cos(toLat) * Math.sin(lonDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
};

/**
 * Nuqta belgilangan radius ichidami. radiusM <= 0 bo'lsa tekshiruv o'chirilgan
 * hisoblanadi va har doim true qaytadi (GEO_MATCH_RADIUS_M=0 sozlamasi).
 */
export const isWithinRadius = (from: GeoPoint, to: GeoPoint, radiusM: number): boolean => {
  if (radiusM <= 0) return true;
  return haversineMeters(from, to) <= radiusM;
};
