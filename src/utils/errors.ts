export type ErrorCode = 'VALIDATION_ERROR' | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'TOO_MANY_REQUESTS' | 'INTERNAL';

export interface FieldError {
  field: string;
  message: string;
}

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    public status: number,
    public messageKey: string,
    public details?: FieldError[],
  ) {
    super(messageKey);
  }
}

export const notFound = (key = 'errors.common.notFound') => new AppError('NOT_FOUND', 404, key);
export const forbidden = (key = 'errors.common.forbidden') => new AppError('FORBIDDEN', 403, key);
export const unauthenticated = (key = 'errors.auth.unauthenticated') => new AppError('UNAUTHENTICATED', 401, key);
export const conflict = (key: string) => new AppError('CONFLICT', 409, key);
export const badRequest = (key: string, details?: FieldError[]) => new AppError('VALIDATION_ERROR', 400, key, details);
export const fieldError = (field: string, key: string) => badRequest(key, [{ field, message: key }]);
