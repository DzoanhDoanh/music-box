import { expect, it } from 'vitest';
import { advanceSceneTime } from '../../src/client/components/game/scene-motion';

it('starts on the first visible frame without consuming time spent on an idle board', () => {
  expect(advanceSceneTime(-1, 30)).toBe(0);
  expect(advanceSceneTime(Infinity, 0.016)).toBe(Infinity);
  expect(advanceSceneTime(400, -0.1)).toBe(400);
});

it('reaches the same impact time at high and low FPS, including a long rendered frame', () => {
  const high = Array.from({ length: 120 }, () => 1 / 60);
  const low = [0.1, 0.3, 0.6, 0.4, 0.2, 0.4];
  const elapsed = (frames: number[]) => frames.reduce(advanceSceneTime, 0);
  expect(elapsed(high)).toBeCloseTo(2000);
  expect(elapsed(low)).toBeCloseTo(2000);
});
