/*
  Príprava vydaných faktúr pre export — položky, číslo opravovanej faktúry
  a odpočty záloh. Jedno miesto pre ručný export (`exportInvoicesFn`),
  prehľad „Rozdiely oproti Pohode“ a kontrolu pred odovzdaním, aby všetky
  skladali XML z rovnakých údajov.
*/

import type { PohodaNastavenia } from "./export.server";

type Klient = any;
type Riadok = Record<string, any>;

/** Predvolené kódy firmy pre vydané faktúry (Účtovníctvo → Predkontácie). */
export function nastaveniaFaktur(company: Riadok): PohodaNastavenia {
  return {
    predkontacia: company?.pohoda_predkontacia,
    predkontaciaZaloha: company?.pohoda_predkontacia_zaloha,
    predkontaciaDobropis: company?.pohoda_predkontacia_dobropis,
    clenenieDph: company?.pohoda_clenenie_dph,
    clenenieDphPdp: company?.pohoda_clenenie_dph_pdp,
    kvFaktura: company?.kv_clenenie_faktura,
    banka: company?.pohoda_banka,
    stredisko: company?.pohoda_stredisko,
    zamknuteDo: company?.locked_until,
    predkontaciaRozuctovat: company?.pohoda_predkontacia_rozuctovat,
  };
}

export async function pripravFaktury(
  supabase: Klient,
  companyId: string,
  invs: Riadok[],
): Promise<{
  bundle: { invoice: Riadok; items: Riadok[] }[];
  zalohy: Record<string, { cislo: string | null; zaklad: number; dph: number; sadzba: number }>;
}> {
  // Po dávkach a stránkach — pri stovkách faktúr je položiek viac než 1 000.
  const { riadkyPreIds } = await import("./strankovanie");
  const items = await riadkyPreIds<any>(
    invs.map((i) => i.id),
    (kus, zac, kon) =>
      supabase
        .from("invoice_items")
        .select("*")
        .in("invoice_id", kus)
        .order("invoice_id")
        .order("position")
        .order("id")
        .range(zac, kon),
  );

  // Dobropis a ťarchopis nesú len id opravovanej faktúry — formáty chcú jej číslo.
  const opravovaneIds = [
    ...new Set(invs.map((i) => i.opravuje_fakturu_id).filter(Boolean) as string[]),
  ];
  const cislaOpravovanych: Record<string, string> = {};
  if (opravovaneIds.length) {
    const { poDavkach } = await import("./strankovanie");
    const povodne = await poDavkach<any>(opravovaneIds as string[], (kus) =>
      supabase
        .from("invoices")
        .select("id, invoice_number")
        .eq("company_id", companyId)
        .in("id", kus),
    );
    for (const r of povodne) cislaOpravovanych[r.id] = r.invoice_number;
  }

  // Odpočty záloh na vyúčtovacích faktúrach (väzba v `invoice_advances`).
  const { nacitajOdpocty } = await import("./zalohy-odpocty.server");
  const { odpoctyZapisatelne, suhrnOdpoctov } = await import("./zalohy-odpocty");
  const odpocty = await nacitajOdpocty(
    supabase,
    companyId,
    invs.map((i) => i.id),
  );

  const { efakturaOdoslane } = await import("./efaktura-odoslana.server");
  const odoslane = await efakturaOdoslane(
    supabase,
    invs.map((i) => i.id),
  );

  const bundle = invs.map((invoice) => ({
    invoice: {
      ...invoice,
      _efakturaOdoslana: odoslane[invoice.id] ?? null,
      _opravujeCislo: invoice.opravuje_fakturu_id
        ? (cislaOpravovanych[invoice.opravuje_fakturu_id] ?? null)
        : null,
      _odpocty: odpocty[invoice.id] ?? null,
    },
    items: (items ?? []).filter((it: Riadok) => it.invoice_id === invoice.id),
  }));

  /*
    Pohoda berie odpočet ako jednu položku s jednou sadzbou — rovnako ako
    konektor; zálohy v rôznych sadzbách sa vynechajú a ozvú sa.
  */
  const zalohy: Record<
    string,
    { cislo: string | null; zaklad: number; dph: number; sadzba: number }
  > = {};
  for (const [id, zoz] of Object.entries(odpocty)) {
    if (!odpoctyZapisatelne(zoz)) continue;
    const s = suhrnOdpoctov(zoz);
    if (s.length !== 1) continue;
    zalohy[id] = {
      cislo: zoz.length === 1 ? zoz[0].zaloha : null,
      zaklad: s[0].zaklad,
      dph: s[0].dph,
      sadzba: s[0].sadzba,
    };
  }
  return { bundle, zalohy };
}

/**
 * Nastavenia pre prijaté doklady a prijaté faktúry — rovnaké ako pri
 * konektore (`zostavDavku`), vrátane kódov podľa kategórie a pokladne.
 */
export async function nastaveniaDokladovPohody(
  supabase: Klient,
  company: Riadok,
  doklady: Riadok[],
): Promise<PohodaNastavenia> {
  const { nastaveniaDokladov } = await import("./predkontacie.server");
  return {
    ...nastaveniaFaktur(company),
    ...(await nastaveniaDokladov(supabase, company, doklady)),
    predkontaciaPrijata: company?.pohoda_predkontacia_prijata,
    clenenieDphPrijata: company?.pohoda_clenenie_dph_prijata,
    predkontaciaDoklady: company?.pohoda_predkontacia_doklady,
    clenenieDphDoklady: company?.pohoda_clenenie_dph_doklady,
    kvFaktura: company?.kv_clenenie_faktura,
    kvPrijata: company?.kv_clenenie_prijata,
    kvDoklady: company?.kv_clenenie_doklady,
    blockyPodlaPlatby: company?.pohoda_blocky_agenda === "podla_platby",
    pokladna: company?.pohoda_pokladna,
    predkontaciaPokladna: company?.pohoda_predkontacia_pokladna,
    sklad: company?.pohoda_sklad,
  } as PohodaNastavenia;
}
