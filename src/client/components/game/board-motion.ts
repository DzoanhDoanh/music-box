import type { GameState } from '../../../shared/game/contracts';
import { piecePoint } from './board-geometry';

export type PiecePosition = { x: number; y: number; scale: number; stack: number };
export function pieceLayout(state: GameState) {
  const all = state.players
    .filter((p) => p.status !== 'FORFEITED')
    .flatMap((p) =>
      p.pieces.map((n, i) => ({ key: p.id + ':' + i, n, point: piecePoint(p.color, n, i) })),
    );
  return new Map(
    all.map((piece) => {
      const [x, y] = piece.point;
      const occupants = all.filter((p) => p.n >= 0 && p.point[0] === x && p.point[1] === y);
      const stack = occupants.length,
        rank = occupants.indexOf(piece),
        columns = Math.ceil(Math.sqrt(stack));
      return [
        piece.key,
        {
          x: x + (stack > 1 ? ((rank % columns) - (columns - 1) / 2) * 0.35 : 0),
          y:
            y +
            (stack > 1
              ? (Math.floor(rank / columns) - (Math.ceil(stack / columns) - 1) / 2) * 0.35
              : 0),
          scale: stack > 4 ? 0.4 : stack > 1 ? 0.65 : 1,
          stack,
        },
      ];
    }),
  );
}
const transform = (p: PiecePosition) => `translate(${p.x}px,${p.y}px) scale(${p.scale})`;
/** Only interpolate an observed, consecutive committed move. Reloads, missed versions,
 * rematches and receipt replays snap to the authoritative position without replaying events. */
export function committedMotion(before: GameState, after: GameState) {
  const plans: { key: string; frames: Keyframe[]; duration: number }[] = [];
  if (
    before.id !== after.id ||
    before.round !== after.round ||
    after.version !== before.version + 1 ||
    !['piece_moved', 'finished'].includes(after.last.type)
  )
    return plans;
  const old = pieceLayout(before),
    next = pieceLayout(after);
  const { actor, piece, from, to } = after.last;
  const mover = after.players.find((p) => p.id === actor);
  if (
    !mover ||
    piece === undefined ||
    from === undefined ||
    to === undefined ||
    to < 0 ||
    to > 57 ||
    (from === -1 ? to !== 0 : to <= from || to - from > 6) ||
    before.players.find((p) => p.id === actor)?.pieces[piece] !== from ||
    mover.pieces[piece] !== to
  )
    return plans;
  const duration = Math.max(360, (to - from) * 115);
  for (const [key, end] of next) {
    const start = old.get(key);
    if (!start || transform(start) === transform(end)) continue;
    const frames: Keyframe[] = [{ transform: transform(start) }];
    if (key === actor + ':' + piece) {
      let last = start;
      for (let n = from + 1; n <= to; n++) {
        const point = piecePoint(mover.color, n, piece);
        const target = n === to ? end : { x: point[0], y: point[1], scale: 1, stack: 1 };
        frames.push({
          transform: transform({
            ...target,
            x: (last.x + target.x) / 2,
            y: (last.y + target.y) / 2 - 0.3,
            scale: 1.08,
          }),
        });
        frames.push({ transform: transform(target) });
        last = target;
      }
    } else if (after.last.captures?.includes(key)) {
      frames.push(
        { transform: transform(start), offset: 0.55 },
        {
          transform: transform({
            ...end,
            x: (start.x + end.x) / 2,
            y: (start.y + end.y) / 2 - 0.9,
            scale: 0.6,
          }),
          offset: 0.8,
        },
        { transform: transform(end) },
      );
    } else frames.push({ transform: transform(end) });
    plans.push({ key, frames, duration });
  }
  return plans;
}
