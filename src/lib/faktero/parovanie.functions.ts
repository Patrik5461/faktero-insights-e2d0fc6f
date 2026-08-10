import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sparuj, type Doklad, type Pohyb, type Zhoda } from "./parovanie";

/**
 * Párovanie bankových platieb s faktúrami — serverová časť.
 *
 * Rozhodovanie je v `parovanie.ts` a nemá prístup k databáze; tu sa len
 * načítajú podklady a zapíše výsledok. Zápis úhrady je jediné miesto, kde sa
 * mení stav faktúry, a robí sa cez `bank_transaction_id`, takže druhé spustenie
 * tú istú platbu nezapíše dvakrát.
 */

/** Koľko dozadu má zmysel hľadať. Staršie pohyby už banka ani nevydá. */
const DNI_DOZADU = 400;

async function overClena(ctx: any, companyId: string) {
  const { data } = await ctx.supabase.rpc("is_company_member", {
    _company_id: companyId,
    _user_id: ctx.userId,
  });
  if (!data) throw new Error("Nemáte prístup k firme.");
}

function cislo(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Podklady na párovanie: nespárované príchodzie platby a otvorené faktúry. */
async function podklady(supabase: any, companyId: string) {
  const od = new Date(Date.now() - DNI_DOZADU * 86400000).toISOString().slice(0, 10);

  const [{ data: txs }, { data: invs }] = await Promise.all([
    supabase
      .from("bank_transactions")
      .select(
        "id, booking_date, amount, currency, variable_symbol, counterparty, description, bank_account_id",
      )
      .eq("company_id", companyId)
      .is("matched_invoice_id", null)
      .gt("amount", 0)
      .gte("booking_date", od)
      .order("booking_date", { ascending: false })
      .limit(2000),
    supabase
      .from("invoices")
      .select(
        "id, invoice_number, variable_symbol, total, currency, status, issue_date, due_date, customer_name",
      )
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .not("status", "in", "(paid,cancelled,draft)")
      .limit(2000),
  ]);

  const faktury = invs ?? [];
  // Čiastočné úhrady sa musia odrátať, inak by faktúra po prvej splátke stále
  // pýtala celú sumu a druhá platba by na ňu nesadla.
  const uhradene = new Map<string, number>();
  if (faktury.length) {
    const { data: platby } = await supabase
      .from("payments")
      .select("invoice_id, amount")
      .eq("company_id", companyId)
      .in(
        "invoice_id",
        faktury.map((f: any) => f.id),
      );
    for (const p of platby ?? [])
      uhradene.set(p.invoice_id, cislo(uhradene.get(p.invoice_id)) + cislo(p.amount));
  }

  const pohyby: Pohyb[] = (txs ?? []).map((t: any) => ({
    id: t.id,
    booking_date: t.booking_date,
    amount: cislo(t.amount),
    currency: t.currency || "EUR",
    variable_symbol: t.variable_symbol,
    counterparty: t.counterparty,
    description: t.description,
  }));

  const doklady: Doklad[] = faktury.map((f: any) => ({
    id: f.id,
    invoice_number: f.invoice_number,
    variable_symbol: f.variable_symbol,
    total: cislo(f.total),
    uhradene: uhradene.get(f.id) ?? 0,
    currency: f.currency || "EUR",
    status: f.status,
    issue_date: f.issue_date,
    customer_name: f.customer_name,
  }));

  return { pohyby, doklady, txs: txs ?? [], faktury };
}

/** Zhoda doplnená o údaje, ktoré potrebuje stránka, aby sa dala prečítať. */
function obohat(z: Zhoda, txs: any[], faktury: any[]) {
  const t = txs.find((x) => x.id === z.transactionId);
  const f = faktury.find((x) => x.id === z.invoiceId);
  return {
    ...z,
    transakcia: t && {
      booking_date: t.booking_date,
      amount: cislo(t.amount),
      currency: t.currency || "EUR",
      variable_symbol: t.variable_symbol,
      counterparty: t.counterparty,
      description: t.description,
    },
    faktura: f && {
      invoice_number: f.invoice_number,
      total: cislo(f.total),
      currency: f.currency || "EUR",
      customer_name: f.customer_name,
      issue_date: f.issue_date,
      due_date: f.due_date,
      status: f.status,
    },
  };
}

export const navrhniParovanie = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ companyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await overClena(context, data.companyId);
    const { pohyby, doklady, txs, faktury } = await podklady(context.supabase, data.companyId);
    const { auto, navrhy } = sparuj(pohyby, doklady);
    return {
      auto: auto.map((z) => obohat(z, txs, faktury)),
      navrhy: navrhy.map((z) => obohat(z, txs, faktury)),
      /** Koľko platieb sa nepodarilo priradiť k ničomu. */
      bezZhody: pohyby.length - auto.length - navrhy.length,
      otvorenychFaktur: doklady.length,
    };
  });

const ZapisSchema = z.object({
  companyId: z.string().uuid(),
  pary: z
    .array(
      z.object({
        transactionId: z.string().uuid(),
        invoiceId: z.string().uuid(),
        suma: z.number().positive(),
      }),
    )
    .min(1)
    .max(500),
});

/**
 * Zapíše úhrady. Faktúra sa označí za uhradenú, až keď je pokrytá celá —
 * čiastočná platba ju nechá otvorenú so zvyškom.
 */
