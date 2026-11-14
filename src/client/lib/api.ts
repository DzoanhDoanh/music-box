import { createClient, type Session } from '@supabase/supabase-js';
import { AppError } from '../../shared/domain';
import { authError, isConnectionError } from '../../shared/auth-errors';
import { withRetry } from '../../shared/retry';
const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase = url && key ? createClient(url, key) : null;
let identityVersion = 0;
let observedUser: string | null | undefined;
supabase?.auth.onAuthStateChange((event, session) => {
  const user = session?.user.id ?? null;
  if (event === 'SIGNED_OUT' || (observedUser !== undefined && user !== observedUser))
    identityVersion++;
  observedUser = user;
});
async function readSession() {
  if (!supabase) throw new AppError('CONFIG_REQUIRED');
  const { data, error } = await supabase.auth.getSession().catch((error: unknown) => {
    throw authError(error);
  });
  if (error) throw authError(error);
  return data.session;
}
function assertIdentity(
  session: Session | null,
  version: number,
  user?: string,
): asserts session is Session {
  if (!session || version !== identityVersion || (user && session.user.id !== user))
    throw new AppError('UNAUTHORIZED', 401);
}
let refreshing: { version: number; user: string; task: Promise<void> } | undefined;
async function renewSession(rejected: Session, version: number) {
  const user = rejected.user.id;
  if (!refreshing || refreshing.version !== version || refreshing.user !== user) {
    const task = (async () => {
      const current = await readSession();
      assertIdentity(current, version, user);
      // Another request or the SDK may already have rotated this token.
      if (current.access_token !== rejected.access_token) return;
      const result = await supabase!.auth.refreshSession().catch((error: unknown) => {
        throw authError(error);
      });
      if (result.error) throw authError(result.error);
      assertIdentity(result.data.session, version, user);
    })();
    refreshing = { version, user, task };
  }
  const pending = refreshing;
  try {
    await pending.task;
  } finally {
    if (refreshing === pending) refreshing = undefined;
  }
}
export async function ensureSession(captchaToken?: string) {
  if (!supabase) throw new AppError('CONFIG_REQUIRED');
  const session = await readSession();
  if (session) return session;
  const result = await supabase.auth.signInAnonymously({ options: { captchaToken } });
  if (result.error) throw authError(result.error);
  if (!result.data.session) throw new AppError('UNAUTHORIZED', 401);
  return result.data.session;
}
export async function api<T>(
  path: string,
  body?: unknown,
  requestId?: string,
  expectedActor?: string,
): Promise<T> {
  if (!navigator.onLine) throw new AppError('OFFLINE');
  // Only the explicit join flow creates guests. Background reads after logout
  // or an expired session must never silently replace the user's identity.
  const version = identityVersion;
  let user: string | undefined = expectedActor;
  let renewed = false;
  let renewalFailed = false;
  const headers: Record<string, string> = {};
  if (body) {
    headers['Content-Type'] = 'application/json';
    headers['Idempotency-Key'] = requestId ?? crypto.randomUUID();
  }
  // Serialize and allocate the receipt key once, outside the retry loop. Only
  // mutations backed by durable receipts may replay after an ambiguous timeout.
  const payload = body ? JSON.stringify(body) : undefined;
  const replayable =
    !body ||
    path === '/rooms' ||
    path === '/library' ||
    /^\/rooms\/[\w-]+\/(commands|chat)$/.test(path);
  return withRetry(
    async () => {
      if (!navigator.onLine) throw new AppError('OFFLINE');
      for (;;) {
        const session = await readSession();
        assertIdentity(session, version, user);
        user = session.user.id;
        let response: Response;
        try {
          response = await fetch(`/api/v1${path}`, {
            method: body ? 'POST' : 'GET',
            headers: { ...headers, Authorization: `Bearer ${session.access_token}` },
            body: payload,
            signal: AbortSignal.timeout(15000),
          });
        } catch {
          throw new AppError('BACKEND_UNAVAILABLE', 503);
        }
        const data = await response.json().catch(() => null);
        assertIdentity(session, version, user);
        // The server rejects authentication before any business mutation. A definite
        // 401 may be retried once, even for a non-receipted action; ambiguous failures may not.
        if (response.status === 401 && data?.error?.code === 'UNAUTHORIZED' && !renewed) {
          renewed = true;
          try {
            await renewSession(session, version);
          } catch (error) {
            renewalFailed = true;
            throw error;
          }
          continue;
        }
        if (!response.ok)
          throw new AppError(data?.error?.code ?? 'BACKEND_UNAVAILABLE', response.status);
        if (data === null) throw new AppError('BACKEND_UNAVAILABLE', 503);
        return data as T;
      }
    },
    (error) =>
      replayable &&
      !renewalFailed &&
      isConnectionError(error) &&
      error instanceof AppError &&
      error.code !== 'OFFLINE',
  );
}
