// The room's AI, shared by every AI feature in a room (Tarot readings today).
// A room owner may bring their own OpenAI-compatible API (base URL + key + model); the key is
// sealed with AES-GCM before it is stored, bound to the room it belongs to. Without one, or when
// it fails, features fall back to Gemini (Google AI Studio) with the server's key.
import { AppError } from '../../shared/domain';
import type { RoomStore } from '../ports';
import type { Env } from '../repository';

export interface RoomAiConfig {
  baseUrl: string;
  model: string;
  key: string;
}

// ---------------------------------------------------------------- base URL

const PRIVATE_SUFFIXES = ['.localhost', '.local', '.internal', '.intranet', '.lan', '.home.arpa'];

function privateIpv4(host: string) {
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
    return false;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

/**
 * Normalise a base URL the owner typed and refuse anything that could point the server at
 * itself or the owner's local network: https only, a public host name, no credentials.
 */
export function checkBaseUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new AppError('ROOM_AI_URL', 400);
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    !host.includes('.') ||
    host.startsWith('[') ||
    host === 'localhost' ||
    PRIVATE_SUFFIXES.some((s) => host.endsWith(s)) ||
    privateIpv4(host)
  )
    throw new AppError('ROOM_AI_URL', 400);
  const path = url.pathname.replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
  return `${url.origin}${path}`;
}

// ---------------------------------------------------------------- key sealing

const encoder = new TextEncoder();
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function sealingKey(secret: string) {
  if (!secret) throw new AppError('CONFIG_REQUIRED', 503);
  const base = await crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      // Named before the setting moved from Tarot to the room; keys sealed then must still open.
      salt: encoder.encode('roomtune:tarot-ai'),
      info: encoder.encode('api-key:v1'),
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypt an API key for one room; the room id is authenticated so a sealed key cannot move. */
export async function sealKey(secret: string, room: string, key: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(room) },
    await sealingKey(secret),
    encoder.encode(key),
  );
  const out = new Uint8Array(12 + sealed.byteLength);
  out.set(iv);
  out.set(new Uint8Array(sealed), 12);
  return toBase64(out);
}

export async function openKey(secret: string, room: string, sealed: string) {
  const bytes = fromBase64(sealed);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: encoder.encode(room) },
    await sealingKey(secret),
    bytes.slice(12),
  );
  return new TextDecoder().decode(plain);
}

/** The last characters of a key, enough for the owner to recognise it. */
export const keyHint = (key: string) => key.slice(-4);

// ---------------------------------------------------------------- calling the API

export class RoomAiError extends Error {
  constructor(
    message: string,
    public status: number | null,
    public detail = '',
  ) {
    super(message);
  }
}

function providerMessage(body: string) {
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: unknown } | string;
      message?: unknown;
    };
    const message =
      typeof parsed.error === 'string'
        ? parsed.error
        : typeof parsed.error?.message === 'string'
          ? parsed.error.message
          : typeof parsed.message === 'string'
            ? parsed.message
            : '';
    return message.replace(/\s+/g, ' ').slice(0, 160);
  } catch {
    return '';
  }
}

