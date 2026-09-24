/**
 * `GET /app?token=...` — Telegram Mini App sahifasi.
 *
 * Token bu yerda tekshirilmaydi: sahifa faqat statik HTML, hech qanday maxfiy
 * ma'lumot ko'rsatmaydi. Haqiqiy tekshiruv `POST /api/upload` da — initData imzosi
 * va tokenning egasi bo'yicha. Shu sabab sahifa hamma vaqt beriladi, xatoni esa
 * Mini App o'zi o'zbekcha ko'rsatadi.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { childLogger } from '../../core/logger.js';

const log = childLogger('web:miniapp');

export const MINIAPP_ROUTE = '/app';
const MINIAPP_ENTRY_FILE = 'index.html';

type AppQuery = { readonly token?: string };

const handleApp = async (
  request: FastifyRequest<{ Querystring: AppQuery }>,
  reply: FastifyReply,
): Promise<FastifyReply> => {
  if (!request.query.token) {
    // Tokensiz kirish odatiy emas: havola qo'lda ochilgan yoki eskirgan.
    log.warn('Mini App tokensiz ochildi');
  }

  // Sahifada bir martalik token bo'lgani uchun keshlanmasligi shart.
  reply.header('Cache-Control', 'no-store, must-revalidate');
  reply.header('Referrer-Policy', 'no-referrer');
  return reply.sendFile(MINIAPP_ENTRY_FILE);
};

export const registerMiniAppRoutes = (app: FastifyInstance): void => {
  app.get<{ Querystring: AppQuery }>(MINIAPP_ROUTE, handleApp);
};
