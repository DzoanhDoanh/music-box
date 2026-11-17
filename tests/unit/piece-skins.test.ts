import { describe, expect, it } from 'vitest';
import {
  caNguaRulesSchema,
  createGameSchema,
  defaultRules,
  gameCommandSchema,
  legacyRules,
  stateSchema,
  type EngineAction,
  type GameRules,
  type GameState,
} from '../../src/shared/game/contracts';
import { createInitialGameState, getLegalMoves, transition } from '../../src/shared/game/engine';
import { pieceSkins } from '../../src/shared/game/piece-skins';
import { committedMotion } from '../../src/client/components/game/board-motion';

const ids = [1, 2, 3].map((n) => `10000000-0000-4000-8000-00000000000${n}`);
const room = '20000000-0000-4000-8000-000000000001';
const send = (
  s: GameState,
  actor: string,
  action: Omit<Extract<EngineAction, { action: 'skin' }>, 'version'>,
) => transition(s, actor, '', false, { ...action, version: s.version }, 10);
function fixture(rules: GameRules = defaultRules) {
  let s = createInitialGameState(room, room, ids[0], 'Hình quân', 'An', rules);
  s = transition(
    s,
    ids[1],
    'Bình',
    false,
    { action: 'join', color: 1, skin: 'CAT', version: s.version },
    0,
  );
  return s;
}
describe('personal piece skins', () => {
  it('does not rewrite old players and accepts the same finite catalog on create, join and change', () => {
    const old = createInitialGameState(room, room, ids[0], 'Bàn cũ', 'An', legacyRules);
    expect(stateSchema.parse(old)).toEqual(old);
    expect(old.players[0]).not.toHaveProperty('skin');
    for (const skin of pieceSkins.map((s) => s.id)) {
      expect(createGameSchema.parse({ name: 'Bàn', rules: defaultRules, skin }).skin).toBe(skin);
      expect(gameCommandSchema.parse({ action: 'join', color: 0, version: 0, skin })).toMatchObject(
        { skin },
      );
      expect(
        createInitialGameState(room, room, ids[0], 'Bàn', 'An', defaultRules, skin).players[0].skin,
      ).toBe(skin);
    }
    for (const skin of [
      '',
      'https://example.com/image.svg',
      '<svg onload=alert(1)>',
      null,
      1,
      {},
      'cat',
    ]) {
      expect(createGameSchema.safeParse({ name: 'Bàn', rules: defaultRules, skin }).success).toBe(
        false,
      );
      expect(gameCommandSchema.safeParse({ action: 'skin', skin, version: 0 }).success).toBe(false);
      const s = fixture();
      s.players[0] = { ...s.players[0], skin } as (typeof s.players)[0];
      expect(stateSchema.safeParse(s).success).toBe(false);
    }
    expect(
      gameCommandSchema.safeParse({ action: 'skin', skin: 'CAT', user_id: ids[1], version: 0 })
        .success,
    ).toBe(false);
  });
  it.each([defaultRules, caNguaRulesSchema.parse({ variant: 'CANGUA_V2' }), legacyRules])(
    'changes only own appearance, preserving ready/turn/die/time/positions/legal moves for %j',
    (rules) => {
      let s = fixture(rules);
      for (const id of ids.slice(0, 2))
        s = transition(s, id, '', false, { action: 'ready', ready: true, version: s.version }, 0);
      const ready = send(s, ids[1], { action: 'skin', skin: 'DOG' });
      expect(ready.status).toBe('READY');
      expect(ready.players.every((p) => p.ready)).toBe(true);
      s = transition(ready, ids[0], '', false, { action: 'start', version: ready.version }, 0);
      s.players[0].pieces[0] = 2;
      s.phase = 'MOVE';
      s.dice = 1;
      for (const skin of pieceSkins.map((s) => s.id)) {
        const before = structuredClone(s);
        const after = send(s, ids[1], { action: 'skin', skin });
        expect(after.players[1].skin).toBe(skin);
        expect(after).toEqual({
          ...before,
          version: before.version + 1,
          players: before.players.map((p) => (p.id === ids[1] ? { ...p, skin } : p)),
          last: { type: 'skin', actor: ids[1] },
        });
        expect(getLegalMoves(after)).toEqual(getLegalMoves(before));
        expect(stateSchema.parse(JSON.parse(JSON.stringify(after)))).toEqual(after);
        expect(committedMotion(before, after)).toEqual([]);
        expect(s).toEqual(before);
      }
      s = transition(s, ids[0], '', false, { action: 'pause', version: s.version }, 10);
      expect(send(s, ids[1], { action: 'skin', skin: 'ROCKET' }).remaining).toBe(s.remaining);
    },
  );
  it('rejects spectators, ended/forfeited players, stale versions and host attempts to target another player', () => {
    const s = fixture();
    expect(() => send(s, ids[2], { action: 'skin', skin: 'CAT' })).toThrow();
    expect(() =>
      transition(s, ids[2], '', true, { action: 'skin', skin: 'CAT', version: s.version }, 1),
    ).toThrow();
    expect(() =>
      transition(s, ids[0], '', false, { action: 'skin', skin: 'CAT', version: s.version - 1 }, 1),
    ).toThrow();
    for (const status of ['FINISHED', 'CANCELLED'] as const)
      expect(() => send({ ...s, status }, ids[0], { action: 'skin', skin: 'CAT' })).toThrow();
    s.players[1].status = 'FORFEITED';
    s.players[1].rank = 2;
    expect(() => send(s, ids[1], { action: 'skin', skin: 'CAT' })).toThrow();
  });
  it('retains each skin on color changes, surrender and rematch without giving it movement powers', () => {
    let s = send(fixture(), ids[0], { action: 'skin', skin: 'ROCKET' });
    s = transition(s, ids[1], '', false, { action: 'color', color: 3, version: s.version }, 0);
    expect(s.players.find((p) => p.id === ids[1])!.skin).toBe('CAT');
    for (const id of ids.slice(0, 2))
      s = transition(s, id, '', false, { action: 'ready', ready: true, version: s.version }, 0);
    s = transition(s, ids[0], '', false, { action: 'start', version: s.version }, 0);
    s = transition(s, ids[1], '', false, { action: 'surrender', version: s.version }, 1);
    s = transition(s, ids[0], '', false, { action: 'rematch', version: s.version }, 2);
    expect(s.players.map((p) => p.skin)).toEqual(['ROCKET', 'CAT']);
    expect(s.players.every((p) => p.pieces.every((n) => n === -1))).toBe(true);
  });
});
