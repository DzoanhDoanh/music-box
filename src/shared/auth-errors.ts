import { AppError } from './domain';

/** Auth outages must not be reported as a revoked or missing login. */
export function authError(error: unknown): AppError {
  const value = error as { status?: number; name?: string } | null;
  return value?.name === 'AuthSessionMissingError' ||
    (value?.status !== undefined && [400, 401, 403, 422].includes(value.status))
    ? new AppError('UNAUTHORIZED', 401)
    : new AppError('BACKEND_UNAVAILABLE', 503);
}

export function isConnectionError(error: unknown): boolean {
  return (
    error instanceof AppError &&
    (error.code === 'OFFLINE' ||
      (error.code === 'BACKEND_UNAVAILABLE' && [502, 503, 504].includes(error.status)))
  );
}
