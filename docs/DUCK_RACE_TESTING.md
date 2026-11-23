# Duck Race validation

Updated 2026-11-19. The original hosted/public acceptance section refers to the 18 November
release; movement-release verification is recorded separately below.

## Movement regression — 19 November

This correction was validated locally, then published with user authorization on 19 November
at 01:35:48 UTC / 08:35:48 Vietnam time.

- `node node_modules/vitest/vitest.mjs run tests/unit/duck-playback.test.ts tests/unit/duck-race.test.ts tests/unit/duck-client.test.tsx tests/integration/duck-race-api.test.ts`:
  4 files / 27 tests passed. Clock monotonicity and 60 FPS movement simulations cover
  30/60/120-second races with HTTP latency cycling between 180 and 1,700 ms. Every duck advances
  on every sampled cruising frame. Separate cases cover outage holding, current-time disclosure,
  replay, overtakes, 2–30 entries, every supported duration and exact committed finish times.
- `node scripts/test-duck-browser.mjs movement.spec.ts --output test-results/duck-movement`:
  desktop 3D and mobile 2D scenarios passed with delayed HTTP responses, forward movement for
  all twelve ducks, actual offline/reconnect and finish proof verification. Final runner state:
  `test-results/duck-movement/.last-run.json` (`passed`, no failed tests). Stage screenshots
  `test-results/duck/movement-desktop.png` and `movement-mobile.png` were inspected.
- Changed-file ESLint, TypeScript and `node scripts/build-duck-race.mjs` passed. The isolated build
  checked 44 client artifacts and preserved public/trial artifacts and the deployment pointer.

The initial browser launch inside the restricted sandbox stalled before test execution and was
stopped. The successful local PostgreSQL/Chromium run used the required process/network access.
The sample preview at 5182 was restarted with the corrected service. The subsequent authorized
publication replaced only the web runtime at 4173; trials 5180/5181/5182 and the tunnel remain.
No schema migration was needed. The jitter regression is simulated latency on one machine,
not an acceptance test on multiple physical networks/devices. Public checks passed all 16
HTTPS route/auth/internal-path cases and verified 379 client assets against the release.
Authenticated public acceptance passed all five groups, including unattended settlement and
exactly-once rewards; cleanup passed and the runner exited 0. Evidence:
`.roomtune/duck-hosted/571dd907-d407-4a39-b0c2-a4d0963ca608/result.json`. See
RELEASE_DUCK_RACE_MOVEMENT_2026-11-19.md for release and recovery details.

## Open the local playground

Run `pnpm duck:preview` (or `node scripts/preview-duck-race.mjs`) and open
<http://127.0.0.1:5182>. This redirects to a sample room with three ready-to-start races,
one per environment and all twelve skins. Open a race and press **Khóa đội hình & xuất phát**.
The ordinary 5181 trial remains the older build. Public release status is recorded below.

This separate preview uses a disposable PostgreSQL instance on loopback port **55444**,
the actual Duck service/RPCs and a clearly labelled sample identity. Authentication and
Realtime transport are local scaffolding; this is not a hosted multiplayer acceptance test.
All songs/coins are sample data. It reads no hosted environment file, serves no Worker build,
blocks environment/runtime files and does not replace builds or listeners on 4173/5180/5181.
Stop the foreground command with Ctrl+C; restarting creates a new sample room.

Manual-preview smoke coverage: ordinary browser navigation, three sample lobbies, a separate
30-second 3D race through finish/proof verification, mobile width and denied sensitive paths.
Screenshots are in `test-results/duck-preview/`. Duck loads the game layout CSS independently
of the Ludo feature flag, so the preview retains the dedicated full-width game page.

## Commands and evidence

Run from the repository root. Node commands below are equivalent to package scripts where
available; `pnpm` 11.25.0 is available in the current runtime. Do not use the ordinary production
`build`/`deploy` scripts during isolated development.

