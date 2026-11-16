import type { WebSocketRoute } from '@playwright/test';

// Phoenix wire messages exercise the real Supabase SDK, with no production test hooks.
export function presenceFixture(room: string, initial: Record<string, number>) {
  let members = initial;
  let paused = false;
  const sockets: { socket: WebSocketRoute; topic: string; array: boolean }[] = [];
  const topic = `realtime:room:${room}`;
  function send(
    channel: (typeof sockets)[number],
    event: string,
    payload: unknown,
    ref: string | null = null,
  ) {
    channel.socket.send(
      JSON.stringify(
        channel.array
          ? [null, ref, channel.topic, event, payload]
          : { topic: channel.topic, event, payload, ref },
      ),
    );
  }
  function sync(channel: (typeof sockets)[number]) {
    if (channel.topic !== topic) return;
    send(
      channel,
      'presence_state',
      Object.fromEntries(
        Object.entries(members).map(([actor, tabs]) => [
          actor,
          { metas: Array.from({ length: tabs }, (_, i) => ({ phx_ref: `${actor}-${i}` })) },
        ]),
      ),
    );
  }
  return {
    handle(socket: WebSocketRoute) {
      if (paused) {
        socket.close();
        return;
      }
      const channel = { socket, topic: '', array: false };
      sockets.push(channel);
      socket.onMessage((data) => {
        const raw = JSON.parse(String(data));
        channel.array = Array.isArray(raw);
        const message = channel.array
          ? { topic: raw[2], event: raw[3], payload: raw[4], ref: raw[1] }
          : raw;
        channel.topic = message.topic;
        send(channel, 'phx_reply', { status: 'ok', response: {} }, message.ref);
        if (message.event === 'phx_join' || message.event === 'presence') sync(channel);
      });
      socket.onClose(() => {
        const i = sockets.indexOf(channel);
        if (i >= 0) sockets.splice(i, 1);
      });
    },
    update(next: Record<string, number>) {
      members = next;
      sockets.forEach(sync);
    },
    broadcast(version: number) {
      sockets
        .filter((channel) => channel.topic === topic)
        .forEach((channel) =>
          send(channel, 'broadcast', { event: 'room.updated', payload: { version } }),
        );
    },
    disconnect() {
      paused = true;
      for (const channel of [...sockets]) channel.socket.close();
      sockets.length = 0;
    },
    resume() {
      paused = false;
    },
  };
}
