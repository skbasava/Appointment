import { describe, it, expect } from 'vitest';

interface Notification {
  id: string;
  appointment_id: string;
  type: string;
  status: string;
  scheduled_for: number;
}

describe('Notification Scheduling', () => {
  const now = Math.floor(Date.now() / 1000);

  describe('shouldSendReminder', () => {
    it('should return true when reminder is due', () => {
      const appointmentStartTime = now + 3600; // 1 hour from now
      const result = shouldSendReminder(appointmentStartTime, now, 3600); // 1 hour before
      expect(result).toBe(true);
    });

    it('should return false when reminder is not yet due', () => {
      const appointmentStartTime = now + 7200; // 2 hours from now
      const result = shouldSendReminder(appointmentStartTime, now, 3600); // 1 hour before
      expect(result).toBe(false);
    });

    it('should return false when appointment is in the past', () => {
      const appointmentStartTime = now - 3600; // 1 hour ago
      const result = shouldSendReminder(appointmentStartTime, now, 3600);
      expect(result).toBe(false);
    });
  });

  describe('getRemindersToSend', () => {
    it('should filter appointments that need reminders', () => {
      const appointments = [
        { id: '1', start_time: now + 1800, hasReminder: false }, // 30 min, should send
        { id: '2', start_time: now + 7200, hasReminder: false }, // 2 hours, too early
        { id: '3', start_time: now + 3600, hasReminder: true },  // 1 hour, already sent
        { id: '4', start_time: now - 1800, hasReminder: false }, // 30 min ago, past
      ];

      const result = getRemindersToSend(appointments, now, 3600);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });
  });
});

function shouldSendReminder(
  appointmentStartTime: number,
  currentTime: number,
  reminderBeforeSeconds: number
): boolean {
  const reminderTime = appointmentStartTime - reminderBeforeSeconds;
  return currentTime >= reminderTime && appointmentStartTime > currentTime;
}

function getRemindersToSend(
  appointments: Array<{ id: string; start_time: number; hasReminder: boolean }>,
  currentTime: number,
  reminderBeforeSeconds: number
): Array<{ id: string; start_time: number; hasReminder: boolean }> {
  return appointments.filter((apt) => {
    if (apt.hasReminder) return false;
    return shouldSendReminder(apt.start_time, currentTime, reminderBeforeSeconds);
  });
}