| Check                     | Command                                                                                                                                   | Recorded result                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Lint                      | `node node_modules/eslint/bin/eslint.js . --max-warnings 0`                                                                               | Passed after policy additions                                                                                |
| TypeScript                | `node node_modules/typescript/bin/tsc --noEmit`                                                                                           | Passed after policy additions                                                                                |
| Full unit/API suite       | `node node_modules/vitest/vitest.mjs run`                                                                                                 | 51 files / 496 tests passed after policy; affected Duck suite 3 files / 21 tests passed again before release |
| Real PostgreSQL           | `node scripts/test-duck-race.mjs`                                                                                                         | 10 groups passed, exit 0                                                                                     |
| Duck browser suite        | `node scripts/test-duck-browser.mjs`                                                                                                      | 24 passed / 4 intentional mobile skips, exit 0                                                               |
| Policy browser flow       | `node scripts/test-duck-browser.mjs policy.spec.ts --output test-results/duck-policy`                                                     | 2 passed, exit 0                                                                                             |
| Public/access regression  | `node node_modules/@playwright/test/cli.js test --config playwright.config.ts --workers=2`                                                | 14 passed, exit 0                                                                                            |
| Music/session regression  | `node node_modules/@playwright/test/cli.js test --config playwright.room.config.ts --workers=2`                                           | 94 passed / 2 intentional mobile skips, exit 0                                                               |
| Ludo regression           | `node node_modules/@playwright/test/cli.js test --config playwright.game.config.ts game.spec.ts`                                          | 13 passed / 1 intentional mobile skip, exit 0                                                                |
| Isolated production build | `node scripts/build-duck-race.mjs`                                                                                                        | Passed after policy, standalone game layout and resolution changes; 44 client artifacts checked              |
| Resolution/GPU regression | `node scripts/test-duck-browser.mjs polish.spec.ts --grep "quality presets" --project desktop --output test-results/duck-release-quality` | 1 passed; verifies default DPR 1.5 and explicit DPR 2 even with LOW effects                                  |

The Ludo skip covers the four-browser full-game flow, which runs on desktop. Duck skips cover
desktop GPU/profile checks on mobile; mobile participation and 2D fallback have separate tests.
The initial public test launch timed out in workerd before executing tests. Browser suites now
use the frontend-only Vite fixture. An initial room regression run had 19 failures, mostly
associated with inherited Bầu Cua flags and missing fixture data; it also exposed a root
error-boundary router-context issue. One mobile timeout was not independently attributed.
Flags are now explicit, cache directories are per mode and the root fallback is inside the
router. The clean rerun above supersedes the failed run. No tests were disabled to conceal failures.

## What the tests cover

- Engine: independent hash vectors, deterministic ranking/replay, unbiased bounded sampling,
  statistical bias smoke, monotone position/finish invariants for 2–30 entries, independent
  skin/graphics inputs, tournaments, rewards and bounded CSV imports.
- API/client: auth/feature gates, malformed/forged commands, no future result disclosure,
  stale snapshot/clock rejection, persistent same-key retry across remount, actor isolation,
  blocked storage, published-position holding and unavailable audio handling.
- PostgreSQL: all migrations on a disposable instance; concurrent start/finalization, single
  wallet settlement, private table/RPC/channel access, removed members, immutable results,
  one-time queue priority preserving PLAYING/losing entries, unique next rounds, team standings,
  elimination lockout, preset/reaction retry identity and no early round-winner disclosure.
- New room-policy group: owner-only versioned saves, three concurrent identical retries,
  stale/conflicting edits, member song creation, cap/priority/mode-bypass rejection, disabled
  lobby starts, already-committed race continuity, scheduled SQL tick and approval after finish.
- Browser: independent clients, disconnect/reconnect, custom race/proof/replay, elimination,
  Song Race approval, all skins, preset confirmation, reduced motion/audio disposal, camera
  controls/free orbit, graphics/context fallback and unchanged host/listener YouTube iframe.
- Existing music tests exercise search, recommendations, queue order/votes, room presence/chat,
  permission changes, session expiry/revocation and player continuity. These use fixtures.

The Duck browser bridge calls the actual Duck service and SQL RPCs on PostgreSQL **55442**,
via a loopback bridge **55443** and Vite **5175**. Auth/music/WebSocket scaffolding is simulated.
It is **not proof of live Supabase Auth or Realtime delivery**. Runners stop their DB/bridge and
explicitly exit with the test exit code to avoid embedded-postgres masking failed runs.

## Visual and GPU measurements

