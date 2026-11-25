import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bot, Crown, Dices, Flag, Plus, RotateCcw, Users, X } from 'lucide-react';
import type { Snapshot } from '../../../shared/contracts';
import {
  AIRPORT_INDEX,
  BEACH_RENT,
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
  winProgress,
} from '../../../shared/ty-phu/engine';
import { asEngineState, openRematch, useTyPhu, useTyPhuList } from '../../lib/ty-phu';
import { AsyncButton, Button, Confirm, ErrorState, Loading } from '../ui';
import TyPhuBoard, { colorNames, Dice3D, playerColors, stripColor } from './TyPhuBoard';
import '../game/game.css';
import './ty-phu.css';

const money = (n: number) => n.toLocaleString('vi-VN');
const winNames: Record<WinReason, string> = {
  MONOPOLY: 'Sở hữu 3 monopoly',
  LINE: 'Độc chiếm một dãy nhà',
  BEACHES: 'Sở hữu 4 bãi biển',
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

function TyPhuMatch({ snapshot, game }: { snapshot: Snapshot; game: string }) {
  const room = snapshot.room.id,
    me = snapshot.me;
  const { query, send, pending, connection, offset } = useTyPhu(room, me, game);
  const now = useNow();
  const [detail, setDetail] = useState<number | null>(null);
  const [giftTile, setGiftTile] = useState<number | null>(null);
  const [tilted, setTilted] = useState(() => {
    try {
      const saved = localStorage.getItem('roomtune:typhu:tilted');
      return saved === null ? innerWidth >= 900 : saved === 'true';
    } catch {
      return innerWidth >= 900;
    }
  });
  const state = query.data?.state;
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
  const myTurn = state.status === 'PLAYING' && state.turn === me && mine?.status === 'ACTIVE';
  const seconds =
    state.deadline === null
      ? null
      : Math.max(0, Math.ceil((state.deadline - (now + offset.current)) / 1000));

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
    else if (state.phase === 'FLY')
      selectable = board.filter((t) => t.index !== AIRPORT_INDEX).map((t) => t.index);
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

  const center = (
    <div className="typhu-center-inner">
      {state.status === 'PLAYING' && current ? (
        <>
          <span className="typhu-turn" style={{ color: playerColors[current.color] }}>
            {current.id === me ? 'Lượt của bạn' : `Lượt của ${current.name}`}
            {current.bot ? (
              <b> · đang nghĩ…</b>
            ) : (
              seconds !== null && <b className={seconds <= 10 ? 'urgent' : ''}> · {seconds}s</b>
            )}
          </span>
          <Dice3D
            dice={state.dice}
            roll={String([...state.log].reverse().find((e) => e.type === 'roll')?.at ?? '')}
          />
          <small className="typhu-last">{state.log.at(-1)?.text}</small>
        </>
      ) : state.status === 'FINISHED' ? (
        <div className="typhu-winner">
          <Crown size={26} />
          <strong>{state.players.find((p) => p.id === state.winner)?.name} thắng!</strong>
          <small>{state.winReason ? winNames[state.winReason] : ''}</small>
        </div>
      ) : (
        <div className="typhu-winner">
          <Users size={24} />
          <strong>{state.players.length}/4 người</strong>
          <small>Chờ chủ bàn bắt đầu</small>
        </div>
      )}
    </div>
  );

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
            {statusNames[state.status]}
            {state.endsAt && state.status === 'PLAYING'
              ? ` · còn ${Math.max(0, Math.ceil((state.endsAt - (now + offset.current)) / 60000))} phút`
              : ''}
            {connection !== 'Đã kết nối' ? ` · ${connection}` : ''}
          </small>
        </div>
        <label className="typhu-check">
          <input
            type="checkbox"
            checked={tilted}
            onChange={(e) => {
              setTilted(e.target.checked);
              try {
                localStorage.setItem('roomtune:typhu:tilted', String(e.target.checked));
              } catch {
                /* preference only */
              }
            }}
          />
          Bàn nghiêng
        </label>
      </header>
      <div className="typhu-layout">
        <TyPhuBoard
          state={state}
          me={me}
          selectable={selectable}
          onTile={onTile}
          tilted={tilted}
          center={center}
        />
        <aside className="typhu-side">
          <ActionPanel
            state={state}
            me={me}
            send={send}
            pending={pending}
            giftTile={giftTile}
            clearGift={() => setGiftTile(null)}
          />
          <Players state={state} me={me} send={send} pending={pending} />
          {detail !== null && (
            <TileDetail state={state} index={detail} onClose={() => setDetail(null)} />
          )}
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

// ---------------------------------------------------------------- panels

function ActionPanel({
  state,
  me,
  send,
  pending,
  giftTile,
  clearGift,
}: {
  state: TyPhuPublicState;
  me: string;
  send: ReturnType<typeof useTyPhu>['send'];
  pending: boolean;
  giftTile: number | null;
  clearGift: () => void;
}) {
  const engine = asEngineState(state);
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
  if (state.turn !== me) {
    return (
      <section className="typhu-card typhu-actions" aria-live="polite">
        <h2>Chờ {current?.name ?? 'người chơi'}</h2>
        <p className="muted">{phaseHint(state)}</p>
        <Surrender send={send} pending={pending} />
      </section>
    );
  }

  const index = state.pending?.tile;
  const t = index === undefined ? null : tileAt(index);
  let body: React.ReactNode = null;
  switch (state.phase) {
    case 'ROLL':
      body = (
        <>
          <p>
            {mine.jailed
              ? `Bạn đang ở tù (lần thử ${mine.jailTries + 1}/3). Tung được đôi để ra tù.`
              : 'Tung xúc xắc để đi tiếp.'}
          </p>
          <div className="typhu-buttons">
            <AsyncButton
              variant="primary"
              disabled={pending}
              onClick={() => send({ action: 'roll' })}
            >
              <Dices size={17} /> Tung xúc xắc
            </AsyncButton>
            {mine.jailed && mine.pass && (
              <AsyncButton disabled={pending} onClick={() => send({ action: 'use_pass' })}>
                Dùng Thẻ VIP
              </AsyncButton>
            )}
            {mine.jailed && (
              <AsyncButton
                disabled={pending || mine.cash < JAIL_FINE}
                onClick={() => send({ action: 'pay_jail' })}
              >
                Nộp {JAIL_FINE} ra tù
              </AsyncButton>
            )}
          </div>
        </>
      );
      break;
    case 'FLY':
      body = (
        <>
          <p>
            Bạn đang ở Sân bay. Chọn một ô trên bàn để bay tới
            {mine.freeFly ? ' (miễn phí).' : ` (phí ${FLY_FEE}).`}
          </p>
          <AsyncButton disabled={pending} onClick={() => send({ action: 'roll' })}>
            <Dices size={17} /> Tung xúc xắc thay vì bay
          </AsyncButton>
        </>
      );
      break;
    case 'BUY': {
      const maxLevel = t!.kind === 'BEACH' ? 0 : buildCap(mine, 0);
      body = (
        <>
          <p>
            <strong>{t!.name}</strong> chưa có chủ. Giá đất {money(t!.price!)}.
          </p>
          <div className="typhu-options">
            {Array.from({ length: maxLevel + 1 }, (_, level) => {
              const cost = t!.price! + buildCost(t!.index, 0, level);
              return (
                <AsyncButton
                  key={level}
                  variant={level === 0 ? 'primary' : 'secondary'}
                  disabled={pending || cost > mine.cash}
                  onClick={() => send({ action: 'buy', level })}
                >
                  {level === 0 ? 'Mua đất' : `Mua + ${levelNames[level]}`} · {money(cost)}
                </AsyncButton>
              );
            })}
          </div>
          <SkipButton send={send} pending={pending} label="Không mua" />
        </>
      );
      break;
    }
    case 'BUILD': {
      const level = state.tiles[index!]!.level;
      const cap = buildCap(mine, state.pending?.from ?? level);
      body = (
        <>
          <p>
            Xây thêm ở <strong>{t!.name}</strong> (đang {levelNames[level]}).
            {cap < HOTEL && level === 3 ? ' Khách sạn mở từ vòng 3 khi ô đã ở Cấp 3.' : ''}
          </p>
          <div className="typhu-options">
            {Array.from({ length: cap - level }, (_, i) => level + 1 + i).map((to) => {
              const cost = buildCost(index!, level, to);
              return (
                <AsyncButton
                  key={to}
                  disabled={pending || cost > mine.cash}
                  onClick={() => send({ action: 'build', level: to })}
                >
                  {levelNames[to]} · {money(cost)}
                </AsyncButton>
              );
            })}
          </div>
          <SkipButton send={send} pending={pending} label="Không xây" />
        </>
      );
      break;
    }
    case 'BUYOUT': {
      const owner = state.players.find((p) => p.id === state.tiles[index!]?.owner);
      const price = buyoutPrice(engine, index!);
      body = (
        <>
          <p>
            Mua lại <strong>{t!.name}</strong> của {owner?.name} với giá {money(price)}? Chủ cũ
            không được từ chối.
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
      break;
    }
    case 'CARD': {
      const card = state.pending!.card!;
      const others = state.players.filter((p) => p.status === 'ACTIVE' && p.id !== me);
      body = (
        <>
          <div className="typhu-chance">
            <span>🃏 Phiếu Cơ hội</span>
            <strong>{cards[card].name}</strong>
            <p>{cards[card].text}</p>
          </div>
          {card === 'GIFT' && giftTile !== null ? (
            <>
              <p>
                Tặng <strong>{tileAt(giftTile).name}</strong> cho ai?
              </p>
              <div className="typhu-options">
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
              </div>
              <Button variant="ghost" onClick={clearGift}>
                Chọn ô khác
              </Button>
            </>
          ) : (
            <p className="typhu-pick-hint">Chọn một ô đang sáng trên bàn cờ.</p>
          )}
          {cards[card].kind !== 'BAD' && (
            <SkipButton send={send} pending={pending} label="Không dùng" />
          )}
        </>
      );
      break;
    }
    case 'FESTIVAL':
      body = (
        <>
          <p>Chọn một thành phố của bạn để tổ chức Đại nhạc hội (tiền thuê ×2).</p>
          <p className="typhu-pick-hint">Chọn một ô đang sáng trên bàn cờ.</p>
          <SkipButton send={send} pending={pending} label="Không tổ chức" />
        </>
      );
      break;
    case 'DEBT': {
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
      const missing = debt.amount - mine.cash;
      body = (
        <>
          <p>
            Bạn phải trả <strong>{money(debt.amount)}</strong> {reason} nhưng chỉ có{' '}
            {money(mine.cash)}. Chọn ô để bán cho ngân hàng (nhận 50% giá hiện tại).
          </p>
          <p className="typhu-debt-missing">
            Còn thiếu {money(missing)} · bán hết được tối đa {money(liquidationValue(engine, me))}
          </p>
          <div className="typhu-options">
            {owned.map(({ t, price }) => (
              <AsyncButton
                key={t.index}
                disabled={pending}
                onClick={() => send({ action: 'sell', tile: t.index })}
              >
                Bán {t.name} · +{money(price)}
              </AsyncButton>
            ))}
          </div>
          <p className="muted">
            Bán một ô trong monopoly làm các ô còn lại mất hệ số ×1,5. Nếu phần còn lại không đủ
            trả, bạn sẽ phá sản.
          </p>
          <Confirm
            title="Tuyên bố phá sản?"
            description={`Toàn bộ ${money(mine.cash)} tiền mặt chuyển cho ${creditor?.name ?? 'ngân hàng'}, đất trả về ngân hàng và bạn rời ván.`}
            onConfirm={() => send({ action: 'declare_bankrupt' })}
          >
            <Button variant="ghost" disabled={pending}>
              Tuyên bố phá sản
            </Button>
          </Confirm>
        </>
      );
      break;
    }
    case 'START_BUILD':
      body = (
        <>
          <p>Bạn dừng ở Xuất phát: được xây thêm 1 cấp cho một thành phố của mình.</p>
          <p className="typhu-pick-hint">Chọn một ô đang sáng trên bàn cờ.</p>
          <SkipButton send={send} pending={pending} label="Không xây" />
        </>
      );
      break;
  }
  return (
    <section className="typhu-card typhu-actions typhu-my-turn" aria-live="polite">
      <h2>Lượt của bạn</h2>
      {body}
      <Surrender send={send} pending={pending} />
    </section>
  );
}
function phaseHint(state: TyPhuPublicState) {
  const t = state.pending?.tile === undefined ? null : tileAt(state.pending.tile);
  switch (state.phase) {
    case 'BUY':
      return `Đang cân nhắc mua ${t?.name}.`;
    case 'BUILD':
      return `Đang xây ở ${t?.name}.`;
    case 'BUYOUT':
      return `Đang cân nhắc mua lại ${t?.name}.`;
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
function SkipButton({
  send,
  pending,
  label,
}: {
  send: ReturnType<typeof useTyPhu>['send'];
  pending: boolean;
  label: string;
}) {
  return (
    <AsyncButton variant="ghost" disabled={pending} onClick={() => send({ action: 'skip' })}>
      {label}
    </AsyncButton>
  );
}
function Surrender({
  send,
  pending,
}: {
  send: ReturnType<typeof useTyPhu>['send'];
  pending: boolean;
}) {
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
  return (
    <section className="typhu-card typhu-detail" aria-label={`Thông tin ${t.name}`}>
      <i className="typhu-strip" style={{ background: stripColor(t) }} />
      <header>
        <h2>{t.name}</h2>
        <Button variant="ghost" size="icon" aria-label="Đóng thông tin ô" onClick={onClose}>
          ×
        </Button>
      </header>
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
          {owned && (
            <p className="muted">
              Tiền thuê hiện tại {money(baseRent(engine, index))} · giá hiện tại{' '}
              {money(currentPrice(engine, index))}
              {owned.level < HOTEL ? ` · mua lại ${money(buyoutPrice(engine, index))}` : ''}
            </p>
          )}
        </>
      ) : t.kind === 'BEACH' ? (
        <p className="muted">
          Giá {money(t.price!)} · tiền thuê {BEACH_RENT} × số bãi chủ đang có
          {owner ? ` · chủ: ${owner.name}` : ''}. Sở hữu 4 bãi là thắng.
        </p>
      ) : (
        <p className="muted">
          {
            {
              START: 'Đi qua nhận 200 và lên vòng mới. Dừng đúng ô được xây thêm 1 cấp.',
              JAIL: `Bị giữ tối đa 3 lượt; ra bằng tung đôi, nộp ${JAIL_FINE} hoặc Thẻ VIP.`,
              FESTIVAL: 'Chọn một thành phố của mình tổ chức Đại nhạc hội: tiền thuê ×2.',
              AIRPORT: `Lượt sau bay tới ô bất kỳ (phí ${FLY_FEE}).`,
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
