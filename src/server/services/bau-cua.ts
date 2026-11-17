import type { RoomStore } from '../ports';
import { hex } from '../../shared/bau-cua/fairness';
import type { BauCommand, BauSnapshot, Penalty } from '../../shared/bau-cua/contracts';

export class BauCuaService {
  constructor(
    private store: RoomStore,
    private actor: string,
  ) {}
  private seed() {
    return hex(crypto.getRandomValues(new Uint8Array(32)));
  }
  async read(room: string, table: string | null) {
    return this.store.call<BauSnapshot>('bau_cua_read', {
      p_actor: this.actor,
      p_room: room,
      p_table: table,
      p_seed: this.seed(),
    });
  }
  async notices(room: string) {
    return this.store.call<Penalty[]>('bau_cua_notices', { p_actor: this.actor, p_room: room });
  }
  async execute(room: string, table: string | null, key: string, command: BauCommand) {
    await this.store.consume('bau.command:' + this.actor, 120, 60);
    return this.store.call<BauSnapshot>('bau_cua_command', {
      p_actor: this.actor,
      p_room: room,
      p_table: table,
      p_request: key,
      p_command: command,
      p_seed: this.seed(),
    });
  }
}
