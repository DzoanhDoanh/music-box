import { describe, expect, it } from 'vitest';
import { createInitialGameState, transition } from '../../src/shared/game/engine';
import { sceneMotion, sampleSceneMotion } from '../../src/client/components/game/scene-motion';
import { piecePoint } from '../../src/client/components/game/board-geometry';

const ids = [1, 2].map((n) => `10000000-0000-4000-8000-00000000000${n}`);
function fixture() {
  const state = createInitialGameState(ids[0], ids[0], ids[0], '3D', 'An');
  state.players.push({ ...structuredClone(state.players[0]), id: ids[1], color: 1 });
  state.players[0].pieces = [13, -1, -1, -1];
  state.players[1].pieces = [0, 13, -1, -1];
  state.status = 'PLAYING';
  state.turn = ids[0];
  state.phase = 'MOVE';
  state.dice = 1;
  state.deadline = 90000;
  const after = transition(
    state,
    ids[0],
    '',
    false,
    { action: 'move', piece: 0, version: state.version },
    1,
  );
  return { before: state, after };
}
describe('3D committed presentation', () => {
  it('skips sheltered starts, arcs over the track, and sends the captured horse home', () => {
    const { before, after } = fixture();
    const plans = sceneMotion(before, after),
      mover = plans.get(ids[0] + ':0')!;
    expect(mover.kind).toBe('jump');
    expect(mover.points).toHaveLength(14); // start at 13; 14 is a skipped spawn, then 15..27.
    const [sx, sz] = piecePoint(0, 14, 0, 2);
    expect(mover.points.some((p) => p.x === sx - 7.5 && p.z === sz - 7.5)).toBe(false);
    expect(sampleSceneMotion(mover, 0.5).y).toBeGreaterThan(1.5);
    expect(sampleSceneMotion(mover, 1)).toMatchObject({
      ...mover.points.at(-1),
      y: expect.closeTo(0.21),
    });
    const captured = plans.get(ids[1] + ':1')!;
    expect(sampleSceneMotion(captured, 0.5)).toMatchObject({ ...captured.points[0], y: 0.21 });
    expect(sampleSceneMotion(captured, 1)).toMatchObject({
      ...captured.points.at(-1),
      y: expect.closeTo(0.21),
    });
    expect(plans.has(ids[1] + ':0')).toBe(false);
  });
  it('never replays on reload, duplicate receipt, missed versions, rematch or another table', () => {
    const { before, after } = fixture();
    expect(sceneMotion(after, after).size).toBe(0);
    for (const change of [
      { version: after.version + 1 },
      { round: after.round + 1 },
      { id: ids[1] },
    ])
      expect(sceneMotion(before, { ...after, ...change }).size).toBe(0);
  });
  it('launches the victim only at impact, tumbles in flight, and lands exactly upright at home', () => {
    const { before, after } = fixture();
    const plans = sceneMotion(before, after);
    const attack = plans.get(ids[0] + ':0')!,
      victim = plans.get(ids[1] + ':1')!;
    expect(victim.delay).toBe(attack.duration);
    const impact = sampleSceneMotion(victim, victim.delay / victim.duration);
    expect(impact).toMatchObject({ ...victim.points[0], y: 0.21, roll: 0, spin: 0 });
    const flight = sampleSceneMotion(victim, (victim.delay + 450) / victim.duration);
    expect(flight.y).toBeGreaterThan(3.9);
    expect(flight.spin).toBeGreaterThan(0);
    expect(flight.roll).toBeGreaterThan(0);
    expect(sampleSceneMotion(victim, 1)).toEqual({
      ...victim.points.at(-1),
      y: 0.21,
      roll: 0,
      spin: 0,
      tilt: 0,
    });
    expect(sampleSceneMotion(victim, 2)).toEqual(sampleSceneMotion(victim, 1));
  });
});
