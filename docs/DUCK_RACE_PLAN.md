# Duck Race Party — implementation plan

Updated 2026-11-18. This is an unreleased module, not a public deployment report.
MusicBox is exempt from PMP under the user's explicit instruction.

## Existing application

React/Vite, Three.js/React Three Fiber, Hono and Supabase remain the stack. Authentication,
room membership, coin_wallets/coin_ledger and music queue services are reused. No new
account system, currency, continuously running game server or paid service is added.
Original branch baseline: 7fd0210. Preserve all unrelated and uncommitted work.

## Implemented work

1. Version-1 TypeScript engine: SHA-256 commitment, canonical locked inputs, unbiased
   shuffle, independent finish timing and trajectories, published segments, replay proof.
2. Additive SQL migration: private seeds/plans/receipts, room authorization, CAS, one-time
   settlement, shared-wallet ledger, atomic song priority, tournaments and private Broadcast.
3. Hono service and client transport: feature flags, rate limits, strict commands, durable
   retry receipts, stale snapshot protection, server clock, reconnect and periodic snapshots.
4. Dedicated Game Hub/lobby/race routes: player/song/custom races, QR invitations, skins,
   ready states, custom CSV/presets, host controls, standings, round history and owner-controlled
   room policy for Song Race permissions/limits/default reward behavior.
5. Original procedural art: three rivers, twelve multipart characters, animated shader
   water, batched wakes/splashes, sphere LOD, eight camera modes, podium/trophy/fireworks.
6. Playback and presentation: replay/seek/slow motion, configurable Photo Finish threshold,
   collapsible rankings, independent game SFX, reduced motion and automatic 2D fallback.
7. Tests and profiling: engine/API/client, disposable PostgreSQL, desktop/mobile browsers,
   screenshots, 30-duck performance samples, quality comparisons and remount resource checks.

See DUCK_RACE_TESTING.md for exact validation results; code being present is not proof of
hosted integration or final visual acceptance.

## Remaining release gates

- Review rendered visuals and UX with the user; reference-level polish is not independently
  established. Do not claim an unmeasured 60 FPS result.
- On an authorized staging backend, exercise real Supabase authentication, private Realtime,
  reconnect/token rotation, scheduled cleanup and simultaneous devices. Local PostgreSQL
  tests do not run the hosted Realtime server.
- Obtain Duck Race release authorization before any hosted migration, public switch, commit
  or push. Previous Ludo publication is not authorization for this new module.
- After staging approval, build a release candidate, verify client secrets and health,
  then switch the public process using the existing deployment workflow and retain rollback.

## Local validation and build

Use local Node binaries if pnpm is not on PATH:

```powershell
node node_modules/eslint/bin/eslint.js . --max-warnings 0
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run
node scripts/test-duck-race.mjs
node scripts/test-duck-browser.mjs
node scripts/build-duck-race.mjs
```

Run database/browser suites sequentially: PostgreSQL 55442, test bridge 55443, browser Vite 5175. Their databases are disposable; authentication/music/WebSocket scaffolding is a test
fixture. Never point these tests at the hosted database. The browser runner starts and stops
its own services and returns a failing exit code on test failure.

`build:duck` writes `.roomtune/duck-build`, restores the Wrangler deploy pointer and checks
fingerprints of `dist`, `.roomtune/game-build` and `.roomtune/bau-build`. Do not run ordinary
`build` or `deploy` during isolated development. Serve **only** the `client` subdirectory;
Worker build directories can contain copied `.dev.vars` secrets.

Flags default off: `VITE_ENABLE_DUCK_RACE` (compile time) and `ENABLE_DUCK_RACE` (Worker).
Ports 5180/5181 are existing trials using hosted Supabase; they are not isolated test DBs.
Public port 4173 and the Cloudflare tunnel remain untouched.
