# TOTP + QR Code Registration Design Spec

**Date:** 2026-03-22
**Status:** Approved (with fixes)

## 1. Problem

Doctors currently register with TOTP but receive the secret as plain text — they must manually type it into Google/Microsoft Authenticator. Patients use SMS OTP via Twilio with no alternative. We need QR code-based TOTP for frictionless authenticator setup.

## 2. Goals

- Add QR code support to TOTP registration (scan to add to Authenticator)
- Enhance doctor onboarding with QR code image
- Add TOTP+QR as default patient auth, keep SMS behind `USE_TWILIO_OTP` flag
- Use pure JS QR code library (Cloudflare Workers compatible)

## 3. Architecture

### 3.1 QR Code Generation

Add `qrcode` npm package (pure JS mode). Use `qrcode.toDataURL()` which returns a base64-encoded PNG data URL. Extract the raw base64 bytes for Telegram delivery via `FormData`.

**New functions in `src/lib/auth/totp.ts`:**
- `generateTOTPUri(secret, label, issuer)` → `otpauth://totp/...` string
- `generateQRCode(uri)` → `Promise<string>` (base64-encoded PNG)

### 3.2 Telegram Delivery

Current `sendImage` sends photo as JSON string (URL only). Need new method:
- `sendImageBuffer(chatId, pngBytes, caption?)` → sends via `multipart/form-data` with `FormData` + `Blob`
- Telegram Bot API's `sendPhoto` accepts raw file bytes via multipart, NOT base64 data URLs

### 3.3 Auth Flow Decision

```
Patient registers
  → USE_TWILIO_OTP=true  → SMS OTP (existing Twilio flow)
  → USE_TWILIO_OTP=false → TOTP + QR code (new flow)

Doctor registers
  → TOTP + QR code (enhanced from existing TOTP flow)

Patient returns (login)
  → TOTP registered: enter TOTP code from Authenticator
  → SMS registered: enter SMS code via Twilio
```

## 4. Data Model

### Existing
- `providers.totp_secret` — already exists (stores doctor TOTP secret)
- `patient_auth` table — no `totp_secret` column yet

### New migration (007-totp-patient.sql)
```sql
ALTER TABLE patient_auth ADD COLUMN totp_secret TEXT;
```

## 5. Component Changes

### 5.1 `src/lib/auth/totp.ts`

Add:
```typescript
export function generateTOTPUri(secret: string, label: string, issuer: string): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

export async function generateQRCode(uri: string): Promise<Uint8Array> {
  // Use qrcode npm package
  // toDataURL() returns base64 PNG — extract raw bytes for FormData
  // Returns PNG bytes as Uint8Array
}
```

### 5.2 `src/lib/messaging/telegram-plugin.ts`

Add `sendImageBuffer` method:
```typescript
async sendImageBuffer(chatId: string, pngBytes: Uint8Array, caption?: string): Promise<boolean> {
  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append('photo', new Blob([pngBytes], { type: 'image/png' }), 'qrcode.png');
  if (caption) formData.append('caption', caption);
  formData.append('parse_mode', 'HTML');

  const response = await fetch(`https://api.telegram.org/bot${this.token}/sendPhoto`, {
    method: 'POST',
    body: formData,
  });
  return response.ok;
}
```

### 5.3 `src/lib/messaging/onboarding-flow.ts`

**Doctor flow (PHONE step):**
- Generate TOTP secret + URI + QR code PNG
- Send QR code as photo: "Scan with Google/Microsoft Authenticator"
- Send secret as text below for manual entry fallback

**Patient flow (PHONE step):**
- Check `isTwilioOTPEnabled(this.env)` — if `true`, SMS OTP flow (existing)
- If `false`: TOTP + QR code flow (same as doctor)
- Store secret in `session.data.totpSecret`

**Patient flow (PHONE_VERIFY step):**
- Check `isTwilioOTPEnabled(this.env)` — if `true`, `verifyOTP` via Twilio
- If `false`: `verifyTOTP` from TOTP module

**Patient login (when returning):**
- If patient has `totp_secret` in `patient_auth`: prompt for TOTP code
- If patient used SMS: prompt for SMS code

### 5.4 `src/db/queries/patient-auth.ts`

Add `getPatientByPhone` to retrieve `totp_secret` for returning patients.

## 6. Error Handling

| Scenario | Handling |
|----------|----------|
| QR code generation fails | Fall back to text-only secret display |
| Telegram sendImageBuffer fails | Fall back to text with secret + manual instructions |
| TOTP verification fails | "Incorrect code. Try again:" (max 3 attempts) |
| Invalid phone number | Re-prompt for valid number |
| `USE_TWILIO_OTP` not defined | Default to `false` (TOTP flow) |
| Patient has no smartphone | Use `USE_TWILIO_OTP=true` flag to enable SMS fallback |

## 7. Security

- TOTP secrets generated via `crypto.getRandomValues` (20 bytes entropy)
- Constant-time comparison in `verifyTOTP`
- Secrets stored in D1
- QR code sent as ephemeral Telegram photo (not stored permanently)

## 8. Testing

- Unit tests for `generateTOTPUri` (correct URI format)
- Unit tests for `generateQRCode` (returns valid PNG bytes)
- Unit tests for `sendImageBuffer` (FormData construction)
- Existing TOTP tests still pass
- Patient flow tested with feature flag both on and off

## 9. Dependencies

- `qrcode` npm package (pure JS QR code generator)

## 10. Open Questions

- None.
