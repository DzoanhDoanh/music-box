import { api } from './api';

/** Authenticated leases, one per mounted room tab. Counts are never supplied by the client. */
export function trackRoomPresence(room: string, onReady: () => void) {
  const session = crypto.randomUUID();
  let sequence = 0;
  let stopped = false;
  let running = false;
  let ready = false;
  let suspended = false;
  let resumePending = false;
  const send = (online: boolean) =>
    api(`/rooms/${room}/presence`, { session_id: session, sequence: ++sequence, online });
  const ping = async () => {
    if (stopped || suspended || running) return;
    running = true;
    try {
      await send(true);
      if (!stopped && !suspended && !ready) {
        ready = true;
        onReady();
      }
    } catch {
      ready = false; /* A failed heartbeat must not grant voting eligibility. */
    } finally {
      running = false;
      if (resumePending) {
        resumePending = false;
        void ping();
      }
    }
  };
  const refresh = () => {
    if (document.visibilityState === 'visible') void ping();
  };
  const leave = () => {
    suspended = true;
    ready = false;
    void send(false).catch(() => {});
  };
  const resume = () => {
    suspended = false;
    if (running) resumePending = true;
    else void ping();
  };
  void ping();
  const timer = setInterval(() => void ping(), 20000);
  window.addEventListener('online', refresh);
  window.addEventListener('pagehide', leave);
  window.addEventListener('pageshow', resume);
  document.addEventListener('visibilitychange', refresh);
  return () => {
    stopped = true;
    clearInterval(timer);
    window.removeEventListener('online', refresh);
    window.removeEventListener('pagehide', leave);
    window.removeEventListener('pageshow', resume);
    document.removeEventListener('visibilitychange', refresh);
    leave();
  };
}
