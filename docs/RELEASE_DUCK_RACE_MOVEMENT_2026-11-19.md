# Duck Race movement — public release, 19 November 2026

Published with user authorization at **01:35:48 UTC / 08:35:48 Vietnam time** to
[ROOMTUNE](https://roomtune.dzoanh.me).

HTTP timing corrections now adjust the presentation clock gradually; ordinary network jitter
no longer rewinds it. Live responses include the position at the current database timestamp,
reducing unnecessary waiting for two-second checkpoints. New plans combine steady cruising
with random overtakes, and swimming animation keeps a continuous phase when speed changes.
Real data starvation displays a waiting indicator. Existing plans, ranks, finish times and
reward outcomes remain authoritative; refresh the page and start a new race to see the new pace.

## Verification

- Local: 27 unit/API checks; desktop 3D and mobile 2D browser movement, outage/reconnect and
  proof verification; lint, TypeScript and isolated production build passed.
- Candidate runtime health passed on loopback 5183 before switching public.
- Public: 16 HTTPS route/feature/auth/internal-path checks passed; 379 assets matched the
  release byte-for-byte, including retained chunks for already-open tabs. Foreign Origin denied.
- Authenticated public acceptance: all five groups passed with two authenticated browser
  identities, private Realtime/outsider denial, live race/reactions, offline/reconnect/token
  rotation, matching results/proof, exactly-once rewards, automatic settlement without viewers
  and revoked membership denial. Runner exited 0 and run-owned accounts/rooms were cleaned.
  Evidence: `.roomtune/duck-hosted/571dd907-d407-4a39-b0c2-a4d0963ca608/result.json`.

## Runtime and recovery

- Release: `.roomtune/releases/duck-race-20261119T013415/`; new build in `candidate`, rollback
  build in `previous`. Prior environment files and deployment pointer are preserved there.
- Public runtime PID 28580 replaced verified PID 119964. Existing ROOMTUNE tunnel PID 80968
  continued running. Trial ports 5180/5181 and local sample preview 5182 were preserved;
  temporary acceptance candidate 5183 was stopped after publication.
- No active Duck or Ludo game was found immediately before switching. No schema migration,
  application-data reset, Git commit or Git push was performed for this release.
- Roll back by restoring `previous` and the saved environment files, then restarting only
  the verified public web process. Preserve the additive Duck tables and existing scheduler.

Operational state/configuration lives in ignored `.roomtune` paths and must not be committed.
Local jitter simulations and browser contexts do not establish physical-device/network or
long-duration GPU acceptance.
