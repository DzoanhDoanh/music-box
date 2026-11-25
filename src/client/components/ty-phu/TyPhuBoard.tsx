import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { RotateCcw, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';
import { board, HOTEL, levelNames, type Tile } from '../../../shared/ty-phu/board';
import type { TyPhuPlayer, TyPhuPublicState } from '../../../shared/ty-phu/contracts';
import { centerMapUrl } from './board-art';
import { colorNames, playerColors, stripColor, tilePosition } from './tile-layout';

export { colorNames, playerColors, stripColor, tilePosition };
const TyPhuScene = lazy(() => import('./TyPhuScene'));

const cornerIcons: Record<string, string> = {
  START: '🏁',
  JAIL: '🔒',
  FESTIVAL: '🎤',
  AIRPORT: '✈️',
};
/** Centre of grid line `k` (1–9) as a fraction of the board: corners are 1.3 units wide. */
const centre = (k: number) => (k === 1 ? 0.65 : k === 9 ? 8.95 : 1.8 + (k - 2)) / 9.6;
export const shortName = (t: Tile) =>
  t.name.replace('Biển ', '').replace('Buôn Ma Thuột', 'BMT').replace('TP. Hồ Chí Minh', 'TP.HCM');

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

let webgl: boolean | null = null;
/**
 * Whether this browser can draw the 3D table at all. Probed once: every probe opens a
 * WebGL context, and browsers drop the oldest context (the live table) past ~16 of them.
 */
export function webglAvailable() {
  if (webgl !== null) return webgl;
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    webgl = Boolean(context);
    context?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webgl = false;
  }
  return webgl;
}

/**
 * Tokens walk one tile at a time to their new square; long jumps (jail, cards, flights)
 * and reduced-motion users skip straight there.
 */
function useWalkingPositions(players: TyPhuPlayer[]) {
  const [shown, setShown] = useState<Record<string, number>>(() =>
    Object.fromEntries(players.map((p) => [p.id, p.position])),
  );
  const latest = useRef(players);
  latest.current = players;
  const key = players.map((p) => p.id + ':' + p.position).join();
  useEffect(() => {
    const step = () =>
      setShown((previous) => {
        let changed = false;
        const next = { ...previous };
        for (const p of latest.current) {
          const at = previous[p.id] ?? p.position;
          if (at === p.position) continue;
          const distance = (p.position - at + board.length) % board.length;
          next[p.id] = distance > 12 || reducedMotion() ? p.position : (at + 1) % board.length;
          changed = true;
        }
        return changed ? next : previous;
      });
    step();
    const timer = setInterval(step, 200);
    return () => clearInterval(timer);
  }, [key]);
  return shown;
}

