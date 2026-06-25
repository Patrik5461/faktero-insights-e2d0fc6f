/**
 * Peppol integration abstraction layer.
 *
 * NO real Peppol communication is implemented here. This file defines the
 * contract every future provider must satisfy (Storacle, Galaxy Gateway,
 * Pagero, custom Access Point, Digitálny poštár, etc.) so callers can stay
 * provider-agnostic.
 *
 * Wire-up flow once a real provider lands:
 *   1. Implement `EfakturaProvider` for the vendor.
 *   2. Register it via `registerEfakturaProvider("vendor", impl)`.
 *   3. Set `efaktura_profiles.peppol_provider` to that key.
 *   4. Call `getEfakturaProvider(profile)` from the delivery worker.
 *
 * Today only a `noopProvider` is registered so wiring is exercised end-to-end
 * without any external calls.
 */
import type {
  EfakturaChannel,
  EfakturaDeliveryStatus,
  EfakturaDocFormat,
} from "./types";

export type DeliveryRequest = {
  documentId: string;
  channel: EfakturaChannel;
  format: EfakturaDocFormat;
  xml: string;
  sender: { participantId: string; scheme: string };
  recipient: { participantId: string; scheme: string; endpointUrl?: string };
  metadata?: Record<string, string>;
};

export type DeliveryResult = {
  status: EfakturaDeliveryStatus;
  providerMessageId?: string;
  acceptedAt?: string;
  errorCode?: string;
  errorMessage?: string;
  raw?: unknown;
};

export type LookupResult = {
  participantId: string;
  scheme: string;
  supportedFormats: EfakturaDocFormat[];
  endpointUrl?: string;
  certificateValid?: boolean;
};

export type IncomingHandler = (raw: {
  xml: string;
  format: EfakturaDocFormat;
  channel: EfakturaChannel;
  sender?: { participantId?: string; scheme?: string };
  receivedAt: string;
  providerMessageId?: string;
}) => Promise<{ accepted: boolean; reason?: string }>;

export interface EfakturaProvider {
  readonly key: string;
  readonly supportedChannels: EfakturaChannel[];
  readonly supportedFormats: EfakturaDocFormat[];

  /** SMP lookup — confirm recipient is reachable and which formats they accept. */
  lookupParticipant(participantId: string, scheme: string): Promise<LookupResult | null>;

  /** Send an eFaktúra document. Implementations must be idempotent on documentId. */
  sendDocument(req: DeliveryRequest): Promise<DeliveryResult>;

  /** Optional: pull inbound documents (when a provider exposes a pull API). */
  fetchInbound?(handler: IncomingHandler): Promise<{ count: number }>;
}

const registry = new Map<string, EfakturaProvider>();

export function registerEfakturaProvider(provider: EfakturaProvider): void {
  registry.set(provider.key, provider);
}

export function getEfakturaProvider(key: string | null | undefined): EfakturaProvider {
  if (!key) return noopProvider;
  return registry.get(key) ?? noopProvider;
}

export function listEfakturaProviders(): EfakturaProvider[] {
  return Array.from(registry.values());
}

/** Placeholder provider — accepts requests but never actually sends. */
export const noopProvider: EfakturaProvider = {
  key: "noop",
  supportedChannels: ["peppol", "digitalny_postar", "email", "manual"],
  supportedFormats: ["ubl_2_1", "peppol_bis_3", "cii_d16b"],
  async lookupParticipant(participantId, scheme) {
    return {
      participantId,
      scheme,
      supportedFormats: ["peppol_bis_3"],
      certificateValid: false,
    };
  },
  async sendDocument(req) {
    return {
      status: "pending",
      providerMessageId: `noop_${req.documentId}`,
      errorMessage: "No Peppol access point configured — delivery is simulated.",
    };
  },
};

registerEfakturaProvider(noopProvider);