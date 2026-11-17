import { describe, expect, it } from 'vitest';
import { createInitialGameState, transition } from '../../src/shared/game/engine';
import {
  defaultRules,
  legacyRules,
  stateSchema,
  type GameRules,
  type GameState,
} from '../../src/shared/game/contracts';

const ids = [1, 2, 3, 4].map((n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`);
function lobby(rules: GameRules) {
  let s = createInitialGameState(ids[0], ids[0], ids[0], 'Bàn thử', 'An', rules);
  for (let i = 1; i < 3; i++)
    s = transition(s, ids[i], 'Bạn', false, { action: 'join', color: i, version: s.version }, 0);
  return s;
}
function start(s: GameState) {
  for (const p of s.players)
    s = transition(s, p.id, '', false, { action: 'ready', ready: true, version: s.version }, 0);
  return transition(s, ids[0], '', false, { action: 'start', version: s.version }, 0);
}
const kick = (s: GameState, target: string, actor = ids[0], manager = false) =>
  transition(s, actor, '', manager, { action: 'kick', user_id: target, version: s.version }, 1000);

describe.each([
  ['v1', legacyRules],
  ['v2', defaultRules],
] as const)('table moderation %s', (_version, rules) => {
  it('removes a waiting seat and allows a deliberate fresh join', () => {
    const s = lobby(rules),
      after = kick(s, ids[1]);
    expect(s.players).toHaveLength(3);
    expect(after.players.map((p) => p.id)).toEqual([ids[0], ids[2]]);
    expect(after.status).toBe('WAITING');
    const rejoined = transition(
      after,
      ids[1],
      'Bạn',
      false,
      { action: 'join', color: 1, version: after.version },
      2000,
    );
    expect(rejoined.players.find((p) => p.id === ids[1])?.ready).toBe(false);
  });
  it('rejects self kicks, ordinary members, missing targets and finished games', () => {
    const s = start(lobby(rules));
    expect(() => kick(s, ids[0])).toThrow();
    expect(() => kick(s, ids[2], ids[1])).toThrow();
    expect(() => kick(s, ids[3])).toThrow();
    const ended = kick(kick(s, ids[1]), ids[2]);
    expect(ended.status).toBe('FINISHED');
    expect(new Set(ended.players.map((p) => p.rank)).size).toBe(3);
    expect(() => kick(ended, ids[1])).toThrow();
  });
  it('transfers a kicked host and the current turn; clears a rolled die', () => {
    let s = start(lobby(rules));
    s = transition(s, ids[0], '', false, { action: 'roll', version: s.version }, 1, 6);
    const after = kick(s, ids[0], ids[3], true);
    expect(after.host).toBe(ids[1]);
    expect(after.turn).toBe(ids[1]);
    expect(after.phase).toBe('ROLL');
    expect(after.dice).toBeNull();
    expect(after.players[0]).toMatchObject({
      status: 'FORFEITED',
      pieces: [-1, -1, -1, -1],
      rank: 3,
    });
    expect(after.deadline).toBe(1000 + rules.turnSeconds * 1000);
    expect(stateSchema.safeParse(after).success).toBe(true);
  });
  it('preserves a paused clock when removing another player and resets a removed turn', () => {
    let s = start(lobby(rules));
    s = transition(s, ids[0], '', false, { action: 'pause', version: s.version }, 500);
    expect(kick(s, ids[1]).remaining).toBe(s.remaining);
    const after = kick(s, ids[0], ids[3], true);
    expect(after.status).toBe('PAUSED');
    expect(after.turn).toBe(ids[1]);
    expect(after.remaining).toBe(rules.turnSeconds * 1000);
    expect(after.deadline).toBeNull();
    expect(stateSchema.safeParse(after).success).toBe(true);
  });
});
