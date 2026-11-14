import type { ChatCommand, ChatSnapshot } from '../../shared/contracts';
import type { RoomStore } from '../ports';

export class ChatService {
  constructor(
    private store: RoomStore,
    private actor: string,
  ) {}
  read(room: string, since: number) {
    return this.store.call<ChatSnapshot>('room_chat', {
      p_actor: this.actor,
      p_room: room,
      p_since: since,
    });
  }
  execute(room: string, key: string, command: ChatCommand) {
    // This RPC checks membership/ban inside the transaction, before receipt replay.
    // A separate HTTP membership read repeats that check without strengthening it.
    return this.store.call<{ id: string; sequence: number }>('room_chat_command', {
      p_actor: this.actor,
      p_room: room,
      p_request: key,
      p_command: command,
    });
  }
}
