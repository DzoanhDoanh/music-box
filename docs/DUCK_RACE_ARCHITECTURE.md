# Duck Race architecture

## Boundaries and state

`src/shared/duck-race` defines versioned contracts, fairness, trajectories and import rules.
`src/server/services/duck-race.ts` is the trusted command service behind Hono endpoints.
`supabase/migrations/202611180002_duck_race.sql` supplies private seeds/plans/receipts,
public match/result/preset/audit storage and service-only RPCs. Raw tables are not readable
by browser JWT roles. Every user command reauthorizes room membership.

A race has a fixed committed seed at creation. Locking entries starts a three-second server
countdown in the same transaction. A locked race cannot be cancelled or reconfigured.
Version checks and receipt identity protect concurrent commands and retries. Configuring a
custom/song race submits settings plus entry replacement atomically. Later tournament rounds
retain their original rules and eligible entries; eliminated players cannot rejoin.

`duck_race_settings` stores owner-controlled room Song Race policy with compare-and-swap
versions. Save receipts serialize concurrent retries and preserve newer edits from other tabs.
SQL checks current policy during create/configure/entry replacement/start, inside the room
transaction. It never rewrites a locked plan. Member-created song races can only use the room's
chosen priority/reward rules. Snapshots expose policy to participants; raw settings remain
service-role-only like other Duck tables. A policy conflict refreshes the client's snapshot.

DB timestamps define progress. Viewers and hosts do not drive simulation. Due reads or the
feature-gated scheduled Worker call finalize abandoned races. The current tunnel deployment
also uses database job `roomtune-duck-settle` every minute, because a local preview does not
receive hosted Workers Cron Triggers. Migration `202611180003` installs that job when pg_cron
is available; disposable embedded PostgreSQL continues to test settlement directly.
Setup follows the [Supabase Cron installation](https://supabase.com/docs/guides/cron/install)
and [scheduling documentation](https://supabase.com/docs/guides/cron/quickstart).
Immutable result rows support standings, linked round history, replay and verification.

## Progressive disclosure and transport

Trajectory checkpoints are generated every **2 seconds**, with exact crossing endpoints.
Each live response also samples the saved plan at the current DB timestamp, eliminating up to
two seconds of unnecessary data starvation. Only positions at or before DB time leave the
backend. Rendering trails server time by **3.5 seconds** and interpolates already published
positions. Missing data holds the last position and displays a waiting indicator. Initial
connection uses the received snapshot; reconnect reconstructs the same race.

The client polls every **1 second** while COUNTDOWN/RACING, and every **10 seconds** in
lobby/results. Hidden tabs use query-library throttling; visibility/online/reconnect trigger
resynchronization. An RTT midpoint estimate (bounded to 1 second) anchors server time.
Subsequent timing corrections are applied continuously at no more than 10% speed adjustment,
so ordinary network jitter cannot rewind the presentation clock. Reads and accepted commands
use the same clock. Rejected stale snapshots cannot roll back the race version, frames or clock.

New plans blend a 65% steady cruise with 35% randomized motion; ducks keep overtaking without
the very slow stretches of the original motion profile. Saved plans are never regenerated.
The independent ranking/finish streams, proof algorithm and reward outcomes are unchanged.
Swimming animation integrates its phase rather than multiplying total time by current speed.

Private `duck:<race-id>` channels deliver version hints and validated emoji reactions.
Existing private room notices invalidate game/wallet state. Shared subscriptions avoid extra
music Presence. Broadcast has no authority to supply a winner or reward: data is refetched
through authenticated HTTP. Missed broadcasts are recovered by snapshot polling.

Uncertain commands persist in per-tab sessionStorage scoped by actor/room/race. A pending
command blocks a different command until verified. Retry reuses the original key/body;
blocked storage prevents sending an unpersisted mutation. Reaction receipts include their
canonical action and serialize concurrent retries, so retries emit only one reaction.

## Economy and queue

Room/economy locking and existing wallet helpers preserve lock ordering. Rewards are
transactional, capped and recorded once under a unique race reference in coin_ledger.
No betting, real-money payout, separate ledger or client balance mutation exists.

Song rewards update priority only for the winning QUEUED entry under the room lock.
Missing/playing/played entries produce an audited skip. Manual approval is owner-only and
idempotent. Other queued entries and the current PLAYING song remain intact. Replay is a
read-only presentation action, not a new settlement.

## Rendering and resource ownership

React controls the lobby/HUD; R3F mutates transforms in its frame loop without per-frame React
state. Sorted immutable entry IDs connect trajectories to rigs. Multipart ducks share bounded
catalog geometry/materials; opaque parts are batched, spheres use quality/distance LOD, and
wakes/splashes use pooled instancing. Unique textures, instances and generated world geometry
are disposed when their owner unmounts. Diagnostics report actual renderer counters.

The scene is lazy loaded. Context loss or shader failure switches to 2D without unmounting
room music players. Game Web Audio has its own context, starts only after a gesture, uses a
separate volume and closes when the race view unmounts. Preferences are device-local.

## Deployment boundary

Both Duck flags must be enabled only after migration on the intended environment. The local
build helper preserves existing public/trial artifacts and restores `.wrangler/deploy/config.json`.
Local database/browser evidence does not verify hosted Supabase Auth/Realtime delivery.
