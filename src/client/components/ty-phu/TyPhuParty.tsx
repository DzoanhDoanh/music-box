import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Bot,
  Crown,
  Dices,
  Flag,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Users,
  X,
} from 'lucide-react';
import type { Snapshot } from '../../../shared/contracts';
import {
  BEACH_RENTS,
  FESTIVAL_FEE,
  FLY_FEE,
  HOTEL,
  JAIL_FINE,
  board,
  cities,
  levelNames,
  levelRent,
  tile as tileAt,
} from '../../../shared/ty-phu/board';
import { cards } from '../../../shared/ty-phu/cards';
import {
  defaultTyPhuRules,
  type TyPhuPublicState,
  type TyPhuRules,
  type WinReason,
} from '../../../shared/ty-phu/contracts';
import {
  baseRent,
  buildCap,
  buildCost,
  bankSalePrice,
  buyoutPrice,
  liquidationValue,
  cardTargets,
  currentPrice,
  flyTargets,
  winProgress,
} from '../../../shared/ty-phu/engine';
import { asEngineState, openRematch, useTyPhu, useTyPhuList } from '../../lib/ty-phu';
import { AsyncButton, Button, Confirm, ErrorState, Loading } from '../ui';
import TyPhuBoard, {
  colorNames,
  playerColors,
  saveView,
  savedView,
  stripColor,
  tileRent,
  type BoardView,
  type TableControls,
} from './TyPhuBoard';
import '../game/game.css';
import './ty-phu.css';

const money = (n: number) => n.toLocaleString('vi-VN');
const winNames: Record<WinReason, string> = {
  MONOPOLY: 'Sở hữu 3 monopoly',
  LINE: 'Độc chiếm một dãy nhà',
  BEACHES: 'Sở hữu đủ 4 bãi biển',
  LAST_STANDING: 'Người trụ lại cuối cùng',
  TIME: 'Giàu nhất khi hết giờ',
};
const statusNames = {
  WAITING: 'Đang chờ người chơi',
  PLAYING: 'Đang chơi',
  FINISHED: 'Đã kết thúc',
  CANCELLED: 'Đã hủy',
};

export default function TyPhuParty({
  snapshot,
  game,
}: {
  snapshot: Snapshot;
  game: string | null;
}) {
  return game ? (
    <TyPhuMatch key={game} snapshot={snapshot} game={game} />
  ) : (
    <TyPhuLobby snapshot={snapshot} />
  );
}

// ---------------------------------------------------------------- lobby

