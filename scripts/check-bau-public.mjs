import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const base = 'https://roomtune.dzoanh.me';
const get = (path, options = {}) =>
  fetch(base + path, { signal: AbortSignal.timeout(20000), ...options });
const room = '00000000-0000-4000-8000-000000000001';
const table = '00000000-0000-4000-8000-000000000002';
for (const [path, expected] of [
  ['/', 200],
  ['/join', 200],
  ['/login', 200],
  ['/api/v1/system/health', 200],
  [`/room/${room}/games`, 200],
  [`/room/${room}/games/${table}`, 200],
  [`/room/${room}/games/bau-cua`, 200],
  [`/room/${room}/games/bau-cua/${table}`, 200],
  ['/api/v1/rooms', 401],
  [`/api/v1/rooms/${room}/bau-cua`, 401],
  ['/.env', 404],
  ['/.dev.vars', 404],
  ['/dist/roomtune/.dev.vars', 404],
  ['/src/server/index.ts', 404],
  ['/__debug', 404],
  ['/cdn-cgi/local/explorer/api/local/workers', 404],
]) {
  const response = await get(path);
  assert.equal(response.status, expected, path);
  if (path === '/') {
    assert.ok(response.headers.get('content-security-policy'));
    assert.match(response.headers.get('permissions-policy') ?? '', /microphone=\(self\)/);
    assert.equal(await response.text(), await readFile('dist/client/index.html', 'utf8'));
  }
  if (path.endsWith('/health')) assert.equal((await response.json()).bauCuaEnabled, true);
}
console.log('PASS 16 HTTPS route, feature flag, authentication and internal-path checks');
const hash = (data) => createHash('sha256').update(data).digest('hex');
const names = await readdir('dist/client/assets');
// Bound concurrency to avoid placing an unnecessary spike on the shared tunnel.
for (let i = 0; i < names.length; i += 4) {
  await Promise.all(
    names.slice(i, i + 4).map(async (name) => {
      const response = await get(`/assets/${name}`);
      assert.equal(response.status, 200, name);
      assert.equal(
        hash(Buffer.from(await response.arrayBuffer())),
        hash(await readFile(`dist/client/assets/${name}`)),
        name,
      );
    }),
  );
}
assert.equal(
  (await get('/api/v1/system/health', { headers: { Origin: 'https://example.invalid' } })).status,
  403,
);
console.log(
  `PASS ${names.length} public assets match the release, including preserved old chunks; foreign Origin denied`,
);
