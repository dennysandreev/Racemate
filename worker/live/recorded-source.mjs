// Playback of actual OpenF1 packets for pre-session acceptance tests. No lap
// synthesis or future results: events keep their original relative ordering.
export class RecordedOpenF1Source {
  constructor({
    recording,
    offset = recording.fromOffsetMs ?? 0,
    speed = 1,
    onMessage,
    onConnection,
  }) {
    this.recording = recording;
    this.offset = offset;
    this.speed = speed;
    this.onMessage = onMessage;
    this.onConnection = onConnection;
    this.base = Date.now() - offset / speed;
    this.session = {
      ...recording.session,
      date_start: new Date(this.base).toISOString(),
      date_end: new Date(
        this.base +
          (Date.parse(recording.session.date_end) -
            Date.parse(recording.session.date_start)) /
            speed,
      ).toISOString(),
    };
  }
  async start() {
    this.index = 0;
    this.started = performance.now();
    this.onConnection(true);
    const tick = () => {
      const elapsed =
        this.offset + (performance.now() - this.started) * this.speed;
      while (
        this.index < this.recording.messages.length &&
        this.recording.messages[this.index].offset <= elapsed
      ) {
        const { topic, row, offset } = this.recording.messages[this.index++];
        this.onMessage(topic, {
          ...row,
          date: new Date(this.base + offset / this.speed).toISOString(),
        });
      }
      if (elapsed >= this.recording.durationMs) {
        clearInterval(this.timer);
        this.onConnection(false);
      }
    };
    this.timer = setInterval(tick, 100);
    tick();
  }
  async stop() {
    clearInterval(this.timer);
    this.onConnection(false);
  }
}