function Pawn({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 40" aria-hidden="true">
      <defs>
        <radialGradient id={`pawn-${color.slice(1)}`} cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.75" />
          <stop offset="0.35" stopColor={color} />
          <stop offset="1" stopColor={color} stopOpacity="0.85" />
        </radialGradient>
      </defs>
      <g fill={`url(#pawn-${color.slice(1)})`} stroke="rgba(0,0,0,.45)" strokeWidth="1.2">
        <path d="M4 38c0-3 2-5 4-6l2-12h4l2 12c2 1 4 3 4 6z" />
        <ellipse cx="12" cy="20" rx="6" ry="2.4" />
        <circle cx="12" cy="10" r="7" />
      </g>
    </svg>
  );
}
function House({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M2 9 10 2l8 7v9H2z" fill={color} stroke="rgba(0,0,0,.5)" strokeWidth="1.2" />
      <path d="M1 9.5 10 1.6l9 7.9" fill="none" stroke="#7a2e1e" strokeWidth="2" />
      <rect x="8" y="12" width="4" height="6" fill="rgba(0,0,0,.35)" />
    </svg>
  );
}
function Hotel({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 22 34" aria-hidden="true">
      <rect x="2" y="4" width="18" height="29" rx="1.5" fill={color} stroke="rgba(0,0,0,.5)" />
      <rect x="0.5" y="1" width="21" height="4" rx="1" fill="#f6c453" stroke="rgba(0,0,0,.45)" />
      {[8, 13, 18, 23].map((y) =>
        [5, 10, 15].map((x) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="3" height="3" fill="#fff4c2" opacity=".9" />
        )),
      )}
      <rect x="9" y="27" width="4" height="6" fill="rgba(0,0,0,.4)" />
    </svg>
  );
}
function Flag({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 16 24" aria-hidden="true">
      <rect x="2" y="1" width="1.6" height="22" fill="#5f5e5a" />
      <path d="M3.6 2h11l-3 4 3 4h-11z" fill={color} stroke="rgba(0,0,0,.4)" strokeWidth=".8" />
    </svg>
  );
}
function Buildings({ level, color, beach }: { level: number; color: string; beach: boolean }) {
  return (
    <span className="typhu-build" aria-hidden="true">
      {beach ? (
        <span className="typhu-umbrella">⛱️</span>
      ) : level === HOTEL ? (
        <span className="typhu-hotel">
          <Hotel color={color} />
        </span>
      ) : level === 0 ? (
        <span className="typhu-flag">
          <Flag color={color} />
        </span>
      ) : (
        Array.from({ length: level }, (_, i) => (
          <span key={i} className="typhu-house">
            <House color={color} />
          </span>
        ))
      )}
    </span>
  );
}

const tileLabel = (state: TyPhuPublicState, t: Tile, pick: boolean) => {
  const owned = state.tiles[t.index];
  return (
    t.name +
    (owned
      ? ` · ${state.players.find((p) => p.id === owned.owner)?.name ?? ''} · ${levelNames[owned.level]}`
      : t.price
        ? ` · giá ${t.price}`
        : '') +
    (pick ? ' · có thể chọn' : '')
  );
};

export type BoardView = '3d' | '2d';

export default function TyPhuBoard({
  state,
  me,
  selectable,
  onTile,
  view,
  onFailure3d,
  center,
  hud,
}: {
  state: TyPhuPublicState;
  me: string;
  selectable: number[];
  onTile: (index: number) => void;
  view: BoardView;
  onFailure3d: () => void;
  center: ReactNode;
  hud: ReactNode;
}) {
  const active = state.players.filter((p) => p.status === 'ACTIVE');
  const shown = useWalkingPositions(active);
  const flat = (
    <Board2D
      state={state}
      me={me}
      selectable={selectable}
      onTile={onTile}
      shown={shown}
      center={center}
    />
  );
  if (view === '2d') return flat;
  return (
    <Table3D
      state={state}
      selectable={selectable}
      onTile={onTile}
      shown={shown}
      onFailure={onFailure3d}
      hud={hud}
      loading={<div className="typhu-table-loading">Đang bày bàn cờ 3D…</div>}
    />
  );
}