Screenshots: `test-results/duck/world-{SUNNY,TROPICAL,FESTIVAL}.png`, `skins/*.png`,
`lobby-{desktop,mobile}.png`, `camera-*.png`, `photo-finish.png`, `festival-podium.png`,
`quality-{HIGH,MEDIUM,LOW}.png`, and results/race views. These were rendered and inspected;
the finish camera/gate occlusion, podium ordering and background bridge height were corrected
and recaptured. They are review artifacts, not approved pixel-golden baselines.

Full Chromium/new-headless used **Intel UHD Graphics 770 / D3D11**, viewport **1440×1000**.
The full 30-duck MEDIUM samples across three maps were about **32 FPS**, **27–30 calls**,
**159k–183k triangles**, p95 frame interval **31.9–39.1 ms**. An earlier blank-browser rAF
baseline was **32.18 FPS**; this environment does not establish a 60 FPS acceptance result.
SwiftShader headless-shell previously rendered only 5–7 FPS, so GPU tests use full Chromium.

Latest paused Festival comparison at DPR **1.5**: HIGH **315,642**, MEDIUM **170,818**, LOW
**118,458** triangles, approximately 32 FPS; p95 **39.4–43.3 ms**. Three repeated MEDIUM scene
remounts each reported **19 geometries / 6 textures**. These are bounded scenarios, not a
long-duration leak/soak proof. Raw metrics are attached by the Playwright tests.

## Build and release limits

`build:duck` performs TypeScript/build/client-secret heuristics into `.roomtune/duck-build`,
restores `.wrangler/deploy/config.json` and compares existing public/game/bau build fingerprints.
The previous successful run checked 44 client artifacts; known server-secret markers were not
found. This is a heuristic, not an exhaustive secret audit. Expected warnings: dependency
PURE annotations and large shared application/Three.js chunks; Duck rendering is lazy-loaded.

The user authorized Duck publication on 18 November. A database backup was created and its
archive directory verified, then migrations `202611180002` and `202611180003` were applied.
The candidate was tested at loopback 5183 against hosted Supabase, then stopped after validation.
Public now serves Duck Race at <https://roomtune.dzoanh.me>. No commit/push is included in this
publication request. The older trial ports 5180/5181 remain unchanged.
Tests may generate legacy documentation screenshots; restore those unrelated images after
regression, retaining Duck review artifacts separately.

Hosted acceptance uses `node scripts/test-duck-hosted.mjs --project-ref zhcnyadfkpszgdmesxvi`
with `--base-url http://127.0.0.1:5183` or the configured public HTTPS origin. Run-owned accounts
and rooms are cleaned automatically. Results live in `.roomtune/duck-hosted/<run>/result.json`.

## Hosted and public acceptance

All five hosted acceptance groups passed on both the candidate and the public HTTPS origin:
real Auth/permissions and raw table/RPC protections; private Realtime with outsider denial and
two simultaneous authenticated browser contexts; reactions, token rotation/reconnect, matching
results/proof and exactly-once rewards; unattended database scheduler settlement; and revoked
membership denial. Both successful runs exited 0 and cleaned their run-owned accounts/rooms.

- Candidate evidence: `.roomtune/duck-hosted/d448ffc0-c950-4015-a9e6-b6fe44af72fe/result.json`.
- Final public evidence: `.roomtune/duck-hosted/362633bb-6aea-4d32-bc6a-db7bf2ed5c9b/result.json`.
- Public HTTPS checks: 16 route/auth/internal-path checks passed, foreign Origin denied, and
  all 345 public assets matched byte-for-byte, including retained old client chunks.

The initial public acceptance attempt exposed a tunnel allowlist that rejected Duck deep links.
That failed run cleaned its temporary data. The route was added and the final public acceptance
above passed through the actual domain. The minute-based `roomtune-duck-settle` database job
completed unattended settlement; this Windows runtime does not receive hosted Workers Cron
Triggers. The temporary candidate listener on 5183 is stopped; sample preview 5182 remains.

Real simultaneous physical devices, user visual acceptance and longer GPU/browser soak remain
outside this automated coverage. No claim
of reference-level visual parity, all-browser certification or 60 FPS. Current graphics do not
include a post-processing pipeline/camera shake; audio uses original synthesis, not an announcer.
