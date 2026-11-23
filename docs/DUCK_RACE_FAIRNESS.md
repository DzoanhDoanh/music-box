# Duck Race fairness and threat model

## Version 1, currently unreleased

The backend creates a 256-bit Web Crypto seed. The initial commitment is:

`SHA256("roomtune:duck:1:commit:" + raceId + ":" + seedHex)`.

At lock, a separate canonical digest binds algorithm, race ID, configuration and sorted entry
identities (entry/user/song/team). Canonical object keys are sorted so PostgreSQL JSONB order
cannot invalidate legitimate proof. Names/skins/graphics do not affect winner probability.

Domain-separated SHA-256 counter streams produce big-endian unsigned 32-bit words. Fisher-Yates
uses rejection sampling to avoid modulo bias. IDs are sorted before shuffling, so input order,
join timing, skin and coin balance are not weighting factors. Secure words must be consumed
sequentially within each stream to preserve deterministic digest ordering.

A distinct `:finish` stream generates positive, variable finish gaps (at least 12 ms), all before
the duration deadline, independently of ranks. `:motion:<entry>` streams generate monotone
trajectories with speed changes and overtakes. Exact crossing endpoints preserve authoritative
finish order. The renderer cannot send a rank, seed, results array or settlement action.

## Disclosure and replay

Private database tables retain the seed, complete plan and result before finish. Browser JWT
roles cannot read raw tables or execute trusted RPCs. HTTP snapshots expose only endpoints
whose timestamps have passed on the database clock. A 3.5-second display delay provides room
for polling/interpolation without releasing a future segment. Live responses additionally
include the position sampled at the current database timestamp, bounded by the same rule;
the full future plan remains private. Client clock smoothing never extrapolates a duck beyond
the latest published position.

The 19 November movement revision adds a steady cruising component to newly generated plans.
Existing saved frames remain authoritative for ongoing races and replay. Ranking, exact finish
times and algorithm-1 verification are unchanged by this visual pacing revision.

After authoritative finish, the API reveals the seed, locked-input hash, results and complete
frames. Browser proof verification recomputes commitment/input hash/ranking/crossing times;
export includes the replay data. Replay never invokes start/finalize/reward commands.

The proof demonstrates consistency with the published seed and inputs. It is **not** proof
against a dishonest service operator selecting seeds before publishing commitments. The trusted
backend and secret-role storage are part of this threat model. A host cannot change or reroll
the seed after lock; cancellation is only possible in the lobby.

## Authorization and concurrency

Every route requires the shared session and room membership; owner/host controls are explicit.
Private Broadcast authorizes the room through its race and does not permit browser-authored
winner/reward events. Version hints only trigger authorized snapshot retrieval.

Transactions/CAS, advisory receipt locks and canonical idempotency keys handle concurrent starts,
retries, rematches and reactions. Finalized results are immutable. Wallet entries and song
priority settle once under existing room/economy locks. Membership revocation denies subsequent
access. Duplicate/newer/older events cannot replace a newer snapshot or its clock.

## Evidence and limitations

Tests include independent SHA-256/word/rank vectors, rejection-tail coverage, deterministic
permutations, malformed/duplicate inputs, 2/12/30-entry timing, monotone paths/exact crossings,
800-seed statistical smoke checks, clock gating, forged HTTP commands, real PostgreSQL privilege
checks, concurrent settlement, queue preservation and retry behavior.

Statistical sampling is a smoke check, not a mathematical proof of randomness. Test fixtures do
not demonstrate hosted Realtime delivery. See DUCK_RACE_TESTING.md for test counts and remaining
staging gates. Do not claim security testing or public rollout beyond that recorded evidence.