export const potvrdParovanie = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => ZapisSchema.parse(d))
  .handler(async ({ data, context }) => {
    await overClena(context, data.companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let zapisanych = 0;
    let uhradenych = 0;
    const preskocene: string[] = [];

    for (const par of data.pary) {
      // Obe strany musia patriť tejto firme — id prišlo zo stránky.
      const [{ data: tx }, { data: inv }] = await Promise.all([
        supabaseAdmin
          .from("bank_transactions")
          .select("id, amount, company_id, matched_invoice_id, booking_date")
          .eq("id", par.transactionId)
          .eq("company_id", data.companyId)
          .maybeSingle(),
        supabaseAdmin
          .from("invoices")
          .select("id, company_id, total, status, invoice_number")
          .eq("id", par.invoiceId)
          .eq("company_id", data.companyId)
          .is("deleted_at", null)
          .maybeSingle(),
      ]);
      if (!tx || !inv) {
        preskocene.push("Platba alebo faktúra sa nenašla.");
        continue;
      }
      if (tx.matched_invoice_id) {
        preskocene.push("Platba už je spárovaná.");
        continue;
      }

      // Nikdy sa nezapíše viac, než z účtu naozaj prišlo.
      const suma = Math.min(par.suma, cislo(tx.amount));
      if (suma <= 0) {
        preskocene.push("Platba nemá kladnú sumu.");
        continue;
      }

      const { error: chyba } = await supabaseAdmin.from("payments").insert({
        company_id: data.companyId,
        invoice_id: inv.id,
        amount: suma,
        paid_at: tx.booking_date,
        method: "bank",
        note: `Bankový pohyb ${tx.booking_date}`,
        bank_transaction_id: tx.id,
      });
      if (chyba) {
        // 23505 = jedinečný index na bank_transaction_id, čiže platbu už
        // medzitým zapísal niekto iný.
        preskocene.push(
          chyba.code === "23505" ? "Platba už bola zapísaná." : `Úhrada: ${chyba.message}`,
        );
        continue;
      }
      zapisanych++;

      await supabaseAdmin
        .from("bank_transactions")
        .update({ matched_invoice_id: inv.id })
        .eq("id", tx.id);

      const { data: vsetky } = await supabaseAdmin
        .from("payments")
        .select("amount")
        .eq("invoice_id", inv.id);
      const spolu = (vsetky ?? []).reduce((s, p: any) => s + cislo(p.amount), 0);

      if (spolu >= cislo(inv.total) - 0.005 && inv.status !== "paid") {
        await supabaseAdmin
          .from("invoices")
          .update({ status: "paid", paid_at: new Date(tx.booking_date).toISOString() })
          .eq("id", inv.id);
        uhradenych++;
      }
    }

    return { zapisanych, uhradenych, preskocene };
  });

/**
 * Automatické spárovanie — zapíše len to, čo je isté (sedí VS aj suma).
 * Zvyšok vráti ako návrhy na rozhodnutie.
 */
export const sparujAutomaticky = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ companyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await overClena(context, data.companyId);
    const { pohyby, doklady } = await podklady(context.supabase, data.companyId);
    const { auto, navrhy } = sparuj(pohyby, doklady);
    if (auto.length === 0) return { zapisanych: 0, uhradenych: 0, navrhov: navrhy.length };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let zapisanych = 0;
    let uhradenych = 0;

    for (const z of auto) {
      const { error } = await supabaseAdmin.from("payments").insert({
        company_id: data.companyId,
        invoice_id: z.invoiceId,
        amount: z.suma,
        paid_at: pohyby.find((p) => p.id === z.transactionId)?.booking_date,
        method: "bank",
        note: "Automaticky spárované s bankovým pohybom",
        bank_transaction_id: z.transactionId,
      });
      if (error) continue;
      zapisanych++;
      await supabaseAdmin
        .from("bank_transactions")
        .update({ matched_invoice_id: z.invoiceId })
        .eq("id", z.transactionId);
      if (!z.ciastocna) {
        await supabaseAdmin
          .from("invoices")
          .update({
            status: "paid",
            paid_at: new Date(
              pohyby.find((p) => p.id === z.transactionId)?.booking_date ?? Date.now(),
            ).toISOString(),
          })
          .eq("id", z.invoiceId);
        uhradenych++;
      }
    }

    return { zapisanych, uhradenych, navrhov: navrhy.length };
  });

/**
 * Vrátenie párovania. Úhrada sa zmaže a faktúra sa vráti medzi otvorené —
 * inak by sa omyl nedal opraviť inak než v databáze.
 */
export const zrusParovanie = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ companyId: z.string().uuid(), transactionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await overClena(context, data.companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: tx } = await supabaseAdmin
      .from("bank_transactions")
      .select("id, matched_invoice_id")
      .eq("id", data.transactionId)
      .eq("company_id", data.companyId)
      .maybeSingle();
    if (!tx?.matched_invoice_id) throw new Error("Platba nie je spárovaná.");

    const invoiceId = tx.matched_invoice_id;
    await supabaseAdmin
      .from("payments")
      .delete()
      .eq("bank_transaction_id", tx.id)
      .eq("company_id", data.companyId);
    await supabaseAdmin
      .from("bank_transactions")
      .update({ matched_invoice_id: null })
      .eq("id", tx.id);

    const { data: inv } = await supabaseAdmin
      .from("invoices")
      .select("id, total, status")
      .eq("id", invoiceId)
      .maybeSingle();
    if (inv) {
      const { data: zvysne } = await supabaseAdmin
        .from("payments")
        .select("amount")
        .eq("invoice_id", inv.id);
      const spolu = (zvysne ?? []).reduce((s, p: any) => s + cislo(p.amount), 0);
      if (spolu < cislo(inv.total) - 0.005 && inv.status === "paid") {
        // Späť na „vystavená" — stav „po splatnosti" sa nikde inde v aplikácii
        // nezapisuje, počíta sa z dátumu splatnosti až pri zobrazení.
        await supabaseAdmin
          .from("invoices")
          .update({ status: "issued", paid_at: null })
          .eq("id", inv.id);
      }
    }

    return { ok: true };
  });
