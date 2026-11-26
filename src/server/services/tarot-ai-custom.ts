// A room's own AI for Tarot readings: any OpenAI-compatible API (base URL + key + model).
// The key is sealed with AES-GCM before it is stored, bound to the room it belongs to.
import { AppError } from '../../shared/domain';

export interface CustomAi {
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
    throw new AppError('TAROT_AI_URL', 400);
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
    throw new AppError('TAROT_AI_URL', 400);
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

export class CustomAiError extends Error {
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
export async function askCustomAi(
  ai: CustomAi,
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
    throw new CustomAiError(timedOut ? 'timeout' : 'network', null);
  }
  if (response.status >= 300 && response.status < 400)
    throw new CustomAiError('redirect', response.status);
  if (!response.ok)
    throw new CustomAiError('status', response.status, providerMessage(await response.text()));
  let body: { choices?: { message?: { content?: unknown } }[] };
  try {
    body = await response.json();
  } catch {
    throw new CustomAiError('format', response.status);
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
  if (!text) throw new CustomAiError('empty', response.status);
  return text;
}

/** A short Vietnamese explanation of why a connection test failed. */
export function describeFailure(error: unknown) {
  if (!(error instanceof CustomAiError)) return 'Không gọi được API.';
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
