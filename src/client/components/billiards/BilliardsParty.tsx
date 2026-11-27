import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Bot, Flag, Plus, RotateCcw, Users, Volume2, VolumeX } from 'lucide-react';
import type { Snapshot } from '../../../shared/contracts';
import { AppError } from '../../../shared/domain';
import {
  levelNames,
  modeNames,
  type BilliardsMode,
  type BilliardsReason,
  type BilliardsState,
  type CreateBilliards,
} from '../../../shared/billiards/contracts';
import { ballGroup, groupNames, type Level, type Side } from '../../../shared/billiards/engine';
import { useBilliards, useBilliardsList } from '../../lib/billiards';
import { setTableSoundOn, tableSoundOn } from '../../lib/billiards-sound';
import DeleteResource from '../DeleteResource';
import { AsyncButton, Button, Confirm, ErrorState, Loading } from '../ui';
import BilliardsTable, { type Playing } from './BilliardsTable';
import './billiards.css';

const statusNames: Record<BilliardsState['status'], string> = {
  WAITING: 'Đang chờ đối thủ',
  PLAYING: 'Đang chơi',
  FINISHED: 'Đã kết thúc',
  CANCELLED: 'Đã hủy',
};
const reasonNames: Record<BilliardsReason, string> = {
  EIGHT_POTTED: 'đưa bi 8 vào lỗ',
  EIGHT_EARLY: 'đối thủ làm rơi bi 8 sai luật',
  NINE_POTTED: 'đưa bi 9 vào lỗ',
  POINTS: 'đủ điểm trước',
  RESIGN: 'đối thủ chịu thua',
  LEFT: 'đối thủ rời bàn',
};
const modeHelp: Record<BilliardsMode, string> = {
  EIGHT:
    'Một bên bi trơn (1–7), một bên bi sọc (9–15). Ai đưa hết bi của mình rồi vào bi 8 là thắng.',
  NINE: 'Luôn phải chạm bi số nhỏ nhất trước. Ai đưa bi 9 vào lỗ hợp lệ là thắng.',
  CAROM: 'Bàn không lỗ. Đánh bi của mình chạm cả hai bi còn lại để ghi 1 điểm.',
};
const otherSide = (side: Side): Side => (side === 'a' ? 'b' : 'a');

function resultText(state: BilliardsState) {
  const result = state.result;
  if (!result) return '';
  if (!result.winner) return 'Hòa';
  return `${state.seats[result.winner]?.name ?? 'Người chơi'} thắng · ${reasonNames[result.reason]}`;
}

export default function BilliardsParty({
  snapshot,
  game,
}: {
  snapshot: Snapshot;
  game: string | null;
}) {
  return game ? (
    <BilliardsMatch key={game} snapshot={snapshot} game={game} />
  ) : (
    <BilliardsLobby snapshot={snapshot} />
  );
}

// ---------------------------------------------------------------- lobby

