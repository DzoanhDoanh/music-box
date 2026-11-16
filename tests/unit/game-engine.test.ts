import { describe, expect, it } from 'vitest';
import {
  boardCell,
  calculateRanking,
  createInitialGameState,
  getLegalMoves,
  reconcileGame,
  transition,
} from '../../src/shared/game/engine';
import {
  defaultRules,
  gameCommandSchema,
  stateSchema,
  type EngineAction,
  type GameState,
} from '../../src/shared/game/contracts';
const ids = [1, 2, 3, 4, 5].map((n) => '10000000-0000-4000-8000-' + String(n).padStart(12, '0'));
const room = '20000000-0000-4000-8000-000000000001';
function fixture(count = 4) {
  let s = createInitialGameState(room, room, ids[0], 'Bàn thử', 'Người 1');
  for (let i = 1; i < count; i++)
    s = transition(
      s,
      ids[i],
      'Người ' + (i + 1),
      false,
      { action: 'join', color: i, version: s.version },
      0,
    );
  for (let i = 0; i < count; i++)
    s = transition(s, ids[i], '', false, { action: 'ready', ready: true, version: s.version }, 0);
  return transition(s, ids[0], '', false, { action: 'start', version: s.version }, 0);
}
type Input = EngineAction extends infer T
  ? T extends EngineAction
    ? Omit<T, 'version'>
    : never
  : never;
const command = (s: GameState, a: Input, dice?: number, actor = s.turn!) =>
  transition(s, actor, 'Tên', false, { ...a, version: s.version } as EngineAction, 1, dice);
