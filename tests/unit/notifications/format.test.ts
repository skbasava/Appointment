import { describe, it, expect } from 'vitest';

interface AppointmentDetails {
  customer_name: string;
  provider_name: string;
  service_name: string;
  start_time: number;
  end_time: number;
}

describe('Telegram Message Formatting', () => {
  const appointment: AppointmentDetails = {
    customer_name: 'John Doe',
    provider_name: 'Dr. Smith',
    service_name: 'General Consultation',
    start_time: 1742808000, // 2025-03-24 10:00 UTC
    end_time: 1742809800, // 2025-03-24 10:30 UTC
  };

  describe('formatConfirmationMessage', () => {
    it('should format a booking confirmation message', () => {
      const message = formatConfirmationMessage(appointment);
      expect(message).toContain('Appointment Confirmed');
      expect(message).toContain('John Doe');
      expect(message).toContain('Dr. Smith');
      expect(message).toContain('General Consultation');
    });
  });

  describe('formatReminderMessage', () => {
    it('should format a reminder message', () => {
      const message = formatReminderMessage(appointment);
      expect(message).toContain('Reminder');
      expect(message).toContain('General Consultation');
      expect(message).toContain('Dr. Smith');
    });
  });

  describe('formatCancellationMessage', () => {
    it('should format a cancellation message', () => {
      const message = formatCancellationMessage(appointment);
      expect(message).toContain('Cancelled');
      expect(message).toContain('General Consultation');
    });
  });

  describe('formatRescheduleMessage', () => {
    it('should format a reschedule message', () => {
      const message = formatRescheduleMessage(appointment, appointment);
      expect(message).toContain('Rescheduled');
      expect(message).toContain('General Consultation');
    });
  });
});

function formatConfirmationMessage(apt: AppointmentDetails): string {
  const startTime = new Date(apt.start_time * 1000);
  return `✅ Appointment Confirmed

Hello ${apt.customer_name}!

Your appointment has been confirmed:

📋 Service: ${apt.service_name}
👨‍⚕️ Provider: ${apt.provider_name}
📅 Date: ${startTime.toLocaleDateString()}
⏰ Time: ${startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}

See you there!`;
}

function formatReminderMessage(apt: AppointmentDetails): string {
  const startTime = new Date(apt.start_time * 1000);
  return `⏰ Reminder

Hello ${apt.customer_name}!

You have an upcoming appointment:

📋 Service: ${apt.service_name}
👨‍⚕️ Provider: ${apt.provider_name}
📅 Date: ${startTime.toLocaleDateString()}
⏰ Time: ${startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}

See you soon!`;
}

function formatCancellationMessage(apt: AppointmentDetails): string {
  return `❌ Appointment Cancelled

Hello ${apt.customer_name}!

Your appointment has been cancelled:

📋 Service: ${apt.service_name}
👨‍⚕️ Provider: ${apt.provider_name}

If you have questions, please contact the provider.`;
}

function formatRescheduleMessage(oldApt: AppointmentDetails, newApt: AppointmentDetails): string {
  const newStartTime = new Date(newApt.start_time * 1000);
  return `📅 Appointment Rescheduled

Hello ${newApt.customer_name}!

Your appointment has been rescheduled:

📋 Service: ${newApt.service_name}
👨‍⚕️ Provider: ${newApt.provider_name}
📅 New Date: ${newStartTime.toLocaleDateString()}
⏰ New Time: ${newStartTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}