function BilliardsLobby({ snapshot }: { snapshot: Snapshot }) {
  const room = snapshot.room.id;
  const navigate = useNavigate();
  const { query, create } = useBilliardsList(room, snapshot.me);
  const [name, setName] = useState('Bi-a cùng nhau');
  const [mode, setMode] = useState<BilliardsMode>('EIGHT');
  const [rival, setRival] = useState<'member' | 'bot'>('bot');
  const [level, setLevel] = useState<Level>(2);
  const [target, setTarget] = useState<5 | 10 | 20>(10);
  const command: CreateBilliards = {
    name: name.trim(),
    mode,
    bot: rival === 'bot' ? level : null,
    target,
  };
  return (
    <section className="bi-party" aria-label="Bi-a">
      <header className="bi-hero">
        <span className="bi-eyebrow">ROOMTUNE PLAY · BI-A</span>
        <h1>Bi-a</h1>
        <p>
          Chọn 8 bi, 9 bi hoặc phăng. Thách đấu một người trong phòng hoặc đánh với máy. Kéo để
          ngắm, chỉnh lực rồi đánh — mọi người trong phòng cùng xem bi lăn.
        </p>
      </header>
      <div className="bi-lobby-grid">
        <form className="bi-card" onSubmit={(e) => e.preventDefault()} aria-labelledby="bi-create">
          <h2 id="bi-create">Mở bàn mới</h2>
          <label>
            Tên bàn
            <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </label>
          <fieldset className="bi-choice">
            <legend>Kiểu chơi</legend>
            {(['EIGHT', 'NINE', 'CAROM'] as const).map((m) => (
              <label key={m}>
                <input
                  type="radio"
                  name="bi-mode"
                  checked={mode === m}
                  onChange={() => setMode(m)}
                />
                {m === 'EIGHT' ? '8 bi' : m === 'NINE' ? '9 bi' : 'Phăng'}
              </label>
            ))}
          </fieldset>
          <p className="muted bi-help">{modeHelp[mode]}</p>
          {mode === 'CAROM' && (
            <fieldset className="bi-choice">
              <legend>Chơi tới</legend>
              {([5, 10, 20] as const).map((t) => (
                <label key={t}>
                  <input
                    type="radio"
                    name="bi-target"
                    checked={target === t}
                    onChange={() => setTarget(t)}
                  />
                  {t} điểm
                </label>
              ))}
            </fieldset>
          )}
          <fieldset className="bi-choice">
            <legend>Đối thủ</legend>
            <label>
              <input
                type="radio"
                name="bi-rival"
                checked={rival === 'bot'}
                onChange={() => setRival('bot')}
              />
              <Bot size={16} aria-hidden="true" /> Máy
            </label>
            <label>
              <input
                type="radio"
                name="bi-rival"
                checked={rival === 'member'}
                onChange={() => setRival('member')}
              />
              <Users size={16} aria-hidden="true" /> Người trong phòng
            </label>
          </fieldset>
          {rival === 'bot' && (
            <fieldset className="bi-choice">
              <legend>Mức độ của máy</legend>
              {([1, 2, 3] as const).map((l) => (
                <label key={l}>
                  <input
                    type="radio"
                    name="bi-level"
                    checked={level === l}
                    onChange={() => setLevel(l)}
                  />
                  {levelNames[l]}
                </label>
              ))}
            </fieldset>
          )}
          <AsyncButton
            variant="primary"
            disabled={command.name.length < 2}
            onClick={async () => {
              const result = await create(command);
              navigate(`/room/${room}/games/bi-a/${result.state.id}`);
            }}
          >
            <Plus size={17} /> Mở bàn
          </AsyncButton>
        </form>
        <section className="bi-card" aria-labelledby="bi-list">
          <h2 id="bi-list">Các bàn trong phòng</h2>
          {query.isPending ? (
            <Loading>Đang tìm bàn…</Loading>
          ) : query.error ? (
            <ErrorState error={query.error} retry={() => void query.refetch()} />
          ) : query.data.matches.length ? (
            <ul className="bi-table-list">
              {query.data.matches.map((m) => {
                const seated = [m.seats.a, m.seats.b].some((s) => s?.id === snapshot.me);
                const open = m.status === 'WAITING' && (!m.seats.a || !m.seats.b);
                return (
                  <li key={m.id}>
                    <Link to={`/room/${room}/games/bi-a/${m.id}`}>
                      <strong>{m.name}</strong>
                      <small>
                        {modeNames[m.mode]} ·{' '}
                        {(['a', 'b'] as const)
                          .map((s) => m.seats[s]?.name ?? 'Ghế trống')
                          .join(' vs ')}
                      </small>
                      <small>
                        {m.status === 'FINISHED' && m.result
                          ? resultText({ ...(m as unknown as BilliardsState) })
                          : statusNames[m.status]}
                      </small>
                      <span className="bi-enter">
                        {seated ? 'Vào lại →' : open ? 'Vào chơi →' : 'Xem →'}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted">Chưa có bàn nào. Mở bàn đầu tiên và rủ cả phòng vào xem.</p>
          )}
        </section>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- match

function BilliardsMatch({ snapshot, game }: { snapshot: Snapshot; game: string }) {
  const room = snapshot.room.id,
    me = snapshot.me;
  const { query, send, pending } = useBilliards(room, me, game);
  const client = useQueryClient();
  const navigate = useNavigate();
  const [level, setLevel] = useState<Level>(2);
  const [sound, setSound] = useState(tableSoundOn);
  const [playing, setPlaying] = useState<Playing>(null);
  const animating = playing !== null;
  // Opening a table brings the players and the whole table into view, so play needs no scrolling.
  const stage = useRef<HTMLDivElement>(null);
  const ready = Boolean(query.data);
  useEffect(() => {
    if (ready) stage.current?.scrollIntoView({ block: 'start' });
  }, [ready]);
  const state = query.data?.state;
  // Shot results stay hidden until their balls have finished rolling on screen.
  const [settled, setSettled] = useState<number | null>(null);
  const shownSeq = settled ?? state?.seq ?? 0;

  if (!state) {
    if (query.error instanceof AppError && query.error.code === 'NOT_FOUND')
      return (
        <section className="bi-party" aria-label="Ván bi-a">
          <div className="bi-card bi-gone" role="status">
            <h2>Bàn này không còn nữa</h2>
            <p className="muted">Chủ bàn hoặc chủ phòng đã xóa bàn này.</p>
            <Button asChild variant="primary">
              <Link to={`/room/${room}/games/bi-a`}>
                <ArrowLeft size={16} /> Về danh sách bàn
              </Link>
            </Button>
          </div>
        </section>
      );
    return query.error ? (
      <ErrorState error={query.error} retry={() => void query.refetch()} />
    ) : (
      <Loading>Đang xếp bi…</Loading>
    );
  }

  const mine: Side | null =
    state.seats.a?.id === me && !state.seats.a.bot
      ? 'a'
      : state.seats.b?.id === me && !state.seats.b.bot
        ? 'b'
        : null;
  const myTurn = state.status === 'PLAYING' && mine === state.turn;
  const rival = mine ? state.seats[otherSide(mine)] : null;
  const host = state.host === me;
  const canManage = host || snapshot.role === 'owner';
  const freeSide = !state.seats.a ? 'a' : !state.seats.b ? 'b' : null;
  const turnText =
    state.status === 'WAITING'
      ? 'Đang chờ đối thủ vào bàn'
      : state.status === 'FINISHED'
        ? resultText(state)
        : state.status === 'CANCELLED'
          ? 'Bàn đã hủy'
          : playing
            ? playing.remote
              ? `${state.seats[playing.by]?.name ?? 'Đối thủ'} đang đánh…`
              : 'Bi đang lăn…'
            : pending
              ? rival?.bot
                ? 'Máy đang đánh…'
                : 'Đang gửi cú đánh…'
              : myTurn
                ? state.ballInHand
                  ? 'Lượt của bạn · được đặt bi cái'
                  : 'Lượt của bạn'
                : `${state.seats[state.turn]?.name ?? 'Đối thủ'} đang đánh`;

  return (
    <section className="bi-party bi-match" aria-label="Ván bi-a">
      <header className="bi-match-head">
        <Button asChild variant="ghost">
          <Link to={`/room/${room}/games/bi-a`}>
            <ArrowLeft size={16} /> Danh sách bàn
          </Link>
        </Button>
        <div>
          <h1>{state.name}</h1>
          <small>
            {modeNames[state.mode]}
            {state.mode === 'CAROM' ? ` · tới ${state.target} điểm` : ''} ·{' '}
            {statusNames[state.status]}
          </small>
        </div>
        <Button
          variant="ghost"
          aria-pressed={sound}
          onClick={() => {
            setTableSoundOn(!sound);
            setSound(!sound);
          }}
        >
          {sound ? <Volume2 size={16} /> : <VolumeX size={16} />} Âm thanh {sound ? 'bật' : 'tắt'}
        </Button>
      </header>
      <div className="bi-stage" ref={stage}>
        <div className="bi-players">
          {(['a', 'b'] as const).map((side) => (
            <PlayerCard
              key={side}
              state={state}
              side={side}
              me={me}
              active={state.status === 'PLAYING' && state.turn === side && !animating}
            />
          ))}
        </div>
        <BilliardsTable
          state={state}
          side={mine}
          canShoot={myTurn && !pending}
          onAnimating={(next) => {
            setPlaying(next);
            setSettled(next ? (settled ?? shownSeq) : null);
          }}
          onShoot={async (shot, place) => Boolean(await send({ action: 'shoot', ...shot, place }))}
        />
      </div>
      <div className="bi-layout">
        <section className="bi-card" aria-label="Trạng thái ván">
          <p className={'bi-turn' + (myTurn && !animating ? ' mine' : '')} role="status">
            {turnText}
          </p>
          {state.note && !animating && <p className="muted bi-note">{state.note}</p>}
          <div className="bi-actions">
            {state.status === 'PLAYING' && mine && (
              <Confirm
                title="Chịu thua ván này?"
                description="Đối thủ sẽ được tính thắng ván này."
                onConfirm={() => send({ action: 'resign' })}
              >
                <Button variant="ghost" disabled={pending}>
                  <Flag size={16} /> Chịu thua
                </Button>
              </Confirm>
            )}
            {state.status === 'FINISHED' && mine && state.seats.a && state.seats.b && (
              <AsyncButton
                variant="primary"
                disabled={pending || animating}
                onClick={() => send({ action: 'rematch' })}
              >
                <RotateCcw size={16} /> Ván mới (đổi người phá)
              </AsyncButton>
            )}
            {['WAITING', 'FINISHED'].includes(state.status) && !mine && freeSide && (
              <AsyncButton
                variant="primary"
                disabled={pending}
                onClick={() => send({ action: 'join' })}
              >
                Vào chơi
              </AsyncButton>
            )}
          </div>
          {host && ['WAITING', 'FINISHED'].includes(state.status) && freeSide && (
            <div className="bi-bot-row">
              <label>
                Mức máy
                <select value={level} onChange={(e) => setLevel(Number(e.target.value) as Level)}>
                  {([1, 2, 3] as const).map((l) => (
                    <option key={l} value={l}>
                      {levelNames[l]}
                    </option>
                  ))}
                </select>
              </label>
              <AsyncButton
                variant="secondary"
                disabled={pending}
                onClick={() => send({ action: 'add_bot', level })}
              >
                <Bot size={16} /> Cho máy vào chơi
              </AsyncButton>
            </div>
          )}
          {host && state.status === 'FINISHED' && (state.seats.a?.bot || state.seats.b?.bot) && (
            <AsyncButton
              variant="ghost"
              disabled={pending}
              onClick={() => send({ action: 'remove_bot' })}
            >
              <Users size={16} /> Mời người thay máy
            </AsyncButton>
          )}
          {mine && state.status !== 'PLAYING' && (
            <AsyncButton
              variant="ghost"
              disabled={pending}
              onClick={() => send({ action: 'leave' })}
            >
              Rời bàn
            </AsyncButton>
          )}
        </section>
        <section className="bi-card bi-log" aria-label="Các cú đánh gần đây">
          <h2>Diễn biến</h2>
          {state.shots.some((s) => s.seq <= shownSeq) ? (
            <ol>
              {[...state.shots]
                .filter((s) => s.seq <= shownSeq)
                .reverse()
                .map((s) => (
                  <li key={s.seq}>{s.text}</li>
                ))}
            </ol>
          ) : (
            <p className="muted">Chưa có cú đánh nào.</p>
          )}
        </section>
      </div>
      {canManage && (
        <div className="delete-zone">
          <DeleteResource
            key={state.id}
            path={`/rooms/${room}/billiards/${state.id}/delete`}
            actor={me}
            name={state.name}
            label="Xóa bàn"
            disabled={pending}
            description="Xóa vĩnh viễn bàn bi-a này cùng diễn biến và tỉ số. Ván đang chơi sẽ dừng với mọi người."
            onDeleted={() => {
              const key = ['billiards', room, me, state.id];
              void client.cancelQueries({ queryKey: key });
              client.removeQueries({ queryKey: key });
              void client.invalidateQueries({ queryKey: ['billiards', room, me, 'list'] });
              navigate(`/room/${room}/games/bi-a`);
            }}
          />
        </div>
      )}
    </section>
  );
}

function PlayerCard({
  state,
  side,
  me,
  active,
}: {
  state: BilliardsState;
  side: Side;
  me: string;
  active: boolean;
}) {
  const seat = state.seats[side];
  const group = state.groups[side];
  const left =
    state.mode === 'EIGHT' && group
      ? state.balls.filter((b) => b.on && ballGroup(b.n) === group).map((b) => b.n)
      : [];
  return (
    <div className={'bi-player' + (active ? ' turn' : '')}>
      <strong>
        {seat ? seat.name : 'Ghế trống'}
        {seat?.id === me && !seat.bot ? ' (bạn)' : ''}
      </strong>
      <small>
        {state.mode === 'CAROM'
          ? `Bi ${side === 'a' ? 'trắng' : 'vàng'} · ${state.points[side]}/${state.target} điểm`
          : state.mode === 'EIGHT'
            ? group
              ? `${groupNames[group]} · còn ${left.length}`
              : 'Chưa chia nhóm'
            : 'Bi số nhỏ nhất trước'}
        {seat && state.score[seat.id] ? ` · thắng ${state.score[seat.id]} ván` : ''}
        {active ? ' · đến lượt' : ''}
      </small>
      {left.length > 0 && (
        <span className="bi-mini" aria-label={`Bi còn lại: ${left.join(', ')}`}>
          {left.map((n) => (
            <i key={n} className={'bi-mini-ball n' + n}>
              {n}
            </i>
          ))}
        </span>
      )}
    </div>
  );
}
