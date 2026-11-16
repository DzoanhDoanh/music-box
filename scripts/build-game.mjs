import { readFile, writeFile, rm, readdir, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';

await mkdir('.roomtune', { recursive: true });
const deployment = '.wrangler/deploy/config.json';
const previous = await readFile(deployment).catch((e) => {
  if (e.code !== 'ENOENT') throw e;
  return null;
});
async function fingerprint(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch((e) => {
    if (e.code !== 'ENOENT') throw e;
    return [];
  });
  const output = {};
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(output, await fingerprint(path));
    else
      output[path] = createHash('sha256')
        .update(await readFile(path))
        .digest('hex');
  }
  return output;
}
const before = await fingerprint('dist');
try {
  for (const args of [
    ['node_modules/typescript/bin/tsc', '--noEmit'],
    [
      'node_modules/vite/bin/vite.js',
      'build',
      '--mode',
      'game-local',
      '--outDir',
      '.roomtune/game-build',
    ],
  ]) {
    const result = spawnSync(process.execPath, args, {
      stdio: 'inherit',
      windowsHide: true,
      env: {
        ...process.env,
        VITE_ENABLE_LUDO: 'true',
        WRANGLER_LOG_PATH: resolve('.roomtune/game-build.log'),
      },
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error('Local game build failed: ' + result.status);
  }
} finally {
  if (previous) await writeFile(deployment, previous);
  else await rm(deployment, { force: true });
}
if (JSON.stringify(before) !== JSON.stringify(await fingerprint('dist')))
  throw new Error('Public dist changed unexpectedly');
console.log(
  'PASS isolated game build; public dist and deployment pointer preserved. No preview restart or deployment.',
);
