import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter } from '../../../src/lib/auth/rate-limiter';

describe('RateLimiter', () => {
  let limiter: RateLimiter;
  beforeEach(() => { limiter = new RateLimiter({ windowMs: 1000, maxRequests: 3 }); });

  it('should allow requests under limit', () => {
    expect(limiter.isAllowed('user1')).toBe(true);
    expect(limiter.isAllowed('user1')).toBe(true);
    expect(limiter.isAllowed('user1')).toBe(true);
  });
  it('should block requests over limit', () => {
    limiter.isAllowed('user1');
    limiter.isAllowed('user1');
    limiter.isAllowed('user1');
    expect(limiter.isAllowed('user1')).toBe(false);
  });
  it('should track users independently', () => {
    limiter.isAllowed('user1');
    limiter.isAllowed('user1');
    limiter.isAllowed('user1');
    expect(limiter.isAllowed('user1')).toBe(false);
    expect(limiter.isAllowed('user2')).toBe(true);
  });
});
