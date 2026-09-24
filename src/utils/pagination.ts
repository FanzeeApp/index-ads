import { PAGE_SIZE } from '../config/constants.js';

export type Page<T> = {
  readonly items: readonly T[];
  readonly page: number;
  readonly totalPages: number;
  readonly totalItems: number;
  readonly hasPrev: boolean;
  readonly hasNext: boolean;
};

export const buildPage = <T>(
  items: readonly T[],
  totalItems: number,
  page: number,
  size: number = PAGE_SIZE,
): Page<T> => {
  const totalPages = Math.max(1, Math.ceil(totalItems / size));
  const safePage = Math.min(Math.max(1, page), totalPages);
  return { items, page: safePage, totalPages, totalItems, hasPrev: safePage > 1, hasNext: safePage < totalPages };
};

export const toSkip = (page: number, size: number = PAGE_SIZE): number => Math.max(0, (Math.max(1, page) - 1) * size);