describe('Ludo deterministic engine', () => {
  it('does not delete archived seats when a batch of kicked players ends a game', () => {
    const s = fixture(3);
    const recovered = reconcileGame(s, [ids[2]], 100);
    expect(recovered.status).toBe('FINISHED');
    expect(recovered.players).toHaveLength(3);
    expect(new Set(recovered.players.map((p) => p.rank)).size).toBe(3);
    expect(recovered.players.find((p) => p.id === ids[2])?.rank).toBe(1);
  });
  it.each([1, 2, 3, 4, 5, 6])('validates entry with face %i', (dice) => {
    const s = command(fixture(), { action: 'roll' }, dice);
    expect(getLegalMoves(s).length).toBe(dice === 6 ? 4 : 0);
    expect(s.turn).toBe(ids[dice === 6 ? 0 : 1]);
  });
  it.each([1, 2, 3, 4, 5, 6])('moves exactly face %i and refuses overshoot', (dice) => {
    const initial = fixture();
    initial.players[0].pieces = [3, 56, 57, -1];
    const s = command(initial, { action: 'roll' }, dice);
    expect(getLegalMoves(s).find((m) => m.piece === 0)?.to).toBe(3 + dice);
    expect(getLegalMoves(s).some((m) => m.piece === 1)).toBe(dice === 1);
    expect(getLegalMoves(s).some((m) => m.piece === 2)).toBe(false);
  });
  it('captures all opposing pieces on an unsafe square, while own stacks are permitted', () => {
    const s = fixture();
    s.players[0].pieces = [12, 13, -1, -1];
    s.players[1].pieces = [0, 0, 2, -1];
    s.rules.safe = 'NONE';
    const moved = command(command(s, { action: 'roll' }, 1), { action: 'move', piece: 0 });
    expect(moved.players[1].pieces).toEqual([-1, -1, 2, -1]);
    expect(moved.players[0].pieces.slice(0, 2)).toEqual([13, 13]);
    expect(moved.last.captures).toHaveLength(2);
    expect(s.players[0].pieces[0]).toBe(12);
  });
  it.each(['STARS', 'STARTS'] as const)('does not capture on safe start under %s', (safe) => {
    const s = fixture();
    s.rules.safe = safe;
    s.players[0].pieces[0] = 12;
    s.players[1].pieces[0] = 0;
    const moved = command(command(s, { action: 'roll' }, 1), { action: 'move', piece: 0 });
    expect(moved.players[1].pieces[0]).toBe(0);
  });
  it('star protection and the home lane are independent of global track cells', () => {
    const s = fixture();
    s.players[0].pieces = [20, 51, -1, -1];
    s.players[1].pieces = [8, 39, -1, -1];
    expect(
      command(command(s, { action: 'roll' }, 1), { action: 'move', piece: 0 }).players[1].pieces[0],
    ).toBe(8);
    s.rules.safe = 'NONE';
    const home = command(command(s, { action: 'roll' }, 1), { action: 'move', piece: 1 });
    expect(home.players[1].pieces[1]).toBe(39);
    expect(home.players[0].pieces[1]).toBe(52);
  });
  it('six grants another roll but the third consecutive six forfeits it', () => {
    let s = fixture();
    for (let i = 0; i < 2; i++)
      s = command(command(s, { action: 'roll' }, 6), { action: 'move', piece: 0 });
    const before = [...s.players[0].pieces];
    s = command(s, { action: 'roll' }, 6);
    expect(s.turn).toBe(ids[1]);
    expect(s.players[0].pieces).toEqual(before);
    expect(s.last.type).toBe('three_sixes');
  });
  it('supports the explicit entry, third-six and capture/finish bonus options', () => {
    let s = fixture();
    s.rules = {
      ...defaultRules,
      entry: 'ONE_OR_SIX',
      threeSixes: false,
      captureBonus: true,
      finishBonus: true,
      safe: 'NONE',
    };
    s = command(command(s, { action: 'roll' }, 1), { action: 'move', piece: 0 });
    expect(s.players[0].pieces[0]).toBe(0);
    s.turn = ids[0];
    for (let i = 0; i < 5; i++)
      s = command(command(s, { action: 'roll' }, 6), { action: 'move', piece: 0 });
    expect(s.turn).toBe(ids[0]);
    s.players[0].pieces[0] = 12;
    s.players[1].pieces[0] = 0;
    s = command(command(s, { action: 'roll' }, 1), { action: 'move', piece: 0 });
    expect(s.turn).toBe(ids[0]);
    s.players[0].pieces[0] = 56;
    s = command(command(s, { action: 'roll' }, 1), { action: 'move', piece: 0 });
    expect(s.turn).toBe(ids[0]);
  });
  it('uses exact finish, skips ranked players and ranks the final remaining player', () => {
    let s = fixture(3);
    s.players[0].pieces = [57, 57, 57, 56];
    s = command(command(s, { action: 'roll' }, 1), { action: 'move', piece: 3 });
    expect(s.players[0].rank).toBe(1);
    expect(s.turn).toBe(ids[1]);
    expect(s.status).toBe('PLAYING');
    s = command(s, { action: 'surrender' });
    expect(s.status).toBe('FINISHED');
    expect(calculateRanking(s).map((p) => p.id)).toEqual([ids[0], ids[2], ids[1]]);
  });
  it('rejects stale versions, spectators, double rolls, invalid pieces and forged dice fields', () => {
    const s = fixture();
    expect(() =>
      transition(s, ids[0], '', false, { action: 'roll', version: s.version - 1 }, 0, 6),
    ).toThrow();
    expect(() => command(s, { action: 'roll' }, 6, ids[4])).toThrow();
    const rolled = command(s, { action: 'roll' }, 6);
    expect(() => command(rolled, { action: 'roll' }, 2)).toThrow();
    expect(() => command(rolled, { action: 'move', piece: 4 })).toThrow();
    expect(
      gameCommandSchema.safeParse({ action: 'roll', version: s.version, dice: 6 }).success,
    ).toBe(false);
    expect(
      gameCommandSchema.safeParse({ action: 'move', version: s.version, piece: 0, to: 57 }).success,
    ).toBe(false);
  });
  it('keeps pending dice on reconnect and across pause/resume, without using wall clock', () => {
    let s = command(fixture(), { action: 'roll' }, 6);
    const original = structuredClone(s);
    expect(reconcileGame(s, ids, 500)).toEqual(s);
    s = transition(s, ids[0], '', false, { action: 'pause', version: s.version }, 1000);
    expect(reconcileGame(s, ids, 1e9)).toEqual(s);
    expect(s.dice).toBe(6);
    s = transition(s, ids[0], '', false, { action: 'resume', version: s.version }, 10000);
    expect(s.deadline).toBe(original.deadline! + 9000);
    expect(s.phase).toBe('MOVE');
  });
  it('reconciles missed turns from durable deadlines and eventually ends an abandoned game', () => {
    const s = fixture();
    const next = reconcileGame(s, ids, 45000);
    expect(next.turn).toBe(ids[1]);
    expect(next.players[0].misses).toBe(1);
    expect(reconcileGame(s, ids, 1e8).status).toBe('FINISHED');
  });
  it('forfeits a kicked player, transfers host, keeps other pieces, and protects paused turns', () => {
    const s = command(fixture(3), { action: 'roll' }, 6);
    const paused = transition(s, ids[0], '', false, { action: 'pause', version: s.version }, 0);
    const recovered = reconcileGame(paused, ids.slice(1), 100);
    expect(recovered.players[0].status).toBe('FORFEITED');
    expect(recovered.host).toBe(ids[1]);
    expect(recovered.status).toBe('PAUSED');
    expect(recovered.deadline).toBeNull();
    expect(recovered.turn).toBe(ids[1]);
  });
  it('validates readiness, color collisions, settings changes, cancel and rematch', () => {
    let s = createInitialGameState(room, room, ids[0], 'Tên bàn', 'Tên');
    expect(() => command(s, { action: 'start' }, undefined, ids[0])).toThrow();
    expect(() =>
      transition(s, ids[1], 'Tên', false, { action: 'join', color: 0, version: 0 }, 0),
    ).toThrow();
    s = command(s, { action: 'cancel' }, undefined, ids[0]);
    expect(s.status).toBe('CANCELLED');
    s = command(s, { action: 'rematch' }, undefined, ids[0]);
    expect(s.round).toBe(2);
    expect(s.players[0].ready).toBe(false);
  });
  it('runs a complete four-player deterministic game with consistent ranks and serializable checkpoints', () => {
    let s = fixture(),
      seed = 17,
      steps = 0;
    const initial = structuredClone(s);
    while (s.status === 'PLAYING' && steps++ < 20000) {
      if (s.phase === 'ROLL') {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        s = command(s, { action: 'roll' }, (seed % 6) + 1);
      } else {
        const move = getLegalMoves(s).sort((a, b) => b.to - a.to)[0];
        s = command(s, { action: 'move', piece: move.piece });
      }
      expect(stateSchema.safeParse(JSON.parse(JSON.stringify(s))).success).toBe(true);
    }
    expect(s.status).toBe('FINISHED');
    expect(new Set(s.players.map((p) => p.rank)).size).toBe(4);
    expect(initial.players.every((p) => p.pieces.every((n) => n === -1))).toBe(true);
  });
  it('maps all 52 track positions to a unique circuit for every color', () => {
    for (let color = 0; color < 4; color++)
      expect(new Set(Array.from({ length: 52 }, (_, p) => boardCell(color, p))).size).toBe(52);
  });
});
