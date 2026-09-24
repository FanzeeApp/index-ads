/** Ilova xatolari — foydalanuvchiga ko'rsatiladigan va ichki xatolarni ajratadi. */

export class AppError extends Error {
  readonly code: string;
  /** Foydalanuvchiga ko'rsatish mumkinmi (o'zbek tilidagi matn). */
  readonly userFacing: boolean;
  readonly statusCode: number;
  readonly meta?: Readonly<Record<string, unknown>>;

  constructor(
    code: string,
    message: string,
    options: { userFacing?: boolean; statusCode?: number; meta?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.userFacing = options.userFacing ?? false;
    this.statusCode = options.statusCode ?? 400;
    this.meta = options.meta ? Object.freeze({ ...options.meta }) : undefined;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super('VALIDATION', message, { userFacing: true, statusCode: 400, meta });
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super('NOT_FOUND', message, { userFacing: true, statusCode: 404, meta });
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super('FORBIDDEN', message, { userFacing: true, statusCode: 403, meta });
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super('CONFLICT', message, { userFacing: true, statusCode: 409, meta });
    this.name = 'ConflictError';
  }
}

export const isAppError = (error: unknown): error is AppError => error instanceof AppError;

/** Noma'lum xatoni xavfsiz matnga aylantiradi (stack ni oshkor qilmaydi). */
export const describeError = (error: unknown): string => {
  if (isAppError(error)) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return String(error);
};
