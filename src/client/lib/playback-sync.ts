import type { Playback } from '../../shared/contracts';

export function hostIsAvailable(playback: Playback, now: number) {
  return Boolean(playback.controller_id && Date.parse(playback.lease_until ?? '') > now);
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
