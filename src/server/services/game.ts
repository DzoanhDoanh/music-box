import { AppError } from '../../shared/domain';
import { createInitialGameState, reconcileGame, transition } from '../../shared/game/engine';
import {
  stateSchema,
  type GameCommand,
  type GameContext,
  type GameRules,
  type GameSnapshot,
  type GameState,
} from '../../shared/game/contracts';
import type { RoomStore } from '../ports';

/** Rejection sampling avoids modulo bias. This module is never imported by the client. */
export function secureDice(): number {
  const buffer = new Uint8Array(1);
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= 252);
  return (buffer[0] % 6) + 1;
}
export class GameService {
  constructor(
    private store: RoomStore,
    private actor: string,
  ) {}
  list(room: string, page: number) {
    return this.store.call<GameState[]>('game_list', {
      p_actor: this.actor,
      p_room: room,
      p_page: page,
    });
  }
  create(room: string, key: string, command: { name: string; rules: GameRules }) {
    const state = createInitialGameState(
      crypto.randomUUID(),
      room,
      this.actor,
      command.name,
      'Người chơi',
      command.rules,
    );
    return this.store.call<GameSnapshot>('game_create', {
      p_actor: this.actor,
      p_room: room,
      p_request: key,
      p_command: { action: 'create', ...command },
      p_state: state,
    });
  }
  private context(room: string, game: string, key?: string, command?: GameCommand) {
    return this.store.call<GameContext>('game_context', {
      p_actor: this.actor,
      p_room: room,
      p_game: game,
      p_request: key ?? null,
      p_command: command ?? null,
    });
  }
  private commit(
    room: string,
    game: string,
    key: string,
    command: unknown,
    previous: number,
    state: GameState,
  ) {
    return this.store.call<GameSnapshot>('game_commit', {
      p_actor: this.actor,
      p_room: room,
      p_game: game,
      p_request: key,
      p_command: command,
      p_version: previous,
      p_state: stateSchema.parse(state),
    });
  }
  async read(room: string, game: string): Promise<GameSnapshot> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const context = await this.context(room, game);
      const state = stateSchema.parse(context.snapshot.state);
      const next = reconcileGame(
        state,
        context.members.map((p) => p.id),
        context.snapshot.serverNow,
      );
      if (state.version === next.version) return context.snapshot;
      try {
        return await this.commit(
          room,
          game,
          crypto.randomUUID(),
          { action: 'sync', version: state.version },
          state.version,
          next,
        );
      } catch (error) {
        if (!(error instanceof AppError) || error.code !== 'GAME_STALE' || attempt === 2)
          throw error;
      }
    }
    throw new AppError('GAME_STALE', 409);
  }
  async execute(
    room: string,
    game: string,
    key: string,
    command: GameCommand,
  ): Promise<GameSnapshot> {
    if (!('version' in command)) {
      return this.store.call<GameSnapshot>('game_watch', {
        p_actor: this.actor,
        p_room: room,
        p_game: game,
        p_watching: command.action === 'watch',
      });
    }
    const context = await this.context(room, game, key, command);
    if (context.receipt) return context.receipt;
    let state = stateSchema.parse(context.snapshot.state);
    const now = context.snapshot.serverNow;
    const reconciled = reconcileGame(
      state,
      context.members.map((p) => p.id),
      now,
    );
    if (reconciled.version !== state.version) {
      await this.commit(
        room,
        game,
        crypto.randomUUID(),
        { action: 'sync', version: state.version },
        state.version,
        reconciled,
      );
      throw new AppError('GAME_STALE', 409);
    }
    const actor = context.members.find((p) => p.id === this.actor);
    if (!actor) throw new AppError('PERMISSION_DENIED', 403);
    const manager = actor.role !== 'member';
    if (command.action === 'rematch') {
      // Removed players cannot silently rejoin through a new round.
      if (!manager && state.host !== this.actor) throw new AppError('PERMISSION_DENIED', 403);
      state = {
        ...state,
        players: state.players.filter((p) => context.members.some((m) => m.id === p.id)),
      };
      if (!state.players.some((p) => p.id === state.host)) state.host = this.actor;
    }
    if (
      command.action === 'roll' &&
      (command.version !== state.version ||
        state.status !== 'PLAYING' ||
        state.turn !== this.actor ||
        state.phase !== 'ROLL')
    )
      throw new AppError(
        command.version !== state.version ? 'GAME_STALE' : 'GAME_NOT_YOUR_TURN',
        409,
      );
    const next = transition(
      state,
      this.actor,
      actor.name,
      manager,
      command,
      now,
      command.action === 'roll' ? secureDice() : undefined,
    );
    return this.commit(room, game, key, command, state.version, next);
  }
}
export async function settleDueGames(store: RoomStore) {
  const due = await store.call<{ id: string; room: string; actor: string }[]>('game_due', {});
  for (const item of due) {
    try {
      await new GameService(store, item.actor).read(item.room, item.id);
    } catch (error) {
      console.error(
        'Game timeout settlement',
        error instanceof AppError ? error.code : 'BACKEND_UNAVAILABLE',
      );
    }
  }
}
