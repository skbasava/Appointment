import { describe, it, expect } from 'vitest';
import { hasConflict } from '../../../src/lib/booking/conflict';
import { Appointment } from '../../../src/db/types';

describe('Conflict Detection', () => {
  describe('hasConflict', () => {
    it('should return false when no existing appointments', () => {
      const result = hasConflict(
        { start_time: 1000, end_time: 2000 },
        []
      );
      expect(result).toBe(false);
    });

    it('should detect exact overlap', () => {
      const existing: Appointment[] = [
        {
          id: '1', provider_id: 'p1', service_id: 's1',
          customer_telegram_id: 't1', customer_name: 'Test',
          start_time: 1000, end_time: 2000, status: 'confirmed',
          google_event_id: null, created_at: 0, updated_at: 0,
        },
      ];
      const result = hasConflict(
        { start_time: 1000, end_time: 2000 },
        existing
      );
      expect(result).toBe(true);
    });

    it('should detect partial overlap (start overlaps)', () => {
      const existing: Appointment[] = [
        {
          id: '1', provider_id: 'p1', service_id: 's1',
          customer_telegram_id: 't1', customer_name: 'Test',
          start_time: 1000, end_time: 2000, status: 'confirmed',
          google_event_id: null, created_at: 0, updated_at: 0,
        },
      ];
      const result = hasConflict(
        { start_time: 1500, end_time: 2500 },
        existing
      );
      expect(result).toBe(true);
    });

    it('should detect partial overlap (end overlaps)', () => {
      const existing: Appointment[] = [
        {
          id: '1', provider_id: 'p1', service_id: 's1',
          customer_telegram_id: 't1', customer_name: 'Test',
          start_time: 1000, end_time: 2000, status: 'confirmed',
          google_event_id: null, created_at: 0, updated_at: 0,
        },
      ];
      const result = hasConflict(
        { start_time: 500, end_time: 1500 },
        existing
      );
      expect(result).toBe(true);
    });

    it('should detect contained overlap', () => {
      const existing: Appointment[] = [
        {
          id: '1', provider_id: 'p1', service_id: 's1',
          customer_telegram_id: 't1', customer_name: 'Test',
          start_time: 1000, end_time: 3000, status: 'confirmed',
          google_event_id: null, created_at: 0, updated_at: 0,
        },
      ];
      const result = hasConflict(
        { start_time: 1500, end_time: 2500 },
        existing
      );
      expect(result).toBe(true);
    });

    it('should not detect conflict when times are adjacent', () => {
      const existing: Appointment[] = [
        {
          id: '1', provider_id: 'p1', service_id: 's1',
          customer_telegram_id: 't1', customer_name: 'Test',
          start_time: 1000, end_time: 2000, status: 'confirmed',
          google_event_id: null, created_at: 0, updated_at: 0,
        },
      ];
      const result = hasConflict(
        { start_time: 2000, end_time: 3000 },
        existing
      );
      expect(result).toBe(false);
    });

    it('should ignore cancelled appointments', () => {
      const existing: Appointment[] = [
        {
          id: '1', provider_id: 'p1', service_id: 's1',
          customer_telegram_id: 't1', customer_name: 'Test',
          start_time: 1000, end_time: 2000, status: 'cancelled',
          google_event_id: null, created_at: 0, updated_at: 0,
        },
      ];
      const result = hasConflict(
        { start_time: 1000, end_time: 2000 },
        existing
      );
      expect(result).toBe(false);
    });
  });
});
