import { readFile, writeFile, rm, readdir, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
await mkdir('.roomtune', { recursive: true });
const pointer = '.wrangler/deploy/config.json';
const previous = await readFile(pointer).catch((e) => {
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
const before = {
  public: await fingerprint('dist'),
  trial: await fingerprint('.roomtune/game-build'),
  bau: await fingerprint('.roomtune/bau-build'),
};
let buildError;
try {
  for (const args of [
    ['node_modules/typescript/bin/tsc', '--noEmit'],
    [
      'node_modules/vite/bin/vite.js',
      'build',
      '--mode',
      'duck-local',
      '--outDir',
      '.roomtune/duck-build',
    ],
    ['scripts/check-client-secrets.mjs', '.roomtune/duck-build/client'],
  ]) {
    const result = spawnSync(process.execPath, args, {
      stdio: 'inherit',
      windowsHide: true,
      env: {
        ...process.env,
        VITE_ENABLE_LUDO: 'true',
        VITE_ENABLE_WHEEL: 'true',
        VITE_ENABLE_BAU_CUA: 'true',
        VITE_ENABLE_DUCK_RACE: 'true',
        WRANGLER_LOG_PATH: resolve('.roomtune/duck-build.log'),
      },
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error('Isolated Duck Race build failed: ' + result.status);
  }
} catch (error) {
  buildError = error;
} finally {
  if (previous) await writeFile(pointer, previous);
  else await rm(pointer, { force: true });
}
if (
  JSON.stringify(before) !==
  JSON.stringify({
    public: await fingerprint('dist'),
    trial: await fingerprint('.roomtune/game-build'),
    bau: await fingerprint('.roomtune/bau-build'),
  })
)
  throw new Error('Public or trial artifacts changed unexpectedly');
if (buildError) throw buildError;
console.log(
  'PASS isolated Duck Race production build; public/trial files and deploy pointer unchanged. No runtime restarted. Serve client artifacts only.',
);
