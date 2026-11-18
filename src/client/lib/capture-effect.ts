export const captureEffectIds = [
  'capture-burst',
  'dragon-strike',
  'rider-kick',
  'kamehameha',
] as const;
export type CaptureEffectId = (typeof captureEffectIds)[number];
const key = (actor: string) => 'roomtune:ludo:effect:' + actor;
export function readCaptureEffect(actor: string): CaptureEffectId {
  try {
    const saved = localStorage.getItem(key(actor));
    return captureEffectIds.find((id) => id === saved) ?? 'capture-burst';
  } catch {
    return 'capture-burst';
  }
}
export function rememberCaptureEffect(actor: string, effect: CaptureEffectId) {
  try {
    localStorage.setItem(key(actor), effect);
    return true;
  } catch {
    return false;
  }
}
