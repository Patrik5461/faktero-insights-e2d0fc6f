import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Bankové pohyby pre mobilnú aplikáciu.
 *
 * Nesiaha na API banky — číta to, čo už denné sťahovanie uložilo
 * (`bank-sync.server.ts`). Telefón sa tak nikdy nečaká na banku a otázka
 * „prišli peniaze?" má odpoveď hneď. Naostro z banky sa ťahá len na vyžiadanie
 * tlačidlom, a to cez `syncBankTransactions`.
 *
 * Číta sa klientom prihláseného používateľa, takže platia politiky RLS —
 * cudziu firmu dotaz nevráti, aj keby prišlo cudzie `company_id`.
 */

const Vstup = z.object({
  company_id: z.string().uuid(),
  /** Bez neho sa vracajú pohyby zo všetkých účtov firmy. */
  account_id: z.string().uuid().optional(),
  limit: z.number().min(1).max(200).default(60),
});

export const bankaPrehladFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Vstup.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    let dotazPohyby = supabase
      .from("bank_transactions")
      .select(
        "id, bank_account_id, booking_date, amount, currency, variable_symbol, counterparty, description, matched_invoice_id, invoices:matched_invoice_id (invoice_number)",
      )
      .eq("company_id", data.company_id)
      // Dva stĺpce: v jeden deň chodí pohybov viac a samotný dátum ich nezoradí.
      .order("booking_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.account_id) dotazPohyby = dotazPohyby.eq("bank_account_id", data.account_id);

    const [ucty, pohyby] = await Promise.all([
      supabase
        .from("bank_accounts")
        .select("id, iban, account_name, currency, balance, last_synced_at")
        .eq("company_id", data.company_id)
        .order("created_at", { ascending: true }),
      dotazPohyby,
    ]);

    return {
      ucty: (ucty.data ?? []).map((u) => ({
        id: u.id as string,
        iban: (u.iban as string | null) ?? null,
        nazov: (u.account_name as string | null) ?? null,
        mena: (u.currency as string | null) ?? "EUR",
        zostatok: u.balance === null || u.balance === undefined ? null : Number(u.balance),
        synchronizovane: (u.last_synced_at as string | null) ?? null,
      })),
      pohyby: (pohyby.data ?? []).map((p: any) => ({
        id: p.id as string,
        ucet_id: p.bank_account_id as string,
        datum: p.booking_date as string,
        suma: Number(p.amount),
        mena: (p.currency as string | null) ?? "EUR",
        vs: (p.variable_symbol as string | null) ?? null,
        protistrana: (p.counterparty as string | null) ?? null,
        popis: (p.description as string | null) ?? null,
        faktura: (p.invoices?.invoice_number as string | null) ?? null,
      })),
    };
  });
