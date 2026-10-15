/**
 * Caps how many runs of an expensive operation share this process at once.
 * Callers past the limit wait in FIFO order; once `maxWaiting` are queued,
 * new callers are turned away so the queue cannot grow without bound.
 */
export class Bulkhead {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(
    readonly limit: number,
    readonly maxWaiting: number
  ) {}

  /**
   * Resolves to a release function once a slot is free, or to null straight
   * away when the queue is full. Call release exactly once, in a finally.
   */
  acquire(): Promise<(() => void) | null> {
    if (this.active < this.limit) {
      this.active++;
      return Promise.resolve(this.releaser());
    }
    if (this.waiting.length >= this.maxWaiting) return Promise.resolve(null);
    // The slot passes straight to the next waiter, so active never dips and
    // a newcomer cannot jump the queue.
    return new Promise((resolve) => this.waiting.push(() => resolve(this.releaser())));
  }

  get stats(): { active: number; waiting: number } {
    return { active: this.active, waiting: this.waiting.length };
  }

  private releaser(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    };
  }
}