function Table3D({
  state,
  selectable,
  onTile,
  shown,
  onFailure,
  hud,
  loading,
}: {
  state: TyPhuPublicState;
  selectable: number[];
  onTile: (index: number) => void;
  shown: Record<string, number>;
  onFailure: () => void;
  hud: ReactNode;
  loading: ReactNode;
}) {
  const [spin, setSpin] = useState(() => {
    try {
      return Number(localStorage.getItem('roomtune:typhu:spin')) || 0;
    } catch {
      return 0;
    }
  });
  const [zoom, setZoom] = useState(1);
  const [focused, setFocused] = useState<number | null>(null);
  // A lost GPU context (driver reset, tab in background, memory pressure) rebuilds the table
  // a couple of times before giving up on 3D.
  const [attempt, setAttempt] = useState(0);
  const [yawDrag, setYawDrag] = useState(0);
  const drag = useRef<{ x: number; yaw: number } | null>(null);
  const moved = useRef(0);
  const turn = (by: number) => {
    setYawDrag(0);
    setSpin((value) => {
      const next = value + by;
      try {
        localStorage.setItem('roomtune:typhu:spin', String(next));
      } catch {
        /* preference only */
      }
      return next;
    });
  };
  return (
    <div className="typhu-table">
      <Suspense fallback={loading}>
        <div
          className="typhu-canvas"
          aria-hidden="true"
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, yaw: yawDrag };
            moved.current = 0;
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || e.buttons !== 1) return;
            const dx = e.clientX - d.x;
            moved.current = Math.max(moved.current, Math.abs(dx));
            if (moved.current > 6) setYawDrag(d.yaw - dx * 0.008);
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerLeave={() => (drag.current = null)}
        >
          <TyPhuScene
            key={attempt}
            state={state}
            shown={shown}
            selectable={selectable}
            focused={focused}
            onTile={onTile}
            yaw={Math.PI / 4 + (spin * Math.PI) / 2 + yawDrag}
            zoom={zoom}
            onFailure={() => (attempt < 2 ? setAttempt((n) => n + 1) : onFailure())}
            dragged={() => moved.current > 6}
          />
        </div>
        <div className="typhu-hud">{hud}</div>
        <div className="typhu-spin">
          <button
            type="button"
            aria-label="Thu nhỏ"
            onClick={() => setZoom((z) => Math.min(1.35, z + 0.12))}
          >
            <ZoomOut size={16} />
          </button>
          <button
            type="button"
            aria-label="Phóng to"
            onClick={() => setZoom((z) => Math.max(0.7, z - 0.12))}
          >
            <ZoomIn size={16} />
          </button>
          <button type="button" aria-label="Xoay bàn sang trái" onClick={() => turn(-1)}>
            <RotateCcw size={16} />
          </button>
          <button type="button" aria-label="Xoay bàn sang phải" onClick={() => turn(1)}>
            <RotateCw size={16} />
          </button>
        </div>
      </Suspense>
      {/* Keyboard and screen-reader access to every tile; focus highlights it on the table. */}
      <div className="typhu-sr-board" role="group" aria-label="Bàn cờ Tỷ Phú Phố Nhạc 3D">
        {board.map((t) => {
          const pick = selectable.includes(t.index);
          return (
            <button
              key={t.index}
              type="button"
              aria-label={tileLabel(state, t, pick)}
              onFocus={() => setFocused(t.index)}
              onBlur={() => setFocused(null)}
              onClick={() => onTile(t.index)}
            />
          );
        })}
      </div>
    </div>
  );
}

