import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

// Separate local runtime; never update dist, shared secrets, or Wrangler's deployment pointer.
const root = resolve('.roomtune/game-trial');
const source = parseEnv(await readFile('.dev.vars', 'utf8'));
const client = parseEnv(await readFile('.env', 'utf8'));
for (const key of ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY'])
  if (!source[key]) throw new Error(`Missing ${key} in .dev.vars`);
if (
  source.SUPABASE_URL !== client.VITE_SUPABASE_URL ||
  source.SUPABASE_PUBLISHABLE_KEY !== client.VITE_SUPABASE_PUBLISHABLE_KEY
)
  throw new Error('Client and server Supabase configuration differ.');
await readFile('.roomtune/game-build/roomtune/index.js');
await readFile('.roomtune/game-build/client/index.html');
const build = JSON.parse(await readFile('.roomtune/game-build/roomtune/wrangler.json', 'utf8'));
await mkdir(root, { recursive: true });
const config = {
  name: 'roomtune-private-game-trial',
  main: '../game-build/roomtune/index.js',
  compatibility_date: build.compatibility_date,
  compatibility_flags: build.compatibility_flags,
  no_bundle: true,
  rules: [{ type: 'ESModule', globs: ['**/*.js', '**/*.mjs'] }],
  assets: {
    directory: '../game-build/client',
    not_found_handling: 'single-page-application',
    run_worker_first: ['/api/*'],
  },
  dev: { ip: '127.0.0.1', port: 5180, local_protocol: 'http' },
};
await writeFile(`${root}/wrangler.json`, JSON.stringify(config, null, 2));
const vars = {
  ...source,
  ENABLE_LUDO: 'true',
  APP_BASE_URL: 'http://127.0.0.1:5180',
};
await writeFile(
  `${root}/.dev.vars`,
  Object.entries(vars)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join('\n') + '\n',
);
console.log(
  'Private trial prepared: loopback only, hosted persistence, game enabled, no public changes.',
);
