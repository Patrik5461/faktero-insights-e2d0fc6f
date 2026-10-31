import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { posliPokusWebhooku } from "./webhook-odoslanie.server";
import { ZAMOK_POKUSU_MS, poNeuspechu } from "./webhook-opakovanie";

export type FakteroEvent =
  | "invoice.created"
  | "invoice.sent"
  | "invoice.paid"
  | "invoice.cancelled"
  | "customer.created"
  | "efaktura.received"
  | "bank_transaction.created";

export async function triggerEvent(opts: {
  company_id: string;
  event: FakteroEvent;
  data: Record<string, any>;
  /** Upozornenie do telefónu; vypína ho fronta, keď ho už poslala synchronizácia banky. */
  push?: boolean;
}) {
  const { data: hooks } = await supabaseAdmin
    .from("webhooks")
    .select("id, url, secret, events, active")
    .eq("company_id", opts.company_id);
  // Fire-and-forget push notifikácia (samostatne od webhookov)
  try {
    const { sendPush } = await import("./push.server");
    if (opts.event === "invoice.paid" && opts.push !== false) {
      const inv = opts.data as any;
      await sendPush({
        company_id: opts.company_id,
        title: "Faktúra zaplatená 💰",
        body: `Faktúra ${inv.invoice_number ?? ""} bola označená ako uhradená.`,
        // Payload z `invoicePayload` nesie `invoice_id`, nie `id` — bez neho viedlo
        // upozornenie na /faktury/undefined.
        data: {
          path: `/faktury/${inv.invoice_id ?? inv.id}`,
          invoice_id: String(inv.invoice_id ?? inv.id ?? ""),
        },
      });
    } else if (opts.event === "efaktura.received") {
      const d = opts.data as any;
      await sendPush({
        company_id: opts.company_id,
        title: "Nová eFaktúra 📄",
        body: `Prijatá eFaktúra od ${d.supplier_name ?? "dodávateľa"}.`,
        data: { path: `/efaktura/prijate`, doc_id: String(d.id ?? "") },
      });
    }
  } catch (e) {
    console.warn("[push] send failed:", e);
  }

  if (!hooks?.length) return;

  const payload = {
    event: opts.event,
    created_at: new Date().toISOString(),
    data: opts.data,
  };
  const body = JSON.stringify(payload);

  const tasks = hooks
    .filter((h: any) => h.active && (h.events?.includes(opts.event) || h.events?.includes("*")))
    .map(async (h: any) => {
      // Riadok sa založí rovno so zámkom — cron ho počas prvého pokusu nevezme.
      const teraz = Date.now();
      const { data: logRow } = await supabaseAdmin
        .from("webhook_delivery_logs")
        .insert({
          company_id: opts.company_id,
          webhook_id: h.id,
          event_type: opts.event,
          payload,
          status: "pending",
          attempt_count: 0,
          next_attempt_at: new Date(teraz).toISOString(),
          sending_until: new Date(teraz + ZAMOK_POKUSU_MS).toISOString(),
        } as any)
        .select("id, attempt_count")
        .single();
      if (!logRow) return;
      await dorucZaznam({ id: logRow.id, attempt_count: 0, event_type: opts.event, payload }, h);
    });

  // Fire-and-forget but don't lose errors silently
  await Promise.allSettled(tasks);
}

type ZaznamDorucenia = {
  id: string;
  attempt_count: number;
  event_type: string;
  payload: unknown;
};
type Webhook = { id: string; url: string; secret: string | null; active: boolean };

/**
 * Jeden pokus pre už zabratý riadok (`sending_until` drží volajúci) a zápis
 * výsledku: úspech, ďalší pokus podľa rozvrhu, alebo vzdané.
 */
export async function dorucZaznam(z: ZaznamDorucenia, hook: Webhook) {
  const pokus = (z.attempt_count ?? 0) + 1;
  const r = await posliPokusWebhooku({
    url: hook.url,
    secret: hook.secret,
    event: z.event_type,
    // Telo je pri každom pokuse to isté — aj čas `created_at` v ňom je čas udalosti.
    body: JSON.stringify(z.payload),
    dorucenieId: z.id,
    pokus,
  });
  const teraz = new Date();
  const zaklad = {
    attempt_count: pokus,
    response_status: r.status,
    response_body: r.body,
    error_message: r.chyba,
    duration_ms: r.trvanieMs,
    last_attempt_at: teraz.toISOString(),
    sending_until: null,
  };
  const zmena = r.ok
    ? { ...zaklad, status: "success", next_attempt_at: null }
    : { ...zaklad, ...poNeuspechu(pokus, teraz) };
  await supabaseAdmin
    .from("webhook_delivery_logs")
    .update(zmena as any)
    .eq("id", z.id);
  return { ...r, status: zmena.status as string, pokus, http: r.status };
}

/**
 * Zaberie riadok na pokus. Vráti ho len vtedy, keď ho nikto iný práve
 * neposiela — cron a tlačidlo „Poslať znova“ sa tak nikdy neprekryjú.
 */
