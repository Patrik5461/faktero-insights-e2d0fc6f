/**
 * Lightweight analytics event tracker.
 * Pushes events to window.dataLayer for future GTM / Plausible / PostHog wiring.
 * No-op safe on server and when no analytics provider is installed.
 */
export type TrackEvent =
  | "registration_click"
  | "pricing_click"
  | "api_docs_click"
  | "contact_click"
  | "trial_start"
  | "faq_open"
  | "floating_cta_click";

export function track(event: TrackEvent, props?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    const w = window as unknown as { dataLayer?: Array<Record<string, unknown>> };
    w.dataLayer = w.dataLayer ?? [];
    w.dataLayer.push({ event, ...(props ?? {}) });
  } catch {
    /* swallow */
  }
}
