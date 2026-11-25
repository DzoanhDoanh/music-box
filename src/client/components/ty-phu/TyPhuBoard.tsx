import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { BEACH_RENTS, board, HOTEL, levelNames, type Tile } from '../../../shared/ty-phu/board';
import type { TyPhuPlayer, TyPhuPublicState } from '../../../shared/ty-phu/contracts';
import { baseRent, DICE_MS, STEP_MS, winProgress } from '../../../shared/ty-phu/engine';
import { asEngineState } from '../../lib/ty-phu';
import { centerMapUrl } from './board-art';
import { colorNames, playerColors, stripColor, tilePosition } from './tile-layout';

export { colorNames, playerColors, stripColor, tilePosition };

/** '25d' is the tilted (isometric) table, 'flat' the top-down printed board. */
export type BoardView = '25d' | 'flat';
const VIEW_KEY = 'roomtune:typhu:view';
export function savedView(): BoardView {
  try {
    if (localStorage.getItem(VIEW_KEY) === '2d') return 'flat';
  } catch {
    /* preference only */
  }
  return '25d';
}
export function saveView(view: BoardView) {
  try {
    localStorage.setItem(VIEW_KEY, view === 'flat' ? '2d' : '25d');
  } catch {
    /* preference only */
  }
}

const cornerIcons: Record<string, string> = {
  START: '🏁',
  JAIL: '🚔',
  FESTIVAL: '🎤',
  AIRPORT: '✈️',
};
/** Centre of grid line `k` (1–9) as a fraction of the grid: corners are 1.3 units wide. */
const centre = (k: number) => (k === 1 ? 0.65 : k === 9 ? 8.95 : 1.8 + (k - 2)) / 9.6;
/** The printed grid sits inside a wooden frame this thick (fraction of the board side). */
const FRAME = 0.025;
export const shortName = (t: Tile) =>
  t.name.replace('Biển ', '').replace('Buôn Ma Thuột', 'BMT').replace('TP. Hồ Chí Minh', 'TP.HCM');

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Rent shown on a tile: what landing there costs now, or the bare-land rent when unowned. */
export function tileRent(state: TyPhuPublicState, index: number) {
  const t = board[index];
  if (!t.price) return null;
  if (state.tiles[index]) return baseRent(asEngineState(state), index);
  return t.kind === 'BEACH' ? BEACH_RENTS[1] : Math.round(0.1 * t.price);
}

/**
 * Where a board point (fractions of the board side, 0–1) appears inside the view box.
 * The 2.5D table is the board turned 45° and tilted back without perspective, so the
 * mapping is exact and upright sprites can be placed in plain 2D on top of it.
 */
function project(view: BoardView, fx: number, fy: number) {
  if (view === 'flat') return { left: fx, top: fy };
  const x = fx - 0.5,
    y = fy - 0.5;
  return { left: 0.5 + (x - y) / 2, top: 0.5 + (x + y) / 2 };
}
function tilePoint(index: number, inward = 0) {
  const [row, col] = tilePosition(index);
  const ox = col === 1 ? -1 : col === 9 ? 1 : 0,
    oy = row === 1 ? -1 : row === 9 ? 1 : 0;
  const gx = centre(col) - ox * inward,
    gy = centre(row) - oy * inward;
  return { fx: FRAME + (1 - 2 * FRAME) * gx, fy: FRAME + (1 - 2 * FRAME) * gy };
}
function place(view: BoardView, fx: number, fy: number): CSSProperties {
  const { left, top } = project(view, fx, fy);
  return { left: `${left * 100}%`, top: `${top * 100}%`, zIndex: Math.round(top * 100) + 10 };
}

// ---------------------------------------------------------------- playback

const lastRollKey = (state: TyPhuPublicState) => {
  for (let i = state.log.length - 1; i >= 0; i--)
    if (state.log[i].type === 'roll') return `${state.log[i].at}|${state.log[i].text}`;
  return '';
};