function Board2D({
  state,
  me,
  selectable,
  onTile,
  shown,
  center,
}: {
  state: TyPhuPublicState;
  me: string;
  selectable: number[];
  onTile: (index: number) => void;
  shown: Record<string, number>;
  center: ReactNode;
}) {
  const active = state.players.filter((p) => p.status === 'ACTIVE');
  const colorOf = (id: string) => playerColors[state.players.find((p) => p.id === id)?.color ?? 0];
  const [map] = useState(centerMapUrl);
  return (
    <div className="typhu-board-wrap">
      <div className="typhu-board" role="group" aria-label="Bàn cờ Tỷ Phú Phố Nhạc">
        {board.map((t) => {
          const [row, col] = tilePosition(t.index);
          const owned = state.tiles[t.index];
          const pick = selectable.includes(t.index);
          const corner = [0, 8, 16, 24].includes(t.index);
          const style = {
            gridRow: row,
            gridColumn: col,
            '--owner': owned ? colorOf(owned.owner) : 'transparent',
            '--strip': stripColor(t),
          } as CSSProperties;
          return (
            <button
              key={t.index}
              type="button"
              className={
                'typhu-tile kind-' +
                t.kind.toLowerCase() +
                (owned ? ' owned' : '') +
                (pick ? ' selectable' : '') +
                (owned?.owner === me ? ' mine' : '') +
                (state.festival === t.index ? ' festival' : '') +
                (corner ? ' corner' : '')
              }
              style={style}
              aria-label={tileLabel(state, t, pick)}
              onClick={() => onTile(t.index)}
            >
              {cornerIcons[t.kind] ? (
                <>
                  <span className="typhu-corner-icon" aria-hidden="true">
                    {cornerIcons[t.kind]}
                  </span>
                  <span className="typhu-tile-name">{t.name}</span>
                </>
              ) : (
                <>
                  <i className="typhu-strip" />
                  <span className="typhu-tile-name">
                    {t.kind === 'CHANCE' ? (
                      <>
                        <b className="typhu-chance-mark">?</b>Cơ hội
                      </>
                    ) : t.kind === 'TAX' ? (
                      '🧾 Thuế nhà'
                    ) : (
                      shortName(t)
                    )}
                  </span>
                  {!owned && t.price ? <span className="typhu-price">{t.price}</span> : null}
                  {owned && (
                    <Buildings
                      level={owned.level}
                      color={colorOf(owned.owner)}
                      beach={t.kind === 'BEACH'}
                    />
                  )}
                </>
              )}
              {state.festival === t.index && (
                <span className="typhu-festival" title="Đang tổ chức Đại nhạc hội">
                  🎤
                </span>
              )}
              {owned && owned.blackout > 0 && (
                <span className="typhu-blackout" title="Đang mất điện">
                  ⚡
                </span>
              )}
            </button>
          );
        })}
        <div className="typhu-center" style={map ? { backgroundImage: `url(${map})` } : undefined}>
          {center}
        </div>
        <div className="typhu-token-layer" aria-hidden="true">
          {active.map((p) => {
            const position = shown[p.id] ?? p.position;
            const [row, col] = tilePosition(position);
            const here = active.filter((o) => (shown[o.id] ?? o.position) === position);
            const slot = here.findIndex((o) => o.id === p.id);
            return (
              <span
                key={p.id}
                className={'typhu-pawn' + (p.id === state.turn ? ' active' : '')}
                style={{
                  left: `${(centre(col) + (slot - (here.length - 1) / 2) * 0.028) * 100}%`,
                  top: `${(centre(row) + (slot % 2 ? 0.012 : -0.006)) * 100}%`,
                }}
                title={p.name}
              >
                <i className="typhu-pawn-shadow" />
                <span className="typhu-pawn-body" key={position}>
                  <Pawn color={playerColors[p.color]} />
                </span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** A six-faced CSS die for the 2D board that tumbles whenever `roll` changes. */
const faceTurn: Record<number, string> = {
  1: 'rotateX(0deg) rotateY(0deg)',
  2: 'rotateX(0deg) rotateY(-90deg)',
  3: 'rotateX(-90deg) rotateY(0deg)',
  4: 'rotateX(90deg) rotateY(0deg)',
  5: 'rotateX(0deg) rotateY(90deg)',
  6: 'rotateX(0deg) rotateY(180deg)',
};
const pips: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};
export function Dice3D({ dice, roll }: { dice: [number, number] | null; roll: string }) {
  const [turns, setTurns] = useState(0);
  const [seen, setSeen] = useState(roll);
  if (seen !== roll) {
    setSeen(roll);
    setTurns((n) => n + 1);
  }
  return (
    <div
      className="typhu-dice"
      role="img"
      aria-label={dice ? `Xúc xắc ${dice.join(' và ')}` : 'Chưa tung'}
    >
      {(dice ?? [1, 1]).map((value, i) => (
        <span key={i} className={'typhu-die3d' + (dice ? '' : ' idle')}>
          <span
            className="typhu-cube"
            style={{
              transform: `rotateX(${turns * (i ? 720 : 360)}deg) rotateY(${turns * (i ? 360 : 720)}deg) ${faceTurn[value]}`,
            }}
          >
            {[1, 2, 3, 4, 5, 6].map((face) => (
              <span key={face} className={`typhu-face f${face}`}>
                {Array.from({ length: 9 }, (_, cell) => (
                  <i key={cell} className={pips[face].includes(cell) ? 'on' : ''} />
                ))}
              </span>
            ))}
          </span>
        </span>
      ))}
    </div>
  );
}
