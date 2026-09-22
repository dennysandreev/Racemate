// One monotonic clock for the controls, timing and both map renderers.
export class ReplayClock {
  private elapsedMs: number;
  private anchor: number;
  speed = 1;
  playing = false;
  readonly durationMs: number;
  private readonly now: () => number;

  constructor(durationMs: number, startMs = 0, now = () => performance.now()) {
    this.durationMs = durationMs;
    this.now = now;
    this.anchor = now();
    this.elapsedMs = startMs;
  }

  read() {
    return Math.min(this.durationMs, this.elapsedMs +
      (this.playing ? (this.now() - this.anchor) * this.speed : 0));
  }

  seek(elapsedMs: number) {
    this.elapsedMs = Math.min(this.durationMs, Math.max(0, elapsedMs));
    this.anchor = this.now();
  }

  setPlaying(playing: boolean) {
    this.seek(this.read());
    this.playing = playing;
  }

  setSpeed(speed: number) {
    this.seek(this.read());
    this.speed = speed;
  }
}
