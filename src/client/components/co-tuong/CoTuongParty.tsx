import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Bot, Flag, Handshake, Plus, RotateCcw, Undo2, Users } from 'lucide-react';
import type { Snapshot } from '../../../shared/contracts';
import { AppError } from '../../../shared/domain';
import {
  levelNames,
  sideNames,
  type CoTuongReason,
  type CoTuongState,
  type CreateCoTuong,
} from '../../../shared/co-tuong/contracts';
import {
  apply,
  inCheck,
  legalMoves,
  pieceGlyphs,
  pieceNames,
  sideOf,
  type Level,
  type Move,
  type Side,
} from '../../../shared/co-tuong/rules';
import { useCoTuong, useCoTuongList } from '../../lib/co-tuong';
import DeleteResource from '../DeleteResource';
import { AsyncButton, Button, Confirm, ErrorState, Loading } from '../ui';
import './co-tuong.css';

const statusNames: Record<CoTuongState['status'], string> = {
  WAITING: 'Đang chờ đối thủ',
  PLAYING: 'Đang chơi',
  FINISHED: 'Đã kết thúc',
  CANCELLED: 'Đã hủy',
};
const reasonNames: Record<CoTuongReason, string> = {
  CHECKMATE: 'chiếu bí',
  STALEMATE: 'đối thủ hết nước đi',
  RESIGN: 'đối thủ đầu hàng',
  LEFT: 'đối thủ rời bàn',
  DRAW_AGREED: 'hai bên đồng ý hòa',
  REPETITION: 'lặp lại thế cờ',
  NO_PROGRESS: '60 nước liền không ăn quân',
  MATERIAL: 'không bên nào còn quân tấn công',
  MOVE_LIMIT: 'ván quá dài',
};
const opposite = (side: Side): Side => (side === 'r' ? 'b' : 'r');

export function resultText(state: CoTuongState) {
  const result = state.result;
  if (!result) return '';
  if (!result.winner) return `Hòa · ${reasonNames[result.reason]}`;
  const winner = state.seats[result.winner]?.name ?? `Quân ${sideNames[result.winner]}`;
  const reason = result.reason === 'REPETITION' ? 'đối thủ chiếu dai' : reasonNames[result.reason];
  return `${winner} thắng · ${reason}`;
}

export default function CoTuongParty({
  snapshot,
  game,
}: {
  snapshot: Snapshot;
  game: string | null;
}) {
  return game ? (
    <CoTuongMatch key={game} snapshot={snapshot} game={game} />
  ) : (
    <CoTuongLobby snapshot={snapshot} />
  );
}

// ---------------------------------------------------------------- lobby

