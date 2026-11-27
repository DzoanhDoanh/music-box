// Cờ Tướng table state: seats, turns, results and the computer's replies. The Worker runs every
// transition; PostgreSQL only stores the versioned result.
import { AppError } from '../domain';
import {
  CO_TUONG_BOT,
  CO_TUONG_MAX_MOVES,
  levelNames,
  sideNames,
  type CoTuongCommand,
  type CoTuongMember,
  type CoTuongReason,
  type CoTuongSeat,
  type CoTuongState,
  type CreateCoTuong,
} from './contracts';
import {
  START_BOARD,
  apply,
  chooseMove,
  evaluate,
  inCheck,
  isLegal,
  legalMoves,
  noAttackers,
  notation,
  other,
  type Level,
  type Move,
  type Random,
  type Side,
} from './rules';

/** Plies without a capture before the game is drawn. */
const NO_PROGRESS = 120;

function fail(code = 'COTUONG_ACTION_INVALID'): never {
  throw new AppError(code, 409);
}

export const botSeat = (level: Level): CoTuongSeat => ({
  id: CO_TUONG_BOT,
  name: `Máy · ${levelNames[level]}`,
  bot: true,
  level,
});
const humanSeat = (id: string, name: string): CoTuongSeat => ({ id, name, bot: false });

/** The side `actor` sits on, or null. */
export const seatOf = (s: CoTuongState, actor: string): Side | null =>
  s.seats.r?.id === actor && !s.seats.r.bot
    ? 'r'
    : s.seats.b?.id === actor && !s.seats.b.bot
      ? 'b'
      : null;
const humans = (s: CoTuongState) =>
  (['r', 'b'] as const).flatMap((side) => {
    const seat = s.seats[side];
    return seat && !seat.bot ? [seat] : [];
  });

export function createCoTuongState(
  id: string,
  room: string,
  actor: string,
  actorName: string,
  command: CreateCoTuong,
  now: number,
  random: Random,
): CoTuongState {
  const s: CoTuongState = {
    schema: 1,
    id,
    room,
    host: actor,
    name: command.name.trim(),
    version: 0,
    status: 'WAITING',
    seats: { r: null, b: null },
    board: START_BOARD,
    turn: 'r',
    moves: [],
    result: null,
    drawOffer: null,
    note: null,
    score: {},
    updatedAt: now,
  };
  s.seats[command.side] = humanSeat(actor, actorName);
  if (command.bot) {
    s.seats[other(command.side)] = botSeat(command.bot);
    start(s, random);
  }
  return s;
}

function start(s: CoTuongState, random: Random) {
  s.status = 'PLAYING';
  s.board = START_BOARD;
  s.turn = 'r';
  s.moves = [];
  s.result = null;
  s.drawOffer = null;
  s.note = null;
  botTurn(s, random);
}

/** Back to an empty board, waiting for someone to take the free seat. */
function reopen(s: CoTuongState) {
  s.status = humans(s).length ? 'WAITING' : 'CANCELLED';
  s.board = START_BOARD;
  s.turn = 'r';
  s.moves = [];
  s.result = null;
  s.drawOffer = null;
  const first = humans(s)[0];
  if (first && seatOf(s, s.host) === null) s.host = first.id;
}

function finish(s: CoTuongState, winner: Side | null, reason: CoTuongReason) {
  s.status = 'FINISHED';
  s.result = { winner, reason };
  s.drawOffer = null;
  const seat = winner ? s.seats[winner] : null;
  if (seat) s.score[seat.id] = (s.score[seat.id] ?? 0) + 1;
}

/** Positions since the start, as board + side to move. */
function positions(s: CoTuongState) {
  const keys = [START_BOARD + 'r'];
  let board = START_BOARD,
    turn: Side = 'r';
  for (const m of s.moves) {
    board = apply(board, m);
    turn = other(turn);
    keys.push(board + turn);
  }
  return keys;
}

/**
 * The same position for the third time. Whoever kept checking through the repetition while the
 * other side did not loses (perpetual check is forbidden); otherwise it is a draw.
 */
