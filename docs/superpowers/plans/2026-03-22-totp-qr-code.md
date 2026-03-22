# TOTP + QR Code Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add QR code support to TOTP registration for both doctors and patients, with SMS OTP preserved behind `USE_TWILIO_OTP` feature flag.

**Architecture:** Add `generateTOTPUri` and `generateQRCode` to TOTP module. Add `sendImageBuffer` to Telegram plugin for binary image delivery. Update onboarding flow: doctors always get TOTP+QR, patients get TOTP+QR by default with SMS fallback.

**Tech Stack:** Cloudflare Workers, Hono, D1, Telegram Bot API, `qrcode` npm package

**Spec:** `docs/superpowers/specs/2026-03-22-totp-qr-code-design.md`

---

### Task 1: Install `qrcode` and add QR functions to TOTP module

**Files:**
- Modify: `package.json`
- Modify: `src/lib/auth/totp.ts`
- Test: `tests/unit/auth/totp.test.ts`

- [ ] **Step 1: Install qrcode package**

```bash
cd /home/satish/Downloads/appointment/appoint
npm install qrcode
```

- [ ] **Step 2: Write failing tests for new TOTP functions**

Add to `tests/unit/auth/totp.test.ts`:

```typescript
import { generateTOTPUri, generateQRCode } from '../../src/lib/auth/totp';

describe('generateTOTPUri', () => {
  it('should generate a valid otpauth URI', () => {
    const uri = generateTOTPUri('JBSWY3DPEHPK3PXP', 'Dr. Smith', 'Appoint');
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('issuer=Appoint');
    expect(uri).toContain('algorithm=SHA1');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
  });

  it('should encode special characters in label and issuer', () => {
    const uri = generateTOTPUri('SECRET', 'Dr. John Doe', 'My App');
    expect(uri).toContain('Dr.%20John%20Doe');
    expect(uri).toContain('My%20App');
  });
});

describe('generateQRCode', () => {
  it('should return PNG bytes', async () => {
    const uri = 'otpauth://totp/Appoint:Dr.Test?secret=JBSWY3DPEHPK3PXP&issuer=Appoint';
    const png = await generateQRCode(uri);
    // PNG magic bytes: 137 80 78 71
    expect(png[0]).toBe(137);
    expect(png[1]).toBe(80);
    expect(png[2]).toBe(78);
    expect(png[3]).toBe(71);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/unit/auth/totp.test.ts`
Expected: FAIL — `generateTOTPUri` and `generateQRCode` not exported

- [ ] **Step 4: Implement generateTOTPUri and generateQRCode**

Add to `src/lib/auth/totp.ts`:

```typescript
import QRCode from 'qrcode';

export function generateTOTPUri(secret: string, label: string, issuer: string): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

export async function generateQRCode(uri: string): Promise<Uint8Array> {
  const dataUrl = await QRCode.toDataURL(uri, { width: 256, margin: 1 });
  // data:image/png;base64,<base64data>
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/auth/totp.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/auth/totp.ts tests/unit/auth/totp.test.ts
git commit -m "feat: add QR code generation to TOTP module"
```

---

### Task 2: Add sendImageBuffer to Telegram plugin

**Files:**
- Modify: `src/lib/messaging/telegram-plugin.ts`
- Test: `tests/unit/messaging/telegram-plugin.test.ts` (create if needed)

- [ ] **Step 1: Add sendImageBuffer method**

In `src/lib/messaging/telegram-plugin.ts`, add after the existing `sendImage` method:

```typescript
async sendImageBuffer(chatId: string, pngBytes: Uint8Array, caption?: string): Promise<boolean> {
  try {
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
  } catch (error) {
    console.error('Telegram send image buffer error:', error);
    return false;
  }
}
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 3: Run tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/messaging/telegram-plugin.ts
git commit -m "feat: add sendImageBuffer for binary photo delivery via Telegram"
```

---

### Task 3: DB migration + patient_auth interface update

**Files:**
- Create: `src/db/migrations/007-totp-patient.sql`
- Modify: `src/db/queries/patient-auth.ts`

- [ ] **Step 1: Create migration**

```sql
-- 007-totp-patient.sql
ALTER TABLE patient_auth ADD COLUMN totp_secret TEXT;
```

- [ ] **Step 2: Update PatientAuth interface in patient-auth.ts**

In `src/db/queries/patient-auth.ts`, find the `PatientAuth` interface and add:

```typescript
totp_secret: string | null;
```

- [ ] **Step 3: Run typecheck and tests**

```bash
npx tsc --noEmit
npx vitest run
```

- [ ] **Step 4: Commit**

```bash
git add src/db/migrations/007-totp-patient.sql src/db/queries/patient-auth.ts
git commit -m "feat: add totp_secret column to patient_auth"
```

---

### Task 4: Update doctor onboarding — QR code instead of plain text

**Files:**
- Modify: `src/lib/messaging/onboarding-flow.ts`

- [ ] **Step 1: Update DOCTOR_STEPS.PHONE handler to send QR code**

In the `DOCTOR_STEPS.PHONE` case (around line 231-253), replace the plain text secret message with QR code + fallback text:

