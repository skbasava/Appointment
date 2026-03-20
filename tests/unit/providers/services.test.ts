import { describe, it, expect } from 'vitest';

interface Service {
  id: string;
  provider_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  is_active: number;
}

describe('Service CRUD Operations', () => {
  describe('validateService', () => {
    it('should accept valid service', () => {
      const service: Partial<Service> = {
        name: 'General Consultation',
        description: 'Standard consultation',
        duration_minutes: 30,
      };
      const result = validateService(service);
      expect(result.valid).toBe(true);
    });

    it('should reject missing name', () => {
      const service: Partial<Service> = {
        duration_minutes: 30,
      };
      const result = validateService(service);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('name is required');
    });

    it('should reject missing duration', () => {
      const service: Partial<Service> = {
        name: 'Consultation',
      };
      const result = validateService(service);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('duration_minutes is required');
    });

    it('should reject duration less than 15 minutes', () => {
      const service: Partial<Service> = {
        name: 'Quick Check',
        duration_minutes: 10,
      };
      const result = validateService(service);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('duration_minutes must be between 15 and 480');
    });

    it('should reject duration more than 480 minutes', () => {
      const service: Partial<Service> = {
        name: 'Full Day',
        duration_minutes: 500,
      };
      const result = validateService(service);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('duration_minutes must be between 15 and 480');
    });
  });

  describe('filterActiveServices', () => {
    it('should filter only active services', () => {
      const services: Service[] = [
        { id: '1', provider_id: 'p1', name: 'Active', description: null, duration_minutes: 30, is_active: 1 },
        { id: '2', provider_id: 'p1', name: 'Inactive', description: null, duration_minutes: 30, is_active: 0 },
        { id: '3', provider_id: 'p1', name: 'Active 2', description: null, duration_minutes: 60, is_active: 1 },
      ];
      const result = filterActiveServices(services);
      expect(result).toHaveLength(2);
      expect(result.every(s => s.is_active === 1)).toBe(true);
    });
  });
});

function validateService(service: Partial<Service>): { valid: boolean; error?: string } {
  if (!service.name) {
    return { valid: false, error: 'name is required' };
  }

  if (!service.duration_minutes) {
    return { valid: false, error: 'duration_minutes is required' };
  }

  if (service.duration_minutes < 15 || service.duration_minutes > 480) {
    return { valid: false, error: 'duration_minutes must be between 15 and 480' };
  }

  return { valid: true };
}

function filterActiveServices(services: Service[]): Service[] {
  return services.filter(s => s.is_active === 1);
}
