// Timezone utilities for IST (Asia/Kolkata, UTC+5:30)
// All times are stored as UTC epoch seconds in DB
// Display formatting always uses IST

const IST = 'Asia/Kolkata';
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Get current IST date components (year, month, day, hour, minute) */
export function getISTNow(): { year: number; month: number; day: number; hour: number; minute: number; epoch: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0');

  return {
    year: get('year'),
    month: get('month') - 1, // JS months are 0-indexed
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    epoch: Math.floor(now.getTime() / 1000),
  };
}

/** Create a UTC Date from IST date components (14:30 IST → correct UTC epoch) */
export function istDate(year: number, month: number, day: number, hour: number, minute: number): Date {
  return new Date(Date.UTC(year, month, day, hour, minute) - IST_OFFSET_MS);
}

/** Format epoch seconds as IST date string */
export function formatDateIST(epoch: number, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(epoch * 1000).toLocaleDateString('en-IN', {
    timeZone: IST,
    ...opts,
  });
}

/** Format epoch seconds as IST time string */
export function formatTimeIST(epoch: number, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(epoch * 1000).toLocaleTimeString('en-IN', {
    timeZone: IST,
    ...opts,
  });
}
