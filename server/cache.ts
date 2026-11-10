// A Map that forgets. Entries expire after `ttlMs`, and once the total weight passes `limit`
// the least recently used go first. `weigh` says what an entry costs (1 each by default; bytes
// or row counts where entries vary a lot in size).

export class Forgetful<V> {
  private entries = new Map<string, { value: V; weight: number; at: number }>();
  private total = 0;

  constructor(private limit: number, private ttlMs: number, private weigh: (v: V) => number = () => 1,
    private now: () => number = Date.now) {}

  get(key: string): V | undefined {
    const e = this.entries.get(key);
    if (!e) return undefined;
    if (this.now() - e.at > this.ttlMs) { this.delete(key); return undefined; }
    this.entries.delete(key); // move to the back: most recently used
    this.entries.set(key, e);
    return e.value;
  }

  set(key: string, value: V) {
    this.delete(key);
    const weight = this.weigh(value);
    if (weight > this.limit) return; // too big to keep at all
    this.entries.set(key, { value, weight, at: this.now() });
    this.total += weight;
    for (const [k] of this.entries) {
      if (this.total <= this.limit) break;
      this.delete(k);
    }
  }

  delete(key: string) {
    const e = this.entries.get(key);
    if (!e) return;
    this.entries.delete(key);
    this.total -= e.weight;
  }

  get weight() { return this.total; }
  get size() { return this.entries.size; }
}
