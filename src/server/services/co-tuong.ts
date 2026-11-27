import { AppError } from '../../shared/domain';
import {
  coTuongStateSchema,
  type CoTuongCommand,
  type CoTuongListItem,
  type CoTuongMember,
  type CoTuongSnapshot,
  type CoTuongState,
  type CreateCoTuong,
} from '../../shared/co-tuong/contracts';
import { createCoTuongState, settleDepartures, transition } from '../../shared/co-tuong/engine';
import type { Random } from '../../shared/co-tuong/rules';
import type { RoomStore } from '../ports';
import { secureInt } from './ty-phu';

type Context = { state: unknown; serverNow: number; members: CoTuongMember[] };
type ContextResult = Context | { receipt: CoTuongSnapshot };
const secureRandom: Random = { index: secureInt };

export class CoTuongService {
  constructor(
    private store: RoomStore,
    private actor: string,
    private random: Random = secureRandom,
  ) {}

  list(room: string) {
    return this.store.call<{ serverNow: number; matches: CoTuongListItem[] }>('co_tuong_list', {
      p_actor: this.actor,
      p_room: room,
    });
  }

  async create(room: string, key: string, command: CreateCoTuong) {
    await this.store.consume('co_tuong:create:' + this.actor, 20, 3600);
    // The SQL function replaces this placeholder with the profile name.
    const state = createCoTuongState(
      crypto.randomUUID(),
      room,
      this.actor,
      'Người chơi',
      command,
      Date.now(),
      this.random,
    );
    return this.store.call<CoTuongSnapshot>('co_tuong_create', {
      p_actor: this.actor,
      p_room: room,
      p_request: key,
      p_command: { action: 'create', ...command },
      p_state: coTuongStateSchema.parse(state),
    });
  }

  /** The host or the room owner deletes a table. Retries return the same receipt. */
  delete(room: string, game: string, key: string, name: string) {
    return this.store.call<{ deleted: true }>('co_tuong_delete', {
      p_actor: this.actor,
      p_room: room,
      p_game: game,
      p_request: key,
      p_name: name,
    });
  }

  private context(room: string, game: string, key?: string, command?: unknown) {
    return this.store.call<ContextResult>('co_tuong_context', {
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
    state: CoTuongState,
  ) {
    return this.store.call<CoTuongSnapshot>('co_tuong_commit', {
      p_actor: this.actor,
      p_room: room,
      p_game: game,
      p_request: key,
      p_command: command,
      p_version: previous,
      p_state: coTuongStateSchema.parse(state),
    });
  }

  /** Stores the departure of seated players who left the room; true when something changed. */
  private async settle(room: string, game: string, state: CoTuongState, context: Context) {
    const next = settleDepartures(state, context.members, context.serverNow);
    if (next.version === state.version) return null;
    return this.commit(
      room,
      game,
      crypto.randomUUID(),
      { action: 'sync', version: state.version },
      state.version,
      { ...next, version: state.version + 1 },
    );
  }

  async read(room: string, game: string): Promise<CoTuongSnapshot> {
    const context = (await this.context(room, game)) as Context;
    const state = coTuongStateSchema.parse(context.state);
    try {
      return (
        (await this.settle(room, game, state, context)) ?? {
          state,
          serverNow: context.serverNow,
        }
      );
    } catch (error) {
      if (error instanceof AppError && error.code === 'COTUONG_STALE')
        return { state, serverNow: context.serverNow };
      throw error;
    }
  }

  async execute(
    room: string,
    game: string,
    key: string,
    request: { version: number; command: CoTuongCommand },
  ): Promise<CoTuongSnapshot> {
    const result = await this.context(room, game, key, request);
    if ('receipt' in result) return result.receipt;
    const state = coTuongStateSchema.parse(result.state);
    if (await this.settle(room, game, state, result)) throw new AppError('COTUONG_STALE', 409);
    if (request.version !== state.version) throw new AppError('COTUONG_STALE', 409);
    const actor = result.members.find((m) => m.id === this.actor);
    if (!actor) throw new AppError('PERMISSION_DENIED', 403);
    const next = transition(
      state,
      this.actor,
      actor.name.slice(0, 40),
      request.command,
      result.serverNow,
      this.random,
    );
    return this.commit(room, game, key, request, state.version, next);
  }
}