function repetition(s: CoTuongState): { winner: Side | null } | null {
  const keys = positions(s);
  const last = keys[keys.length - 1];
  const seen = keys.reduce((n, k) => n + (k === last ? 1 : 0), 0);
  if (seen < 3) return null;
  const first = keys.indexOf(last);
  // Move i turns position i into position i + 1; red plays the even plies.
  const cycle = s.moves
    .slice(first)
    .map((m, i) => ({ m, side: ((first + i) % 2 ? 'b' : 'r') as Side }));
  const perpetual = (side: Side) => {
    const own = cycle.filter((x) => x.side === side);
    return own.length > 0 && own.every((x) => x.m.check);
  };
  const r = perpetual('r'),
    b = perpetual('b');
  if (r && !b) return { winner: 'b' };
  if (b && !r) return { winner: 'r' };
  return { winner: null };
}

function playMove(s: CoTuongState, move: Move) {
  const piece = s.board[move.from];
  const captured = s.board[move.to] === '.' ? null : s.board[move.to];
  const text = notation(s.board, move);
  s.board = apply(s.board, move);
  s.turn = other(s.turn);
  const check = inCheck(s.board, s.turn);
  s.moves.push({ from: move.from, to: move.to, piece, captured, text, check });
  s.drawOffer = null;
  s.note = null;
  if (!legalMoves(s.board, s.turn).length)
    return finish(s, other(s.turn), check ? 'CHECKMATE' : 'STALEMATE');
  const repeated = repetition(s);
  if (repeated) return finish(s, repeated.winner, 'REPETITION');
  let quiet = 0;
  while (quiet < s.moves.length && !s.moves[s.moves.length - 1 - quiet].captured) quiet++;
  if (quiet >= NO_PROGRESS) return finish(s, null, 'NO_PROGRESS');
  if (noAttackers(s.board)) return finish(s, null, 'MATERIAL');
  if (s.moves.length >= CO_TUONG_MAX_MOVES) return finish(s, null, 'MOVE_LIMIT');
}

/** The computer replies while it is its turn. */
function botTurn(s: CoTuongState, random: Random) {
  while (s.status === 'PLAYING' && s.seats[s.turn]?.bot) {
    const move = chooseMove(s.board, s.turn, s.seats[s.turn]!.level ?? 2, random);
    if (!move)
      return finish(s, other(s.turn), inCheck(s.board, s.turn) ? 'CHECKMATE' : 'STALEMATE');
    playMove(s, move);
  }
}

/** Rebuilds the board from the first `count` moves. */
function rewind(s: CoTuongState, count: number) {
  s.moves = s.moves.slice(0, count);
  s.board = s.moves.reduce((board, m) => apply(board, m), START_BOARD);
  s.turn = s.moves.length % 2 ? 'b' : 'r';
  s.drawOffer = null;
}

/** Seated players who left the room lose a running game or free their seat. */
export function settleDepartures(s: CoTuongState, members: CoTuongMember[], now: number) {
  const present = new Set(members.map((m) => m.id));
  let next = s;
  for (const side of ['r', 'b'] as const) {
    const seat = next.seats[side];
    if (!seat || seat.bot || present.has(seat.id) || ['CANCELLED'].includes(next.status)) continue;
    next = transition(next, seat.id, seat.name, { action: 'leave' }, now, { index: () => 0 });
  }
  return next;
}

