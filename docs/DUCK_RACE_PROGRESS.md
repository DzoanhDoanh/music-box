# Duck Race progress

Updated 2026-11-19. Duck Race was published on 18 November at **15:40:59 UTC / 22:40:59 Vietnam time**.
Branch `codex/voice-lucky-wheel`, original baseline `7fd0210`. MusicBox is exempt from PMP.
All Duck changes remain uncommitted. The 18 November release authorized publication, not Git commit/push.
Public now serves Duck Race. Existing trials 5180/5181 remain unchanged. The existing ROOMTUNE
tunnel now allows Duck deep links; its connector was replaced after the new connection was ready.
Local sample preview stays at 5182; hosted candidate acceptance used 5183, now stopped.

## Movement correction — published 19 November

The jitter reproduction showed 16 clock rewinds and 5.6 seconds with the whole field stopped
over approximately 45 seconds of observed play; some original motion segments ran at 27% of
nominal pace. The client now slews timing corrections, while live responses include the position
at the current DB timestamp. New plans blend steady cruising with randomized overtakes. Saved
plans, independent rank/finish streams and reward outcomes are unchanged. Swimming animation
uses a continuous phase, and real data starvation shows an explicit waiting indicator.

Validation: 27 targeted unit/API tests, desktop 3D and mobile 2D browser movement/reconnect/proof
scenarios, lint, TypeScript and isolated production build passed. The sample preview at 5182
was restarted with the new service. The user subsequently authorized publication, completed at
**01:35:48 UTC / 08:35:48 Vietnam time on 19 November**. Public port 4173 now serves the correction;
trials 5180/5181/5182 and the tunnel remain running. The temporary candidate on 5183 was stopped.
All 16 HTTPS route checks, 379 asset comparisons and five authenticated public acceptance groups
passed. Test accounts/rooms were cleaned successfully. See
RELEASE_DUCK_RACE_MOVEMENT_2026-11-19.md for post-publication acceptance and recovery.

## Implemented

- Repository/reference research and architecture/design/fairness documentation.
- Published v1 engine: committed seed, canonical locked inputs, rejection-sampled ranks,
  separate motion/finish streams, monotone movement/overtakes and exact variable finish gaps.
- Additive migration/service: private seeds/plans/receipts, room authorization, version checks,
  immutable results, transactional shared coin-wallet rewards and atomic song queue priority.
- PLAYER/SONG/CUSTOM modes; ready/skin selection, CSV/numbered entries, presets, QR invitations,
  private notifications, reactions, snapshots and actor-scoped durable command retry.
- Four tournament types, linked round history, champion/tie handling, rematch, replay/seek,
  configurable Photo Finish and browser fairness verification/export.
- Three original procedural 3D worlds, twelve animated skins, shader water, instanced scenery,
  duck batching/LOD, pooled wakes, eight cameras, podium/trophy/confetti/Festival fireworks.
- Local quality/resolution/shadow/particle settings, reduced motion, automatic quality reduction,
  2D fallback and gesture-unlocked independent Web Audio. Existing music players stay mounted.
- Owner-controlled room Song Race policy: enable/disable, 2–30 entry cap, member creation option,
  default priority behavior, CAS updates and idempotency. Policy changes preserve started races.
  Song lobby/results display the nominator as well as the song.
- Regression infrastructure: browser fixtures no longer require workerd, use per-mode caches,
  and explicitly disable unrelated game flags for music-only tests. Root error fallback now
  remains inside the router, avoiding a second exception while showing recovery navigation.
- Standalone game layout loads with Duck even without Ludo. Desktop render resolution defaults
  to 150%, 200% is available, and automatic quality reduction no longer chooses 75% rendering.
- Hosted migrations applied after backup. Database job `roomtune-duck-settle` runs each minute
  to finalize unattended races in the current Windows/tunnel hosting model.

## Validation

See [DUCK_RACE_TESTING.md](DUCK_RACE_TESTING.md) for exact commands, counts and limitations.
Engine/API/client tests, real disposable PostgreSQL tests, desktop/mobile browser tests,
rendered screenshot inspection and GPU profiling have been performed. Latest policy database
run passed 10 groups; full Duck browser run passed 24 with 4 intentional mobile skips.
Full unit/API: 496 tests; room regression: 94 passed / 2 skips; public: 14 passed;
Ludo: 13 passed / 1 skip. Final build checked 44 client artifacts. Resolution/GPU regression
and affected API checks passed. Hosted candidate and final public acceptance each passed all five groups, including
real Auth, private Realtime, reconnect/token rotation, exactly-once rewards and automatic
database settlement without viewers. Test accounts/rooms were removed.
All 16 public HTTPS route/auth/internal-path checks passed, and all 345 public assets matched
byte-for-byte. Final public evidence:
`.roomtune/duck-hosted/362633bb-6aea-4d32-bc6a-db7bf2ed5c9b/result.json`.

## Release and remaining validation limits

1. Release candidate and rollback: `.roomtune/releases/duck-race-20261118T153414/`.
   Public HTTPS and authenticated post-publication checks are recorded in the release document.
2. Multiple simultaneous physical devices and longer hardware/browser soak remain unverified;
   automated acceptance uses two real authenticated browser contexts on this machine.
3. Continue user visual review. No reference-level parity or 60 FPS
   guarantee. The current implementation has no bloom/post-processing pass, camera-shake
   control or recorded announcer; the graphics/audio documentation describes actual features.
4. Git commit/push remains a separate action; no repository history was changed by publication.

The isolated build lives in `.roomtune/duck-build`. Serve **only** its `client` subdirectory as static files:
Worker build folders can contain copied `.dev.vars`. Never replace `dist`, existing trial
builds, ports 4173/5180/5181 or the public tunnel during subsequent feature development.
