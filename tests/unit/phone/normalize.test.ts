import { describe, it, expect } from 'vitest';
import { normalizePhone } from '../../../src/lib/phone/normalize';

describe('normalizePhone', () => {
  it('should normalize already-valid E.164', () => {
    expect(normalizePhone('+911234567890')).toBe('+911234567890');
  });
  it('should add country code when missing', () => {
    expect(normalizePhone('1234567890', '+91')).toBe('+911234567890');
  });
  it('should strip spaces and dashes', () => {
    expect(normalizePhone('+91 123-456-7890')).toBe('+911234567890');
  });
  it('should strip leading zero after country code', () => {
    expect(normalizePhone('01234567890', '+91')).toBe('+911234567890');
  });
  it('should throw for invalid phone', () => {
    expect(() => normalizePhone('123')).toThrow('Invalid phone');
  });
});
