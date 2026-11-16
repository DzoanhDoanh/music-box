import { useId, useLayoutEffect, useRef } from 'react';
import { getLegalMoves, isSafe } from '../../../shared/game/engine';
import { colorNames, type GameState } from '../../../shared/game/contracts';
import { track, origins, homeLane, piecePoint } from './board-geometry';
import { committedMotion, pieceLayout } from './board-motion';
export { track, piecePoint } from './board-geometry';

export default function LudoBoard({
  state,
  actor,
  disabled,
  onMove,
}: {
  state: GameState;
  actor: string;
  disabled: boolean;
  onMove: (piece: number) => void;
}) {
  const id = useId().replace(/:/g, '');
  const legal = getLegalMoves(state, actor);
  const board = useRef<SVGSVGElement>(null);
  const previous = useRef(state);
  const animations = useRef<Animation[]>([]);
  useLayoutEffect(() => {
    const old = previous.current;
    if (old.id === state.id && old.version === state.version) return;
    previous.current = state;
    animations.current.forEach((a) => a.cancel());
    animations.current = [];
    if (document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const plans = committedMotion(old, state);
    for (const plan of plans) {
      const node = board.current?.querySelector<SVGGElement>('[data-piece="' + plan.key + '"]');
      if (node?.animate)
        animations.current.push(
          node.animate(plan.frames, { duration: plan.duration, easing: 'linear' }),
        );
    }
    if (
      plans.length &&
      (state.last.captures?.length || state.last.type === 'finished' || state.last.to === 57)
    ) {
      const effect = board.current?.querySelector(
        '[data-piece="' + state.last.actor + ':' + state.last.piece + '"] .ludo-event-ring',
      );
      if (effect?.animate)
        animations.current.push(
          effect.animate(
            [
              { opacity: 0, strokeWidth: 0.1 },
              { opacity: 0.9, offset: 0.55, strokeWidth: 0.06 },
              { opacity: 0, strokeWidth: 0.01 },
            ],
            { duration: 900 },
          ),
        );
    }
  }, [state]);
  useLayoutEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const stop = () => animations.current.forEach((a) => a.cancel());
    document.addEventListener('visibilitychange', stop);
    preference.addEventListener('change', stop);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', stop);
      preference.removeEventListener('change', stop);
    };
  }, []);
  const layout = pieceLayout(state);
  return (
    <svg
      ref={board}
      className="ludo-board"
      viewBox="-0.3 -0.3 15.6 15.6"
      role="group"
      aria-label="Bàn cờ cá ngựa. Quân hợp lệ có vòng sáng; dùng Tab và Enter để di chuyển."
    >
      <defs>
        <filter id={id + 'shadow'} x="-70%" y="-70%" width="240%" height="260%">
          <feDropShadow dx="0" dy="0.1" stdDeviation="0.07" floodOpacity=".35" />
        </filter>
        <linearGradient id={id + 'gloss'} x1="0" y1="0" x2=".8" y2="1">
          <stop offset="0" stopColor="white" stopOpacity=".7" />
          <stop offset=".5" stopColor="white" stopOpacity="0" />
          <stop offset="1" stopColor="black" stopOpacity=".3" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="15" height="15" rx=".45" className="ludo-board-base" />
      {origins.map(([x, y], color) => (
        <g key={color} className={'ludo-color-' + color}>
          <rect x={x + 0.25} y={y + 0.25} width="5.5" height="5.5" rx=".6" className="ludo-home" />
          <rect
            x={x + 0.8}
            y={y + 0.8}
            width="4.4"
            height="4.4"
            rx=".55"
            className="ludo-home-inner"
          />
          <text x={x + 3} y={y + 0.62} className="ludo-home-label" textAnchor="middle">
            {['◆', '♣', '★', '●'][color]} {colorNames[color]}
          </text>
          {[0, 1, 2, 3].map((p) => (
            <circle
              key={p}
              cx={x + 1.8 + (p % 2) * 2.3}
              cy={y + 1.8 + Math.floor(p / 2) * 2.3}
              r=".6"
              className="ludo-nest"
            />
          ))}
        </g>
      ))}
      {track.map(([x, y], i) => (
        <g key={i} className={i % 13 === 0 ? 'ludo-color-' + Math.floor(i / 13) : ''}>
          <rect
            x={x + 0.035}
            y={y + 0.035}
            width=".93"
            height=".93"
            rx=".14"
            className={'ludo-cell ' + (i % 13 === 0 ? 'ludo-start' : '')}
          />
          {isSafe(i, state.rules) && (
            <text x={x + 0.5} y={y + 0.66} textAnchor="middle" className="ludo-star">
              ✧
            </text>
          )}
        </g>
      ))}
      {[0, 1, 2, 3].map((color) => (
        <g key={color} className={'ludo-color-' + color}>
          {[0, 1, 2, 3, 4, 5].map((n) => {
            const [x, y] = homeLane(color, n);
            return (
              <rect
                key={n}
                x={x + 0.04}
                y={y + 0.04}
                width=".92"
                height=".92"
                rx=".13"
                className="ludo-lane"
              />
            );
          })}
        </g>
      ))}
      <path d="M6,6 L7.5,7.5 L6,9 Z" fill="var(--horse-0)" />
      <path d="M6,6 L9,6 L7.5,7.5 Z" fill="var(--horse-1)" />
      <path d="M9,6 L9,9 L7.5,7.5 Z" fill="var(--horse-2)" />
      <path d="M6,9 L9,9 L7.5,7.5 Z" fill="var(--horse-3)" />
      <circle cx="7.5" cy="7.5" r=".55" className="ludo-finish" />
      <text x="7.5" y="7.72" textAnchor="middle" className="ludo-trophy">
        ♛
      </text>
      {legal.map((move) => {
        const p = state.players.find((p) => p.id === actor)!;
        const [x, y] = piecePoint(p.color, move.to, move.piece);
        return <circle key={move.piece} cx={x} cy={y} r=".43" className="ludo-destination" />;
      })}
      {state.players
        .filter((p) => p.status !== 'FORFEITED')
        .flatMap((p) =>
          p.pieces.map((n, piece) => {
            const { x, y, scale, stack } = layout.get(p.id + ':' + piece)!;
            const allowed = !disabled && legal.some((m) => m.piece === piece) && p.id === actor;
            const moved =
              ['piece_moved', 'finished'].includes(state.last.type) &&
              state.last.actor === p.id &&
              state.last.piece === piece;
            return (
              <g
                key={p.id + piece}
                data-piece={p.id + ':' + piece}
                className={
                  'ludo-piece ludo-color-' +
                  p.color +
                  (allowed ? ' can-move' : '') +
                  (moved ? ' just-moved' : '') +
                  (moved && n === 57 ? ' just-finished' : '') +
                  (state.last.captures?.includes(p.id + ':' + piece) ? ' just-captured' : '')
                }
                style={{
                  transform: `translate(${x}px,${y}px) scale(${scale})`,
                  filter: 'url(#' + id + 'shadow)',
                }}
                role="button"
                tabIndex={allowed ? 0 : -1}
                aria-disabled={!allowed}
                aria-label={
                  'Ngựa ' +
                  (piece + 1) +
                  ' · ' +
                  colorNames[p.color] +
                  ' · ' +
                  p.name +
                  ' · ' +
                  (n === -1 ? 'chưa ra quân' : n === 57 ? 'đã về đích' : 'ô ' + n)
                }
                onClick={() => {
                  if (allowed) onMove(piece);
                }}
                onKeyDown={(e) => {
                  if (allowed && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onMove(piece);
                  }
                }}
              >
                <title>
                  {p.name} · Ngựa {piece + 1}
                  {stack > 1 ? ` · ${stack} quân trên ô` : ''}
                </title>
                <circle r=".52" className="ludo-hit" />
                {allowed && <circle r=".47" className="ludo-halo" />}
                <ellipse cy=".13" rx=".36" ry=".28" className="ludo-piece-shadow" />
                <path
                  d="M-.32,.28 Q-.4,.1 -.2,-.04 L-.13,-.22 L-.3,-.24 L-.2,-.42 L.02,-.39 L.1,-.5 L.18,-.3 Q.38,-.18 .27,.1 L.34,.28 Z"
                  className="ludo-horse"
                />
                <path
                  d="M-.32,.28 Q-.4,.1 -.2,-.04 L-.13,-.22 L-.3,-.24 L-.2,-.42 L.02,-.39 L.1,-.5 L.18,-.3 Q.38,-.18 .27,.1 L.34,.28 Z"
                  fill={'url(#' + id + 'gloss)'}
                  pointerEvents="none"
                />
                <circle
                  className="ludo-event-ring"
                  r=".64"
                  fill="none"
                  stroke="var(--horse)"
                  opacity="0"
                />
                <circle cx="-.08" cy="-.28" r=".035" fill="#151321" />
                <text x="0" y=".25" textAnchor="middle" className="ludo-piece-number">
                  {piece + 1}
                </text>
              </g>
            );
          }),
        )}
    </svg>
  );
}
