/** Bound server latency without placing network work on the typing path. */
export class SaveScheduler {
  private idle: ReturnType<typeof setTimeout> | undefined;
  private deadline: ReturnType<typeof setTimeout> | undefined;
  constructor(private readonly save: () => void) {}
  changed() {
    clearTimeout(this.idle);
    this.idle = setTimeout(() => this.flush(), 600);
    this.deadline ??= setTimeout(() => this.flush(), 3000);
  }
  flush() {
    this.dispose();
    this.save();
  }
  dispose() {
    clearTimeout(this.idle);
    clearTimeout(this.deadline);
    this.idle = this.deadline = undefined;
  }
}
