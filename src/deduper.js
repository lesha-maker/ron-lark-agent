export class TtlDeduper {
  constructor({ ttlMs = 10 * 60 * 1000 } = {}) {
    this.ttlMs = ttlMs;
    this.seen = new Map();
  }

  claim(key) {
    if (!key) return true;

    const now = Date.now();
    this.prune(now);

    if (this.seen.has(key)) return false;

    this.seen.set(key, now + this.ttlMs);
    return true;
  }

  prune(now = Date.now()) {
    for (const [key, expiresAt] of this.seen.entries()) {
      if (expiresAt <= now) this.seen.delete(key);
    }
  }
}
