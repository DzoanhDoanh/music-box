// Cờ Tướng sound effects, synthesised with Web Audio: no files to download, and they play
// alongside the room's music without touching it.

export type BoardSound = 'move' | 'capture' | 'check';

const STORAGE = 'roomtune:co-tuong:sound';
let context: AudioContext | null = null;

export function soundOn() {
  try {
    return localStorage.getItem(STORAGE) !== 'off';
  } catch {
    return true;
  }
}
export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(STORAGE, on ? 'on' : 'off');
  } catch {
    // Without storage the choice simply lasts for this page.
  }
}

function audio() {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  // Browsers start audio suspended until the page has been clicked; any click unlocks it.
  if (context.state === 'suspended') void context.resume().catch(() => {});
  return context;
}

/** A burst of noise through a band-pass filter: the crack of wood on wood. */
function knock(ctx: AudioContext, at: number, pitch: number, gain: number, length = 0.05) {
  const frames = Math.ceil(ctx.sampleRate * length);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 3;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = pitch;
  band.Q.value = 2.2;
  const level = ctx.createGain();
  level.gain.setValueAtTime(gain, at);
  level.gain.exponentialRampToValueAtTime(0.001, at + length);
  source.connect(band).connect(level).connect(ctx.destination);
  source.start(at);
}

/** The low body of the board resonating under the piece. */
function thump(
  ctx: AudioContext,
  at: number,
  from: number,
  to: number,
  gain: number,
  length = 0.12,
) {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + length);
  const level = ctx.createGain();
  level.gain.setValueAtTime(0.0001, at);
  level.gain.exponentialRampToValueAtTime(gain, at + 0.005);
  level.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(level).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

function chime(ctx: AudioContext, at: number, frequency: number, gain: number) {
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = frequency;
  const level = ctx.createGain();
  level.gain.setValueAtTime(0.0001, at);
  level.gain.exponentialRampToValueAtTime(gain, at + 0.01);
  level.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
  osc.connect(level).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + 0.4);
}

export function playBoardSound(sound: BoardSound) {
  const audible = soundOn() && !document.hidden;
  // Tests and other listeners can follow what was played, and whether it could be heard.
  window.dispatchEvent(new CustomEvent('roomtune:board-sound', { detail: { sound, audible } }));
  if (!audible) return;
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime + 0.01;
  if (sound === 'move') {
    knock(ctx, now, 1900, 0.9);
    thump(ctx, now, 210, 120, 0.35);
  } else if (sound === 'capture') {
    // The capturing piece strikes the other, then both settle on the board.
    knock(ctx, now, 2600, 0.8, 0.035);
    knock(ctx, now + 0.045, 1500, 1, 0.07);
    thump(ctx, now + 0.045, 170, 80, 0.55, 0.18);
  } else {
    chime(ctx, now, 988, 0.18);
    chime(ctx, now + 0.11, 1319, 0.14);
  }
}
