import type { z } from 'zod';
import type { librarySchema } from '../../shared/contracts';
import type { ReadModel, RoomStore } from '../ports';

export class PlaylistService {
  constructor(
    private store: RoomStore,
    private actor: string,
  ) {}
  read() {
    return this.store.library(this.actor);
  }
  execute(command: z.infer<typeof librarySchema>, key: string) {
    return this.store.call<ReadModel>('library_command', {
      p_actor: this.actor,
      p_request: key,
      p_command: command,
    });
  }
  async export() {
    await this.store.consume(`export:${this.actor}`, 2, 3600);
    return this.store.exportData(this.actor);
  }
}
