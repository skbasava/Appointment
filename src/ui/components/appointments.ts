interface Appointment {
  id: string;
  provider_id: string;
  service_id: string;
  customer_name: string;
  start_time: number;
  end_time: number;
  status: string;
  google_event_id: string | null;
}

interface Provider {
  id: string;
  name: string;
}

interface Service {
  id: string;
  name: string;
  duration_minutes: number;
}

const urlParams = new URLSearchParams(window.location.search);
const telegramId = urlParams.get('telegram_id');

if (!telegramId) {
  alert('Please access this page through Telegram');
}

let currentAppointment: Appointment | null = null;

document.addEventListener('DOMContentLoaded', loadAppointments);

async function loadAppointments() {
  try {
    const response = await fetch('/api/appointments', {
      headers: { 'X-Telegram-User-Id': telegramId || '' },
    });

    if (!response.ok) throw new Error('Failed to load appointments');

    const data = await response.json();
    renderAppointments(data.appointments || []);
  } catch (error) {
    console.error('Error loading appointments:', error);
    document.getElementById('appointments-container')!.innerHTML =
      '<p class="alert alert-error">Failed to load appointments</p>';
  }
}

function renderAppointments(appointments: Appointment[]) {
  const container = document.getElementById('appointments-container')!;

  if (appointments.length === 0) {
    container.innerHTML = `
      <div class="card">
        <p>You have no appointments yet.</p>
        <a href="/booking" class="btn btn-primary">Book Your First Appointment</a>
      </div>
    `;
    return;
  }

  const grouped = groupByStatus(appointments);

  let html = '';

  if (grouped.pending?.length) {
    html += `<h2>Pending</h2>${renderAppointmentList(grouped.pending, 'pending')}`;
  }
  if (grouped.confirmed?.length) {
    html += `<h2>Confirmed</h2>${renderAppointmentList(grouped.confirmed, 'confirmed')}`;
  }
  if (grouped.rescheduled?.length) {
    html += `<h2>Rescheduled</h2>${renderAppointmentList(grouped.rescheduled, 'rescheduled')}`;
  }
  if (grouped.cancelled?.length) {
    html += `<h2>Cancelled</h2>${renderAppointmentList(grouped.cancelled, 'cancelled')}`;
  }

  container.innerHTML = html;
}

function groupByStatus(appointments: Appointment[]): Record<string, Appointment[]> {
  return appointments.reduce(
    (groups, apt) => {
      if (!groups[apt.status]) groups[apt.status] = [];
      groups[apt.status].push(apt);
      return groups;
    },
    {} as Record<string, Appointment[]>
  );
}

function renderAppointmentList(appointments: Appointment[], status: string): string {
  return appointments
    .map((apt) => {
      const startDate = new Date(apt.start_time * 1000);
      const endDate = new Date(apt.end_time * 1000);

      const canModify = ['pending', 'confirmed'].includes(apt.status);

      return `
        <div class="card">
          <div class="appointment-info">
            <p><strong>Date:</strong> ${startDate.toLocaleDateString()}</p>
            <p><strong>Time:</strong> ${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
            <p><strong>Status:</strong> <span class="status-${apt.status}">${apt.status}</span></p>
          </div>
          ${
            canModify
              ? `
            <div class="appointment-actions">
              <button class="btn btn-secondary" onclick="openRescheduleModal('${apt.id}', '${apt.provider_id}', '${apt.service_id}')">Reschedule</button>
              <button class="btn btn-error" onclick="cancelAppointment('${apt.id}')">Cancel</button>
            </div>
          `
              : ''
          }
        </div>
      `;
    })
    .join('');
}

async function cancelAppointment(appointmentId: string) {
  if (!confirm('Are you sure you want to cancel this appointment?')) return;

  try {
    const response = await fetch(`/api/appointments/${appointmentId}/cancel`, {
      method: 'PUT',
      headers: { 'X-Telegram-User-Id': telegramId || '' },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Cancellation failed');
    }

    alert('Appointment cancelled successfully');
    loadAppointments();
  } catch (error) {
    console.error('Cancellation error:', error);
    alert(`Cancellation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function openRescheduleModal(appointmentId: string, providerId: string, serviceId: string) {
  currentAppointment = { id: appointmentId, provider_id: providerId, service_id: serviceId } as Appointment;

  const modal = document.getElementById('reschedule-modal')!;
  modal.style.display = 'flex';

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const datePicker = document.getElementById('reschedule-date') as HTMLInputElement;
  datePicker.value = tomorrow.toISOString().split('T')[0];
  datePicker.addEventListener('change', loadRescheduleSlots);
  loadRescheduleSlots();
}

function closeRescheduleModal() {
  const modal = document.getElementById('reschedule-modal')!;
  modal.style.display = 'none';
  currentAppointment = null;
}

async function loadRescheduleSlots() {
  if (!currentAppointment) return;

  const datePicker = document.getElementById('reschedule-date') as HTMLInputElement;
  const date = datePicker.value;

  try {
    const response = await fetch(
      `/api/providers/${currentAppointment.provider_id}/available-slots?date=${date}&service_id=${currentAppointment.service_id}`,
      { headers: { 'X-Telegram-User-Id': telegramId || '' } }
    );

    if (!response.ok) throw new Error('Failed to load slots');

    const data = await response.json();
    renderRescheduleSlots(data.slots || []);
  } catch (error) {
    console.error('Error loading slots:', error);
  }
}

function renderRescheduleSlots(slots: { start: string; end: string }[]) {
  const container = document.getElementById('reschedule-slots')!;

  if (slots.length === 0) {
    container.innerHTML = '<p>No available slots for this date</p>';
    return;
  }

  container.innerHTML = slots
    .map((slot) => {
      const startTime = new Date(slot.start);
      const timeStr = startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `
        <button class="btn btn-secondary" onclick="confirmReschedule('${slot.start}')">
          ${timeStr}
        </button>
      `;
    })
    .join('');
}

async function confirmReschedule(slotStart: string) {
  if (!currentAppointment) return;

  const startTime = Math.floor(new Date(slotStart).getTime() / 1000);

  try {
    const response = await fetch(`/api/appointments/${currentAppointment.id}/reschedule`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-User-Id': telegramId || '',
      },
      body: JSON.stringify({ start_time: startTime }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Reschedule failed');
    }

    alert('Appointment rescheduled successfully');
    closeRescheduleModal();
    loadAppointments();
  } catch (error) {
    console.error('Reschedule error:', error);
    alert(`Reschedule failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
