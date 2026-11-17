import { useId, useLayoutEffect, useRef } from 'react';
import { getLegalMoves, isSafe } from '../../../shared/game/engine';
import { colorNames, type GameState, type LegalMove } from '../../../shared/game/contracts';
import { boardTrack, origins, homeLane, piecePoint } from './board-geometry';
import { lastPosition, trackLength } from '../../../shared/game/board';
import { committedMotion, pieceLayout } from './board-motion';
import PieceFigure, { horseShape } from './PieceFigure';
import { pieceSkinName } from '../../../shared/game/piece-skins';
export { track, piecePoint } from './board-geometry';

export default function LudoBoard({
  state,
  actor,
  disabled,
  selectedPiece,
  onMove,
  onDestination,
}: {
  state: GameState;
  actor: string;
  disabled: boolean;
  selectedPiece?: number | null;
  onMove: (piece: number) => void;
  onDestination: (move: LegalMove) => void;
}) {
  const id = useId().replace(/:/g, '');
  const legal = getLegalMoves(state, actor);
  const v2 = state.schema === 2;
  const track = boardTrack(state.schema);
  const quarter = trackLength(state.schema) / 4;
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
      (state.last.captures?.length ||
        state.last.type === 'finished' ||
        state.last.to === lastPosition(state.schema))
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
  const destinations = new Map<number, LegalMove[]>();
  for (const move of legal) {
    if (selectedPiece != null && move.piece !== selectedPiece) continue;
    destinations.set(move.to, [...(destinations.get(move.to) ?? []), move]);
  }
  return (
    <svg
      ref={board}
      className="ludo-board"
      data-board-version={state.schema}
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
          <rect
            x={x + 0.12}
            y={y + 0.12}
            width="5.76"
            height="5.76"
            rx=".22"
            className="ludo-home"
          />
          <circle cx={x + 3} cy={y + 3.05} r="2.3" className="ludo-home-inner" />
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
      {track.map(([x, y], i) => {
        const start = i % quarter === 0;
        const gate = i % quarter === quarter - 1;
        const color = gate ? ((i + 1) / quarter) % 4 : Math.floor(i / quarter);
        return (
          <g
            key={i}
            data-track={i}
            data-gate={gate ? color : undefined}
            data-start={start ? color : undefined}
            className={'ludo-color-' + color}
          >
            <title>
              {start
                ? 'Xuất quân · ' +
                  colorNames[color] +
                  (v2
                    ? isSafe(i, state.rules)
                      ? ' · Ô an toàn, chỉ một ngựa cùng màu; màu khác chỉ đi qua'
                      : ' · Luật cũ, không an toàn'
                    : '')
                : gate
                  ? 'Cửa chuồng · ' + colorNames[color]
                  : 'Đường đi'}
            </title>
            <circle
              cx={x + 0.5}
              cy={y + 0.5}
              r=".39"
              className={'ludo-cell ' + (start ? 'ludo-start' : gate ? 'ludo-gate' : '')}
            />
            {start && (
              <path
                d={horseShape}
                transform={`translate(${x + 0.5} ${y + 0.57}) scale(.68)`}
                className="ludo-start-symbol"
              />
            )}
            {gate && (
              <path
                d="M-.23,0 H.23 M.04,-.18 L.23,0 L.04,.18"
                transform={`translate(${x + 0.5} ${y + 0.5}) rotate(${color * 90})`}
                className="ludo-route-arrow"
              />
            )}
            {isSafe(i, state.rules) && (
              <circle cx={x + 0.5} cy={y + 0.5} r=".47" className="ludo-safe">
                <title>
                  {v2
                    ? 'Ô xuất quân an toàn · Màu khác chỉ đi qua, không được dừng'
                    : 'Ô an toàn · Luật bàn cũ'}
                </title>
              </circle>
            )}
          </g>
        );
      })}
      {[0, 1, 2, 3].map((color) => (
        <g key={color} className={'ludo-color-' + color}>
          {[0, 1, 2, 3, 4, 5].map((n) => {
            const [x, y] = homeLane(color, n);
            return (
              <g key={n} data-home={color + ':' + (n + 1)}>
                <rect
                  x={x + 0.04}
                  y={y + 0.04}
                  width=".92"
                  height=".92"
                  rx=".04"
                  className="ludo-lane"
                />
                <text x={x + 0.5} y={y + 0.65} textAnchor="middle" className="ludo-lane-number">
                  {n + 1}
                </text>
              </g>
            );
          })}
        </g>
      ))}
      <g className="ludo-center" aria-hidden="true">
        <path d="M7.12,7.12 L7.5,7.5 L7.12,7.88 Z" fill="var(--horse-0)" />
        <path d="M7.12,7.12 L7.88,7.12 L7.5,7.5 Z" fill="var(--horse-1)" />
        <path d="M7.88,7.12 L7.88,7.88 L7.5,7.5 Z" fill="var(--horse-2)" />
        <path d="M7.12,7.88 L7.88,7.88 L7.5,7.5 Z" fill="var(--horse-3)" />
      </g>
      {[...destinations].map(([to, moves]) => {
        const move = moves[0];
        const p = state.players.find((p) => p.id === actor)!;
        const [x, y] = piecePoint(p.color, move.to, move.piece, state.schema);
        const allowed = !disabled && moves.length === 1;
        const label =
          moves.length === 1
            ? `Đi tới ô sáng · ${pieceSkinName(p.skin)} ${move.piece + 1} · ${move.moveKind === 'JUMP' ? 'Nhảy tới cửa chuồng' : to >= trackLength(state.schema) ? 'Vào bậc ' + (to - trackLength(state.schema) + 1) : 'Đi tới ô ' + to}`
            : `${moves.length} quân có thể tới ô này; chọn quân bằng số ở dưới bàn.`;
        return (
          <g
            key={to}
            data-destination={to}
            className="ludo-target"
            role={moves.length === 1 ? 'button' : undefined}
            tabIndex={allowed ? 0 : -1}
            aria-disabled={!allowed}
            aria-label={label}
            pointerEvents={allowed ? 'auto' : 'none'}
            onClick={() => {
              if (allowed) onDestination(move);
            }}
            onKeyDown={(e) => {
              if (allowed && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onDestination(move);
              }
            }}
          >
            <title>{label}</title>
            <rect x={x - 0.5} y={y - 0.5} width="1" height="1" className="ludo-hit" />
            <circle cx={x} cy={y} r=".43" className="ludo-destination" />
          </g>
        );
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
                data-skin={p.skin ?? 'HORSE'}
                className={
                  'ludo-piece ludo-color-' +
                  p.color +
                  (allowed ? ' can-move' : '') +
                  (moved ? ' just-moved' : '') +
                  (moved && n === lastPosition(state.schema) ? ' just-finished' : '') +
                  (state.last.captures?.includes(p.id + ':' + piece) ? ' just-captured' : '')
                }
                style={{
                  transform: `translate(${x}px,${y}px) scale(${scale})`,
                  filter: 'url(#' + id + 'shadow)',
                }}
                role="button"
                pointerEvents={allowed ? 'auto' : 'none'}
                tabIndex={allowed ? 0 : -1}
                aria-disabled={!allowed}
                aria-label={
                  pieceSkinName(p.skin) +
                  ' ' +
                  (piece + 1) +
                  ' · ' +
                  colorNames[p.color] +
                  ' · ' +
                  p.name +
                  ' · ' +
                  (n === -1
                    ? 'chưa ra quân'
                    : v2 && n >= 56
                      ? 'chuồng bậc ' + (n - 55)
                      : v2 && n === 55
                        ? 'cửa chuồng của mình'
                        : n === lastPosition(state.schema)
                          ? 'đã về đích'
                          : 'ô ' + n)
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
                  {p.name} · {pieceSkinName(p.skin)} {piece + 1}
                  {stack > 1 ? ` · ${stack} quân trên ô` : ''}
                </title>
                <rect x="-.5" y="-.5" width="1" height="1" className="ludo-hit" />
                {allowed && <circle r=".47" className="ludo-halo" pointerEvents="none" />}
                <ellipse
                  cy=".13"
                  rx=".36"
                  ry=".28"
                  className="ludo-piece-shadow"
                  pointerEvents="none"
                />
                <PieceFigure skin={p.skin} number={piece + 1} gloss={'url(#' + id + 'gloss)'} />
                <circle
                  className="ludo-event-ring"
                  pointerEvents="none"
                  r=".64"
                  fill="none"
                  stroke="var(--horse)"
                  opacity="0"
                />
              </g>
            );
          }),
        )}
    </svg>
  );
}
