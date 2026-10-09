/*
  Automatický import objednávok zo Shoptetu (hook každú hodinu). Pre firmy so
  zapnutým `auto_import` vystaví faktúry z objednávok vytvorených od zapnutia
  v zvolených stavoch (napr. „Vybavená"). Faktúra sa vystaví rovnako ako ručne
  zo stránky; tú istú objednávku druhýkrát nefakturuje (external_id).
*/
const MAX_NA_FIRMU = 30;

export async function spustiAutoImportShoptetu(): Promise<{
  firmy: number;
  faktury: number;
  chyby: number;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { shoptetApi } = await import("./shoptet.server");
  const { fakturaZObjednavky } = await import("./shoptet");
  const { vytvorFakturu } = await import("./vytvor-fakturu.server");
  const { decryptSecret } = await import("./payment-crypto.server");
  const { data: napojenia } = await supabaseAdmin
    .from("shoptet_napojenia")
    .select("company_id, token_sifrovany, auto_stavy, auto_od")
    .eq("auto_import", true);
  let faktury = 0;
  let chyby = 0;
  for (const n of napojenia ?? []) {
    let chyba: string | null = null;
    let vystavene = 0;
    try {
      if (!n.auto_od || !n.auto_stavy?.length) continue;
      const token = decryptSecret(n.token_sifrovany);
      const od = new Date(n.auto_od).toISOString().slice(0, 19) + "+0000";
      const kody = new Set<string>();
      for (const stav of n.auto_stavy) {
        for (let strana = 1; strana <= 4; strana++) {
          const d = await shoptetApi<any>(
            token,
            `/api/orders?creationTimeFrom=${encodeURIComponent(od)}&statusId=${stav}&itemsPerPage=50&page=${strana}`,
          );
          for (const o of d?.orders ?? []) kody.add(String(o.code));
          if (!d?.paginator || strana >= d.paginator.pageCount) break;
        }
      }
      if (!kody.size) continue;
      const { data: hotove } = await supabaseAdmin
        .from("invoices")
        .select("external_id")
        .eq("company_id", n.company_id)
        .in(
          "external_id",
          [...kody].map((k) => `shoptet:${k}`),
        );
      const uz = new Set((hotove ?? []).map((f) => f.external_id));
      for (const kod of [...kody].filter((k) => !uz.has(`shoptet:${k}`)).slice(0, MAX_NA_FIRMU)) {
        try {
          const o = await shoptetApi<any>(token, `/api/orders/${encodeURIComponent(kod)}`);
          const vstup = fakturaZObjednavky(o.order);
          if (!vstup.items.length) throw new Error("objednávka nemá položku s cenou");
          const v = await vytvorFakturu(supabaseAdmin, n.company_id, vstup);
          if (!v.ok) throw new Error(v.sprava);
          if (v.nova && o.order?.paid === true)
            await supabaseAdmin
              .from("invoices")
              .update({ status: "paid", paid_at: new Date().toISOString() })
              .eq("id", v.faktura.id);
          if (v.nova) vystavene++;
        } catch (e: any) {
          chyby++;
          chyba = `${kod}: ${String(e?.message ?? e).slice(0, 200)}`;
        }
      }
    } catch (e: any) {
      chyby++;
      chyba = String(e?.message ?? e).slice(0, 300);
    }
    faktury += vystavene;
    await supabaseAdmin
      .from("shoptet_napojenia")
      .update({ posledny_import_at: new Date().toISOString(), posledna_chyba: chyba })
      .eq("company_id", n.company_id);
  }
  return { firmy: napojenia?.length ?? 0, faktury, chyby };
}