/**
 * Plays each update in order: a new roll first lets the dice fall, then pawns walk one tile
 * at a time (long jumps such as jail, cards and flights land at once). `busy` stays true
 * until both are done, so decisions, cards and money only appear once the pawn arrives.
 */
function usePlayback(players: TyPhuPlayer[], rollKey: string) {
  const [shown, setShown] = useState<Record<string, number>>(() =>
    Object.fromEntries(players.map((p) => [p.id, p.position])),
  );
  const [rolling, setRolling] = useState(false);
  const hold = useRef(0);
  const lastRoll = useRef(rollKey);
  const latest = useRef(players);
  latest.current = players;
  const key = players.map((p) => p.id + ':' + p.position).join() + '|' + rollKey;
  useEffect(() => {
    if (lastRoll.current !== rollKey) {
      lastRoll.current = rollKey;
      if (!reducedMotion()) {
        hold.current = Date.now() + DICE_MS;
        setRolling(true);
      }
    }
    const step = () => {
      if (Date.now() < hold.current) return;
      setRolling(false);
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
    };
    step();
    const timer = setInterval(step, STEP_MS);
    return () => clearInterval(timer);
    // `key` captures every position and the roll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const walking = players.some((p) => (shown[p.id] ?? p.position) !== p.position);
  return { shown, rolling, busy: rolling || walking };
}

type Flight = { key: number; amount: number; from: Point; to: Point; delay: number };
type Point = { x: number; y: number };
type Burst = { key: number; index: number; text: string };

// ---------------------------------------------------------------- sprites

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
/** A small house drawn in 2.5D: front wall, side wall and a two-slope roof. */
function House({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 12 9 15v8l-6-3z" fill={color} stroke="rgba(0,0,0,.45)" strokeWidth=".8" />
      <path d="M9 15 21 11v8L9 23z" fill={color} stroke="rgba(0,0,0,.45)" strokeWidth=".8" />
      <path d="M9 15 21 11v8L9 23z" fill="rgba(0,0,0,.18)" />
      <path d="M3 12 7 4l12-3-4 9z" fill="#b5442b" stroke="rgba(0,0,0,.5)" strokeWidth=".8" />
      <path d="M3 12 7 4l2 11z" fill="#8e3220" stroke="rgba(0,0,0,.5)" strokeWidth=".8" />
      <path d="M7 4 19 1l2 10-6-1z" fill="#c9563a" stroke="rgba(0,0,0,.5)" strokeWidth=".8" />
      <path d="M13 15.6 16 14.6v5l-3 1z" fill="#fff4c2" opacity=".85" />
    </svg>
  );
}
function Hotel({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 28 40" aria-hidden="true">
      <path d="M2 10 12 14v25L2 35z" fill={color} stroke="rgba(0,0,0,.5)" strokeWidth=".8" />
      <path d="M12 14 26 9v25l-14 5z" fill={color} stroke="rgba(0,0,0,.5)" strokeWidth=".8" />
      <path d="M12 14 26 9v25l-14 5z" fill="rgba(0,0,0,.2)" />
      <path d="M2 10 16 5l10 4-14 5z" fill="#f6c453" stroke="rgba(0,0,0,.45)" strokeWidth=".8" />
      {[17, 22, 27, 32].map((y) =>
        [15, 19, 23].map((x) => (
          <rect
            key={`${x}-${y}`}
            x={x}
            y={y - (x - 12) * 0.36}
            width="2.2"
            height="2.6"
            fill="#fff4c2"
            opacity=".9"
          />
        )),
      )}
      {[16, 22, 28].map((y) => (
        <rect key={y} x="4" y={y} width="2" height="2.6" fill="#fff4c2" opacity=".75" />
      ))}
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
  if (beach) return <span className="typhu-umbrella">⛱️</span>;
  if (level === HOTEL)
    return (
      <span className="typhu-hotel">
        <Hotel color={color} />
      </span>
    );
  if (level === 0)
    return (
      <span className="typhu-flag">
        <Flag color={color} />
      </span>
    );
  return (
    <>
      {Array.from({ length: level }, (_, i) => (
        <span key={i} className="typhu-house">
          <House color={color} />
        </span>
      ))}
    </>
  );
}

const tileLabel = (state: TyPhuPublicState, t: Tile, pick: boolean) => {
  const owned = state.tiles[t.index];
  const rent = tileRent(state, t.index);
  return (
    t.name +
    (owned
      ? ` · ${state.players.find((p) => p.id === owned.owner)?.name ?? ''} · ${levelNames[owned.level]}`
      : '') +
    (pick ? ' · có thể chọn' : '') +
    (rent === null ? '' : ` · thuê ${rent}`)
  );
};

// ---------------------------------------------------------------- seats

const SEAT_CORNERS = ['tl', 'tr', 'br', 'bl'] as const;

function nearWin(progress: ReturnType<typeof winProgress>) {
  const hints: string[] = [];
  if (progress.monopolies === 2) hints.push('1 monopoly nữa');
  if (progress.beaches === 3) hints.push('1 bãi biển nữa');
  const line = progress.lines.find((l) => l.total - l.owned === 1);
  if (line) hints.push(`1 ô nữa đủ dãy ${line.side}`);
  return hints;
}

function Seat({
  state,
  player,
  corner,
  me,
  cash,
  seconds,
  delta,
  seatRef,
}: {
  state: TyPhuPublicState;
  player: TyPhuPlayer;
  corner: (typeof SEAT_CORNERS)[number];
  me: string;
  cash: number;
  seconds: number | null;
  delta: { key: number; amount: number } | null;
  seatRef: (el: HTMLDivElement | null) => void;
}) {
  const color = playerColors[player.color];
  const turn = state.status === 'PLAYING' && state.turn === player.id;
  const out = player.status !== 'ACTIVE';
  const close =
    state.status === 'PLAYING' && !out ? nearWin(winProgress(asEngineState(state), player.id)) : [];
  const total = state.rules.turnSeconds;
  return (
    <div
      ref={seatRef}
      role="group"
      className={`typhu-seat seat-${corner}${turn ? ' turn' : ''}${out ? ' out' : ''}`}
      style={{ '--seat': color } as CSSProperties}
      aria-label={`${player.name}: ${cash.toLocaleString('vi-VN')}`}
    >
      <span className="typhu-avatar" aria-hidden="true">
        {turn && seconds !== null && !player.auto && (
          <svg className="typhu-timer" viewBox="0 0 40 40">
            <circle
              cx="20"
              cy="20"
              r="18"
              pathLength="100"
              strokeDasharray={`${Math.min(100, (seconds / total) * 100)} 100`}
            />
          </svg>
        )}
        <b>{player.bot ? '🤖' : player.name.trim().charAt(0).toUpperCase()}</b>
      </span>
      <span className="typhu-seat-text">
        <strong>
          {player.name}
          {player.id === me ? ' (bạn)' : ''}
        </strong>
        <span className="typhu-seat-cash">
          💰{' '}
          {out
            ? player.status === 'BANKRUPT'
              ? 'Phá sản'
              : 'Đã rời'
            : cash.toLocaleString('vi-VN')}
        </span>
        <small>
          {player.jailed ? '🚔 Trong tù · ' : ''}
          {state.status === 'WAITING'
            ? player.bot || player.ready || player.id === state.host
              ? 'Sẵn sàng'
              : 'Chưa sẵn sàng'
            : `Vòng ${player.lap}`}
          {player.pass ? ' 🎫' : ''}
          {player.shield ? ' 🛡️' : ''}
          {player.half ? ' ½' : ''}
          {player.fine ? ' ×2' : ''}
          {turn && seconds !== null && !player.auto ? ` · ${seconds}s` : ''}
        </small>
        {close.length > 0 && <span className="typhu-seat-hot">🔥 {close[0]}</span>}
      </span>
      {delta && (
        <span key={delta.key} className={'typhu-delta ' + (delta.amount > 0 ? 'gain' : 'loss')}>
          {delta.amount > 0 ? '+' : '−'}
          {Math.abs(delta.amount).toLocaleString('vi-VN')}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- table

export type TableControls = {
  /** Bar above the table: whose turn it is, or what the current player must pick. */
  status: ReactNode;
  /** In the middle of the board, by the dice (the roll button). */
  center?: ReactNode;
  /** A dialog over the table (buy, build, buy out). */
  popup?: ReactNode;
  /** Full overlay, e.g. a chance card everyone is looking at. */
  overlay?: ReactNode;
};

export default function TyPhuBoard({
  state,
  me,
  selectable,
  onTile,
  view,
  seconds,
  controls,
}: {
  state: TyPhuPublicState;
  me: string;
  selectable: number[];
  onTile: (index: number) => void;
  view: BoardView;
  seconds: number | null;
  controls: (busy: boolean) => TableControls;
}) {
  const active = state.players.filter((p) => p.status === 'ACTIVE');
  const rollKey = lastRollKey(state);
  const { shown, rolling, busy } = usePlayback(active, rollKey);
  const colorOf = (id: string) => playerColors[state.players.find((p) => p.id === id)?.color ?? 0];
  const [map] = useState(centerMapUrl);
  const arena = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const seats = useRef(new Map<string, HTMLDivElement>());

  // Money is shown as it was until the pawn arrives; then coins fly seat → bank → seat.
  const cashKey = state.players.map((p) => p.id + ':' + p.cash).join();
  const [cash, setCash] = useState<Record<string, number>>(() =>
    Object.fromEntries(state.players.map((p) => [p.id, p.cash])),
  );
  const [flights, setFlights] = useState<Flight[]>([]);
  const [deltas, setDeltas] = useState<Record<string, { key: number; amount: number }>>({});
  const tilesKey = state.tiles.map((t) => (t ? `${t.owner}${t.level}` : '-')).join();
  const [tilesSeen, setTilesSeen] = useState(tilesKey);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const counter = useRef(0);
  useLayoutEffect(() => {
    if (busy) return;
    const changes = state.players
      .map((p) => ({ id: p.id, amount: p.cash - (cash[p.id] ?? p.cash) }))
      .filter((c) => c.amount !== 0);
    if (!changes.length) {
      if (state.players.some((p) => cash[p.id] === undefined))
        setCash(Object.fromEntries(state.players.map((p) => [p.id, p.cash])));
      return;
    }
    setCash(Object.fromEntries(state.players.map((p) => [p.id, p.cash])));
    const nextDeltas: Record<string, { key: number; amount: number }> = {};
    for (const c of changes) nextDeltas[c.id] = { key: ++counter.current, amount: c.amount };
    setDeltas((d) => ({ ...d, ...nextDeltas }));
    if (reducedMotion() || !arena.current || !box.current) return;
    const base = arena.current.getBoundingClientRect();
    const middle = box.current.getBoundingClientRect();
    const bank = {
      x: middle.left + middle.width / 2 - base.left,
      y: middle.top + middle.height / 2 - base.top,
    };
    const seatPoint = (id: string) => {
      const r = seats.current.get(id)?.getBoundingClientRect();
      return r ? { x: r.left + r.width / 2 - base.left, y: r.top + r.height / 2 - base.top } : bank;
    };
    const losses = changes.some((c) => c.amount < 0);
    const made: Flight[] = changes.map((c) => ({
      key: ++counter.current,
      amount: c.amount,
      from: c.amount < 0 ? seatPoint(c.id) : bank,
      to: c.amount < 0 ? bank : seatPoint(c.id),
      delay: c.amount > 0 && losses ? 650 : 0,
    }));
    setFlights((f) => [...f, ...made]);
    const keys = new Set(made.map((m) => m.key));
    setTimeout(() => setFlights((f) => f.filter((m) => !keys.has(m.key))), 1800);
    // `cash` is the shown money; only arrivals of new state should trigger flights.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, cashKey]);
  useEffect(() => {
    if (busy || tilesKey === tilesSeen) return;
    const before = tilesSeen.split(',');
    const now = tilesKey.split(',');
    const made: Burst[] = [];
    now.forEach((value, index) => {
      if (value === before[index]) return;
      const owned = state.tiles[index];
      made.push({
        key: ++counter.current,
        index,
        text: !owned ? '💨' : before[index] === '-' ? '🎉' : '✨',
      });
    });
    setTilesSeen(tilesKey);
    if (reducedMotion() || !made.length) return;
    setBursts((b) => [...b, ...made]);
    const keys = new Set(made.map((m) => m.key));
    setTimeout(() => setBursts((b) => b.filter((m) => !keys.has(m.key))), 1400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, tilesKey]);

  const ctl = controls(busy);
  const dice = state.dice;
  const festival = state.festival;

  const sprites: ReactNode[] = [];
  for (const t of board) {
    const owned = state.tiles[t.index];
    const corner = cornerIcons[t.kind];
    if (corner) {
      const p = tilePoint(t.index);
      sprites.push(
        <span
          key={'c' + t.index}
          className="typhu-sprite typhu-corner-sprite"
          style={place(view, p.fx, p.fy)}
        >
          {corner}
        </span>,
      );
      continue;
    }
    if (owned) {
      const p = tilePoint(t.index, 0.012);
      sprites.push(
        <span
          key={'b' + t.index}
          className="typhu-sprite typhu-buildings"
          style={place(view, p.fx, p.fy)}
        >
          <Buildings level={owned.level} color={colorOf(owned.owner)} beach={t.kind === 'BEACH'} />
        </span>,
      );
    }
    const rent = tileRent(state, t.index);
    if (rent !== null) {
      const p = tilePoint(t.index, -0.04);
      sprites.push(
        <span
          key={'r' + t.index}
          className={
            'typhu-rent' +
            (owned ? ' owned' : '') +
            (owned && owned.blackout > 0 ? ' blackout' : '') +
            (festival === t.index ? ' festival' : '')
          }
          style={
            {
              ...place(view, p.fx, p.fy),
              '--owner': owned ? colorOf(owned.owner) : undefined,
            } as CSSProperties
          }
          aria-hidden="true"
        >
          {owned && owned.blackout > 0 ? '⚡' : festival === t.index ? '🎤' : ''}
          {rent.toLocaleString('vi-VN')}
        </span>,
      );
    }
  }
  for (const b of bursts) {
    const p = tilePoint(b.index);
    sprites.push(
      <span key={'x' + b.key} className="typhu-sprite typhu-burst" style={place(view, p.fx, p.fy)}>
        {b.text}
      </span>,
    );
  }
  active.forEach((p) => {
    const position = shown[p.id] ?? p.position;
    const here = active.filter((o) => (shown[o.id] ?? o.position) === position);
    const slot = here.findIndex((o) => o.id === p.id);
    const at = tilePoint(position, 0.035);
    const spread = (slot - (here.length - 1) / 2) * 0.022;
    sprites.push(
      <span
        key={'p' + p.id}
        className={'typhu-sprite typhu-pawn' + (p.id === state.turn ? ' active' : '')}
        style={place(view, at.fx + spread, at.fy - spread)}
        title={p.name}
      >
        <i className="typhu-pawn-shadow" />
        <span className="typhu-pawn-body" key={position}>
          <Pawn color={playerColors[p.color]} />
        </span>
      </span>,
    );
  });

  return (
    <div className={`typhu-stage view-${view}`}>
      <div className="typhu-status" aria-live="polite">
        {ctl.status}
      </div>
      <div className="typhu-arena" ref={arena}>
        {state.players.map((p, i) => (
          <Seat
            key={p.id}
            state={state}
            player={p}
            corner={SEAT_CORNERS[i]}
            me={me}
            cash={cash[p.id] ?? p.cash}
            seconds={seconds}
            delta={deltas[p.id] ?? null}
            seatRef={(el) => {
              if (el) seats.current.set(p.id, el);
              else seats.current.delete(p.id);
            }}
          />
        ))}
        <div className="typhu-box" ref={box}>
          <div className="typhu-board" role="group" aria-label="Bàn cờ Tỷ Phú Phố Nhạc">
            <div className="typhu-grid">
              {board.map((t) => {
                const [row, col] = tilePosition(t.index);
                const owned = state.tiles[t.index];
                const pick = selectable.includes(t.index);
                const corner = [0, 8, 16, 24].includes(t.index);
                const side = row === 9 ? 'b' : col === 1 ? 'l' : row === 1 ? 't' : 'r';
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
                      `typhu-tile side-${side} kind-` +
                      t.kind.toLowerCase() +
                      (owned ? ' owned' : '') +
                      (pick ? ' selectable' : '') +
                      (selectable.length && !pick ? ' locked' : '') +
                      (owned?.owner === me ? ' mine' : '') +
                      (festival === t.index ? ' festival' : '') +
                      (corner ? ' corner' : '')
                    }
                    style={style}
                    aria-label={tileLabel(state, t, pick)}
                    onClick={() => onTile(t.index)}
                  >
                    {!corner && <i className="typhu-strip" />}
                    <span className="typhu-tile-name">
                      {t.kind === 'CHANCE' ? (
                        <>
                          <b className="typhu-chance-mark">?</b>Cơ hội
                        </>
                      ) : t.kind === 'TAX' ? (
                        '🧾 Thuế'
                      ) : corner ? (
                        t.name
                      ) : (
                        shortName(t)
                      )}
                    </span>
                  </button>
                );
              })}
              <div
                className="typhu-center"
                style={map ? { backgroundImage: `url(${map})` } : undefined}
                aria-hidden="true"
              />
            </div>
          </div>
          <div className="typhu-sprites" aria-hidden="true">
            {sprites}
          </div>
          <div className="typhu-center-controls">
            <div className="typhu-tray" aria-hidden={!dice}>
              <Dice3D dice={dice} roll={rollKey} rolling={rolling} />
            </div>
            {ctl.center}
          </div>
        </div>
        {flights.map((f) => (
          <span
            key={f.key}
            className={'typhu-coin ' + (f.amount > 0 ? 'gain' : 'loss')}
            style={
              {
                '--x1': `${f.from.x}px`,
                '--y1': `${f.from.y}px`,
                '--x2': `${f.to.x}px`,
                '--y2': `${f.to.y}px`,
                animationDelay: `${f.delay}ms`,
              } as CSSProperties
            }
            aria-hidden="true"
          >
            💰 {Math.abs(f.amount).toLocaleString('vi-VN')}
          </span>
        ))}
        {ctl.popup && <div className="typhu-popup-layer">{ctl.popup}</div>}
        {ctl.overlay}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- dice

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
/** Two CSS dice that drop into the tray and tumble whenever `roll` changes. */
export function Dice3D({
  dice,
  roll,
  rolling = false,
}: {
  dice: [number, number] | null;
  roll: string;
  rolling?: boolean;
}) {
  const [turns, setTurns] = useState(0);
  const [seen, setSeen] = useState(roll);
  if (seen !== roll) {
    setSeen(roll);
    setTurns((n) => n + 1);
  }
  return (
    <div
      className={'typhu-dice' + (rolling ? ' rolling' : '')}
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
