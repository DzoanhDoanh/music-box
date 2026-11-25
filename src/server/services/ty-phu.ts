import { AppError } from '../../shared/domain';
import {
  tyPhuStateSchema,
  type TyPhuCommand,
  type TyPhuListItem,
  type TyPhuMember,
  type TyPhuRules,
  type TyPhuSnapshot,
  type TyPhuState,
} from '../../shared/ty-phu/contracts';
import {
  createTyPhuState,
  reconcile,
  transition,
  type TyPhuRandom,
} from '../../shared/ty-phu/engine';
import type { RoomStore } from '../ports';

/** Unbiased integer in [0, n) from the Workers CSPRNG. Never imported by the client. */
export function secureInt(n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > 1_000_000) throw new AppError('INVALID_INPUT', 400);
  const buffer = new Uint32Array(1);
  const limit = 2 ** 32 - (2 ** 32 % n);
  do crypto.getRandomValues(buffer);
  while (buffer[0] >= limit);
  return buffer[0] % n;
}
export const secureRandom: TyPhuRandom = { die: () => secureInt(6) + 1, index: secureInt };

type Context = { state: unknown; serverNow: number; members: TyPhuMember[] };
type ContextResult = Context | { receipt: TyPhuSnapshot };

export class TyPhuService {
  constructor(
    private store: RoomStore,
    private actor: string,
    private random: TyPhuRandom = secureRandom,
  ) {}

  list(room: string) {
    return this.store.call<{ serverNow: number; matches: TyPhuListItem[] }>('ty_phu_list', {
      p_actor: this.actor,
      p_room: room,
    });
  }

  async create(room: string, key: string, command: { name: string; rules: TyPhuRules }) {
    await this.store.consume('ty_phu:create:' + this.actor, 6, 3600);
    // The SQL function replaces this placeholder with the profile name.
    const state = createTyPhuState(
      crypto.randomUUID(),
      room,
      this.actor,
      'Người chơi',
      command.name,
      command.rules,
    );
    return this.store.call<TyPhuSnapshot>('ty_phu_create', {
      p_actor: this.actor,
      p_room: room,
      p_request: key,
      p_command: { action: 'create', ...command },
      p_state: state,
    });
  }

  private context(room: string, game: string, key?: string, command?: unknown) {
    return this.store.call<ContextResult>('ty_phu_context', {
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
    state: TyPhuState,
  ) {
    return this.store.call<TyPhuSnapshot>('ty_phu_commit', {
      p_actor: this.actor,
      p_room: room,
      p_game: game,
      p_request: key,
      p_command: command,
      p_version: previous,
      p_state: tyPhuStateSchema.parse(state),
    });
  }

  /** Retires players who left the room and applies expired deadlines. */
  private settle(state: TyPhuState, context: Context) {
    let next = state;
    const members = new Set(context.members.map((m) => m.id));
    for (const p of state.players)
      if (p.status === 'ACTIVE' && !p.bot && !members.has(p.id) && next.status !== 'FINISHED')
        next = transition(next, p.id, p.name, { action: 'leave' }, context.serverNow, this.random);
    return reconcile(next, context.serverNow, this.random);
  }

  async read(room: string, game: string): Promise<TyPhuSnapshot> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const context = (await this.context(room, game)) as Context;
      const state = tyPhuStateSchema.parse(context.state);
      const next = this.settle(state, context);
      if (next.version === state.version) {
        const { deck, ...visible } = state;
        return { state: { ...visible, deckCount: deck.length }, serverNow: context.serverNow };
      }
      try {
        return await this.commit(
          room,
          game,
          crypto.randomUUID(),
          { action: 'sync', version: state.version },
          state.version,
          { ...next, version: state.version + 1 },
        );
      } catch (error) {
        if (!(error instanceof AppError) || error.code !== 'TYPHU_STALE' || attempt === 2)
          throw error;
      }
    }
    throw new AppError('TYPHU_STALE', 409);
  }

  async execute(
    room: string,
    game: string,
    key: string,
    request: { version: number; command: TyPhuCommand },
  ): Promise<TyPhuSnapshot> {
    const result = await this.context(room, game, key, request);
    if ('receipt' in result) return result.receipt;
    const state = tyPhuStateSchema.parse(result.state);
    const settled = this.settle(state, result);
    if (settled.version !== state.version) {
      // Deadlines or departures changed the board first: store that, then ask to retry.
      await this.commit(
        room,
        game,
        crypto.randomUUID(),
        { action: 'sync', version: state.version },
        state.version,
        { ...settled, version: state.version + 1 },
      );
      throw new AppError('TYPHU_STALE', 409);
    }
    if (request.version !== state.version) throw new AppError('TYPHU_STALE', 409);
    const actor = result.members.find((m) => m.id === this.actor);
    if (!actor) throw new AppError('PERMISSION_DENIED', 403);
    const next = transition(
      state,
      this.actor,
      actor.name,
      request.command,
      result.serverNow,
      this.random,
    );
    return this.commit(room, game, key, request, state.version, next);
  }
}

export async function settleDueTyPhu(store: RoomStore) {
  const due = await store.call<{ id: string; room: string; actor: string }[]>('ty_phu_due', {});
  for (const item of due) {
    try {
      await new TyPhuService(store, item.actor).read(item.room, item.id);
    } catch (error) {
      console.error(
        'Tỷ Phú timeout settlement',
        error instanceof AppError ? error.code : 'BACKEND_UNAVAILABLE',
      );
    }
  }
}
