import type { Playback } from '../../shared/contracts';

export function hostIsAvailable(playback: Playback, now: number) {
  return Boolean(playback.controller_id && Date.parse(playback.lease_until ?? '') > now);
}

/** The member whose device plays the room's music while its lease is alive, or null. */
export function musicPlayer(playback: Playback, now: number) {
  if (!hostIsAvailable(playback, now) || !playback.controller_user) return null;
  return {
    user: playback.controller_user,
    playing: playback.state === 'PLAYING' && playback.intent === 'PLAYING',
  };
}

export function shouldListen(playback: Playback, now: number) {
  return (
    hostIsAvailable(playback, now) && playback.intent === 'PLAYING' && playback.state === 'PLAYING'
  );
}

export function listeningPosition(playback: Playback, duration: number, now: number) {
  const updated = Date.parse(playback.updated_at);
  const elapsed =
    shouldListen(playback, now) && Number.isFinite(updated)
      ? Math.max(0, (now - updated) / 1000)
      : 0;
  return Math.min(Math.max(0, duration - 0.1), Math.max(0, playback.position + elapsed));
}