function TyPhuLobby({ snapshot }: { snapshot: Snapshot }) {
  const room = snapshot.room.id;
  const navigate = useNavigate();
  const { query, create } = useTyPhuList(room, snapshot.me);
  const [name, setName] = useState('Tỷ phú cùng nhau');
  const [rules, setRules] = useState<TyPhuRules>(defaultTyPhuRules);
  return (
    <section className="typhu-party" aria-label="Tỷ Phú Phố Nhạc">
      <header className="typhu-hero">
        <span className="typhu-eyebrow">ROOMTUNE PLAY · CỜ TỶ PHÚ</span>
        <h1>Tỷ Phú Phố Nhạc</h1>
        <p>
          Đi từ Hà Giang vào TP. Hồ Chí Minh, mua đất, xây khách sạn và tổ chức Đại nhạc hội. Thắng
          ngay khi có 3 monopoly, một dãy nhà hoặc 4 bãi biển.
        </p>
      </header>
      <div className="typhu-lobby-grid">
        <form
          className="typhu-card"
          onSubmit={(e) => e.preventDefault()}
          aria-labelledby="typhu-create-title"
        >
          <h2 id="typhu-create-title">Mở bàn mới</h2>
          <label>
            Tên bàn
            <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="typhu-form-row">
            <label>
              Tiền khởi đầu
              <select
                value={rules.startCash}
                onChange={(e) => setRules({ ...rules, startCash: Number(e.target.value) })}
              >
                {[1500, 2000, 2500, 3000].map((n) => (
                  <option key={n} value={n}>
                    {money(n)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Thời lượng
              <select
                value={rules.minutes ?? 'none'}
                onChange={(e) =>
                  setRules({
                    ...rules,
                    minutes:
                      e.target.value === 'none' ? null : (Number(e.target.value) as 30 | 45 | 60),
                  })
                }
              >
                <option value={30}>30 phút</option>
                <option value={45}>45 phút</option>
                <option value={60}>60 phút</option>
                <option value="none">Không giới hạn</option>
              </select>
            </label>
            <label>
              Mỗi lượt
              <select
                value={rules.turnSeconds}
                onChange={(e) =>
                  setRules({
                    ...rules,
                    turnSeconds: Number(e.target.value) as TyPhuRules['turnSeconds'],
                  })
                }
              >
                {[30, 45, 60, 90].map((n) => (
                  <option key={n} value={n}>
                    {n} giây
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="typhu-check">
            <input
              type="checkbox"
              checked={rules.buyout}
              onChange={(e) => setRules({ ...rules, buyout: e.target.checked })}
            />
            Cho phép mua lại thành phố của đối thủ (×1,5 giá hiện tại)
          </label>
          <AsyncButton
            variant="primary"
            disabled={name.trim().length < 2}
            onClick={async () => {
              const result = await create(name.trim(), rules);
              navigate(`/room/${room}/games/ty-phu/${result.state.id}`);
            }}
          >
            <Plus size={17} /> Mở bàn
          </AsyncButton>
        </form>
        <section className="typhu-card" aria-labelledby="typhu-list-title">
          <h2 id="typhu-list-title">Các bàn trong phòng</h2>
          {query.isPending ? (
            <Loading>Đang tìm bàn…</Loading>
          ) : query.error ? (
            <ErrorState error={query.error} retry={() => void query.refetch()} />
          ) : query.data.matches.length ? (
            <ul className="typhu-table-list">
              {query.data.matches.map((m) => {
                const seated = m.players.some((p) => p.id === snapshot.me);
                return (
                  <li key={m.id}>
                    <Link to={`/room/${room}/games/ty-phu/${m.id}`}>
                      <strong>{m.name}</strong>
                      <small>
                        {statusNames[m.status]} · {m.players.length}/4 người
                        {m.winner
                          ? ` · ${m.players.find((p) => p.id === m.winner)?.name ?? ''} thắng`
                          : ''}
                      </small>
                      <span className="typhu-seats" aria-hidden="true">
                        {m.players.map((p) => (
                          <i key={p.id} style={{ background: playerColors[p.color] }} />
                        ))}
                      </span>
                      <span className="typhu-enter">
                        {seated ? 'Vào lại →' : m.status === 'WAITING' ? 'Vào bàn →' : 'Xem →'}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted">Chưa có bàn nào. Mở bàn đầu tiên và rủ cả phòng vào chơi.</p>
          )}
        </section>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- match

function useNow(interval = 500) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(timer);
  }, [interval]);
  return now;
}

type Send = ReturnType<typeof useTyPhu>['send'];
/** Phases where the player picks a tile on the board; the prompt sits above the table. */
const pickPhases = ['FLY', 'CARD', 'FESTIVAL', 'START_BUILD', 'DEBT'];
/** Decisions shown as a dialog over the table. */
const popupPhases = ['BUY', 'BUILD', 'BUYOUT'];

function TyPhuMatch({ snapshot, game }: { snapshot: Snapshot; game: string }) {
  const room = snapshot.room.id,
    me = snapshot.me;
  const { query, send, pending, connection, offset } = useTyPhu(room, me, game);
  const now = useNow();
  const [detail, setDetail] = useState<number | null>(null);
  const [giftTile, setGiftTile] = useState<number | null>(null);
  const [view, setView] = useState<BoardView>(savedView);
  const chooseView = (next: BoardView) => {
    setView(next);
    saveView(next);
  };
  const state = query.data?.state;
  // Tile info closes when the turn passes, so it never hides the next player's choices.
  const turnKey = `${state?.turn}|${state?.phase}`;
  useEffect(() => setDetail(null), [turnKey]);
  const engine = useMemo(() => (state ? asEngineState(state) : null), [state]);
  if (!state || !engine) {
    return query.error ? (
      <ErrorState error={query.error} retry={() => void query.refetch()} />
    ) : (
      <Loading>Đang dọn bàn cờ…</Loading>
    );
  }
  const mine = state.players.find((p) => p.id === me);
  const current = state.players.find((p) => p.id === state.turn);
  const paused = state.status === 'PLAYING' ? (state.paused ?? null) : null;
  const myTurn =
    state.status === 'PLAYING' && state.turn === me && mine?.status === 'ACTIVE' && !paused;
  const seconds =
    state.deadline === null
      ? null
      : Math.max(0, Math.ceil((state.deadline - (now + offset.current)) / 1000));
  const canPause = state.status === 'PLAYING' && mine?.status === 'ACTIVE' && !mine.bot;

  const ownCities = cities.filter((c) => state.tiles[c.index]?.owner === me).map((c) => c.index);
  let selectable: number[] = [];
  if (myTurn && mine) {
    if (state.phase === 'CARD' && state.pending?.card)
      selectable = giftTile === null ? cardTargets(engine, mine, state.pending.card) : [];
    else if (state.phase === 'FESTIVAL') selectable = ownCities;
    else if (state.phase === 'START_BUILD')
      selectable = ownCities.filter((i) => {
        const level = state.tiles[i]!.level;
        return level < buildCap(mine, level) && buildCost(i, level, level + 1) <= mine.cash;
      });
    else if (state.phase === 'FLY') selectable = flyTargets(engine, mine);
    else if (state.phase === 'DEBT')
      selectable = board.filter((t) => state.tiles[t.index]?.owner === me).map((t) => t.index);
  }

  const onTile = (index: number) => {
    if (!selectable.includes(index)) return setDetail(index);
    if (state.phase === 'FESTIVAL') void send({ action: 'festival', tile: index });
    else if (state.phase === 'START_BUILD') void send({ action: 'start_build', tile: index });
    else if (state.phase === 'FLY') void send({ action: 'fly', to: index });
    else if (state.phase === 'DEBT') void send({ action: 'sell', tile: index });
    else if (state.phase === 'CARD') {
      if (state.pending?.card === 'GIFT') setGiftTile(index);
      else void send({ action: 'card_target', tile: index });
    }
  };

  const turnLine =
    state.status === 'PLAYING' && current ? (
      <span className="typhu-turn" style={{ color: playerColors[current.color] }}>
        {current.id === me ? 'Lượt của bạn' : `Lượt của ${current.name}`}
        {paused ? null : current.bot ? (
          <b> · đang nghĩ…</b>
        ) : (
          seconds !== null && <b className={seconds <= 10 ? 'urgent' : ''}> · {seconds}s</b>
        )}
      </span>
    ) : state.status === 'FINISHED' ? (
      <span className="typhu-turn">
        <Crown size={16} /> {state.players.find((p) => p.id === state.winner)?.name} thắng
        {state.winReason ? ` · ${winNames[state.winReason]}` : ''}
      </span>
    ) : (
      <span className="typhu-turn">
        <Users size={16} /> {state.players.length}/4 người · chờ chủ bàn bắt đầu
      </span>
    );

  const controls = (busy: boolean): TableControls => {
    const ready = !busy && myTurn && mine;
    const status =
      ready && pickPhases.includes(state.phase) ? (
        <TurnPrompt
          state={state}
          me={me}
          send={send}
          pending={pending}
          giftTile={giftTile}
          clearGift={() => setGiftTile(null)}
        />
      ) : (
        <div className="typhu-status-line">
          {turnLine}
          {!busy && state.log.at(-1) && <small>{state.log.at(-1)!.text}</small>}
        </div>
      );
    let center: ReactNode = null;
    if (ready && state.phase === 'ROLL')
      center = <RollButtons state={state} me={me} send={send} pending={pending} />;
    else if (state.status === 'FINISHED')
      center = (
        <div className="typhu-winner">
          <Crown size={26} />
          <strong>{state.players.find((p) => p.id === state.winner)?.name} thắng!</strong>
          <small>{state.winReason ? winNames[state.winReason] : ''}</small>
        </div>
      );
    else if (state.status === 'WAITING')
      center = (
        <div className="typhu-winner">
          <Users size={24} />
          <strong>{state.players.length}/4 người</strong>
          <small>Chờ chủ bàn bắt đầu</small>
        </div>
      );
    const decision = ready && (popupPhases.includes(state.phase) || state.phase === 'DEBT');
    const popup =
      ready && popupPhases.includes(state.phase) ? (
        <DecisionPopup state={state} me={me} send={send} pending={pending} />
      ) : ready && state.phase === 'DEBT' && state.debt ? (
        <DebtPopup state={state} me={me} send={send} pending={pending} />
      ) : detail !== null ? (
        <TileDetail state={state} index={detail} onClose={() => setDetail(null)} />
      ) : null;
    let overlay: ReactNode = null;
    if (paused)
      overlay = (
        <div className="typhu-paused" role="dialog" aria-label="Ván đang tạm dừng">
          <strong>⏸ Ván đang tạm dừng</strong>
          <small>
            {state.players.find((p) => p.id === paused.by)?.name ?? 'Một người chơi'} đã tạm dừng.
          </small>
          {canPause && (
            <AsyncButton
              variant="primary"
              disabled={pending}
              onClick={() => send({ action: 'resume' })}
            >
              <Play size={16} /> Chơi tiếp
            </AsyncButton>
          )}
        </div>
      );
    else if (!busy && state.status === 'PLAYING' && state.phase === 'REVEAL' && state.pending?.card)
      overlay = (
        <CardReveal
          state={state}
          mine={state.turn === me}
          seconds={seconds}
          send={send}
          pending={pending}
        />
      );
    else if (state.status === 'FINISHED') overlay = <Confetti />;
    return {
      status,
      center,
      popup,
      overlay,
      onDismiss: !decision && detail !== null ? () => setDetail(null) : undefined,
    };
  };

  return (
    <section className="typhu-party typhu-match" aria-label="Ván Tỷ Phú Phố Nhạc">
      <header className="typhu-match-head">
        <Button asChild variant="ghost">
          <Link to={`/room/${room}/games/ty-phu`}>
            <ArrowLeft size={16} /> Danh sách bàn
          </Link>
        </Button>
        <div>
          <h1>{state.name}</h1>
          <small>
            {paused ? 'Đang tạm dừng' : statusNames[state.status]}
            {state.endsAt && state.status === 'PLAYING' && !paused
              ? ` · còn ${Math.max(0, Math.ceil((state.endsAt - (now + offset.current)) / 60000))} phút`
              : ''}
            {connection !== 'Đã kết nối' ? ` · ${connection}` : ''}
          </small>
        </div>
        {canPause && (
          <AsyncButton
            variant="secondary"
            disabled={pending}
            onClick={() => send({ action: paused ? 'resume' : 'pause' })}
          >
            {paused ? <Play size={16} /> : <Pause size={16} />} {paused ? 'Chơi tiếp' : 'Tạm dừng'}
          </AsyncButton>
        )}
        <div className="typhu-view" role="group" aria-label="Kiểu bàn cờ">
          {(['25d', 'flat'] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => chooseView(v)}>
              {v === '25d' ? 'Bàn 2.5D' : 'Bàn phẳng'}
            </button>
          ))}
        </div>
      </header>
      <div className="typhu-layout">
        <TyPhuBoard
          state={state}
          me={me}
          selectable={selectable}
          onTile={onTile}
          view={view}
          seconds={paused ? null : seconds}
          controls={controls}
        />
        <aside className="typhu-side">
          <ActionPanel state={state} me={me} send={send} pending={pending} />
          <Players state={state} me={me} send={send} pending={pending} />
          <section className="typhu-card typhu-log" aria-label="Diễn biến ván">
            <h2>Diễn biến</h2>
            <ol>
              {[...state.log]
                .reverse()
                .slice(0, 10)
                .map((e, i) => (
                  <li key={state.log.length - i}>{e.text}</li>
                ))}
            </ol>
          </section>
        </aside>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- table controls

function RollButtons({
  state,
  me,
  send,
  pending,
}: {
  state: TyPhuPublicState;
  me: string;
  send: Send;
  pending: boolean;
}) {
  const mine = state.players.find((p) => p.id === me)!;
  return (
    <div className="typhu-roll">
      {mine.jailed && <small>Đang ở tù (lần {mine.jailTries + 1}/3) · tung đôi để ra</small>}
      <AsyncButton
        variant="primary"
        className="typhu-roll-button"
        disabled={pending}
        onClick={() => send({ action: 'roll' })}
      >
        <Dices size={20} /> Tung xúc xắc
      </AsyncButton>
      {mine.jailed && (
        <div className="typhu-buttons">
          {mine.pass && (
            <AsyncButton disabled={pending} onClick={() => send({ action: 'use_pass' })}>
              Dùng Thẻ VIP
            </AsyncButton>
          )}
          <AsyncButton
            disabled={pending || mine.cash < JAIL_FINE}
            onClick={() => send({ action: 'pay_jail' })}
          >
            Nộp {JAIL_FINE} ra tù
          </AsyncButton>
        </div>
      )}
    </div>
  );
}

/** Buy, build and buy-out choices, as a dialog in the middle of the table. */
function DecisionPopup({
  state,
  me,
  send,
  pending,
}: {
  state: TyPhuPublicState;
  me: string;
  send: Send;
  pending: boolean;
}) {
  const engine = asEngineState(state);
  const mine = state.players.find((p) => p.id === me)!;
  const index = state.pending!.tile!;
  const t = tileAt(index);
  const owned = state.tiles[index];
  let title: string;
  let body: ReactNode;
  if (state.phase === 'BUY') {
    const maxLevel = t.kind === 'BEACH' ? 0 : buildCap(mine, 0);
    title = `Mua ${t.name}?`;
    body = (
      <>
        <p>
          Giá đất {money(t.price!)} · bạn có {money(mine.cash)}
        </p>
        <div className="typhu-levels">
          {Array.from({ length: maxLevel + 1 }, (_, level) => {
            const cost = t.price! + buildCost(index, 0, level);
            const rent =
              t.kind === 'BEACH' ? BEACH_RENTS[1] : Math.round(0.1 * t.price! * levelRent[level]);
            return (
              <AsyncButton
                key={level}
                variant={level === 0 ? 'primary' : 'secondary'}
                disabled={pending || cost > mine.cash}
                onClick={() => send({ action: 'buy', level })}
              >
                {level === 0 ? 'Mua đất' : `Mua + ${levelNames[level]}`} · {money(cost)}
                <small>thuê {money(rent)}</small>
              </AsyncButton>
            );
          })}
        </div>
        <SkipButton send={send} pending={pending} label="Không mua" />
      </>
    );
  } else if (state.phase === 'BUILD') {
    const level = owned!.level;
    const cap = buildCap(mine, state.pending?.from ?? level);
    title = `Nâng nhà ở ${t.name}`;
    body = (
      <>
        <p>
          Đang {levelNames[level]} · thuê {money(baseRent(engine, index))}
          {cap < HOTEL && level === 3 ? '. Khách sạn mở từ vòng 3 khi ô đã ở Cấp 3.' : ''}
        </p>
        <div className="typhu-levels">
          {Array.from({ length: cap - level }, (_, i) => level + 1 + i).map((to) => {
            const cost = buildCost(index, level, to);
            return (
              <AsyncButton
                key={to}
                disabled={pending || cost > mine.cash}
                onClick={() => send({ action: 'build', level: to })}
              >
                {levelNames[to]} · {money(cost)}
                <small>thuê {money(Math.round(0.1 * t.price! * levelRent[to]))}+</small>
              </AsyncButton>
            );
          })}
        </div>
        <SkipButton send={send} pending={pending} label="Không xây" />
      </>
    );
  } else {
    const owner = state.players.find((p) => p.id === owned?.owner);
    const price = buyoutPrice(engine, index);
    title = `Mua lại ${t.name}?`;
    body = (
      <>
        <p>
          Của {owner?.name} · giá {money(price)}. Chủ cũ không được từ chối.
        </p>
        <div className="typhu-buttons">
          <AsyncButton
            variant="primary"
            disabled={pending || price > mine.cash}
            onClick={() => send({ action: 'buyout' })}
          >
            Mua lại · {money(price)}
          </AsyncButton>
          <SkipButton send={send} pending={pending} label="Thôi" />
        </div>
      </>
    );
  }
  return (
    <section className="typhu-popup" role="dialog" aria-label={title}>
      <i className="typhu-strip" style={{ background: stripColor(t) }} />
      <h2>{title}</h2>
      {body}
    </section>
  );
}

/** What to pick on the board (fly, card target, festival, build at Start, sell for debt). */
function TurnPrompt({
  state,
  me,
  send,
  pending,
  giftTile,
  clearGift,
}: {
  state: TyPhuPublicState;
  me: string;
  send: Send;
  pending: boolean;
  giftTile: number | null;
  clearGift: () => void;
}) {
  const mine = state.players.find((p) => p.id === me)!;
  switch (state.phase) {
    case 'FLY':
      return (
        <div className="typhu-prompt">
          <span>
            ✈️ Chọn ô đất trống hoặc đất của bạn để bay tới
            {mine.freeFly ? ' (miễn phí)' : ` (phí ${FLY_FEE})`}.
          </span>
          <AsyncButton disabled={pending} onClick={() => send({ action: 'roll' })}>
            <Dices size={16} /> Tung xúc xắc thay vì bay
          </AsyncButton>
        </div>
      );
    case 'CARD': {
      const card = state.pending!.card!;
      const others = state.players.filter((p) => p.status === 'ACTIVE' && p.id !== me);
      return (
        <div className="typhu-prompt">
          <span>
            🃏 <strong>{cards[card].name}</strong>
            {card === 'GIFT' && giftTile !== null
              ? ` · tặng ${tileAt(giftTile).name} cho ai?`
              : ' · chọn một ô đang sáng.'}
          </span>
          {card === 'GIFT' && giftTile !== null && (
            <>
              {others.map((o) => (
                <AsyncButton
                  key={o.id}
                  disabled={pending}
                  onClick={async () => {
                    await send({ action: 'card_target', tile: giftTile, player: o.id });
                    clearGift();
                  }}
                >
                  {o.name}
                </AsyncButton>
              ))}
              <Button variant="ghost" onClick={clearGift}>
                Chọn ô khác
              </Button>
            </>
          )}
          {cards[card].kind !== 'BAD' && (
            <SkipButton send={send} pending={pending} label="Không dùng" />
          )}
        </div>
      );
    }
    case 'FESTIVAL':
      return (
        <div className="typhu-prompt">
          <span>
            🎤 Trả {FESTIVAL_FEE} để một thành phố của bạn tổ chức Đại nhạc hội (thuê ×2).
          </span>
          <SkipButton send={send} pending={pending} label="Không tổ chức" />
        </div>
      );
    case 'START_BUILD':
      return (
        <div className="typhu-prompt">
          <span>🏁 Dừng ở Xuất phát: chọn một thành phố để xây thêm 1 cấp.</span>
          <SkipButton send={send} pending={pending} label="Không xây" />
        </div>
      );
    case 'DEBT':
      return (
        <div className="typhu-prompt typhu-debt">
          <span>💸 Thiếu tiền trả nợ: chọn ô để bán trong bảng hoặc bấm ô của bạn.</span>
        </div>
      );
    default:
      return null;
  }
}

/** Selling to pay a debt: what is owed, and every property with what the bank pays for it. */
function DebtPopup({
  state,
  me,
  send,
  pending,
}: {
  state: TyPhuPublicState;
  me: string;
  send: Send;
  pending: boolean;
}) {
  const engine = asEngineState(state);
  const mine = state.players.find((p) => p.id === me)!;
  const debt = state.debt!;
  const creditor = state.players.find((p) => p.id === debt.creditor);
  const owned = board
    .filter((t) => state.tiles[t.index]?.owner === me)
    .map((t) => ({ t, price: bankSalePrice(engine, t.index) }))
    .sort((a, b) => a.price - b.price || a.t.index - b.t.index);
  const reason =
    debt.reason === 'RENT'
      ? `tiền thuê ${tileAt(debt.tile!).name} cho ${creditor?.name ?? 'chủ ô'}`
      : debt.reason === 'TAX'
        ? 'thuế nhà'
        : 'tiền phạt ra tù';
  return (
    <section className="typhu-popup typhu-debt-popup" role="dialog" aria-label="Bán ô để trả nợ">
      <i className="typhu-strip" style={{ background: '#e2574c' }} />
      <h2>💸 Bán ô để trả nợ</h2>
      <p>
        Phải trả <strong>{money(debt.amount)}</strong> {reason}, đang có {money(mine.cash)}.{' '}
        <b className="typhu-debt-missing">Còn thiếu {money(debt.amount - mine.cash)}</b>. Bán hết
        được {money(liquidationValue(engine, me))}: đất được 50% giá, Biển được đủ giá.
      </p>
      <div className="typhu-levels">
        {owned.map(({ t, price }) => {
          const level = state.tiles[t.index]!.level;
          return (
            <AsyncButton
              key={t.index}
              disabled={pending}
              onClick={() => send({ action: 'sell', tile: t.index })}
            >
              Bán {t.name} · +{money(price)}
              <small>{t.kind === 'BEACH' ? 'Biển' : levelNames[level]}</small>
            </AsyncButton>
          );
        })}
      </div>
      <Confirm
        title="Tuyên bố phá sản?"
        description={`Toàn bộ ${money(mine.cash)} tiền mặt chuyển cho ${creditor?.name ?? 'ngân hàng'}, đất trả về ngân hàng và bạn rời ván.`}
        onConfirm={() => send({ action: 'declare_bankrupt' })}
      >
        <Button variant="ghost" disabled={pending}>
          Tuyên bố phá sản
        </Button>
      </Confirm>
    </section>
  );
}

/** The drawn chance card, shown to everyone before it takes effect. */
function CardReveal({
  state,
  mine,
  seconds,
  send,
  pending,
}: {
  state: TyPhuPublicState;
  mine: boolean;
  seconds: number | null;
  send: Send;
  pending: boolean;
}) {
  const card = cards[state.pending!.card!];
  const drawer = state.players.find((p) => p.id === state.turn);
  return (
    <div className="typhu-reveal" role="dialog" aria-label="Phiếu Cơ hội">
      <div className={`typhu-card-face kind-${card.kind.toLowerCase()}`}>
        <span className="typhu-card-top">🃏 Cơ hội · {drawer?.name}</span>
        <strong>{card.name}</strong>
        <p>{card.text}</p>
        <span className="typhu-card-kind">
          {card.kind === 'ATTACK' ? 'Tấn công' : card.kind === 'BAD' ? 'Xui' : 'May mắn'}
        </span>
      </div>
      {mine ? (
        <AsyncButton
          variant="primary"
          disabled={pending}
          onClick={() => send({ action: 'card_ok' })}
        >
          Thực hiện phiếu{seconds !== null ? ` · ${seconds}s` : ''}
        </AsyncButton>
      ) : (
        <small>Phiếu có hiệu lực sau {seconds ?? 0}s…</small>
      )}
    </div>
  );
}

function Confetti() {
  return (
    <div className="typhu-confetti" aria-hidden="true">
      {Array.from({ length: 36 }, (_, i) => (
        <i
          key={i}
          style={
            {
              '--x': `${(i * 37) % 100}%`,
              '--d': `${(i % 7) * 0.35}s`,
              '--c': ['#f6c453', '#e24b4a', '#378add', '#639922', '#d4537e'][i % 5],
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- side panels

function ActionPanel({
  state,
  me,
  send,
  pending,
}: {
  state: TyPhuPublicState;
  me: string;
  send: Send;
  pending: boolean;
}) {
  const mine = state.players.find((p) => p.id === me);
  const current = state.players.find((p) => p.id === state.turn);
  const host = state.host === me;

  if (state.status === 'WAITING') {
    const others = state.players.filter((p) => p.id !== state.host);
    const canStart = state.players.length >= 2 && others.every((p) => p.ready);
    return (
      <section className="typhu-card typhu-actions" aria-label="Chuẩn bị ván">
        <h2>Chuẩn bị</h2>
        <p className="muted">
          {money(state.rules.startCash)} khởi đầu ·{' '}
          {state.rules.minutes ? `${state.rules.minutes} phút` : 'không giới hạn giờ'} ·{' '}
          {state.rules.turnSeconds} giây/lượt
          {state.rules.buyout ? ' · có mua lại' : ''}
        </p>
        {!mine ? (
          <AsyncButton
            variant="primary"
            disabled={pending || state.players.length >= 4}
            onClick={() => send({ action: 'join' })}
          >
            Tham gia bàn
          </AsyncButton>
        ) : host ? (
          <AsyncButton
            variant="primary"
            disabled={pending || !canStart}
            onClick={() => send({ action: 'start' })}
          >
            <Flag size={16} /> Bắt đầu ván
          </AsyncButton>
        ) : (
          <AsyncButton
            variant={mine.ready ? 'secondary' : 'primary'}
            disabled={pending}
            onClick={() => send({ action: 'ready', ready: !mine.ready })}
          >
            {mine.ready ? 'Hủy sẵn sàng' : 'Tôi đã sẵn sàng'}
          </AsyncButton>
        )}
        {host && state.players.length < 4 && (
          <AsyncButton
            variant="secondary"
            disabled={pending}
            onClick={() => send({ action: 'add_bot' })}
          >
            <Bot size={16} /> Thêm máy
          </AsyncButton>
        )}
        {host && !canStart && (
          <small className="muted">
            Cần ít nhất 2 người và mọi người bấm sẵn sàng. Thiếu người thì thêm máy để chơi cùng.
          </small>
        )}
        {mine && (
          <AsyncButton variant="ghost" disabled={pending} onClick={() => send({ action: 'leave' })}>
            Rời bàn
          </AsyncButton>
        )}
      </section>
    );
  }
  if (state.status !== 'PLAYING' || !mine || mine.status !== 'ACTIVE') {
    return (
      <section className="typhu-card typhu-actions">
        <h2>{state.status === 'FINISHED' ? 'Ván đã kết thúc' : 'Bạn đang xem'}</h2>
        {state.status === 'FINISHED' && state.winner && (
          <p>
            <strong>{state.players.find((p) => p.id === state.winner)?.name}</strong> thắng ·{' '}
            {state.winReason ? winNames[state.winReason] : ''}
          </p>
        )}
        {mine && mine.status !== 'ACTIVE' && state.status === 'PLAYING' && (
          <p className="muted">Bạn đã rời cuộc chơi; vẫn có thể theo dõi ván.</p>
        )}
        {state.status === 'FINISHED' && <Rematch state={state} me={me} send={send} />}
      </section>
    );
  }
  const mineTurn = state.turn === me;
  return (
    <section
      className={'typhu-card typhu-actions' + (mineTurn ? ' typhu-my-turn' : '')}
      aria-live="polite"
    >
      <h2>{mineTurn ? 'Lượt của bạn' : `Chờ ${current?.name ?? 'người chơi'}`}</h2>
      <p className="muted">{state.paused ? 'Ván đang tạm dừng.' : phaseHint(state, mineTurn)}</p>
      <Surrender send={send} pending={pending} />
    </section>
  );
}
function phaseHint(state: TyPhuPublicState, mine: boolean) {
  const t = state.pending?.tile === undefined ? null : tileAt(state.pending.tile);
  if (mine)
    return state.phase === 'ROLL'
      ? 'Bấm Tung xúc xắc ở giữa bàn.'
      : state.phase === 'REVEAL'
        ? 'Mọi người đang xem phiếu Cơ hội bạn rút.'
        : popupPhases.includes(state.phase)
          ? `Chọn trong bảng ${t?.name ?? ''} trên bàn.`
          : 'Làm theo hướng dẫn phía trên bàn cờ.';
  switch (state.phase) {
    case 'BUY':
      return `Đang cân nhắc mua ${t?.name}.`;
    case 'BUILD':
      return `Đang xây ở ${t?.name}.`;
    case 'BUYOUT':
      return `Đang cân nhắc mua lại ${t?.name}.`;
    case 'REVEAL':
      return 'Đang lật phiếu Cơ hội.';
    case 'CARD':
      return `Đang dùng phiếu “${cards[state.pending!.card!].name}”.`;
    case 'FESTIVAL':
      return 'Đang chọn nơi tổ chức Đại nhạc hội.';
    case 'FLY':
      return 'Đang chọn nơi bay tới.';
    case 'START_BUILD':
      return 'Đang chọn thành phố để xây thêm.';
    case 'DEBT':
      return `Đang bán ô để trả nợ ${money(state.debt?.amount ?? 0)}.`;
    default:
      return 'Đang tung xúc xắc.';
  }
}
function SkipButton({ send, pending, label }: { send: Send; pending: boolean; label: string }) {
  return (
    <AsyncButton variant="ghost" disabled={pending} onClick={() => send({ action: 'skip' })}>
      {label}
    </AsyncButton>
  );
}
function Surrender({ send, pending }: { send: Send; pending: boolean }) {
  return (
    <Confirm
      title="Đầu hàng và rời ván?"
      description="Toàn bộ đất và tiền của bạn trả về ngân hàng. Không thể quay lại ván này."
      onConfirm={() => send({ action: 'surrender' })}
    >
      <Button variant="ghost" className="typhu-surrender" disabled={pending}>
        Đầu hàng
      </Button>
    </Confirm>
  );
}

function Rematch({
  state,
  me,
  send,
}: {
  state: TyPhuPublicState;
  me: string;
  send: ReturnType<typeof useTyPhu>['send'];
}) {
  const navigate = useNavigate();
  const path = (id: string) => `/room/${state.room}/games/ty-phu/${id}`;
  if (state.rematch)
    return (
      <Button asChild variant="primary">
        <Link to={path(state.rematch)}>
          <RotateCcw size={16} /> Vào ván mới
        </Link>
      </Button>
    );
  if (state.host !== me)
    return <p className="muted">Chủ bàn có thể mở ván mới với cùng luật chơi.</p>;
  return (
    <AsyncButton
      variant="primary"
      onClick={async () => {
        const id = await openRematch(state.room, me, state);
        // Linking is best effort: the new table is already open in the list.
        await send({ action: 'rematch', game: id });
        navigate(path(id));
      }}
    >
      <RotateCcw size={16} /> Chơi lại
    </AsyncButton>
  );
}

/** What a player still needs for an instant win, when it is a single step away. */
function nearWin(progress: ReturnType<typeof winProgress>) {
  const hints: string[] = [];
  if (progress.monopolies === 2) hints.push('1 monopoly nữa');
  if (progress.beaches === 3) hints.push('1 bãi biển nữa');
  const line = progress.lines.find((l) => l.total - l.owned === 1);
  if (line) hints.push(`1 ô nữa đủ dãy chặng ${line.side}`);
  return hints;
}

function Players({
  state,
  me,
  send,
  pending,
}: {
  state: TyPhuPublicState;
  me: string;
  send: ReturnType<typeof useTyPhu>['send'];
  pending: boolean;
}) {
  const engine = asEngineState(state);
  return (
    <section className="typhu-card typhu-players" aria-label="Người chơi">
      <h2>Người chơi</h2>
      <ul>
        {state.players.map((p) => {
          const progress = winProgress(engine, p.id);
          const bestLine = progress.lines.reduce((best, l) =>
            l.owned / l.total > best.owned / best.total ? l : best,
          );
          const close =
            state.status === 'PLAYING' && p.status === 'ACTIVE' ? nearWin(progress) : [];
          return (
            <li
              key={p.id}
              className={(p.id === state.turn ? 'active ' : '') + p.status.toLowerCase()}
            >
              <i
                role="img"
                style={{ background: playerColors[p.color] }}
                aria-label={colorNames[p.color]}
              />
              <div>
                <strong>
                  {p.name}
                  {p.bot ? ' 🤖' : ''}
                  {p.id === me ? ' (bạn)' : ''}
                  {p.id === state.host ? ' 👑' : ''}
                </strong>
                <small>
                  {p.status === 'BANKRUPT'
                    ? 'Phá sản'
                    : p.status === 'LEFT'
                      ? 'Đã rời ván'
                      : state.status === 'WAITING'
                        ? p.bot
                          ? 'Máy · luôn sẵn sàng'
                          : p.ready || p.id === state.host
                            ? 'Sẵn sàng'
                            : 'Chưa sẵn sàng'
                        : `Vòng ${p.lap}${p.jailed ? ' · trong tù' : ''}${p.auto && !p.bot ? ' · máy chơi thay' : ''}`}
                </small>
                {close.length > 0 && (
                  <span className="typhu-near-win">🔥 Sắp thắng: {close.join(', ')}</span>
                )}
                {state.status !== 'WAITING' && p.status === 'ACTIVE' && (
                  <span className="typhu-progress">
                    <span title="Monopoly">🏘️ {progress.monopolies}/3</span>
                    <span title="Bãi biển">🏖️ {progress.beaches}/4</span>
                    <span title={`Dãy chặng ${bestLine.side}`}>
                      🛣️ {bestLine.owned}/{bestLine.total}
                    </span>
                    {p.pass && <span title="Thẻ VIP hậu trường">🎫</span>}
                    {p.shield && <span title="Bảo hiểm sân khấu">🛡️</span>}
                    {p.half && <span title="Giảm giá nửa vé">½</span>}
                    {p.fine && <span title="Bị phạt gấp đôi">×2</span>}
                  </span>
                )}
              </div>
              {p.bot && state.status === 'WAITING' && state.host === me ? (
                <Button
                  variant="ghost"
                  className="typhu-remove-bot"
                  aria-label={`Bỏ ${p.name}`}
                  disabled={pending}
                  onClick={() => void send({ action: 'remove_bot', player: p.id })}
                >
                  <X size={15} />
                </Button>
              ) : (
                <b>{money(p.cash)}</b>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function TileDetail({
  state,
  index,
  onClose,
}: {
  state: TyPhuPublicState;
  index: number;
  onClose: () => void;
}) {
  const engine = asEngineState(state);
  const t = tileAt(index);
  const owned = state.tiles[index];
  const owner = state.players.find((p) => p.id === owned?.owner);
  const ownerColor = owner ? playerColors[owner.color] : undefined;
  useEffect(() => {
    const close = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);
  const buyout =
    !owned || !t.price
      ? null
      : t.kind === 'BEACH'
        ? 'Biển không mua lại được'
        : owned.level === HOTEL
          ? 'Khách sạn không mua lại được'
          : money(buyoutPrice(engine, index));
  return (
    <section className="typhu-popup typhu-detail" role="dialog" aria-label={`Thông tin ${t.name}`}>
      <i className="typhu-strip" style={{ background: stripColor(t) }} />
      <header>
        <h2>{t.name}</h2>
        <Button variant="ghost" size="icon" aria-label="Đóng thông tin ô" onClick={onClose}>
          <X size={18} />
        </Button>
      </header>
      {t.price ? (
        <dl className="typhu-facts">
          <div>
            <dt>Chủ</dt>
            <dd style={ownerColor ? { color: ownerColor } : undefined}>
              {owner?.name ?? 'Chưa có chủ'}
            </dd>
          </div>
          <div>
            <dt>Cấp nhà</dt>
            <dd>{t.kind === 'BEACH' ? 'Biển' : owned ? levelNames[owned.level] : '—'}</dd>
          </div>
          <div>
            <dt>Thuê hiện tại</dt>
            <dd>{money(tileRent(state, index) ?? 0)}</dd>
          </div>
          <div>
            <dt>{owned ? 'Giá mua lại' : 'Giá mua'}</dt>
            <dd>{owned ? buyout : money(t.price)}</dd>
          </div>
          {owned && (
            <div>
              <dt>Bán cho ngân hàng</dt>
              <dd>{money(bankSalePrice(engine, index))}</dd>
            </div>
          )}
        </dl>
      ) : null}
      {t.kind === 'CITY' ? (
        <>
          <p className="muted">
            Giá đất {money(t.price!)} · {t.group ? `nhóm ${t.group}` : 'không thuộc nhóm'}
            {owner ? ` · chủ: ${owner.name}` : ' · chưa có chủ'}
          </p>
          <table>
            <tbody>
              {levelNames.map((name, level) => (
                <tr key={name} className={owned?.level === level ? 'current' : ''}>
                  <td>{name}</td>
                  <td>{money(Math.round(0.1 * t.price! * levelRent[level]))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {owned && <p className="muted">Giá trị hiện tại {money(currentPrice(engine, index))}.</p>}
        </>
      ) : t.kind === 'BEACH' ? (
        <p className="muted">
          Giá {money(t.price!)} · tiền thuê theo số bãi chủ đang có: 1 bãi {BEACH_RENTS[1]}, 2 bãi{' '}
          {BEACH_RENTS[2]}, 3 bãi {BEACH_RENTS[3]}
          {owner ? ` · chủ: ${owner.name}` : ''}. Sở hữu đủ 4 bãi là thắng.
        </p>
      ) : (
        <p className="muted">
          {
            {
              START: 'Đi qua nhận 200 và lên vòng mới. Dừng đúng ô được xây thêm 1 cấp.',
              JAIL: `Dừng ở đây là hết lượt. Bị giữ tối đa 3 lượt; ra bằng tung đôi, nộp ${JAIL_FINE} hoặc Thẻ VIP.`,
              FESTIVAL: `Dừng ở đây là hết lượt. Trả ${FESTIVAL_FEE} để một thành phố của mình tổ chức Đại nhạc hội: tiền thuê ×2.`,
              AIRPORT: `Dừng ở đây là hết lượt. Lượt sau bay tới ô đất trống hoặc đất của mình (phí ${FLY_FEE}).`,
              CHANCE: 'Rút một trong 15 phiếu Cơ hội.',
              TAX: 'Nộp 10% tổng giá trị đất và nhà đang sở hữu.',
              CITY: '',
              BEACH: '',
            }[t.kind]
          }
        </p>
      )}
    </section>
  );
}
