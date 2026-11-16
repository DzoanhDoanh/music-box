import { z } from 'zod';
import { createGameSchema, gameCommandSchema } from '../../shared/game/contracts';
import { AppError } from '../../shared/domain';

const receiptSchema = z.object({ key: z.uuid(), body: z.unknown() }).strict();
export type GameRequest<T> = { key: string; body: T };
export function gameOutboxKey(room: string, actor: string, game: string | null) {
  return `roomtune:ludo:pending:v1:${actor}:${room}:${game ?? 'create'}`;
}
/** Per-tab storage avoids competing tabs overwriting a pending roll. Contains no credentials. */
export function readGameRequest<T>(scope: string, create = false): GameRequest<T> | null {
  try {
    const raw = sessionStorage.getItem(scope);
    if (!raw) return null;
    const receipt = receiptSchema.parse(JSON.parse(raw));
    const body = (create ? createGameSchema : gameCommandSchema).parse(receipt.body);
    return { key: receipt.key, body: body as T };
  } catch {
    return null;
  }
}
export function saveGameRequest<T>(scope: string, request: GameRequest<T>) {
  // Persist BEFORE sending. If storage is blocked, no mutation leaves the browser.
  sessionStorage.setItem(scope, JSON.stringify(request));
}
export function clearGameRequest(scope: string, key: string) {
  try {
    const current = JSON.parse(sessionStorage.getItem(scope) ?? 'null');
    if (current?.key === key) sessionStorage.removeItem(scope);
  } catch {
    /* A later retry still has the same durable server receipt. */
  }
}
export function uncertainGameRequest(error: unknown) {
  return (
    !(error instanceof AppError) ||
    error.status >= 500 ||
    ['OFFLINE', 'UNAUTHORIZED'].includes(error.code)
  );
}
