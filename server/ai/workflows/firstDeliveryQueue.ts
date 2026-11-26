/** Before the first commit, let all originals finish their local recovery and
 * spend a reserve on the closest failed proposal first. Slots release on every exit. */
export class FirstDeliveryQueue {
  private active: Set<number>;
  private waiting = new Map<number, { defects: number; start: () => void }>();
  private delivered = false;

  constructor(slots: number[]) {
    this.active = new Set(slots);
  }

  nextAttempt(slot: number, defects: number) {
    if (this.delivered) return Promise.resolve();
    this.active.delete(slot);
    return new Promise<void>(start => {
      this.waiting.set(slot, { defects, start });
      this.drain();
    });
  }

  finish(slot: number, ready: boolean) {
    this.active.delete(slot);
    this.delivered ||= ready;
    this.drain();
  }

  private drain() {
    if (!this.delivered && this.active.size) return;
    const order = Array.from(this.waiting).sort(
      ([a, x], [b, y]) => x.defects - y.defects || a - b
    );
    for (const [slot, entry] of order) {
      this.waiting.delete(slot);
      this.active.add(slot);
      entry.start();
      if (!this.delivered) break;
    }
  }
}
