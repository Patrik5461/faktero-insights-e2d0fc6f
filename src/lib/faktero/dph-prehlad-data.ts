/*
  Doklady pre DPH prehľad za obdobie — jedno načítanie pre stránku
  `uctovnictvo/dph` (prehliadač) aj pre hlasové ovládanie (server, klient
  prihláseného). Výber je rovnaký ako vo výkaze: vystavené podľa dňa dane,
  prijaté podľa dňa odpočtu, bez zálohových a bez faktúr iného odberateľa.
*/
import { riadkyPreIds, vsetkoAkoData } from "./strankovanie";
import {
  denDaneVystavenej,
  denOdpoctuPrijatej,
  filterDatumovObdobia,
  vObdobi,
  vstupPrehladu,
  vystupPrehladu,
} from "./dph-prehlad";
import { zapocitatelna } from "./samofakturacia";
import type { KrajinaDane } from "./vat-rates";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Klient = any;

export type DokladyDphObdobia = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invoices: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  purchases: any[];
};

/** Po stránkach — Supabase vráti najviac 1 000 riadkov a zvyšok by v prehľade ticho chýbal. */
export async function nacitajDokladyDph(
  sb: Klient,
  cid: string,
  od: string,
  doDna: string,
): Promise<DokladyDphObdobia> {
  const [{ data: invs }, { data: purch }] = await Promise.all([
    vsetkoAkoData((zac, kon) =>
      sb
        .from("invoices")
        .select(
          "id, invoice_number, issue_date, delivery_date, datum_dph, opravuje_fakturu_id, customer_name, subtotal, vat_total, total, currency, exchange_rate, status, reverse_charge, type",
        )
        .eq("company_id", cid)
        // Hrubý výber podľa oboch dátumov; do obdobia ho presne zaradí
        // `denDaneVystavenej` — rovnako ako priznanie (dátum dodania).
        .or(filterDatumovObdobia(["issue_date", "delivery_date", "datum_dph"], od, doDna))
        .is("deleted_at", null)
        .neq("status", "draft")
        .neq("status", "cancelled")
        // Zálohová faktúra je výzva na zaplatenie preddavku, nie zdaniteľné
        // plnenie — do priznania nepatrí. Plnenie prizná až vyúčtovacia
        // faktúra, inak by tá istá suma bola v prehľade dvakrát.
        .neq("type", "proforma")
        .order("issue_date", { ascending: true })
        .order("id")
        .range(zac, kon),
    ),
    vsetkoAkoData((zac, kon) =>
      sb
        .from("purchase_invoices")
        .select(
          "id, invoice_number, issue_date, delivery_date, received_date, datum_dph, dph_rezim, reverse_charge, opravuje_cislo, supplier_name, amount_without_vat, vat_amount, amount_total, currency, amount_without_vat_eur, vat_amount_eur, vat_breakdown, samofakturacia, samofakturacia_stav",
        )
        .eq("company_id", cid)
        .or(
          filterDatumovObdobia(["issue_date", "delivery_date", "received_date", "datum_dph"], od, doDna),
        )
        .is("deleted_at", null)
        // Ako výkaz: prijatá zálohová nie je daňový doklad a faktúra iného
        // odberateľa (nepotvrdená) do odpočtu nejde. Daňový doklad
        // k prijatej platbe (DPH zo zaplatenej zálohy) áno.
        .in("type", ["regular", "advance_payment"])
        .is("odberatel_nesedi", null)
        .order("issue_date", { ascending: true })
        .order("id")
        .range(zac, kon),
    ),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vystaveneVObdobi = (invs ?? []).filter((i: any) => vObdobi(denDaneVystavenej(i), od, doDna));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const idVObdobi = new Set(vystaveneVObdobi.map((i: any) => i.id as string));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const itms = await riadkyPreIds<any>([...idVObdobi] as string[], (kus, zac, kon) =>
    sb
      .from("invoice_items")
      .select("id, invoice_id, subtotal, vat_amount, vat_rate")
      .in("invoice_id", kus)
      .order("id")
      .range(zac, kon),
  );
  return {
    invoices: vystaveneVObdobi,
    items: itms.filter((it) => idVObdobi.has(it.invoice_id)),
    purchases: (purch ?? []).filter(
      // Samofaktúra sa odpočíta až po odsúhlasení dodávateľom (ako výkaz).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p: any) => zapocitatelna(p) && vObdobi(denOdpoctuPrijatej(p), od, doDna),
    ),
  };
}

/** Súčty prehľadu (výstup, vstup, rozdiel) v domácej mene — pre krátku odpoveď. */
export function suctyDph(d: DokladyDphObdobia, krajina: KrajinaDane) {
  const vystup = vystupPrehladu(d.invoices, d.items, krajina);
  const vstup = vstupPrehladu(d.purchases, krajina);
  const sucet = (b: Record<string, { base: number; vat: number }>, pole: "base" | "vat") =>
    Math.round(Object.values(b).reduce((a, r) => a + Number(r[pole] ?? 0), 0) * 100) / 100;
  const dphVystup = sucet(vystup, "vat");
  const dphVstup = sucet(vstup, "vat");
  return {
    zakladVystup: sucet(vystup, "base"),
    dphVystup,
    zakladVstup: sucet(vstup, "base"),
    dphVstup,
    rozdiel: Math.round((dphVystup - dphVstup) * 100) / 100,
    pocetVystavenych: d.invoices.length,
    pocetPrijatych: d.purchases.length,
  };
}
