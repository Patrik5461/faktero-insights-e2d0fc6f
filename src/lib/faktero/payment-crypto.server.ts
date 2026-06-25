/**
 * AES-256-GCM helpers for per-company payment provider secrets.
 * Encryption key candidates (in priority order):
 *   1. PAYMENT_SECRETS_KEY  (preferred, dedicated)
 *   2. SUPABASE_SERVICE_ROLE_KEY  (legacy fallback for backward compat)
 * Encrypt always uses the first available key.
 * Decrypt tries every candidate so secrets encrypted with the legacy key keep
 * working after PAYMENT_SECRETS_KEY is introduced.
 * Server-only — never import from client code.
 */
import { createHash, createCipheriv, createDecipheriv, randomBytes } from "crypto";

function deriveKey(base: string): Buffer {
  return createHash("sha256").update("faktero:payment-secrets:v1:" + base).digest();
}

function candidateKeys(): Buffer[] {
  const out: Buffer[] = [];
  const dedicated = process.env.PAYMENT_SECRETS_KEY;
  const legacy = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (dedicated) out.push(deriveKey(dedicated));
  if (legacy && legacy !== dedicated) out.push(deriveKey(legacy));
  if (!out.length) throw new Error("Encryption key not configured");
  return out;
}

export function hasPaymentSecretsKey(): boolean {
  return !!process.env.PAYMENT_SECRETS_KEY;
}

export function encryptSecret(plain: string): string {
  const key = candidateKeys()[0];
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decryptSecret(b64: string): string {
  const buf = Buffer.from(b64, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  let lastErr: unknown = null;
  for (const key of candidateKeys()) {
    try {
      const dec = createDecipheriv("aes-256-gcm", key, iv);
      dec.setAuthTag(tag);
      return Buffer.concat([dec.update(ct), dec.final()]).toString("utf8");
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Decryption failed");
}

export function maskSecret(s: string | null | undefined): string | null {
  if (!s) return null;
  if (s.length <= 4) return "••••";
  return "••••" + s.slice(-4);
}