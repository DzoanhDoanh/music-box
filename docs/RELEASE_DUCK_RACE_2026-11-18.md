# Duck Race Party — public release, 18 November 2026

Published at **15:40:59 UTC / 22:40:59 Vietnam time** to
[ROOMTUNE](https://roomtune.dzoanh.me). Open a room, then **Giải trí → Trò chơi → Duck Race Party**.
The user explicitly authorized this publication after trying the isolated preview.

## Included

Three procedural 3D environments, twelve duck skins, PLAYER/SONG/CUSTOM races, room song
policy, private notifications, committed results, replay/proof verification, tournaments,
transactional coin rewards and song priority. Existing music and games remain available.
Desktop defaults to 150% resolution, with 200% available in **Hình ảnh & âm thanh**. Automatic
quality reduction lowers effects and can reduce resolution to 100%, rather than 75%.

## Validation

- Local: 496 unit/API tests, 10 real PostgreSQL groups, 24 Duck browser cases with four
  intentional mobile GPU skips; 94 music/session cases with two intentional mobile skips;
  14 public/access cases; 13 Ludo cases with one intentional mobile skip.
- Release changes: resolution/camera/GPU case passed; affected Duck tests 21 passed and
  general API tests 27 passed. Lint and TypeScript passed. Isolated production build checked
  44 client artifacts for known secret markers, without modifying the old public artifacts.
- Hosted candidate: five acceptance groups passed with two simultaneous authenticated browser
  contexts, private Broadcast/reactions, forbidden outsider access, revoked membership,
  token rotation/reconnect, matching results/proof and exactly-once reward ledger entries.
  A separate race finished automatically after all viewers closed, through the real database
  scheduler. Run-owned accounts/rooms cleaned successfully.
  Evidence: `.roomtune/duck-hosted/d448ffc0-c950-4015-a9e6-b6fe44af72fe/result.json`.
- Public HTTPS: all 16 route/auth/internal-path checks passed; all 345 public assets matched
  byte-for-byte, including retained chunks from the previous release. Foreign Origin was denied.
- Public authenticated acceptance: all five groups passed after the tunnel route fix, covering
  real Auth, private Realtime, two simultaneous browser identities, reconnect/token rotation,
  matching results/proof, exactly-once rewards, unattended scheduler settlement and revoked
  membership. Run-owned accounts/rooms cleaned successfully; the runner exited 0.
  Evidence: `.roomtune/duck-hosted/362633bb-6aea-4d32-bc6a-db7bf2ed5c9b/result.json`.

## Deployment and recovery

- Candidate: `.roomtune/releases/duck-race-20261118T153414/candidate`.
- Previous public build: sibling `previous`. Previous `.env` and `.dev.vars` are stored in the
  same release directory; these ignored files contain configuration and must never be committed.
- Backup: `backups/before-duck-race-2026-11-18T15-32-22-078Z.dump`, 1,263,312 bytes. The archive
  directory was read successfully; this is not a restore rehearsal.
- Migrations: `202611180002_duck_race.sql`, `202611180003_duck_race_schedule.sql`.
  The latter enables database job `roomtune-duck-settle` every minute, because the Windows/tunnel
  runtime does not receive hosted Workers Cron Triggers. Due reads also settle races.
- Public runtime replaced (PID 119964). The initial HTTPS check caught the old tunnel route
  allowlist rejecting Duck deep links. Added only the Duck route family, validated ingress,
  started connector 80968, then retired verified connector 105572 once the replacement had
  connected. Tunnel identity/credentials and all other tunnels were retained. The failed public
  acceptance run cleaned its temporary data; post-fix evidence is recorded separately.
  Legacy trial ports 5180/5181 and
  isolated sample preview 5182 were preserved. Existing hashed client chunks were retained
  so open tabs can still lazy-load the previous release.
  The temporary hosted acceptance candidate on port 5183 was stopped after validation.
- No active Ludo game or unfinished Bầu Cua round was found immediately before switching.
  Existing user rooms, memberships, queues and game rows were not reset or rewritten.
- This release uses the authorized uncommitted working tree based on `7fd0210`.
  No Git commit or push was performed.

The previous ingress configuration is also stored in the release directory as
`cloudflared.roomtune.yml.previous`. Future releases should verify deep links through the actual
domain, since localhost checks do not exercise tunnel route restrictions.

Rollback can restore the previous build/config and restart only the verified public preview
process. Keep the tunnel and additive Duck tables/data; do not drop data or the shared pg_cron
extension. If needed, disable only the named Duck scheduler job after evaluating active races.

Real simultaneous physical devices, long hardware/browser soak and reference-level graphics
parity are not established by these tests. GPU measurements around 32 FPS in this environment
are not a 60 FPS guarantee. Post-processing/bloom, camera shake and a recorded announcer are
not implemented.
