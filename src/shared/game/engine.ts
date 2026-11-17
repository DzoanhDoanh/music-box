import { AppError } from '../domain';
import {
  defaultRules,
  isCaNgua,
  usesAutomaticMovement,
  stateSchema,
  type EngineAction,
  type GamePlayer,
  type GameRules,
  type GameState,
  type LegalMove,
  type MoveKind,
} from './contracts';
import { boardCell, trackLength, nextGate, trackStepTarget } from './board';
import type { PieceSkin } from './piece-skins';
export { boardCell } from './board';

function fail(code = 'GAME_ACTION_INVALID'): never {
  throw new AppError(code, 409);
}
export function createInitialGameState(
  id: string,
  room: string,
  actor: string,
  name: string,
  playerName: string,
  rules: GameRules = defaultRules,
  skin?: PieceSkin,
): GameState {
  return stateSchema.parse({
    schema: isCaNgua(rules) ? 2 : 1,
    id,
    room,
    host: actor,
    name,
    version: 0,
    round: 1,
    status: 'WAITING',
    rules,
    players: [newPlayer(actor, playerName, 0, skin)],
    turn: null,
    phase: 'ROLL',
    dice: null,
    sixes: 0,
    deadline: null,
    remaining: null,
    last: { type: 'created', actor },
  });
}
function newPlayer(id: string, name: string, color: number, skin?: PieceSkin): GamePlayer {
  return {
    id,
    name,
    color,
    ready: false,
    pieces: [-1, -1, -1, -1],
    status: 'ACTIVE',
    rank: null,
    misses: 0,
    ...(skin ? { skin } : {}),
  };
}
export function isSafe(cell: number, rules: GameRules) {
  if (isCaNgua(rules)) return rules.safe === 'STARTS' && cell >= 0 && cell < 56 && cell % 14 === 0;
  return rules.safe !== 'NONE' && (cell % 13 === 0 || (rules.safe === 'STARS' && cell % 13 === 8));
}
export function getLegalMoves(state: GameState, actor = state.turn): LegalMove[] {
  const p = state.players.find((p) => p.id === actor);
  if (
    state.status !== 'PLAYING' ||
    state.phase !== 'MOVE' ||
    state.turn !== actor ||
    !state.dice ||
    !p ||
    p.status !== 'ACTIVE'
  )
    return [];
  const dice = state.dice;
  if (state.schema === 2) return caNguaMoves(state, p, dice);
  return p.pieces.flatMap((from, piece) => {
    if (from === 57) return [];
    const to =
      from === -1
        ? dice === 6 || (state.rules.entry === 'ONE_OR_SIX' && dice === 1)
          ? 0
          : -1
        : from + dice;
    return to >= 0 && to <= 57 ? [{ piece, from, to }] : [];
  });
}
/** Occupancy uses the common route, not each opponent's relative progress. */
function caNguaMoves(state: GameState, player: GamePlayer, dice: number): LegalMove[] {
  const occupants = new Map<number, string>();
  for (const p of state.players) {
    if (p.status === 'FORFEITED') continue;
    for (const n of p.pieces) if (n >= 0 && n < 56) occupants.set(boardCell(p.color, n, 2), p.id);
  }
  const occupied = (n: number) => occupants.get(boardCell(player.color, n, 2));
  const safe = (n: number) => isSafe(boardCell(player.color, n, 2), state.rules);
  const clear = (from: number, to: number) => {
    // A horse sheltered on a start does not block passage. Ordinary occupied cells still do.
    for (let n = from + 1; n <= to; n++) if (occupied(n) && !safe(n)) return false;
    return true;
  };
  return player.pieces.flatMap((from, piece): LegalMove[] => {
    const step = (to: number): LegalMove[] => [{ piece, from, to, moveKind: 'STEP' }];
    if (from === -1)
      return (dice === 6 || (state.rules.entry === 'ONE_OR_SIX' && dice === 1)) && !occupied(0)
        ? step(0)
        : [];
    if (from >= 55) {
      const to = from === 55 ? 55 + dice : from + 1;
      if (from === 61 || (from > 55 && dice !== to - 55)) return [];
      for (let n = from + 1; n <= to; n++) if (player.pieces.includes(n)) return [];
      return step(to);
    }
    const moves: LegalMove[] = [];
    const to = trackStepTarget(from, dice, state.rules);
    const gate = nextGate(from);
    const canJump =
      dice === 1 &&
      isCaNgua(state.rules) &&
      state.rules.jumpOnOne &&
      clear(from, gate - 1) &&
      !occupied(gate);
    // The player chooses a horse, never a weaker movement when a jump is available.
    if (canJump && usesAutomaticMovement(state.rules))
      return [{ piece, from, to: gate, moveKind: 'JUMP' }];
    // Safe starts belong to their color: other horses may pass, never land there.
    if (
      to <= 55 &&
      !safe(to) &&
      clear(from, to - 1) &&
      (!occupied(to) || (!safe(to) && occupied(to) !== player.id))
    )
      moves.push(...step(to));
    if (canJump && gate !== to) moves.push({ piece, from, to: gate, moveKind: 'JUMP' });
    return moves;
  });
}
export function validateMove(state: GameState, actor: string, piece: number, moveKind?: MoveKind) {
  return (
    getLegalMoves(state, actor).find(
      (m) =>
        m.piece === piece &&
        ((moveKind === undefined && usesAutomaticMovement(state.rules)) ||
          (m.moveKind ?? 'STEP') === (moveKind ?? 'STEP')),
    ) ?? fail('GAME_ILLEGAL_MOVE')
  );
}
export function getNextPlayer(state: GameState, current = state.turn) {
  const start = state.players.findIndex((p) => p.id === current);
  for (let i = 1; i <= state.players.length; i++) {
    const p = state.players[(start + i) % state.players.length];
    if (p.status === 'ACTIVE') return p;
  }
  return null;
}
export function checkWinCondition(player: GamePlayer, schema: GameState['schema'] = 1) {
  return schema === 2
    ? [58, 59, 60, 61].every((n) => player.pieces.includes(n))
    : player.pieces.every((n) => n === 57);
}
export function calculateRanking(state: GameState) {
  return [...state.players].sort((a, b) => (a.rank ?? 5) - (b.rank ?? 5) || a.color - b.color);
}
function finalize(state: GameState) {
  const active = state.players.filter((p) => p.status === 'ACTIVE');
  if (active.length > 1) return false;
  if (active[0]) {
    active[0].status = 'FINISHED';
    active[0].rank = state.players.filter((p) => p.status === 'FINISHED').length;
  }
  state.status = 'FINISHED';
  state.phase = 'DONE';
  state.turn = null;
  state.deadline = null;
  state.remaining = null;
  state.dice = null;
  return true;
}
function nextTurn(state: GameState, now: number, extra = false) {
  if (finalize(state)) return;
  const current = state.players.find((p) => p.id === state.turn);
  if (!extra || current?.status !== 'ACTIVE') {
    state.turn = getNextPlayer(state)?.id ?? null;
    state.sixes = 0;
  }
  state.phase = 'ROLL';
  state.dice = null;
  state.deadline = now + state.rules.turnSeconds * 1000;
}
export function resolveCapture(state: GameState, player: GamePlayer, position: number) {
  const captured: string[] = [];
  const length = trackLength(state.schema);
  const cell = boardCell(player.color, position, state.schema);
  if (position >= length || isSafe(cell, state.rules)) return captured;
  for (const opponent of state.players) {
    if (opponent.id === player.id || opponent.status !== 'ACTIVE') continue;
    opponent.pieces.forEach((n, i) => {
      if (n >= 0 && n < length && boardCell(opponent.color, n, state.schema) === cell) {
        opponent.pieces[i] = -1;
        captured.push(opponent.id + ':' + i);
      }
    });
  }
  return captured;
}
export function evaluateDiceRoll(state: GameState, actor: string, dice: number, now: number) {
  if (state.status !== 'PLAYING' || state.turn !== actor || state.phase !== 'ROLL')
    fail('GAME_NOT_YOUR_TURN');
  if (!Number.isInteger(dice) || dice < 1 || dice > 6) fail('INVALID_INPUT');
  state.players.find((p) => p.id === actor)!.misses = 0;
  state.dice = dice;
  state.sixes = dice === 6 ? Math.min(3, state.sixes + 1) : 0;
  state.phase = 'MOVE';
  state.last = { type: 'dice_rolled', actor, dice };
  if (state.rules.threeSixes && state.sixes === 3) {
    state.last.type = 'three_sixes';
    nextTurn(state, now);
    return;
  }
  // No extra turn after three sixes is checked before legal moves.
  if (!getLegalMoves(state).length) {
    state.last.type = 'no_moves';
    nextTurn(state, now, dice === 6);
  }
}
export function applyMove(
  state: GameState,
  actor: string,
  piece: number,
  now: number,
  moveKind?: MoveKind,
) {
  const move = validateMove(state, actor, piece, moveKind);
  const p = state.players.find((p) => p.id === actor)!;
  const dice = state.dice!;
  p.pieces[piece] = move.to;
  p.misses = 0;
  const captures = resolveCapture(state, p, move.to);
  state.last = { type: 'piece_moved', actor, ...move, dice, captures };
  if (checkWinCondition(p, state.schema)) {
    p.status = 'FINISHED';
    p.rank = state.players.filter((p) => p.status === 'FINISHED').length;
  }
  nextTurn(
    state,
    now,
    dice === 6 ||
      (state.rules.captureBonus && captures.length > 0) ||
      (state.rules.finishBonus && move.to === 57),
  );
}
function forfeit(state: GameState, actor: string, now: number) {
  const p = state.players.find((p) => p.id === actor);
  if (!p || p.status !== 'ACTIVE') return;
  p.status = 'FORFEITED';
  p.pieces = [-1, -1, -1, -1];
  p.rank = state.players.length - state.players.filter((p) => p.status === 'FORFEITED').length + 1;
  if (finalize(state)) return;
  if (state.turn === actor) {
    const paused = state.status === 'PAUSED';
    nextTurn(state, now);
    if (paused) {
      state.deadline = null;
      state.remaining = state.rules.turnSeconds * 1000;
    }
  }
}
function waitingStatus(state: GameState) {
  state.status =
    state.players.length >= 2 && state.players.every((p) => p.ready) ? 'READY' : 'WAITING';
}
/** Reconcile persisted deadlines and revoked membership; no randomness and no wall-clock reads. */
export function reconcileGame(input: GameState, members: string[], now: number): GameState {
  const state = structuredClone(input);
  if (['FINISHED', 'CANCELLED'].includes(state.status)) return state;
  const missing = state.players.filter((p) => !members.includes(p.id));
  const lobby = ['WAITING', 'READY'].includes(state.status);
  for (const player of missing) {
    if (lobby) state.players = state.players.filter((p) => p.id !== player.id);
    else if (['PLAYING', 'PAUSED'].includes(state.status)) forfeit(state, player.id, now);
  }
  if (
    !members.includes(state.host) ||
    !state.players.some((p) => p.id === state.host && p.status !== 'FORFEITED')
  )
    state.host =
      state.players.find((p) => members.includes(p.id) && p.status !== 'FORFEITED')?.id ??
      state.host;
  if (!state.players.length) {
    state.status = 'CANCELLED';
    state.turn = null;
    state.deadline = null;
  } else if (['WAITING', 'READY'].includes(state.status)) waitingStatus(state);
  // At most 4*5 missed turns before the game ends; all arithmetic uses persisted deadlines.
  for (
    let i = 0;
    i < 24 && state.status === 'PLAYING' && state.deadline !== null && state.deadline <= now;
    i++
  ) {
    const expiredAt = state.deadline;
    const p = state.players.find((p) => p.id === state.turn)!;
    p.misses++;
    state.last = { type: 'timeout', actor: p.id };
    if (p.misses >= state.rules.maxMisses) forfeit(state, p.id, expiredAt);
    else nextTurn(state, expiredAt);
  }
  if (JSON.stringify(state) !== JSON.stringify(input)) state.version++;
  return stateSchema.parse(state);
}
/** All caller identity, dice and time values are supplied by the trusted service. */
export function transition(
  input: GameState,
  actor: string,
  name: string,
  manager: boolean,
  action: EngineAction,
  now: number,
  dice?: number,
  firstPlayer = 0,
): GameState {
  if (action.version !== input.version) fail('GAME_STALE');
  const s = structuredClone(input);
  const waiting = ['WAITING', 'READY'].includes(s.status);
  const player = s.players.find((p) => p.id === actor);
  const host = s.host === actor || manager;
  const requireHost = () => {
    if (!host) fail('PERMISSION_DENIED');
  };
  switch (action.action) {
    case 'join':
      if (
        !waiting ||
        player ||
        s.players.length >= 4 ||
        s.players.some((p) => p.color === action.color)
      )
        fail('GAME_SEAT_TAKEN');
      s.players.push(newPlayer(actor, name, action.color, action.skin));
      s.players.sort((a, b) => a.color - b.color);
      waitingStatus(s);
      break;
    case 'color':
      if (!waiting || !player || s.players.some((p) => p.id !== actor && p.color === action.color))
        fail('GAME_SEAT_TAKEN');
      player.color = action.color;
      player.ready = false;
      s.players.sort((a, b) => a.color - b.color);
      waitingStatus(s);
      break;
    case 'skin':
      if (
        !player ||
        player.status !== 'ACTIVE' ||
        (!waiting && !['PLAYING', 'PAUSED'].includes(s.status))
      )
        fail('GAME_ACTION_INVALID');
      player.skin = action.skin;
      break;
    case 'ready':
      if (!waiting || !player) fail();
      player.ready = action.ready;
      waitingStatus(s);
      break;
    case 'settings':
      requireHost();
      if (!waiting) fail();
      if (isCaNgua(action.rules) !== (s.schema === 2)) fail('INVALID_INPUT');
      s.rules = action.rules;
      s.players.forEach((p) => (p.ready = false));
      waitingStatus(s);
      break;
    case 'start':
      requireHost();
      if (s.status !== 'READY') fail('GAME_NOT_READY');
      s.status = 'PLAYING';
      if (!Number.isInteger(firstPlayer) || firstPlayer < 0 || firstPlayer >= s.players.length)
        fail('INVALID_INPUT');
      s.turn = s.players[s.schema === 2 ? firstPlayer : 0].id;
      s.phase = 'ROLL';
      s.deadline = now + s.rules.turnSeconds * 1000;
      break;
    case 'roll':
      if (dice === undefined) fail('INVALID_INPUT');
      evaluateDiceRoll(s, actor, dice, now);
      break;
    case 'move':
      applyMove(s, actor, action.piece, now, action.moveKind);
      break;
    case 'leave':
      if (!waiting || !player) fail();
      s.players = s.players.filter((p) => p.id !== actor);
      if (!s.players.length) s.status = 'CANCELLED';
      else {
        if (s.host === actor) s.host = s.players[0].id;
        waitingStatus(s);
      }
      break;
    case 'surrender':
      if (!['PLAYING', 'PAUSED'].includes(s.status) || !player || player.status !== 'ACTIVE')
        fail();
      forfeit(s, actor, now);
      if (s.host === actor) s.host = s.players.find((p) => p.status !== 'FORFEITED')?.id ?? s.host;
      break;
    case 'pause':
      requireHost();
      if (s.status !== 'PLAYING') fail();
      s.remaining = Math.max(0, s.deadline! - now);
      s.deadline = null;
      s.status = 'PAUSED';
      break;
    case 'kick': {
      requireHost();
      const target = s.players.find((p) => p.id === action.user_id);
      if (action.user_id === actor) fail('PERMISSION_DENIED');
      if (
        !target ||
        (!waiting && !['PLAYING', 'PAUSED'].includes(s.status)) ||
        target.status !== 'ACTIVE'
      )
        fail();
      if (waiting) {
        s.players = s.players.filter((p) => p.id !== action.user_id);
        waitingStatus(s);
      } else forfeit(s, action.user_id, now);
      if (s.host === action.user_id)
        s.host = s.players.find((p) => p.status !== 'FORFEITED')?.id ?? actor;
      break;
    }
    case 'resume':
      requireHost();
      if (s.status !== 'PAUSED') fail();
      s.deadline = now + (s.remaining ?? s.rules.turnSeconds * 1000);
      s.remaining = null;
      s.status = 'PLAYING';
      break;
    case 'cancel':
      requireHost();
      if (!waiting) fail();
      s.status = 'CANCELLED';
      break;
    case 'rematch':
      requireHost();
      if (!['FINISHED', 'CANCELLED'].includes(s.status)) fail();
      s.players = s.players.map((p) => newPlayer(p.id, p.name, p.color, p.skin));
      s.round++;
      s.status = 'WAITING';
      s.turn = null;
      s.phase = 'ROLL';
      s.dice = null;
      s.sixes = 0;
      s.deadline = null;
      s.remaining = null;
      break;
  }
  if (!['roll', 'move'].includes(action.action))
    s.last = { type: action.action === 'start' ? 'started' : action.action, actor };
  if (s.status === 'FINISHED') s.last.type = 'finished';
  s.version++;
  return stateSchema.parse(s);
}
