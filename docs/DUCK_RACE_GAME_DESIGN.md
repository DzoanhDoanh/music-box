# Duck Race game design

## Modes and roles

- PLAYER: each room member enters once, chooses a skin and marks ready. Skins do not alter odds.
- SONG: owner selects queued songs. Priority can be off, automatic or require owner approval.
- CUSTOM: names, multiline paste, numbered entries or bounded CSV; edit preview and save/delete
  personal presets in the room. No online member requirement for custom labels.

Two to thirty entries; 30/45/60/90/120-second races. PLAYER/CUSTOM creation is owner-only. The owner or
assigned race host can configure/manage/start/transfer control; owner always retains control.
A removed participant remains in the music room but cannot rejoin that race. Room membership
revocation also removes API/channel access. After locking, no new participants or rerolls.
Spectators can watch, select a local camera, inspect rankings and react.

Owners can configure room-wide Song Race policy from the Duck hub: enable/disable, maximum
2–30 songs, owner-only creation or member creation, and default OFF/AUTO/APPROVAL priority.
Member-created races are limited to SONG and must use the room's priority policy. Members
cannot change rewards or convert a song race into a different mode. Changes are versioned,
retry-safe and checked transactionally on create/edit/start. Already-started races retain their
committed settings, rewards and replay; disabling Song Race does not cancel or reroll them.
Song lobby/results retain the song title and original nominator's display name.

## Race and viewing

Lobby -> server countdown -> swimming/overtakes -> sprint -> exact finish -> podium/results.
Clients display a 3.5-second delayed timeline to keep unpublished movement secret. Disconnecting
the host does not stop a race. Game navigation/fallback preserves the existing YouTube iframe.

Eight local camera choices include automatic, overview, leader, side, water, aerial, finish and
free orbit. Follow my duck and collapsible top rankings keep the scene readable. Graphics/SFX
are independent of other viewers. Mobile defaults to 2D and supports all participation actions.

Replay supports pause, seek, 0.25x/0.5x/1x and camera changes. Photo Finish starts 2.5 seconds
before the first finish at 0.25x and displays the exact first/second gap. The configurable
near-finish threshold is 20–1000 ms (default 150). Stored finish timestamps determine ranking;
an animation frame never changes the authoritative result.

## Tournaments

- POINTS: accumulate points across up to ten rounds.
- ELIMINATION: advance the configured top N from each round; terminate when fewer than two
  remain or the maximum round count is reached. The last-round winner is champion.
- WINNER_REMOVAL: each winner gives up their place in the next round; stop with fewer than two.
- TEAM: sum members' per-race points by team name, with empty names grouped as “Không đội”.

A field of N awards N points to first, N-1 to second, down to 1. Points/TEAM/WINNER_REMOVAL
standings compare points then number of wins; exact ties are displayed as joint ranks/champions.
Elimination's cumulative scores are labeled as informational, not a replacement for the final.
Round history links to existing saved rounds and identifies future rounds as not started.
Rules and qualified rosters cannot be replaced in a later round. Ready must be reconfirmed.

## Optional rewards

PLAYER coins reuse ROOMTUNE wallets. Defaults are 500/200 for first/second, 0 participation,
1000 total cap; rewards are **off by default**. Each configured amount is bounded and final
settlement is one-time. No coins are issued to CUSTOM labels or SONG entries.

SONG priority affects only the winning entry while still QUEUED. Already removed/played songs
are skipped, never recreated. Current music and losing queue entries are preserved. Replay does
not grant rewards or change music. Creating a rematch creates a distinct race with a fresh seed.

## Deliberate limits

No real-money game, betting, skin marketplace or unlock progression. All twelve skins are
available. Visual effects do not determine physics or results.
