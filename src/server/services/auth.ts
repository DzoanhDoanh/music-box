import { AppError } from '../../shared/domain';
import type { IdentityPort, RoomStore } from '../ports';

export class AuthService {
  constructor(
    private identity: IdentityPort,
    private store: RoomStore,
  ) {}
  async authenticate(token: string, write: boolean): Promise<string> {
    const actor = await this.identity.verify(token);
    // Independent buckets can commit concurrently after authoritative verification.
    // Await both so denied requests never reach a business mutation.
    const limits = await Promise.allSettled([
      this.store.consume(`user:${actor}`, 180),
      ...(write ? [this.store.consume(`write:${actor}`, 90)] : []),
    ]);
    for (const result of limits) if (result.status === 'rejected') throw result.reason;
    return actor;
  }
  async deleteAccount(actor: string) {
    await this.store.consume(`delete:${actor}`, 2, 3600);
    if (await this.store.ownsRoom(actor)) throw new AppError('OWNER_ACCOUNT', 409);
    await this.identity.deleteIdentity(actor);
    return { deleted: true };
  }
}
