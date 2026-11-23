/** Original synthesized cues on a dedicated Web Audio graph; never touches the room player. */
export class DuckAudio {
  private context: AudioContext | null = null;
  private volume = 0;
  setVolume(volume: number) {
    this.volume = volume;
    if (volume > 0 && !this.context && typeof AudioContext !== 'undefined') {
      try {
        this.context = new AudioContext();
      } catch {
        return;
      }
    }
    if (volume > 0 && this.context?.state === 'suspended')
      void this.context.resume().catch(() => {});
  }
  play(kind: 'tick' | 'start' | 'finish' | 'quack' | 'splash' | 'overtake' | 'sprint' | 'click') {
    if (!this.context || this.context.state !== 'running' || !this.volume) return;
    const ctx = this.context,
      at = ctx.currentTime;
    const notes =
      kind === 'finish'
        ? [523, 659, 784, 1046]
        : kind === 'start'
          ? [440, 880]
          : kind === 'quack'
            ? [310, 260]
            : kind === 'sprint'
              ? [392, 523, 659]
              : kind === 'overtake'
                ? [660, 880]
                : [kind === 'tick' ? 600 : kind === 'click' ? 800 : 160];
    notes.forEach((note, i) => {
      const oscillator = ctx.createOscillator(),
        gain = ctx.createGain();
      const start = at + i * 0.12,
        duration = kind === 'splash' ? 0.15 : 0.22;
      oscillator.type = kind === 'quack' ? 'sawtooth' : 'sine';
      oscillator.frequency.setValueAtTime(note, start);
      oscillator.frequency.exponentialRampToValueAtTime(
        note * (kind === 'quack' ? 0.65 : 0.98),
        start + duration,
      );
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(
        this.volume * (kind === 'quack' ? 0.035 : 0.09),
        start + 0.015,
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    });
  }
  dispose() {
    void this.context?.close().catch(() => {});
    this.context = null;
  }
}