export function transition(
  current: CoTuongState,
  actor: string,
  actorName: string,
  command: CoTuongCommand,
  now: number,
  random: Random,
): CoTuongState {
  const s = structuredClone(current);
  const mine = seatOf(s, actor);
  const host = s.host === actor;
  switch (command.action) {
    case 'join': {
      // An open seat: a waiting table, or a finished one whose opponent left.
      if (!['WAITING', 'FINISHED'].includes(s.status) || mine) fail('COTUONG_SEAT_TAKEN');
      const free = !s.seats.r ? 'r' : !s.seats.b ? 'b' : fail('COTUONG_SEAT_TAKEN');
      s.seats[free] = humanSeat(actor, actorName);
      start(s, random);
      break;
    }
    case 'leave': {
      if (!mine) fail();
      if (s.status === 'PLAYING') {
        finish(s, other(mine), 'LEFT');
        s.note = `${s.seats[mine]!.name} đã rời bàn.`;
      }
      s.seats[mine] = null;
      // A computer does not keep a table open on its own.
      if (!humans(s).length) for (const side of ['r', 'b'] as const) s.seats[side] = null;
      if (s.status !== 'FINISHED' || !humans(s).length) reopen(s);
      else if (s.host === actor) s.host = humans(s)[0].id;
      break;
    }
    case 'switch_side': {
      if (s.status !== 'WAITING' || !mine || s.seats[other(mine)]) fail();
      s.seats[other(mine)] = s.seats[mine];
      s.seats[mine] = null;
      break;
    }
    case 'add_bot': {
      if (!host || !['WAITING', 'FINISHED'].includes(s.status)) fail();
      const free = !s.seats.r ? 'r' : !s.seats.b ? 'b' : fail('COTUONG_SEAT_TAKEN');
      s.seats[free] = botSeat(command.level);
      start(s, random);
      break;
    }
    case 'remove_bot': {
      const side = s.seats.r?.bot ? 'r' : s.seats.b?.bot ? 'b' : null;
      if (!host || !side || s.status !== 'FINISHED') fail();
      s.seats[side] = null;
      reopen(s);
      break;
    }
    case 'move': {
      if (s.status !== 'PLAYING') fail();
      if (!mine || s.turn !== mine) fail('COTUONG_NOT_YOUR_TURN');
      const move = { from: command.from, to: command.to };
      if (!isLegal(s.board, mine, move)) fail('COTUONG_ILLEGAL_MOVE');
      playMove(s, move);
      botTurn(s, random);
      break;
    }
    case 'undo': {
      // Only against the computer: take back your last move and its reply.
      if (s.status !== 'PLAYING' || !mine || !s.seats[other(mine)]?.bot) fail();
      const first = mine === 'r' ? 0 : 1;
      let count = s.moves.length;
      do count--;
      while (count >= first && (count % 2 ? 'b' : 'r') !== mine);
      if (count < first) fail();
      rewind(s, count);
      s.note = `${s.seats[mine]!.name} xin đi lại.`;
      break;
    }
    case 'resign': {
      if (s.status !== 'PLAYING' || !mine) fail();
      finish(s, other(mine), 'RESIGN');
      break;
    }
    case 'offer_draw': {
      if (s.status !== 'PLAYING' || !mine || s.drawOffer) fail();
      const rival = s.seats[other(mine)]!;
      if (rival.bot) {
        // The computer agrees only when it is clearly worse off.
        if (evaluate(s.board, other(mine)) <= -150) finish(s, null, 'DRAW_AGREED');
        else s.note = `${rival.name} từ chối hòa.`;
      } else {
        s.drawOffer = mine;
        s.note = `${s.seats[mine]!.name} xin hòa.`;
      }
      break;
    }
    case 'answer_draw': {
      if (s.status !== 'PLAYING' || !mine || s.drawOffer !== other(mine)) fail();
      if (command.accept) finish(s, null, 'DRAW_AGREED');
      else {
        s.drawOffer = null;
        s.note = `${s.seats[mine]!.name} từ chối hòa.`;
      }
      break;
    }
    case 'rematch': {
      if (s.status !== 'FINISHED' || !mine || !s.seats.r || !s.seats.b) fail();
      // Swap colours so whoever played Black now opens the game.
      [s.seats.r, s.seats.b] = [s.seats.b, s.seats.r];
      start(s, random);
      s.note = `Ván mới: ${s.seats.r.name} cầm quân ${sideNames.r}.`;
      break;
    }
  }
  s.version = current.version + 1;
  s.updatedAt = now;
  return s;
}