/** One chat completion. Never follows redirects, so the checked base URL is the only host called. */
export async function askRoomAi(
  ai: RoomAiConfig,
  system: string,
  prompt: string,
  options: { maxTokens: number; timeoutMs: number },
  fetcher: typeof fetch = fetch,
) {
  let response: Response;
  try {
    response = await fetcher(`${ai.baseUrl}/chat/completions`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.key}` },
      body: JSON.stringify({
        model: ai.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        temperature: 0.9,
        max_tokens: options.maxTokens,
      }),
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    throw new RoomAiError(timedOut ? 'timeout' : 'network', null);
  }
  if (response.status >= 300 && response.status < 400)
    throw new RoomAiError('redirect', response.status);
  if (!response.ok)
    throw new RoomAiError('status', response.status, providerMessage(await response.text()));
  let body: { choices?: { message?: { content?: unknown } }[] };
  try {
    body = await response.json();
  } catch {
    throw new RoomAiError('format', response.status);
  }
  const content = body.choices?.[0]?.message?.content;
  const text = (
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content
            .map((p: { text?: unknown }) => (typeof p?.text === 'string' ? p.text : ''))
            .join('')
        : ''
  )
    // Reasoning models behind some proxies inline their thinking.
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/\r\n?/g, '\n')
    .trim();
  if (!text) throw new RoomAiError('empty', response.status);
  return text;
}

/** A short Vietnamese explanation of why a connection test failed. */
export function describeFailure(error: unknown) {
  if (!(error instanceof RoomAiError)) return 'Không gọi được API.';
  const detail = error.detail ? ` (${error.detail})` : '';
  switch (error.message) {
    case 'timeout':
      return 'API không trả lời kịp (quá 30 giây).';
    case 'network':
      return 'Không kết nối được tới Base URL. Kiểm tra lại địa chỉ.';
    case 'redirect':
      return 'Base URL chuyển hướng sang địa chỉ khác. Hãy nhập địa chỉ cuối cùng.';
    case 'format':
    case 'empty':
      return 'API có trả lời nhưng không đúng kiểu OpenAI (chat/completions).';
    default:
      if (error.status === 401 || error.status === 403)
        return `API key không hợp lệ hoặc không có quyền${detail}.`;
      if (error.status === 404) return `Sai Base URL hoặc model không tồn tại${detail}.`;
      if (error.status === 429) return `Hết hạn mức hoặc bị giới hạn tốc độ${detail}.`;
      return `API báo lỗi ${error.status}${detail}.`;
  }
}

// ---------------------------------------------------------------- loading and writing

/** The room's own AI, decrypted, when its owner switched it on; null otherwise. */
export async function loadRoomAi(
  store: RoomStore,
  env: Env,
  room: string,
): Promise<RoomAiConfig | null> {
  const saved = await store.call<{
    enabled: boolean;
    base_url: string;
    model: string;
    key_cipher: string;
  } | null>('room_ai_secret', { p_room: room });
  if (!saved?.enabled || !saved.base_url || !saved.model) return null;
  try {
    return {
      baseUrl: saved.base_url,
      model: saved.model,
      key: await openKey(env.SUPABASE_SECRET_KEY, room, saved.key_cipher),
    };
  } catch {
    console.error('room ai key could not be opened');
    return null;
  }
}

/** Whether a room has any AI to use: its own, or the server's Gemini key. */
export const hasAi = (env: Env, room: RoomAiConfig | null) => Boolean(room || env.GEMINI_API_KEY);

// Google retires model versions for new keys, so default to the rolling aliases. Flash-Lite answers
// in seconds with a large free quota; the bigger Flash only steps in when it is busy (429/5xx/timeout).
const GEMINI_DEFAULT = 'gemini-flash-lite-latest';
const GEMINI_FALLBACK = 'gemini-flash-latest';
const retryable = (status: number) => status === 429 || status >= 500;

async function askGemini(
  env: Env,
  model: string,
  task: AiTask,
  fetcher: typeof fetch,
): Promise<string> {
  const response = await fetcher(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY ?? '' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: task.system }] },
        contents: [{ role: 'user', parts: [{ text: task.prompt }] }],
        // Room for the model's own thinking plus the answer.
        generationConfig: { temperature: 0.9, maxOutputTokens: 8192 },
      }),
      signal: AbortSignal.timeout(40_000),
    },
  );
  if (!response.ok)
    throw Object.assign(
      new Error(`Gemini ${model} ${response.status}: ${(await response.text()).slice(0, 200)}`),
      { retry: retryable(response.status) },
    );
  const body = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  };
  const text = (body.candidates?.[0]?.content?.parts ?? [])
    .filter((p) => !p.thought)
    .map((p) => p.text ?? '')
    .join('')
    .replace(/\r\n?/g, '\n')
    .trim();
  if (text.length < task.minLength)
    throw Object.assign(new Error(`Gemini ${model} returned too little`), { retry: true });
  return text;
}

/** One piece of text an AI feature needs written. */
export interface AiTask {
  system: string;
  prompt: string;
  /** Upper bound on the answer, in tokens, for the room's own API. */
  maxTokens: number;
  /** Shorter answers count as failures and move on to the next AI. */
  minLength: number;
}

/**
 * Write text for any AI feature in a room: the room's own AI first, then Gemini with the
 * server's key. Throws when every option fails or returns too little.
 */
export async function writeWithAi(
  env: Env,
  room: RoomAiConfig | null,
  task: AiTask,
  fetcher: typeof fetch = fetch,
) {
  let last: unknown = new Error('no AI configured');
  if (room) {
    try {
      const text = await askRoomAi(
        room,
        task.system,
        task.prompt,
        { maxTokens: task.maxTokens, timeoutMs: 60_000 },
        fetcher,
      );
      if (text.length >= task.minLength) return text;
      last = new Error('room AI returned too little');
    } catch (error) {
      last = error;
    }
    console.error('room ai failed', last instanceof Error ? last.message : last);
  }
  if (!env.GEMINI_API_KEY) throw last;
  const models = [...new Set([env.GEMINI_MODEL?.trim() || GEMINI_DEFAULT, GEMINI_FALLBACK])];
  for (const model of models) {
    try {
      return await askGemini(env, model, task, fetcher);
    } catch (error) {
      last = error;
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      if (!timedOut && !(error as { retry?: boolean }).retry) break;
    }
  }
  throw last;
}
