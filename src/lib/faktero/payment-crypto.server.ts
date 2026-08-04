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
  return createHash("sha256")
    .update("faktero:payment-secrets:v1:" + base)
    .digest();
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

export class DecryptError extends Error {
  code = "FAKTERO_DECRYPT_ERROR" as const;
  constructor(
    message = "Uložené prihlasovacie údaje nie je možné dešifrovať. Zadajte ich prosím znova.",
  ) {
    super(message);
    this.name = "DecryptError";
  }
}

export function isDecryptError(e: unknown): boolean {
  if (!e) return false;
  if (e instanceof DecryptError) return true;
  const msg = (e as any)?.message ? String((e as any).message) : "";
  const code = (e as any)?.code ? String((e as any).code) : "";
  return (
    code === "FAKTERO_DECRYPT_ERROR" ||
    /FAKTERO_DECRYPT_ERROR/i.test(msg) ||
    /Unsupported state or unable to authenticate data/i.test(msg) ||
    /unable to authenticate data/i.test(msg) ||
    /bad decrypt/i.test(msg)
  );
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
  let buf: Buffer;
  try {
    buf = Buffer.from(b64, "base64");
  } catch {
    throw new DecryptError();
  }
  if (buf.length < 29) throw new DecryptError();
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  for (const key of candidateKeys()) {
    try {
      const dec = createDecipheriv("aes-256-gcm", key, iv);
      dec.setAuthTag(tag);
      return Buffer.concat([dec.update(ct), dec.final()]).toString("utf8");
    } catch {
      // try next candidate
    }
  }
  throw new DecryptError();
}

export function canDecryptSecret(b64: string | null | undefined): boolean {
  if (!b64) return false;
  try {
    decryptSecret(b64);
    return true;
  } catch {
    return false;
  }
}

export function maskSecret(s: string | null | undefined): string | null {
  if (!s) return null;
  if (s.length <= 4) return "••••";
  return "••••" + s.slice(-4);
}
