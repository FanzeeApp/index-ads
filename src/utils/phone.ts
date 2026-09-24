/** O'zbekiston raqamlarini +998XXXXXXXXX ko'rinishiga keltiradi. */
export const normalizePhone = (raw: string): string | null => {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 9) return `+998${digits}`;
  if (digits.length === 12 && digits.startsWith('998')) return `+${digits}`;
  if (digits.length === 13 && digits.startsWith('0998')) return `+${digits.slice(1)}`;
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
};

export const isValidPhone = (raw: string): boolean => normalizePhone(raw) !== null;

export const formatPhone = (raw: string): string => {
  const normalized = normalizePhone(raw);
  if (!normalized || !normalized.startsWith('+998') || normalized.length !== 13) return raw;
  return `${normalized.slice(0, 4)} ${normalized.slice(4, 6)} ${normalized.slice(6, 9)} ${normalized.slice(9, 11)} ${normalized.slice(11)}`;
};

/** @username ni tozalaydi (kichik harf, @ siz). */
export const normalizeUsername = (raw: string): string | null => {
  const cleaned = raw.trim().replace(/^@/, '').replace(/^https?:\/\/t\.me\//i, '');
  return /^[A-Za-z0-9_]{5,32}$/.test(cleaned) ? cleaned.toLowerCase() : null;
};
