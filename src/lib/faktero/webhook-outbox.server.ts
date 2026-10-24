/**
 * Doručenie webhookov z fronty `webhook_outbox`.
 *
 * Udalosti „faktúra uhradená“ a „nový bankový pohyb“ zapisuje databázový
 * spúšťač — faktúra sa dá uhradiť z desiatky miest (párovanie s bankou,
 * hromadné označenie, API, detail, e-shop) a každé by inak muselo na webhook
 * pamätať samo. Predtým naň pamätali len dve a integrátor sa o úhrade z banky
 * nedozvedel vôbec.
 *
 * Cron to volá každú minútu; API `mark-paid` hneď po zmene, aby odpoveď
 * a webhook prišli spolu ako doteraz.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { invoicePayload, triggerEvent } from "./webhook-trigger.server";
import { nazovBanky } from "./banka-z-iban";

const DAVKA = 200;
const MAX_POKUSOV = 5;
/** Beh sa zastaví skôr, než ho odstrihne časový limit cronu. */
const MAX_TRVANIE_MS = 45_000;

type Riadok = {
  id: number;
  company_id: string;
  event: string;
  entity_id: string;
  attempts: number;
};

async function payloadPohybu(id: string) {
  const { data: t } = await supabaseAdmin
    .from("bank_transactions")
    .select(
      "id, bank_account_id, booking_date, amount, currency, variable_symbol, counterparty, description, transaction_reference, matched_invoice_id, matched_purchase_invoice_id, matched_expense_id, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!t) return null;
  let iban: string | null = null;
  let bankName: string | null = null;
  if (t.bank_account_id) {
    const { data: u } = await supabaseAdmin
      .from("bank_accounts")
      .select("iban, bank_connections(provider)")
      .eq("id", t.bank_account_id)
      .maybeSingle();
    iban = (u?.iban as string | null) ?? null;
    bankName = nazovBanky(iban, (u as any)?.bank_connections?.provider);
  }
  // Rovnaký tvar ako položka z GET /api/v1/bank-transactions.
  return { ...t, iban, bank_name: bankName };
}

async function dorucJednu(r: Riadok) {
  if (r.event === "invoice.paid") {
    const { data: inv } = await supabaseAdmin
      .from("invoices")
      .select("*")
      .eq("id", r.entity_id)
      .maybeSingle();
    if (!inv) return;
    // Úhradu z banky ohlási do telefónu už synchronizácia (`oznamUhradu`) — druhé upozornenie by bolo navyše.
    const { data: pohyb } = await supabaseAdmin
      .from("bank_transactions")
      .select("id")
      .eq("matched_invoice_id", r.entity_id)
      .limit(1)
      .maybeSingle();
    await triggerEvent({
      company_id: r.company_id,
      event: "invoice.paid",
      data: {
        ...invoicePayload(inv),
        paid_at: inv.paid_at ?? null,
        bank_transaction_id: (pohyb?.id as string | undefined) ?? null,
      },
      push: !pohyb,
    });
    return;
  }
  if (r.event === "bank_transaction.created") {
    const data = await payloadPohybu(r.entity_id);
    if (!data) return;
    await triggerEvent({ company_id: r.company_id, event: "bank_transaction.created", data });
  }
}

/** Spracuje čakajúce udalosti; s `entityId` len tú jednu (API mark-paid). */
export async function spracujWebhookOutbox(opts: { entityId?: string } = {}) {
  const zaciatok = Date.now();
  let q = supabaseAdmin
    .from("webhook_outbox")
    .select("id, company_id, event, entity_id, attempts")
    .is("processed_at", null)
    .lt("attempts", MAX_POKUSOV)
    .order("id")
    .limit(DAVKA);
  if (opts.entityId) q = q.eq("entity_id", opts.entityId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  let dorucenych = 0;
  let chyb = 0;
  const riadky = (data ?? []) as Riadok[];
  // Po piatich naraz — každý webhook čaká na odpoveď prijímateľa až 10 s.
  for (let i = 0; i < riadky.length; i += 5) {
    if (Date.now() - zaciatok > MAX_TRVANIE_MS) break;
    await Promise.all(
      riadky.slice(i, i + 5).map(async (r) => {
        // Najprv sa riadok zaberie — keby sa cron prekryl s API, webhook nesmie odísť dvakrát.
        const { data: zabrate } = await supabaseAdmin
          .from("webhook_outbox")
          .update({ processed_at: new Date().toISOString(), attempts: r.attempts + 1 })
          .eq("id", r.id)
          .is("processed_at", null)
          .select("id");
        if (!zabrate?.length) return;
        try {
          await dorucJednu(r);
          dorucenych++;
        } catch (e: any) {
          chyb++;
          // Vrátiť do fronty — skúsi sa pri ďalšom behu, najviac päťkrát.
          await supabaseAdmin
            .from("webhook_outbox")
            .update({ processed_at: null, error: String(e?.message ?? e).slice(0, 500) })
            .eq("id", r.id);
        }
      }),
    );
  }
  return { cakalo: riadky.length, dorucenych, chyb };
}
