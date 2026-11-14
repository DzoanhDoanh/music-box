import type { RoomCommand } from '../../shared/contracts';
import type { RoomStore } from '../ports';
import type { YouTubePort } from '../youtube';

type VoteCommand = Extract<
  RoomCommand,
  { action: 'vote' | 'reorder.propose' | 'reorder.vote' | 'reorder.cancel' }
>;
type MemberCommand = Extract<
  RoomCommand,
  { action: 'kick' | 'ban' | 'unban' | 'moderator' | 'demote' }
>;
type SettingsCommand = Extract<RoomCommand, { action: 'settings' | 'clear' | 'rotate_code' }>;
type PlaybackCommand = Extract<RoomCommand, { controller_id: string }>;
type QueueCommand = Exclude<
  RoomCommand,
  VoteCommand | MemberCommand | SettingsCommand | PlaybackCommand
>;

class RoomMutation {
  constructor(
    protected store: RoomStore,
    protected actor: string,
  ) {}
  protected commit(room: string, key: string, command: RoomCommand) {
    return this.store.command(this.actor, room, key, command);
  }
}
export class VotingService extends RoomMutation {
  async execute(room: string, key: string, command: VoteCommand) {
    if (command.action === 'reorder.propose')
      await this.store.consume(`reorder:${room}:${this.actor}`, 6);
    return this.commit(room, key, command);
  }
}
export class PlaybackService extends RoomMutation {
  // The SQL transaction verifies lease/fencing/run before changing playback.
  execute(room: string, key: string, command: PlaybackCommand) {
    return this.commit(room, key, command);
  }
}
export class SettingsService extends RoomMutation {
  execute(room: string, key: string, command: SettingsCommand) {
    return this.commit(room, key, command);
  }
}
export class MemberService extends RoomMutation {
  execute(room: string, key: string, command: MemberCommand) {
    return this.commit(room, key, command);
  }
  async administration(room: string, page: number) {
    await this.store.requireMember(this.actor, room, true);
    return this.store.administration(room, page);
  }
}
export class QueueService extends RoomMutation {
  constructor(
    store: RoomStore,
    actor: string,
    private youtube: YouTubePort,
  ) {
    super(store, actor);
  }
  async execute(room: string, key: string, command: QueueCommand) {
    if (command.action === 'enqueue') {
      await this.store.requireMember(this.actor, room);
      await this.store.consume(`enqueue:${this.actor}`, 12);
      const song = await this.youtube.video(command.video_id);
      await this.store.saveSong(song);
    }
    return this.commit(room, key, command);
  }
}
/** Typed dispatch retains a single atomic room mutation in the store. */
export class RoomCommandService {
  readonly queue: QueueService;
  readonly voting: VotingService;
  readonly playback: PlaybackService;
  readonly settings: SettingsService;
  readonly members: MemberService;
  constructor(store: RoomStore, actor: string, youtube: YouTubePort) {
    this.queue = new QueueService(store, actor, youtube);
    this.voting = new VotingService(store, actor);
    this.playback = new PlaybackService(store, actor);
    this.settings = new SettingsService(store, actor);
    this.members = new MemberService(store, actor);
  }
  execute(room: string, key: string, command: RoomCommand) {
    switch (command.action) {
      case 'vote':
      case 'reorder.propose':
      case 'reorder.vote':
      case 'reorder.cancel':
        return this.voting.execute(room, key, command);
      case 'claim':
      case 'heartbeat':
      case 'release':
      case 'next':
      case 'ended':
      case 'failed':
      case 'play':
      case 'pause':
      case 'report':
      case 'seek':
        return this.playback.execute(room, key, command);
      case 'settings':
      case 'clear':
      case 'rotate_code':
        return this.settings.execute(room, key, command);
      case 'kick':
      case 'ban':
      case 'unban':
      case 'moderator':
      case 'demote':
        return this.members.execute(room, key, command);
      default:
        return this.queue.execute(room, key, command);
    }
  }
}
