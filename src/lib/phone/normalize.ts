export function normalizePhone(phone: string, defaultCountryCode?: string): string {
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');
  if (cleaned.startsWith('+')) {
    const digits = cleaned.slice(1);
    if (digits.length < 10 || digits.length > 15) throw new Error('Invalid phone number');
    return '+' + digits;
  }
  let digits = cleaned;
  if (digits.startsWith('0')) digits = digits.slice(1);
  const code = defaultCountryCode || '+91';
  const full = code.replace('+', '') + digits;
  if (full.length < 10 || full.length > 15) throw new Error('Invalid phone number');
  return '+' + full;
}