function CoTuongLobby({ snapshot }: { snapshot: Snapshot }) {
  const room = snapshot.room.id;
  const navigate = useNavigate();
  const { query, create } = useCoTuongList(room, snapshot.me);
  const [name, setName] = useState('Cờ Tướng cùng nhau');
  const [side, setSide] = useState<Side>('r');
  const [rival, setRival] = useState<'member' | 'bot'>('bot');
  const [level, setLevel] = useState<Level>(2);
  const command: CreateCoTuong = { name: name.trim(), side, bot: rival === 'bot' ? level : null };
  return (
    <section className="xq-party" aria-label="Cờ Tướng">
      <header className="xq-hero">
        <span className="xq-eyebrow">ROOMTUNE PLAY · CỜ TƯỚNG</span>
        <h1>Cờ Tướng</h1>
        <p>
          Thách đấu một người trong phòng, hoặc luyện tay với máy ở mức Dễ, Vừa hay Khó. Không tính
          giờ, ai cũng xem được ván đang đánh.
        </p>
      </header>
      <div className="xq-lobby-grid">
        <form
          className="xq-card"
          onSubmit={(e) => e.preventDefault()}
          aria-labelledby="xq-create-title"
        >
          <h2 id="xq-create-title">Mở bàn mới</h2>
          <label>
            Tên bàn
            <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </label>
          <fieldset className="xq-choice">
            <legend>Đối thủ</legend>
            <label>
              <input
                type="radio"
                name="xq-rival"
                checked={rival === 'bot'}
                onChange={() => setRival('bot')}
              />
              <Bot size={16} aria-hidden="true" /> Máy
            </label>
            <label>
              <input
                type="radio"
                name="xq-rival"
                checked={rival === 'member'}
                onChange={() => setRival('member')}
              />
              <Users size={16} aria-hidden="true" /> Người trong phòng
            </label>
          </fieldset>
          {rival === 'bot' && (
            <fieldset className="xq-choice">
              <legend>Mức độ của máy</legend>
              {([1, 2, 3] as const).map((l) => (
                <label key={l}>
                  <input
                    type="radio"
                    name="xq-level"
                    checked={level === l}
                    onChange={() => setLevel(l)}
                  />
                  {levelNames[l]}
                </label>
              ))}
            </fieldset>
          )}
          <fieldset className="xq-choice">
            <legend>Bạn cầm quân</legend>
            {(['r', 'b'] as const).map((s) => (
              <label key={s}>
                <input
                  type="radio"
                  name="xq-side"
                  checked={side === s}
                  onChange={() => setSide(s)}
                />
                <i className={`xq-dot ${s}`} aria-hidden="true" />
                {sideNames[s]}
                {s === 'r' ? ' (đi trước)' : ''}
              </label>
            ))}
          </fieldset>
          <AsyncButton
            variant="primary"
            disabled={command.name.length < 2}
            onClick={async () => {
              const result = await create(command);
              navigate(`/room/${room}/games/co-tuong/${result.state.id}`);
            }}
          >
            <Plus size={17} /> Mở bàn
          </AsyncButton>
        </form>
        <section className="xq-card" aria-labelledby="xq-list-title">
          <h2 id="xq-list-title">Các bàn trong phòng</h2>
          {query.isPending ? (
            <Loading>Đang tìm bàn…</Loading>
          ) : query.error ? (
            <ErrorState error={query.error} retry={() => void query.refetch()} />
          ) : query.data.matches.length ? (
            <ul className="xq-table-list">
              {query.data.matches.map((m) => {
                const seated = [m.seats.r, m.seats.b].some((s) => s?.id === snapshot.me);
                const open = m.status === 'WAITING' && (!m.seats.r || !m.seats.b);
                const state = { ...m, seats: m.seats } as unknown as CoTuongState;
                return (
                  <li key={m.id}>
                    <Link to={`/room/${room}/games/co-tuong/${m.id}`}>
                      <strong>{m.name}</strong>
                      <small>
                        {(['r', 'b'] as const)
                          .map((s) => m.seats[s]?.name ?? 'Ghế trống')
                          .join(' vs ')}
                      </small>
                      <small>
                        {m.status === 'FINISHED' && m.result
                          ? resultText(state)
                          : `${statusNames[m.status]}${m.moves ? ` · ${m.moves} nước` : ''}`}
                      </small>
                      <span className="xq-enter">
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

function CoTuongMatch({ snapshot, game }: { snapshot: Snapshot; game: string }) {
  const room = snapshot.room.id,
    me = snapshot.me;
  const { query, send, pending } = useCoTuong(room, me, game);
  const client = useQueryClient();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<number | null>(null);
  const [sent, setSent] = useState<Move | null>(null);
  const [level, setLevel] = useState<Level>(2);
  const state = query.data?.state;
  const mine: Side | null = !state
    ? null
    : state.seats.r?.id === me && !state.seats.r.bot
      ? 'r'
      : state.seats.b?.id === me && !state.seats.b.bot
        ? 'b'
        : null;
  const myTurn = state?.status === 'PLAYING' && mine === state.turn;
  const targets = useMemo(
    () =>
      state && myTurn && selected !== null
        ? legalMoves(state.board, state.turn)
            .filter((m) => m.from === selected)
            .map((m) => m.to)
        : [],
    [state, myTurn, selected],
  );

  if (!state) {
    // The host or room owner deleted this table while it was open.
    if (query.error instanceof AppError && query.error.code === 'NOT_FOUND')
      return (
        <section className="xq-party" aria-label="Ván Cờ Tướng">
          <div className="xq-card xq-gone" role="status">
            <h2>Bàn này không còn nữa</h2>
            <p className="muted">Chủ bàn hoặc chủ phòng đã xóa bàn này.</p>
            <Button asChild variant="primary">
              <Link to={`/room/${room}/games/co-tuong`}>
                <ArrowLeft size={16} /> Về danh sách bàn
              </Link>
            </Button>
          </div>
        </section>
      );
    return query.error ? (
      <ErrorState error={query.error} retry={() => void query.refetch()} />
    ) : (
      <Loading>Đang bày quân…</Loading>
    );
  }

  // While a move is on its way, show it at once; the computer's reply arrives with the answer.
  const board = pending && sent ? apply(state.board, sent) : state.board;
  const last = pending && sent ? sent : state.moves.at(-1);
  const toMove = pending && sent ? opposite(state.turn) : state.turn;
  const checked =
    state.status === 'PLAYING' && inCheck(board, toMove)
      ? board.indexOf(toMove === 'r' ? 'K' : 'k')
      : -1;
  const flipped = mine === 'b';
  const rival = mine ? state.seats[opposite(mine)] : null;
  const host = state.host === me;
  const canManage = host || snapshot.role === 'owner';
  const freeSide = !state.seats.r ? 'r' : !state.seats.b ? 'b' : null;

  const choose = async (square: number) => {
    if (!myTurn || pending) return;
    if (selected !== null && targets.includes(square)) {
      const move = { from: selected, to: square };
      setSelected(null);
      setSent(move);
      await send({ action: 'move', ...move });
      setSent(null);
      return;
    }
    setSelected(sideOf(state.board[square]) === mine && square !== selected ? square : null);
  };

  const top: Side = flipped ? 'r' : 'b';
  const turnText =
    state.status === 'WAITING'
      ? 'Đang chờ đối thủ vào bàn'
      : state.status === 'FINISHED'
        ? resultText(state)
        : state.status === 'CANCELLED'
          ? 'Bàn đã hủy'
          : pending && sent && rival?.bot
            ? 'Máy đang nghĩ…'
            : myTurn
              ? 'Lượt của bạn'
              : `${state.seats[state.turn]?.name ?? sideNames[state.turn]} đang đi`;

  return (
    <section className="xq-party xq-match" aria-label="Ván Cờ Tướng">
      <header className="xq-match-head">
        <Button asChild variant="ghost">
          <Link to={`/room/${room}/games/co-tuong`}>
            <ArrowLeft size={16} /> Danh sách bàn
          </Link>
        </Button>
        <div>
          <h1>{state.name}</h1>
          <small>{statusNames[state.status]}</small>
        </div>
      </header>
      <div className="xq-layout">
        <div className="xq-board-col">
          <SeatBar state={state} side={top} me={me} />
          <XiangqiBoard
            board={board}
            flipped={flipped}
            selected={selected}
            targets={targets}
            last={last ?? null}
            checked={checked}
            interactive={myTurn && !pending}
            onSquare={(sq) => void choose(sq)}
          />
          <SeatBar state={state} side={opposite(top)} me={me} />
        </div>
        <aside className="xq-side">
          <section className="xq-card" aria-label="Trạng thái ván">
            <p className={'xq-turn' + (myTurn && !pending ? ' mine' : '')} role="status">
              {turnText}
            </p>
            {checked >= 0 && state.status === 'PLAYING' && (
              <p className="xq-check" role="alert">
                Chiếu tướng!
              </p>
            )}
            {state.note && <p className="muted xq-note">{state.note}</p>}
            {state.status === 'PLAYING' && mine && state.drawOffer === opposite(mine) && (
              <div className="xq-actions">
                <AsyncButton
                  variant="primary"
                  disabled={pending}
                  onClick={() => send({ action: 'answer_draw', accept: true })}
                >
                  <Handshake size={16} /> Đồng ý hòa
                </AsyncButton>
                <AsyncButton
                  variant="ghost"
                  disabled={pending}
                  onClick={() => send({ action: 'answer_draw', accept: false })}
                >
                  Đánh tiếp
                </AsyncButton>
              </div>
            )}
            <div className="xq-actions">
              {state.status === 'PLAYING' && mine && rival?.bot && (
                <AsyncButton
                  variant="secondary"
                  disabled={pending || !state.moves.some((_, i) => (i % 2 ? 'b' : 'r') === mine)}
                  onClick={() => send({ action: 'undo' })}
                >
                  <Undo2 size={16} /> Đi lại
                </AsyncButton>
              )}
              {state.status === 'PLAYING' && mine && !state.drawOffer && (
                <AsyncButton
                  variant="ghost"
                  disabled={pending}
                  onClick={() => send({ action: 'offer_draw' })}
                >
                  <Handshake size={16} /> Xin hòa
                </AsyncButton>
              )}
              {state.status === 'PLAYING' && mine && (
                <Confirm
                  title="Đầu hàng ván này?"
                  description="Đối thủ sẽ được tính thắng ván này."
                  onConfirm={() => send({ action: 'resign' })}
                >
                  <Button variant="ghost" disabled={pending}>
                    <Flag size={16} /> Đầu hàng
                  </Button>
                </Confirm>
              )}
              {state.status === 'FINISHED' && mine && state.seats.r && state.seats.b && (
                <AsyncButton
                  variant="primary"
                  disabled={pending}
                  onClick={() => send({ action: 'rematch' })}
                >
                  <RotateCcw size={16} /> Ván mới (đổi bên)
                </AsyncButton>
              )}
              {['WAITING', 'FINISHED'].includes(state.status) && !mine && freeSide && (
                <AsyncButton
                  variant="primary"
                  disabled={pending}
                  onClick={() => send({ action: 'join' })}
                >
                  Vào chơi · cầm quân {sideNames[freeSide]}
                </AsyncButton>
              )}
              {state.status === 'WAITING' && mine && !state.seats[opposite(mine)] && (
                <AsyncButton
                  variant="ghost"
                  disabled={pending}
                  onClick={() => send({ action: 'switch_side' })}
                >
                  Đổi sang quân {sideNames[opposite(mine)]}
                </AsyncButton>
              )}
            </div>
            {host && ['WAITING', 'FINISHED'].includes(state.status) && freeSide && (
              <div className="xq-bot-row">
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
            {host && state.status === 'FINISHED' && (state.seats.r?.bot || state.seats.b?.bot) && (
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
          <section className="xq-card xq-moves" aria-label="Biên bản ván cờ">
            <h2>Biên bản</h2>
            {state.moves.length ? (
              <ol>
                {Array.from({ length: Math.ceil(state.moves.length / 2) }, (_, i) => (
                  <li key={i}>
                    <span>{state.moves[i * 2].text}</span>
                    <span>{state.moves[i * 2 + 1]?.text ?? ''}</span>
                  </li>
                )).reverse()}
              </ol>
            ) : (
              <p className="muted">Chưa có nước nào.</p>
            )}
          </section>
          {canManage && (
            <div className="delete-zone">
              <DeleteResource
                key={state.id}
                path={`/rooms/${room}/co-tuong/${state.id}/delete`}
                actor={me}
                name={state.name}
                label="Xóa bàn"
                disabled={pending}
                description="Xóa vĩnh viễn bàn này cùng biên bản và tỉ số. Ván đang chơi sẽ dừng với mọi người."
                onDeleted={() => {
                  const key = ['co-tuong', room, me, state.id];
                  void client.cancelQueries({ queryKey: key });
                  client.removeQueries({ queryKey: key });
                  void client.invalidateQueries({ queryKey: ['co-tuong', room, me, 'list'] });
                  navigate(`/room/${room}/games/co-tuong`);
                }}
              />
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function SeatBar({ state, side, me }: { state: CoTuongState; side: Side; me: string }) {
  const seat = state.seats[side];
  const turn = state.status === 'PLAYING' && state.turn === side;
  return (
    <div className={'xq-seat' + (turn ? ' turn' : '')}>
      <i className={`xq-dot ${side}`} aria-hidden="true" />
      <strong>
        {seat ? seat.name : 'Ghế trống'}
        {seat?.id === me && !seat.bot ? ' (bạn)' : ''}
      </strong>
      <small>
        Quân {sideNames[side]}
        {seat && state.score[seat.id] ? ` · thắng ${state.score[seat.id]}` : ''}
        {turn ? ' · đến lượt' : ''}
      </small>
    </div>
  );
}

// ---------------------------------------------------------------- board

const GAP = 60,
  PAD = 40,
  WIDTH = PAD * 2 + GAP * 8,
  HEIGHT = PAD * 2 + GAP * 9;

function XiangqiBoard({
  board,
  flipped,
  selected,
  targets,
  last,
  checked,
  interactive,
  onSquare,
}: {
  board: string;
  flipped: boolean;
  selected: number | null;
  targets: number[];
  last: Move | null;
  checked: number;
  interactive: boolean;
  onSquare: (square: number) => void;
}) {
  // Screen position of a square; Black's player sees the board from the other side.
  const place = (sq: number) => {
    const r = Math.floor(sq / 9),
      c = sq % 9;
    const vr = flipped ? 9 - r : r,
      vc = flipped ? 8 - c : c;
    return { x: PAD + vc * GAP, y: PAD + vr * GAP };
  };
  const line = (r1: number, c1: number, r2: number, c2: number, key: string) => (
    <line
      key={key}
      x1={PAD + c1 * GAP}
      y1={PAD + r1 * GAP}
      x2={PAD + c2 * GAP}
      y2={PAD + r2 * GAP}
    />
  );
  const grid = [
    ...Array.from({ length: 10 }, (_, r) => line(r, 0, r, 8, 'h' + r)),
    line(0, 0, 9, 0, 'v0'),
    line(0, 8, 9, 8, 'v8'),
    ...Array.from({ length: 7 }, (_, i) => [
      line(0, i + 1, 4, i + 1, 'vt' + i),
      line(5, i + 1, 9, i + 1, 'vb' + i),
    ]).flat(),
    line(0, 3, 2, 5, 'p1'),
    line(0, 5, 2, 3, 'p2'),
    line(7, 3, 9, 5, 'p3'),
    line(7, 5, 9, 3, 'p4'),
  ];
  const squares = [...board].map((piece, sq) => ({ piece, sq }));
  const label = (sq: number, piece: string) => {
    const r = Math.floor(sq / 9),
      c = sq % 9;
    const where = `cột ${c + 1}, hàng ${r + 1}`;
    if (piece === '.') return `Đi tới ${where}`;
    const side = sideOf(piece)!;
    return `${pieceNames[piece.toUpperCase()]} ${sideNames[side]} ở ${where}`;
  };
  return (
    <div className="xq-board" role="group" aria-label="Bàn Cờ Tướng">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
        <rect className="xq-wood" x="4" y="4" width={WIDTH - 8} height={HEIGHT - 8} rx="14" />
        <g className="xq-lines">{grid}</g>
        <text className="xq-river" x={PAD + GAP * 2} y={PAD + GAP * 4.5}>
          楚 河
        </text>
        <text className="xq-river" x={PAD + GAP * 6} y={PAD + GAP * 4.5}>
          漢 界
        </text>
        {last &&
          [last.from, last.to].map((sq) => {
            const p = place(sq);
            return (
              <rect
                key={'last' + sq}
                className="xq-last"
                x={p.x - 28}
                y={p.y - 28}
                width="56"
                height="56"
                rx="10"
              />
            );
          })}
      </svg>
      {squares.map(({ piece, sq }) => {
        const target = targets.includes(sq);
        if (piece === '.' && !target) return null;
        const p = place(sq);
        const style = {
          left: `${(p.x / WIDTH) * 100}%`,
          top: `${(p.y / HEIGHT) * 100}%`,
        };
        const side = sideOf(piece);
        const classes = [
          'xq-point',
          piece !== '.' ? `xq-piece ${side}` : 'xq-empty',
          selected === sq ? 'selected' : '',
          target ? 'target' : '',
          checked === sq ? 'checked' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <button
            key={sq}
            type="button"
            className={classes}
            style={style}
            aria-label={target && piece !== '.' ? `Ăn ${label(sq, piece)}` : label(sq, piece)}
            aria-pressed={selected === sq ? true : undefined}
            disabled={!interactive}
            onClick={() => onSquare(sq)}
          >
            {piece !== '.' && <span>{pieceGlyphs[piece]}</span>}
          </button>
        );
      })}
    </div>
  );
}
