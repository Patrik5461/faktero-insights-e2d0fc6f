/*
  Najvyššie poradie, ktoré už nesie vystavený doklad — pre export číselných
  radov a pre pravidlo „import nesmie počítadlo znížiť pod posledné použité".

  Číta sa cez klienta bez RLS (volajúci predtým overí prístup cez
  `overPristup`): človek s právom na faktúry, ale bez pokladne, by cez RLS
  pokladničné doklady nevidel, a pravidlo by u neho ticho neplatilo.

  Hľadá sa rovnako ako `faktero_cislo_obsadene` / `faktero_next_invoice_number`
  — podľa čísla dokladu v celej firme, nie podľa `number_series_id`. Rad sa
  zakladá lenivo a staršie doklady ho nemajú, ich čísla sú však obsadené.
  Zmazané doklady sa rátajú tiež (číslo odoslanej či zmazanej ponuky ostáva
  obsadené) — radšej prísnejšie ako duplicita.
*/
import type { DruhRadu } from "./ciselne-rady";
import { klucPosledneho, najvyssiePoradie, vzorCislaVObdobi, type Obdobie } from "./ciselne-rady-subor";
import { vsetkyRiadky } from "./strankovanie";

const KDE: Record<DruhRadu, { tabulka: string; stlpec: string; samofakturacia?: boolean }> = {
  invoice: { tabulka: "invoices", stlpec: "invoice_number" },
  proforma: { tabulka: "invoices", stlpec: "invoice_number" },
  credit_note: { tabulka: "invoices", stlpec: "invoice_number" },
  debit_note: { tabulka: "invoices", stlpec: "invoice_number" },
  advance_payment: { tabulka: "invoices", stlpec: "invoice_number" },
  quote: { tabulka: "quotes", stlpec: "quote_number" },
  sales_order: { tabulka: "sales_orders", stlpec: "order_number" },
  purchase_order: { tabulka: "purchase_orders", stlpec: "order_number" },
  cash: { tabulka: "cash_entries", stlpec: "entry_number" },
  self_billing: { tabulka: "purchase_invoices", stlpec: "invoice_number", samofakturacia: true },
  financing: { tabulka: "financing_installments", stlpec: "cislo_dokladu" },
};

/** Dnešný deň v Bratislave — číslovanie v databáze ráta s rovnakým. */
export function dnesneObdobie(teraz: Date = new Date()): Obdobie {
  const [rok, mesiac] = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Bratislava",
    year: "numeric",
    month: "2-digit",
  })
    .format(teraz)
    .split("-")
    .map(Number);
  return { rok, mesiac };
}

/**
 * Pre každú dvojicu druh + šablóna najvyššie poradie s dokladom v aktuálnom
 * období. Kľúč mapy je `klucPosledneho(kind, format)`.
 */
export async function posledneVRadoch(
  admin: any,
  companyId: string,
  pary: { kind: DruhRadu; format: string }[],
  obdobie: Obdobie = dnesneObdobie(),
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  await Promise.all(
    pary.map(async ({ kind, format }) => {
      const kde = KDE[kind];
      if (!kde) return;
      const { like } = vzorCislaVObdobi(format, obdobie);
      const cisla = await vsetkyRiadky<Record<string, string | null>>((od, po) => {
        let q = admin
          .from(kde.tabulka)
          .select(`id, ${kde.stlpec}`)
          .eq("company_id", companyId)
          .like(kde.stlpec, like);
        if (kde.samofakturacia) q = q.eq("samofakturacia", true);
        return q.order("id").range(od, po);
      });
      out.set(
        klucPosledneho(kind, format),
        najvyssiePoradie(
          cisla.map((r) => r[kde.stlpec] ?? null),
          format,
          obdobie,
        ),
      );
    }),
  );
  return out;
}
