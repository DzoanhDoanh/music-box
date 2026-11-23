import { AppError } from '../../shared/domain';
import {
  createRaceSchema,
  raceConfigSchema,
  type DuckCommand,
  type DuckSnapshot,
  type Race,
  type RaceEntry,
  type RacePlan,
} from '../../shared/duck-race/contracts';
import { commitment, hex, lockedHash, canonical } from '../../shared/duck-race/fairness';
import { buildPlan, nextEntries, publishedFrames, raceStatus } from '../../shared/duck-race/engine';
import type { RoomStore } from '../ports';
type Context = {
  race: Race;
  seed: string;
  plan: RacePlan | null;
  serverNow: number;
  receipt: boolean;
  members: { id: string; name: string; role: string }[];
  songs: { id: string; name: string; requester: string }[];
};
const fail = (code: string): never => {
  throw new AppError(
    code,
    code === 'PERMISSION_DENIED'
      ? 403
      : code === 'NOT_FOUND'
        ? 404
        : code === 'INVALID_INPUT'
          ? 400
          : 409,
  );
};
const immutable = (race: Race) => {
  if (race.status !== 'LOBBY') fail('DUCK_LOCKED');
};
export class DuckRaceService {
  constructor(
    private store: RoomStore,
    private actor: string,
  ) {}
  async list(room: string, series: string | null = null, internal = false): Promise<DuckSnapshot> {
    if (!internal) await this.store.consume('duck.read:' + this.actor, 150, 60);
    return this.store.call('duck_race_list', {
      p_actor: this.actor,
      p_room: room,
      p_series: series,
    });
  }
  private context(
    room: string,
    race: string,
    key: string | null = null,
    command: unknown = null,
  ): Promise<Context> {
    return this.store.call('duck_race_context', {
      p_actor: this.actor,
      p_room: room,
      p_race: race,
      p_request: key,
      p_command: command,
    });
  }
  private async view(room: string, context: Context): Promise<DuckSnapshot> {
    const race = structuredClone(context.race);
    race.status = raceStatus(race.startAt, race.config.duration, context.serverNow, race.status);
    if (context.plan && race.startAt !== null) {
      race.frames = publishedFrames(context.plan, race.startAt, context.serverNow);
      if (race.status === 'FINISHED') {
        race.seed = context.seed;
        race.results = context.plan.results;
      }
    }
    const meta = await this.list(room, race.seriesId, true);
    return { ...meta, serverNow: context.serverNow, race };
  }
  private commit(
    room: string,
    race: Race,
    oldVersion: number,
    key: string,
    command: unknown,
    plan: RacePlan | null,
  ): Promise<Context> {
    return this.store.call('duck_race_commit', {
      p_actor: this.actor,
      p_room: room,
      p_race: race.id,
      p_request: key,
      p_command: command,
      p_version: oldVersion,
      p_state: race,
      p_plan: plan,
    });
  }
  async read(room: string, race: string): Promise<DuckSnapshot> {
    await this.store.consume('duck.read:' + this.actor, 150, 60);
    for (let attempt = 0; attempt < 3; attempt++) {
      const context = await this.context(room, race);
      if (
        context.race.startAt !== null &&
        context.plan &&
        context.race.status !== 'FINISHED' &&
        context.serverNow >= context.race.startAt + context.race.config.duration * 1000
      ) {
        const next = {
          ...context.race,
          status: 'FINISHED' as const,
          version: context.race.version + 1,
          seed: context.seed,
          results: context.plan.results,
          frames: context.plan.frames,
        };
        try {
          return this.view(
            room,
            await this.commit(
              room,
              next,
              context.race.version,
              crypto.randomUUID(),
              { action: 'finalize' },
              null,
            ),
          );
        } catch (e) {
          if (!(e instanceof AppError) || e.code !== 'DUCK_STALE' || attempt === 2) throw e;
        }
      } else return this.view(room, context);
    }
    return fail('DUCK_STALE');
  }
  private entries(
    command: Extract<DuckCommand, { action: 'create' | 'entries' }>,
    ctx: { songs: Context['songs'] },
    mode: Race['config']['mode'],
  ): RaceEntry[] {
    if (mode === 'SONG') {
      if (new Set(command.songs).size !== command.songs.length) fail('INVALID_INPUT');
      return command.songs.map((id) => {
        const song = ctx.songs.find((s) => s.id === id);
        if (!song) return fail('DUCK_SONG_UNAVAILABLE');
        return {
          id: crypto.randomUUID(),
          userId: null,
          songId: id,
          requestedBy: song.requester,
          name: song.name.slice(0, 80),
          skin: 'YELLOW',
          team: '',
          ready: true,
        };
      });
    }
    return command.entries.map((e) => ({
      ...e,
      id: crypto.randomUUID(),
      userId: null,
      songId: null,
      ready: true,
    }));
  }
  async execute(
    room: string,
    raceId: string | null,
    key: string,
    command: DuckCommand,
  ): Promise<DuckSnapshot> {
    await this.store.consume('duck.command:' + this.actor, 90, 60);
    if (command.action === 'settings') {
      await this.store.call('duck_race_settings', {
        p_actor: this.actor,
        p_room: room,
        p_request: key,
        p_command: command,
      });
      return raceId ? this.read(room, raceId) : this.list(room);
    }
    if (command.action === 'save_preset' || command.action === 'delete_preset') {
      await this.store.call('duck_race_preset', {
        p_actor: this.actor,
        p_room: room,
        p_command: command,
        p_request: key,
      });
      return raceId ? this.read(room, raceId) : this.list(room);
    }
    if (command.action === 'create') {
      const parsed = createRaceSchema.parse(command);
      const seed = hex(crypto.getRandomValues(new Uint8Array(32))),
        id = crypto.randomUUID();
      const config = raceConfigSchema.parse(parsed.config);
      const ctx = await this.store.call<{ songs: Context['songs'] }>('duck_race_create_context', {
        p_actor: this.actor,
        p_room: room,
      });
      const state: Race = {
        id,
        roomId: room,
        name: parsed.name,
        host: this.actor,
        version: 1,
        status: 'LOBBY',
        config,
        entries: config.mode === 'PLAYER' ? [] : this.entries(parsed, ctx, config.mode),
        banned: [],
        lobbyClosed: false,
        createdAt: 0,
        startAt: null,
        commitment: await commitment(id, seed),
        lockedHash: null,
        algorithm: 1,
        seed: null,
        results: [],
        frames: [],
        round: 1,
        seriesId: id,
        previousId: null,
        songReward: 'NONE',
      };
      const result = await this.store.call<Context>('duck_race_create', {
        p_actor: this.actor,
        p_room: room,
        p_request: key,
        p_command: command,
        p_state: state,
        p_seed: seed,
      });
      return this.view(room, result);
    }
    if (!raceId) return fail('NOT_FOUND');
    for (let attempt = 0; attempt < 3; attempt++) {
      const ctx = await this.context(
        room,
        raceId,
        command.action === 'rematch' ? null : key,
        command.action === 'rematch' ? null : command,
      );
      if (ctx.receipt) return this.read(room, raceId);
      const race = structuredClone(ctx.race),
        oldVersion = race.version;
      const owner = ctx.members.find((m) => m.id === this.actor)?.role === 'owner';
      const manage = owner || race.host === this.actor;
      const entry = race.entries.find((e) => e.userId === this.actor);
      let plan: RacePlan | null = null;
      if (
        [
          'configure',
          'entries',
          'lobby',
          'kick',
          'transfer',
          'start',
          'cancel',
          'rematch',
          'approve_song',
        ].includes(command.action) &&
        !manage
      )
        fail('PERMISSION_DENIED');
      switch (command.action) {
        case 'join': {
          immutable(race);
          if (
            race.config.mode !== 'PLAYER' ||
            race.previousId !== null ||
            race.banned.includes(this.actor) ||
            race.lobbyClosed ||
            race.entries.length >= race.config.capacity
          )
            fail('DUCK_LOBBY_CLOSED');
          if (entry) fail('DUCK_ALREADY_JOINED');
          const me = ctx.members.find((m) => m.id === this.actor)!;
          race.entries.push({
            id: crypto.randomUUID(),
            userId: this.actor,
            songId: null,
            name: me.name.slice(0, 80),
            skin: command.skin,
            team: command.team,
            ready: false,
          });
          break;
        }
        case 'leave':
          immutable(race);
          race.entries = race.entries.filter((e) => e.userId !== this.actor);
          break;
        case 'ready':
          immutable(race);
          if (!entry) fail('PERMISSION_DENIED');
          entry!.ready = command.ready;
          break;
        case 'skin':
          immutable(race);
          if (!entry) fail('PERMISSION_DENIED');
          entry!.skin = command.skin;
          entry!.ready = false;
          break;
        case 'configure':
          immutable(race);
          if (
            race.previousId &&
            (canonical(command.config) !== canonical(race.config) ||
              command.entries ||
              command.songs)
          )
            fail('DUCK_LOCKED');
          if (
            !owner &&
            (canonical(command.config.rewards) !== canonical(race.config.rewards) ||
              (command.config.mode !== 'SONG' &&
                command.config.songPriority !== race.config.songPriority))
          )
            fail('PERMISSION_DENIED');
          if (command.config.mode !== race.config.mode) race.entries = [];
          if (command.config.mode !== 'PLAYER' && (command.entries || command.songs)) {
            race.entries = this.entries(
              { action: 'entries', entries: command.entries ?? [], songs: command.songs ?? [] },
              ctx,
              command.config.mode,
            );
          }
          if (command.config.capacity < race.entries.length) fail('INVALID_INPUT');
          race.name = command.name;
          race.config = command.config;
          race.entries.forEach((e) => {
            if (e.userId) e.ready = false;
          });
          break;
        case 'entries':
          immutable(race);
          if (race.previousId) fail('DUCK_LOCKED');
          if (race.config.mode === 'PLAYER') fail('INVALID_INPUT');
          race.entries = this.entries(command, ctx, race.config.mode);
          if (race.entries.length > race.config.capacity) fail('INVALID_INPUT');
          break;
        case 'lobby':
          immutable(race);
          race.lobbyClosed = command.closed;
          break;
        case 'kick':
          immutable(race);
          if (
            command.user === this.actor ||
            ctx.members.find((m) => m.id === command.user)?.role === 'owner'
          )
            fail('PERMISSION_DENIED');
          race.entries = race.entries.filter((e) => e.userId !== command.user);
          race.banned.push(command.user);
          break;
        case 'transfer':
          if (!ctx.members.some((m) => m.id === command.user) || race.banned.includes(command.user))
            fail('PERMISSION_DENIED');
          race.host = command.user;
          break;
        case 'start':
          immutable(race);
          if (
            race.entries.length < 2 ||
            race.entries.length > race.config.capacity ||
            race.entries.some((e) => !e.ready)
          )
            fail('DUCK_NOT_READY');
          if (race.entries.some((e) => e.userId && !ctx.members.some((m) => m.id === e.userId)))
            fail('DUCK_NOT_READY');
          // Only the room owner may pay coins. A host who received the race by transfer
          // (or a rematch of it) must not inherit the owner's reward budget.
          if (!owner && race.config.rewards.enabled)
            race.config = { ...race.config, rewards: { ...race.config.rewards, enabled: false } };
          race.entries.sort((a, b) => a.id.localeCompare(b.id));
          race.lockedHash = await lockedHash(race);
          plan = await buildPlan(race, ctx.seed);
          race.startAt = ctx.serverNow + 3000;
          race.status = 'COUNTDOWN';
          race.lobbyClosed = true;
          break;
        case 'cancel':
          immutable(race);
          race.status = 'CANCELLED';
          break;
        case 'approve_song':
          if (!owner || race.status !== 'FINISHED' || race.songReward !== 'PENDING')
            fail('PERMISSION_DENIED');
          race.songReward = 'APPROVED';
          break;
        case 'reaction':
          await this.store.consume('duck.react:' + this.actor, 15, 60);
          await this.store.call('duck_race_react', {
            p_actor: this.actor,
            p_room: room,
            p_race: raceId,
            p_emoji: command.emoji,
            p_request: key,
          });
          return this.read(room, raceId);
        case 'rematch': {
          if (race.status !== 'FINISHED') fail('DUCK_LOCKED');
          if (
            command.nextRound &&
            (race.config.tournament.kind === 'SINGLE' ||
              race.round >= race.config.tournament.rounds)
          )
            fail('DUCK_TOURNAMENT_COMPLETE');
          const entries = command.nextRound
            ? nextEntries(race.entries, race.results, race.config)
            : race.entries;
          if (entries.length < 2) fail('DUCK_TOURNAMENT_COMPLETE');
          const id = crypto.randomUUID(),
            seed = hex(crypto.getRandomValues(new Uint8Array(32)));
          const next: Race = {
            ...race,
            id,
            version: 1,
            status: 'LOBBY',
            seed: null,
            commitment: await commitment(id, seed),
            lockedHash: null,
            results: [],
            frames: [],
            startAt: null,
            createdAt: 0,
            lobbyClosed: false,
            songReward: 'NONE',
            // Players removed by the host stay removed in rematches and later rounds.
            banned: race.banned,
            config:
              owner || !race.config.rewards.enabled
                ? race.config
                : { ...race.config, rewards: { ...race.config.rewards, enabled: false } },
            entries: entries.map((e) => ({ ...e, ready: !e.userId })),
            round: command.nextRound ? race.round + 1 : 1,
            seriesId: command.nextRound ? race.seriesId : id,
            previousId: command.nextRound ? race.id : null,
          };
          const result = await this.store.call<Context>('duck_race_create', {
            p_actor: this.actor,
            p_room: room,
            p_request: key,
            p_command: { ...command, source: raceId },
            p_state: next,
            p_seed: seed,
          });
          return this.view(room, result);
        }
      }
      race.version++;
      try {
        return this.view(room, await this.commit(room, race, oldVersion, key, command, plan));
      } catch (e) {
        if (!(e instanceof AppError) || e.code !== 'DUCK_STALE' || attempt === 2) throw e;
      }
    }
    return fail('DUCK_STALE');
  }
}
