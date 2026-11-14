import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

// Read-only checks. Never print credentials or raw upstream error bodies.
let failed = false;
function report(ok, label, detail) {
  failed ||= !ok;
  console.log(`${ok ? 'PASS' : 'WAIT'} ${label}: ${detail}`);
}
async function request(url, key) {
  try {
    const response = await fetch(url, {
      headers: key ? { apikey: key } : {},
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json().catch(() => null);
    return { status: response.status, data };
  } catch (error) {
    return { status: 0, failure: error.cause?.code ?? error.name };
  }
}
try {
  const server = parseEnv(await readFile(new URL('../.dev.vars', import.meta.url), 'utf8'));
  const client = parseEnv(await readFile(new URL('../.env', import.meta.url), 'utf8'));
  const required = [
    'SUPABASE_URL',
    'SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_SECRET_KEY',
    'YOUTUBE_API_KEY',
  ];
  const missing = required.filter((name) => !server[name]);
  if (missing.length) throw new Error(`Missing variables: ${missing.join(', ')}`);
  report(
    client.VITE_SUPABASE_URL === server.SUPABASE_URL &&
      client.VITE_SUPABASE_PUBLISHABLE_KEY === server.SUPABASE_PUBLISHABLE_KEY,
    'Client/server configuration',
    'URL and publishable key must match',
  );
  const auth = await request(
    `${server.SUPABASE_URL}/auth/v1/settings`,
    server.SUPABASE_PUBLISHABLE_KEY,
  );
  report(
    auth.status === 200,
    'Supabase Auth',
    `HTTP ${auth.status}${auth.failure ? ` (${auth.failure})` : ''}`,
  );
  report(
    auth.data?.external?.anonymous_users === true,
    'Anonymous sign-ins',
    auth.data?.external?.anonymous_users === true ? 'enabled' : 'not enabled or unreachable',
  );
  const schema = await request(
    `${server.SUPABASE_URL}/rest/v1/rooms?select=id&limit=0`,
    server.SUPABASE_SECRET_KEY,
  );
  report(
    schema.status === 200,
    'ROOMTUNE schema',
    schema.status === 200
      ? 'rooms table is accessible'
      : `HTTP ${schema.status}; apply migrations if missing`,
  );
  const videoUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
  videoUrl.search = new URLSearchParams({
    part: 'status',
    id: 'jNQXAC9IVRw',
    key: server.YOUTUBE_API_KEY,
  }).toString();
  const youtube = await request(videoUrl);
  report(
    youtube.status === 200 && youtube.data?.items?.length === 1,
    'YouTube Data API',
    `HTTP ${youtube.status}`,
  );
  console.log(
    'Read-only connectivity checks; this does not verify playback, Realtime, or deployment.',
  );
  process.exitCode = failed ? 1 : 0;
} catch (error) {
  console.error(
    error.code === 'ENOENT'
      ? 'Create .env and .dev.vars from the example files first.'
      : error.message?.startsWith('Missing variables:')
        ? error.message
        : 'Unable to read service configuration.',
  );
  process.exitCode = 1;
}