async function zaberZaznam(id: string, opts: { len_na_rade: boolean; stavy: string[] }) {
  const teraz = new Date();
  let q = supabaseAdmin
    .from("webhook_delivery_logs")
    .update({ sending_until: new Date(teraz.getTime() + ZAMOK_POKUSU_MS).toISOString() } as any)
    .eq("id", id)
    .in("status", opts.stavy)
    .or(`sending_until.is.null,sending_until.lt."${teraz.toISOString()}"`);
  if (opts.len_na_rade) q = q.lte("next_attempt_at", teraz.toISOString());
  const { data } = await q.select("id, company_id, webhook_id, event_type, payload, attempt_count");
  return (
    (data?.[0] as (ZaznamDorucenia & { company_id: string; webhook_id: string }) | undefined) ??
    null
  );
}

async function nacitajWebhook(id: string): Promise<Webhook | null> {
  const { data } = await supabaseAdmin
    .from("webhooks")
    .select("id, url, secret, active")
    .eq("id", id)
    .maybeSingle();
  return (data as Webhook | null) ?? null;
}

/** Webhook medzitým vypli — ďalej sa neskúša, ale nie je to porucha prijímateľa. */
async function ukonciPreVypnutyWebhook(id: string) {
  await supabaseAdmin
    .from("webhook_delivery_logs")
    .update({
      status: "failed",
      next_attempt_at: null,
      sending_until: null,
      error_message: "Webhook je vypnutý — doručenie sa ďalej neopakuje.",
    } as any)
    .eq("id", id);
}

/**
 * Cron: doručenia, ktorým nadišiel čas ďalšieho pokusu (aj tie, ktorých
 * prvý pokus prerušil pád procesu — po vypršaní zámku).
 */
export async function spracujOpakovaniaWebhookov(opts: { dokedy?: number } = {}) {
  const dokedy = opts.dokedy ?? Date.now() + 40_000;
  const teraz = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("webhook_delivery_logs")
    .select("id")
    .in("status", ["pending", "retrying"])
    .lte("next_attempt_at", teraz)
    .or(`sending_until.is.null,sending_until.lt."${teraz}"`)
    .order("next_attempt_at")
    .limit(100);
  if (error) throw new Error(error.message);
  const hooky = new Map<string, Promise<Webhook | null>>();
  let dorucenych = 0;
  let neuspesnych = 0;
  const riadky = (data ?? []) as { id: string }[];
  for (let i = 0; i < riadky.length; i += 5) {
    if (Date.now() > dokedy) break;
    await Promise.all(
      riadky.slice(i, i + 5).map(async ({ id }) => {
        const z = await zaberZaznam(id, { len_na_rade: true, stavy: ["pending", "retrying"] });
        if (!z) return;
        if (!hooky.has(z.webhook_id)) hooky.set(z.webhook_id, nacitajWebhook(z.webhook_id));
        const hook = await hooky.get(z.webhook_id)!;
        if (!hook?.active) return ukonciPreVypnutyWebhook(z.id);
        const r = await dorucZaznam(z, hook);
        if (r.ok) dorucenych++;
        else neuspesnych++;
      }),
    );
  }
  return { na_rade: riadky.length, dorucenych, neuspesnych };
}

/**
 * „Poslať znova“ z nastavení — hneď jeden pokus pre opakované alebo vzdané
 * doručenie, s tým istým `Idempotency-Key` ako predtým. Úspešné sa znova
 * neposiela: prijímateľ ho už má.
 */
export async function posliWebhookZnova(id: string) {
  const z = await zaberZaznam(id, { len_na_rade: false, stavy: ["retrying", "failed"] });
  if (!z) {
    const { data } = await supabaseAdmin
      .from("webhook_delivery_logs")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (data?.status === "success") throw new Error("Udalosť už bola doručená.");
    throw new Error("Doručenie práve prebieha — skúste to o chvíľu.");
  }
  const hook = await nacitajWebhook(z.webhook_id);
  if (!hook) throw new Error("Webhook už neexistuje");
  if (!hook.active) {
    await supabaseAdmin
      .from("webhook_delivery_logs")
      .update({ sending_until: null } as any)
      .eq("id", z.id);
    throw new Error("Webhook je vypnutý.");
  }
  return dorucZaznam(z, hook);
}

/** Build a standard invoice payload */
export function invoicePayload(inv: any) {
  return {
    invoice_id: inv.id,
    invoice_number: inv.invoice_number,
    status: inv.status,
    total: Number(inv.total),
    currency: inv.currency,
    external_id: inv.external_id ?? null,
    customer_id: inv.customer_id ?? null,
    customer_name: inv.customer_name,
    customer_email: inv.customer_email,
  };
}

export function customerPayload(cust: any) {
  return {
    customer_id: cust.id,
    name: cust.name,
    email: cust.email,
    ico: cust.ico,
    external_id: cust.external_id ?? null,
  };
}
