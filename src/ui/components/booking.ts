interface Provider {
  id: string;
  name: string;
  type: string;
}

interface Service {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
}

interface Slot {
  start: string;
  end: string;
}

let selectedProvider: Provider | null = null;
let selectedService: Service | null = null;
let selectedSlot: Slot | null = null;

// Get Telegram user ID from URL params
const urlParams = new URLSearchParams(window.location.search);
const telegramId = urlParams.get('telegram_id');

if (!telegramId) {
  alert('Please access this page through Telegram');
}

// Load providers on page load
document.addEventListener('DOMContentLoaded', loadProviders);

async function loadProviders() {
  try {
    const response = await fetch('/api/providers', {
      headers: { 'X-Telegram-User-Id': telegramId || '' },
    });

    if (!response.ok) throw new Error('Failed to load providers');

    const data = await response.json();
    renderProviders(data.providers || []);
  } catch (error) {
    console.error('Error loading providers:', error);
    document.getElementById('providers-list')!.innerHTML =
      '<p class="alert alert-error">Failed to load providers</p>';
  }
}

function renderProviders(providers: Provider[]) {
  const container = document.getElementById('providers-list')!;
  if (providers.length === 0) {
    container.innerHTML = '<p>No providers available</p>';
    return;
  }

  container.innerHTML = providers
    .map(
      (p) => `
    <div class="card" onclick="selectProvider('${p.id}', '${p.name}', '${p.type}')">
      <h3>${p.name}</h3>
      <p>${p.type}</p>
    </div>
  `
    )
    .join('');
}

async function selectProvider(id: string, name: string, type: string) {
  selectedProvider = { id, name, type };
  await loadServices(id);
  goToStep(2);
}

async function loadServices(providerId: string) {
  try {
    const response = await fetch(`/api/providers/${providerId}/services`, {
      headers: { 'X-Telegram-User-Id': telegramId || '' },
    });

    if (!response.ok) throw new Error('Failed to load services');

    const data = await response.json();
    renderServices(data.services || []);
  } catch (error) {
    console.error('Error loading services:', error);
  }
}

function renderServices(services: Service[]) {
  const container = document.getElementById('services-list')!;
  if (services.length === 0) {
    container.innerHTML = '<p>No services available for this provider</p>';
    return;
  }

  container.innerHTML = services
    .map(
      (s) => `
    <div class="card" onclick="selectService('${s.id}', '${s.name}', ${s.duration_minutes})">
      <h3>${s.name}</h3>
      <p>${s.description || ''}</p>
      <p><strong>Duration:</strong> ${s.duration_minutes} minutes</p>
    </div>
    `
    )
    .join('');
}

function selectService(id: string, name: string, duration: number) {
  selectedService = { id, name, description: null, duration_minutes: duration };
  goToStep(3);

  // Set default date to tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const datePicker = document.getElementById('date-picker') as HTMLInputElement;
  datePicker.value = tomorrow.toISOString().split('T')[0];
  datePicker.addEventListener('change', loadSlots);
  loadSlots();
}

async function loadSlots() {
  if (!selectedProvider || !selectedService) return;

  const datePicker = document.getElementById('date-picker') as HTMLInputElement;
  const date = datePicker.value;

  try {
    const response = await fetch(
      `/api/providers/${selectedProvider.id}/available-slots?date=${date}&service_id=${selectedService.id}`,
      { headers: { 'X-Telegram-User-Id': telegramId || '' } }
    );

    if (!response.ok) throw new Error('Failed to load slots');

    const data = await response.json();
    renderSlots(data.slots || []);
  } catch (error) {
    console.error('Error loading slots:', error);
  }
}

function renderSlots(slots: Slot[]) {
  const container = document.getElementById('slots-container')!;
  if (slots.length === 0) {
    container.innerHTML = '<p>No available slots for this date</p>';
    return;
  }

  container.innerHTML = slots
    .map((slot) => {
      const startTime = new Date(slot.start);
      const timeStr = startTime.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      return `
        <button class="btn btn-secondary" onclick="selectSlot('${slot.start}', '${slot.end}')">
          ${timeStr}
        </button>
      `;
    })
    .join('');
}

function selectSlot(start: string, end: string) {
  selectedSlot = { start, end };
  showBookingSummary();
  goToStep(4);
}

function showBookingSummary() {
  const summary = document.getElementById('booking-summary')!;
  const startTime = new Date(selectedSlot!.start);

  summary.innerHTML = `
    <p><strong>Provider:</strong> ${selectedProvider!.name}</p>
    <p><strong>Service:</strong> ${selectedService!.name}</p>
    <p><strong>Date:</strong> ${startTime.toLocaleDateString()}</p>
    <p><strong>Time:</strong> ${startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
    <p><strong>Duration:</strong> ${selectedService!.duration_minutes} minutes</p>
  `;
}

async function confirmBooking() {
  const customerName = (document.getElementById('customer-name') as HTMLInputElement).value;

  if (!customerName) {
    alert('Please enter your name');
    return;
  }

  try {
    const response = await fetch('/api/appointments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-User-Id': telegramId || '',
        'X-Telegram-Username': customerName,
      },
      body: JSON.stringify({
        provider_id: selectedProvider!.id,
        service_id: selectedService!.id,
        customer_name: customerName,
        start_time: Math.floor(new Date(selectedSlot!.start).getTime() / 1000),
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Booking failed');
    }

    const result = await response.json();
    alert(`Booking confirmed! Appointment ID: ${result.id}`);
    window.location.href = `/appointments?telegram_id=${telegramId}`;
  } catch (error) {
    console.error('Booking error:', error);
    alert(`Booking failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function goToStep(step: number) {
  document.querySelectorAll('.booking-step').forEach((el, i) => {
    (el as HTMLElement).style.display = i + 1 === step ? 'block' : 'none';
  });
}
