// Bi-a sound effects, synthesised with Web Audio (no files): the cue strike, balls clicking,
// cushions and pockets. Loudness follows how hard things hit.

export type TableSound = 'cue' | 'ball' | 'rail' | 'pocket';

const STORAGE = 'roomtune:billiards:sound';
let context: AudioContext | null = null;

export function tableSoundOn() {
  try {
    return localStorage.getItem(STORAGE) !== 'off';
  } catch {
    return true;
  }
}
export function setTableSoundOn(on: boolean) {
  try {
    localStorage.setItem(STORAGE, on ? 'on' : 'off');
  } catch {
    // Without storage the choice lasts for this page only.
  }
}

function audio() {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  if (context.state === 'suspended') void context.resume().catch(() => {});
  return context;
}

function noise(
  ctx: AudioContext,
  at: number,
  type: BiquadFilterType,
  frequency: number,
  gain: number,
  length: number,
  q = 1.5,
) {
  const frames = Math.ceil(ctx.sampleRate * length);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2.5;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  const level = ctx.createGain();
  level.gain.setValueAtTime(gain, at);
  level.gain.exponentialRampToValueAtTime(0.0005, at + length);
  source.connect(filter).connect(level).connect(ctx.destination);
  source.start(at);
}

function tone(
  ctx: AudioContext,
  at: number,
  from: number,
  to: number,
  gain: number,
  length: number,
) {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + length);
  const level = ctx.createGain();
  level.gain.setValueAtTime(0.0001, at);
  level.gain.exponentialRampToValueAtTime(gain, at + 0.004);
  level.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(level).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

/** `strength` is 0..1, from how fast the balls met. */
export function playTableSound(sound: TableSound, strength = 1) {
  const audible = tableSoundOn() && !document.hidden;
  window.dispatchEvent(new CustomEvent('roomtune:table-sound', { detail: { sound, audible } }));
  if (!audible) return;
  const ctx = audio();
  if (!ctx) return;
  const v = Math.max(0.08, Math.min(1, strength));
  const now = ctx.currentTime + 0.005;
  if (sound === 'ball') {
    // Phenolic balls: a bright, short click.
    noise(ctx, now, 'bandpass', 3400, 0.9 * v, 0.03, 3);
    tone(ctx, now, 2200, 1700, 0.25 * v, 0.05);
  } else if (sound === 'cue') {
    noise(ctx, now, 'bandpass', 1600, 0.7 * v, 0.04, 2);
    tone(ctx, now, 600, 300, 0.2 * v, 0.06);
  } else if (sound === 'rail') {
    noise(ctx, now, 'lowpass', 500, 0.6 * v, 0.08, 0.8);
    tone(ctx, now, 140, 90, 0.35 * v, 0.1);
  } else {
    // Into the pocket: a knock on the jaw, then the ball rolling down the gully.
    noise(ctx, now, 'bandpass', 900, 0.6, 0.05, 2);
    noise(ctx, now + 0.06, 'lowpass', 350, 0.5, 0.35, 0.7);
    tone(ctx, now + 0.06, 110, 70, 0.3, 0.3);
  }
}