```typescript
case DOCTOR_STEPS.PHONE:
  try {
    session.data.phone = normalizePhone(text);
  } catch (e: any) {
    await plugin.send(message.chatId, { text: `❌ Invalid phone number. Please enter a valid number:` });
    return;
  }

  const totpSecret = generateTOTPSecret();
  session.data.totpSecret = totpSecret;
  session.step = DOCTOR_STEPS.PHONE_VERIFY;

  const doctorUri = generateTOTPUri(totpSecret, `Dr.${session.data.name || 'Doctor'}`, 'Appoint');

  // Try to send QR code image
  try {
    const qrPng = await generateQRCode(doctorUri);
    await (plugin as any).sendImageBuffer(message.chatId, qrPng,
      '🔐 Scan this QR code with Google/Microsoft Authenticator'
    );
  } catch (e: any) {
    console.error('QR code send failed, falling back to text:', e);
  }

  // Always send text fallback
  await plugin.send(message.chatId, {
    text: `🔐 <b>Or enter manually:</b>\n\nSecret: <code>${totpSecret}</code>\nAccount: Dr.${session.data.name || 'Doctor'}\n\nThen enter the 6-digit code:`,
  });
  break;
```

Add imports at the top of the file (update existing TOTP import):
```typescript
import { generateTOTPSecret, generateTOTP, verifyTOTP, generateTOTPUri, generateQRCode } from '../../lib/auth/totp';
```

- [ ] **Step 2: Run typecheck and tests**

```bash
npx tsc --noEmit
npx vitest run
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/messaging/onboarding-flow.ts
git commit -m "feat: add QR code to doctor TOTP registration"
```

---

### Task 5: Update patient onboarding — TOTP+QR as default, SMS behind flag

**Files:**
- Modify: `src/lib/messaging/onboarding-flow.ts`

- [ ] **Step 1: Add isTwilioOTPEnabled import**

Add import at the top of `onboarding-flow.ts`:
```typescript
import { isTwilioOTPEnabled } from '../../lib/auth/feature-flags';
```

- [ ] **Step 2: Update PATIENT_STEPS.PHONE handler**

In the `PATIENT_STEPS.PHONE` case (around line 343-360), add TOTP branch:

```typescript
case PATIENT_STEPS.PHONE:
  try {
    session.data.phone = normalizePhone(text);
  } catch (e: any) {
    await plugin.send(message.chatId, { text: `❌ Invalid phone number. Please enter a valid number:` });
    return;
  }

  if (isTwilioOTPEnabled(this.env as any)) {
    // SMS OTP path (existing Twilio flow)
    try {
      if (this.otpRegistry) {
        const otp = await generateOTPSession(this.db, session.data.phone, 'sms');
        await this.otpRegistry.sendOTPWithFallback(session.data.phone, otp);
      }
    } catch (e: any) {
      console.error('OTP send error:', e);
    }
    session.step = PATIENT_STEPS.PHONE_VERIFY;
    await plugin.send(message.chatId, { text: '🔐 We sent a verification code to your phone. Enter the code:' });
  } else {
    // TOTP + QR code path (new default)
    const patientSecret = generateTOTPSecret();
    session.data.totpSecret = patientSecret;
    session.step = PATIENT_STEPS.PHONE_VERIFY;

    const patientUri = generateTOTPUri(patientSecret, session.data.name || 'Patient', 'Appoint');

    try {
      const qrPng = await generateQRCode(patientUri);
      await (plugin as any).sendImageBuffer(message.chatId, qrPng,
        '🔐 Scan this QR code with Google/Microsoft Authenticator'
      );
    } catch (e: any) {
      console.error('QR code send failed, falling back to text:', e);
    }

    await plugin.send(message.chatId, {
      text: `🔐 <b>Or enter manually:</b>\n\nSecret: <code>${patientSecret}</code>\n\nThen enter the 6-digit code:`,
    });
  }
  break;
```

- [ ] **Step 3: Update PATIENT_STEPS.PHONE_VERIFY handler**

```typescript
case PATIENT_STEPS.PHONE_VERIFY:
  if (isTwilioOTPEnabled(this.env as any)) {
    // SMS OTP verification
    try {
      if (this.otpRegistry) {
        await verifyOTP(this.db, session.data.phone, text.trim());
      }
    } catch (e: any) {
      await plugin.send(message.chatId, { text: `❌ ${e.message} Try again:` });
      return;
    }
  } else {
    // TOTP verification
    const patientSecret = session.data.totpSecret;
    if (!patientSecret) {
      await plugin.send(message.chatId, { text: '❌ Session error. Please start over with /register_patient' });
      return;
    }
    const valid = await verifyTOTP(patientSecret, text.trim());
    if (!valid) {
      await plugin.send(message.chatId, { text: '❌ Incorrect code. Try again:' });
      return;
    }
  }
  session.data.phone_verified = 1;
  session.step = PATIENT_STEPS.CONFIRM;
  await plugin.send(message.chatId, { text: '✅ Phone verified!' });
  await this.showPatientConfirmation(message, session, plugin);
  break;
```

- [ ] **Step 4: Update savePatient to store totp_secret**

In the `savePatient` method, find the `patient_auth` INSERT (around line 488-496). Add `totp_secret` to the columns and bind:

Current INSERT (approximate):
```sql
INSERT INTO patient_auth (id, name, phone, phone_verified, telegram_id, created_at)
VALUES (?, ?, ?, ?, ?, ?)
```

Update to:
```sql
INSERT INTO patient_auth (id, name, phone, phone_verified, totp_secret, telegram_id, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
```

Bind: add `session.data.totpSecret || null` before the telegram_id bind value.

- [ ] **Step 5: Run typecheck and tests**

```bash
npx tsc --noEmit
npx vitest run
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/messaging/onboarding-flow.ts
git commit -m "feat: patient TOTP+QR as default, SMS behind USE_TWILIO_OTP flag"
```

---

### Task 6: Integration verification + deploy

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 4: Deploy**

Run: `npx wrangler deploy`
Expected: Successful deployment

- [ ] **Step 5: Set secrets if needed**

Ensure `USE_TWILIO_OTP` is NOT set for TOTP to be default, or set `USE_TWILIO_OTP=true` to keep SMS as default for patients.
