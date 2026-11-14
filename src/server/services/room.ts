import type { z } from 'zod';
import type {
  createRoomSchema,
  joinSchema,
  presenceSchema,
  Snapshot,
  Room,
} from '../../shared/contracts';
import type { RoomStore } from '../ports';

export class RoomService {
  constructor(
    private store: RoomStore,
    private actor: string,
  ) {}
  list() {
    return this.store.listRooms(this.actor);
  }
  create(input: z.infer<typeof createRoomSchema>, key: string) {
    return this.store.call<Room>('create_room', {
      p_actor: this.actor,
      p_name: input.name,
      p_description: input.description,
      p_pin: input.pin,
      p_request: key,
    });
  }
  async join(input: z.infer<typeof joinSchema>, ip: string) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
    const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join(
      '',
    );
    // Consume in separate committed transactions, including failed PIN attempts.
    await this.store.consume(`join-ip:${hash}`, 20, 300);
    await this.store.consume(`join-user:${this.actor}`, 8, 300);
    return this.store.call<Room>('join_room', {
      p_actor: this.actor,
      p_code: input.code,
      p_name: input.name,
      p_pin: input.pin,
    });
  }
  snapshot(room: string) {
    return this.store.call<Snapshot>('room_snapshot', { p_actor: this.actor, p_room: room });
  }
  presence(room: string, input: z.infer<typeof presenceSchema>) {
    return this.store.call<{ online_count: number }>('room_presence', {
      p_actor: this.actor,
      p_room: room,
      p_session: input.session_id,
      p_sequence: input.sequence,
      p_online: input.online,
    });
  }
  async history(room: string, page: number) {
    await this.store.requireMember(this.actor, room);
    return this.store.history(room, page);
  }
}
