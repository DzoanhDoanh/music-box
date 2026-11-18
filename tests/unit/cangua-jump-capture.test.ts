import { describe, expect, it } from 'vitest';
import { defaultRules, stateSchema } from '../../src/shared/game/contracts';
import { createInitialGameState, getLegalMoves, transition } from '../../src/shared/game/engine';
import { committedMotion } from '../../src/client/components/game/board-motion';

const ids = [1, 2, 3, 4].map((n) => `10000000-0000-4000-8000-00000000000${n}`);
const room = '20000000-0000-4000-8000-000000000001';
function fixture(color = 0) {
  const state = createInitialGameState(room, room, ids[0], 'Nhảy đá cửa chuồng', 'An');
  state.players = ids.map((id, color) => ({ ...structuredClone(state.players[0]), id, color }));
  state.status = 'PLAYING';
  state.phase = 'MOVE';
  state.turn = ids[color];
  state.dice = 1;
  state.deadline = 90000;
  return state;
}
const play = (state: ReturnType<typeof fixture>) =>
  transition(
    state,
    state.turn!,
    '',
    false,
    { action: 'move', piece: 0, version: state.version },
    1,
  );

describe('rolling one jumps to and captures an enemy at the next stable gate', () => {
  it.each([0, 1, 2, 3])(
    'captures any opponent at all four gates for color %i, including absolute wrap',
    (color) => {
      for (const gate of [13, 27, 41, 55])
        for (const opponent of [0, 1, 2, 3].filter((value) => value !== color)) {
          const state = fixture(color);
          state.players[color].pieces[0] = gate - 4;
          state.players[opponent].pieces[1] = (color * 14 + gate - opponent * 14 + 56) % 56;
          expect(stateSchema.safeParse(state).success).toBe(true);
          expect(getLegalMoves(state)).toEqual([
            { piece: 0, from: gate - 4, to: gate, moveKind: 'JUMP' },
          ]);
          const after = play(state);
          expect(after.players[color].pieces[0]).toBe(gate);
          expect(after.players[opponent].pieces[1]).toBe(-1);
          expect(after.last).toMatchObject({
            dice: 1,
            moveKind: 'JUMP',
            captures: [ids[opponent] + ':1'],
          });
          expect(after.turn).not.toBe(state.turn);
          expect(after.version).toBe(state.version + 1);
          expect(stateSchema.parse(JSON.parse(JSON.stringify(after)))).toEqual(after);
          const plans = committedMotion(state, after);
          expect(plans.map((plan) => plan.key).sort()).toEqual(
            [ids[color] + ':0', ids[opponent] + ':1'].sort(),
          );
        }
    },
  );

  it('passes a protected spawn occupant and captures only the enemy at the next gate', () => {
    const state = fixture();
    state.players[0].pieces[0] = 13;
    state.players[1].pieces = [0, 13, -1, -1]; // global 14 is safe; global 27 is yellow's gate.
    const after = play(state);
    expect(after.players[0].pieces[0]).toBe(27);
    expect(after.players[1].pieces).toEqual([0, -1, -1, -1]);
    expect(after.last).toMatchObject({ moveKind: 'JUMP', captures: [ids[1] + ':1'] });
    expect(state.players[1].pieces).toEqual([0, 13, -1, -1]);
  });

  it('never jumps through a friendly or enemy blocker to capture the occupied gate', () => {
    for (const friendly of [false, true]) {
      const state = fixture();
      state.players[0].pieces[0] = 13;
      state.players[1].pieces = [0, 13, -1, -1];
      if (friendly) state.players[0].pieces[1] = 16;
      else state.players[2].pieces[0] = 44; // global 16, strictly before the gate.
      expect(getLegalMoves(state).filter((move) => move.piece === 0)).toEqual([
        { piece: 0, from: 13, to: 15, moveKind: 'STEP' },
      ]);
      const after = play(state);
      expect(after.players[0].pieces[0]).toBe(15);
      expect(after.players[1].pieces).toEqual([0, 13, -1, -1]);
      expect(after.last.captures).toEqual([]);
    }
  });

  it('allows exact normal capture of a blocking neighbor without capturing the gate beyond it', () => {
    const state = fixture();
    state.players[0].pieces[0] = 13;
    state.players[1].pieces = [0, 1, 13, -1];
    const after = play(state);
    expect(after.players[0].pieces[0]).toBe(15);
    expect(after.players[1].pieces).toEqual([0, -1, 13, -1]);
    expect(after.last).toMatchObject({ moveKind: 'STEP', captures: [ids[1] + ':1'] });
  });

  it('does not capture a friendly horse at the gate or use the jump when disabled', () => {
    const state = fixture();
    state.players[0].pieces = [9, 13, -1, -1];
    expect(play(state).players[0].pieces).toEqual([10, 13, -1, -1]);
    state.players[0].pieces = [9, -1, -1, -1];
    state.players[1].pieces[0] = 55;
    state.rules = { ...defaultRules, movement: 'SKIP_STARTS_AUTO_JUMP', jumpOnOne: false };
    const after = play(state);
    expect(after.players[0].pieces[0]).toBe(10);
    expect(after.players[1].pieces[0]).toBe(55);
    expect(after.last.captures).toEqual([]);
  });
});
