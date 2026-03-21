interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}
interface Entry {
  timestamps: number[];
  blockedUntil: number;
}
export class RateLimiter {
  private store = new Map<string, Entry>();
  private config: RateLimitConfig;
  constructor(config: RateLimitConfig) { this.config = config; }
  isAllowed(identifier: string): boolean {
    const now = Date.now();
    let entry = this.store.get(identifier);
    if (!entry) { entry = { timestamps: [], blockedUntil: 0 }; this.store.set(identifier, entry); }
    if (entry.blockedUntil > now) return false;
    entry.timestamps = entry.timestamps.filter(t => t > now - this.config.windowMs);
    if (entry.timestamps.length >= this.config.maxRequests) {
      entry.blockedUntil = now + this.config.windowMs * 5;
      return false;
    }
    entry.timestamps.push(now);
    return true;
  }
}
