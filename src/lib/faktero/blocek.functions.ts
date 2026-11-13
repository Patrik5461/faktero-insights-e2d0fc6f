import { createServerFn } from "@tanstack/react-start";
import { krajinaBlocku } from "./krajina-blocku";
import { nastavZaokruhlenie, zaokruhlenieZPoloziek } from "./zaokruhlenie-blocku";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { jeEetQr, parseEetQr } from "./eet-cz";
import { firmaZAres } from "./ares.server";
import { jeZalohovaFaktura } from "./zalohova-rozpoznanie";

/**
 * Prečítanie pokladničného dokladu (bločku).
 *
 * Dve cesty, v tomto poradí:
 *
 * 1. **QR kód** — v ňom je identifikátor, pod ktorým Finančná správa vydá celý
 *    doklad tak, ako je zaevidovaný: predajca, IČO, dátum, sumy aj položky.
 *    Nič sa nehádá a čísla sedia na cent.
 * 2. **Fotka** — keď QR na doklade nie je, nedá sa prečítať, alebo doklad ešte
 *    nie je zaevidovaný. Vtedy sa údaje vyčítajú z obrázka. Je to odhad, preto
 *    to stránka aj takto pomenuje.
 *
 * Skener predtým vedel len druhú cestu a o QR kóde na bločku nevedel nič.
 *
 * Na českom bločku to funguje inak a nedá sa to spraviť rovnako: evidencia
 * tržieb (EET) skončila 1. 1. 2023 a databáza, z ktorej by sa doklad dal
 * dotiahnuť, neexistuje. Český QR kód ale nesie údaje priamo v sebe — suma,
 * dátum a DIČ sa z neho prečítajú bez akéhokoľvek volania von (`eet-cz.ts`),
 * predajca sa podľa IČO dohľadá v ARES a položky ostávajú na fotku.
 */

/** Pod týmto kľúčom si stránka nového dokladu prevezme prečítaný bloček. */
export const PRENOS_KLUC = "faktero.blocek";

export type BlocekPolozka = {
  name: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  total?: number;
  /** Predkontácia položky; prázdna = predkontácia dokladu. */
  predkontacia?: string | null;
  clenenie?: string | null;
  /** Položka je zaokrúhlenie sumy (hotovosť na 5 centov), nie plnenie v 0 %. */
  zaokruhlenie?: boolean;
};

export type BlocekVysledok = {
  zdroj: "ekasa" | "qr" | "foto" | "nic";
  overeny: boolean;
  /** Prečo sa nepodarilo prečítať z Finančnej správy — nech to netreba hádať. */
  poznamka?: string;
  supplier?: string;
  supplier_ico?: string;
  supplier_dic?: string;
  supplier_ic_dph?: string;
  supplier_address?: string;
  /**
   * Štát predajcu (ISO) — eKasa SK, český QR CZ, z fotky podľa krajiny/IČ
   * DPH/adresy. Zahraničný bloček nesie sadzby svojho štátu (pravidlo DPH).
   */
  supplier_country?: string;
  total?: number;
  vat_amount?: number;
  net_amount?: number;
  vat_rate?: number;
  /** Rozpis po sadzbách — bloček ich má často viac naraz. */
  vat_breakdown?: { sadzba: number; zaklad: number; dph: number }[];
  /**
   * Rozpis DPH prečítaný z fotky nesedí so sumami či sadzbami dokladu
   * (`rozpis-dph-kontrola.ts`) — dôvod pre človeka. Doklad treba skontrolovať.
   */
  kontrola_dph?: string;
  /**
   * Rozpis DPH je len návrh, nie údaj z dokladu: český QR (EET) nenesie
   * sadzby a fotka rozpis nedala — predvyplnilo sa 21 % zo sumy
   * (`blocek-eet.ts`). Bloček ide na kontrolu, či nejde o 12 %.
   */
  rozpis_odhad?: boolean;
  /** Spôsob úhrady, keď ho doklad nesie. Väčšina bločkov ho neposiela. */
  payment_method?: "hotovost" | "karta" | "prevod";
  currency?: string;
  date?: string;
  document_number?: string;
  cash_register?: string;
  uid?: string;
  /** Obsah QR kódu, z ktorého doklad vznikol — ukladá sa k dokladu. */
  qr_raw?: string;
  /**
   * Doklad je zálohová (proforma, preddavková) faktúra. Nie je daňový doklad,
   * tak nepatrí medzi bločky ani medzi bežné prijaté faktúry — appka ho podľa
   * toho zaradí medzi prijaté zálohy.
   */
  zalohova?: boolean;
  items: BlocekPolozka[];
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const Vstup = z.object({
  qr: z.string().max(4000).optional(),
  image_data_url: z.string().max(12_000_000).optional(),
  /*
   * Krajina firmy, ktorá doklad skenuje. Rozhoduje o tom, aké sadzby DPH a akú
   * menu má čítanie z fotky čakať — český bloček s 12 % DPH sa proti slovenskej
   * sade sadzieb prečítal ako nulový. Keď nepríde, ostáva Slovensko; český QR
   * kód si krajinu povie sám.
   */
  krajina: z.enum(["SK", "CZ", "DE"]).optional(),
});

/**
 * Prevažujúca sadzba — do hlavičky dokladu treba jednu, aj keď doklad nesie
 * viac sadzieb. Váži sa sumou riadku, nie počtom riadkov: jeden drahý tovar
 * v základnej sadzbe rozhoduje o doklade viac než tri drobnosti v zníženej.
 */
function prevazujucaSadzba(items: BlocekPolozka[]): number | undefined {
  if (!items.length) return undefined;
  const podla = new Map<number, number>();
  for (const p of items) {
    const vaha = p.total ?? p.quantity * p.unit_price;
    podla.set(p.vat_rate, (podla.get(p.vat_rate) ?? 0) + vaha);
  }
  return [...podla.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

export const nacitajBlocekFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Vstup.parse(d))
  .handler(async ({ data }): Promise<BlocekVysledok> => {
    let poznamka: string | undefined;

    /*
     * Český bloček sa musí skúsiť skôr než eKasa — `processEkasaQr` by na
     * reťazci `EET*1.0*…` len márne hľadal base64 payload a skončil chybou.
     * Keď je aj fotka, výsledok sa nižšie zlúči: hlavička z QR, položky z fotky.
     */
    let eet: BlocekVysledok | undefined;
    if (data.qr?.trim() && jeEetQr(data.qr)) {
      const d = parseEetQr(data.qr.trim());
      if (d) {
        const firma = d.ico ? await firmaZAres(d.ico) : null;
        eet = {
          zdroj: "qr",
          overeny: false,
          qr_raw: data.qr.trim(),
          poznamka:
            "Český bloček — údaje sú priamo z QR kódu. Evidencia tržieb (EET) skončila v roku 2023, " +
            "takže doklad ani jeho položky sa nemajú kde overiť.",
          supplier: firma?.nazov,
          supplier_address: firma?.adresa,
          supplier_ico: d.ico,
          supplier_dic: d.dic,
          supplier_ic_dph: firma?.platitelDph ? (firma.dic ?? d.dic) : undefined,
          supplier_country: "CZ",
          total: d.suma,
          currency: "CZK",
          date: d.datum,
          items: [],
        };
        // Bez fotky sadzby nepovie nič — rozpis je návrh 21 % na kontrolu.
        if (!data.image_data_url) return (await import("./blocek-eet")).doplnRozpisEet(eet);
        poznamka = "Suma, dátum a predajca sú z QR kódu, položky sú prečítané z fotky.";
      } else {
        poznamka = data.image_data_url
          ? "Český QR kód sa nepodarilo prečítať, údaje sú prečítané z fotky."
          : "Český QR kód sa nepodarilo prečítať.";
      }
    }

    if (data.qr?.trim() && !jeEetQr(data.qr)) {
      const { processEkasaQr } = await import("./ekasa-decoder.server");
      const r = await processEkasaQr(data.qr.trim());
      if (r.ok && r.source === "ekasa") {
        const d = r.data;
        const items: BlocekPolozka[] = d.polozky.map((p) => ({
          name: p.name,
          quantity: p.quantity,
          unit_price: p.unit_price,
          vat_rate: p.vat_rate,
          total: p.total,
        }));
        return {
          zdroj: "ekasa",
          overeny: true,
          qr_raw: data.qr!.trim(),
          supplier: d.dodavatel,
          supplier_ico: d.ico,
          supplier_dic: d.dic,
          supplier_ic_dph: d.ic_dph,
          supplier_address: d.adresa,
          // eKasa je slovenská pokladnica.
          supplier_country: "SK",
          total: d.suma,
          vat_amount: d.dph,
          // Základ bez zaokrúhlenia — to je samostatná položka bločku.
          net_amount:
            d.zaklad ??
            (d.suma != null && d.dph != null
              ? round2(d.suma - d.dph - zaokruhlenieZPoloziek(items))
              : undefined),
          // Do hlavičky ide sadzba s najvyšším základom; celý rozpis ide vedľa,
          // lebo bloček býva zmiešaný a jedna sadzba ho nepopíše.
          vat_rate: d.sadzby?.length
            ? [...d.sadzby].sort((a, b) => b.zaklad - a.zaklad)[0].sadzba
            : prevazujucaSadzba(items),
          vat_breakdown: d.sadzby?.length ? d.sadzby : undefined,
          payment_method: d.uhrada,
          currency: d.mena ?? "EUR",
          date: d.datum,
          document_number: d.cisloDokladu,
          cash_register: d.kodPokladnice,
          uid: d.uid,
          items,
        };
      }

      if (r.ok) {
        // QR sa prečítal, ale doklad Finančná správa nevydala. To, čo je priamo
        // v kóde, je aj tak lepšie než nič — a fotka to nižšie ešte doplní.
        const d = r.data;
        const zQr: BlocekVysledok = {
          zdroj: "qr",
          overeny: false,
          qr_raw: data.qr!.trim(),
          poznamka: "Doklad sa vo Finančnej správe nenašiel — údaje sú len z QR kódu.",
          supplier_ico: d.ico,
          supplier_ic_dph: d.ic_dph,
          supplier_country: "SK",
          total: d.suma,
          vat_amount: d.dph,
          currency: d.mena ?? "EUR",
          date: d.datum,
          document_number: d.cisloDokladu,
          cash_register: d.kodPokladnice,
          uid: d.uid,
          items: d.polozky.map((p) => ({
            name: p.name,
            quantity: p.quantity,
            unit_price: p.unit_price,
            vat_rate: p.vat_rate,
            total: p.total,
          })),
        };
        // Keď z QR vypadlo niečo použiteľné, netreba už otravovať OCR.
        if (zQr.total != null || zQr.items.length > 0) return zQr;
        // Inak sa ide na fotku — a poznámka to musí povedať tak, aby si
        // neodporovala s hlavičkou „odhadnuté z fotky".
        poznamka = "Doklad sa vo Finančnej správe nenašiel, údaje sú prečítané z fotky.";
      } else {
        poznamka = "QR kód sa nepodarilo prečítať, údaje sú prečítané z fotky.";
      }
    }

    if (!data.image_data_url) {
      return {
        zdroj: "nic",
        overeny: false,
        poznamka: poznamka ?? "Nebolo z čoho čítať — chýba QR kód aj fotka.",
        items: [],
      };
    }

    const { ocrBlocek } = await import("./blocek-ocr.server");
    const ocr = await ocrBlocek(data.image_data_url, eet ? "CZ" : (data.krajina ?? "SK"));
    if (!ocr) {
      // Z fotky nič, ale český QR sa prečítal — jeho údaje sa nezahodia.
      if (eet) return (await import("./blocek-eet")).zlucEetSFotkou(eet, null);
      return {
        zdroj: "nic",
        overeny: false,
        poznamka:
          poznamka ??
          "Z fotky sa nepodarilo prečítať nič. Skúste doklad odfotiť zhora, celý a pri lepšom svetle.",
        items: [],
      };
    }

    const precitane: BlocekPolozka[] = (ocr.items ?? []).map((p: any) => {
      const mnozstvo = Number(p?.quantity) || 1;
      const cena = Number(p?.unit_price) || 0;
      return {
        name: String(p?.name ?? ""),
        quantity: mnozstvo,
        unit_price: cena,
        vat_rate: Number(p?.vat_rate) || 0,
        // Z fotky súčet riadku nechodí; bez neho by prevažujúca sadzba vážila
        // samé nuly a vyšla by tá, ktorá je v zozname náhodou prvá.
        total: Math.round(mnozstvo * cena * 100) / 100,
      };
    });
    /*
      Zaokrúhlenie (hotovosť na 5 centov) ide ako samostatná položka bez DPH —
      z poľa „rounding“ alebo z riadku „Zaokrúhlenie“, ak ho čítanie dalo medzi
      položky. Suma bločku je po zaokrúhlení, rozpis DPH bez neho.
    */
    const zaokrOcr = Number(ocr.rounding);
    const zaokr =
      Number.isFinite(zaokrOcr) && zaokrOcr && Math.abs(zaokrOcr) <= 0.05
        ? round2(zaokrOcr)
        : zaokruhlenieZPoloziek(precitane);
    const items = nastavZaokruhlenie(precitane, zaokr) as BlocekPolozka[];

    /*
      Rozpis DPH: tabuľka z bločku, inak položky (ceny s DPH), inak jedna
      sadzba — len keď daň zo základu pri nej naozaj vychádza. Čo neprejde
      kontrolou, ide von s dôvodom; nikdy nie potichu.
    */
    const { rozpisZVytazenia } = await import("./rozpis-dph-vytazeny");
    const { popisChybRozpisu } = await import("./rozpis-dph-kontrola");
    const sumaBezZaokr = ocr.total != null ? round2(Number(ocr.total) - (zaokr || 0)) : null;
    const krajinaPredajcu = krajinaBlocku({
      krajina: ocr.supplier_country,
      icDph: ocr.ic_dph,
      adresa: ocr.supplier_address,
    });
    const rozpisFoto = rozpisZVytazenia(
      {
        supplier_country: krajinaPredajcu,
        amount_without_vat: ocr.net_amount ?? null,
        vat_amount: ocr.vat_amount ?? null,
        amount_total: sumaBezZaokr,
        vat_breakdown: ocr.vat_breakdown ?? null,
        items: precitane.filter((p) => !p.zaokruhlenie),
        items_total_with_vat: true,
        issue_date: ocr.date ?? null,
      },
      { krajina: eet ? "CZ" : (data.krajina ?? "SK") },
    );
    const rozpisOk = rozpisFoto.rozpis.length > 0;

    const vysledok: BlocekVysledok = {
      zdroj: "foto",
      overeny: false,
      poznamka,
      qr_raw: data.qr?.trim() || undefined,
      supplier: ocr.supplier ?? undefined,
      supplier_ico: ocr.ico ?? undefined,
      supplier_ic_dph: ocr.ic_dph ?? undefined,
      ...(ocr.supplier_address ? { supplier_address: ocr.supplier_address } : {}),
      ...(krajinaPredajcu ? { supplier_country: krajinaPredajcu } : {}),
      total: ocr.total ?? undefined,
      /*
        DPH hlavičky zo skontrolovaného rozpisu (súčet riadkov po zákonných
        sadzbách) — keď rozpis prešiel kontrolou alebo ho náprava opravila,
        hlavička s ním musí sedieť; inak ostáva, čo je na bločku.
      */
      vat_amount:
        rozpisOk && rozpisFoto.kontrola.ok
          ? round2(rozpisFoto.rozpis.reduce((a, r) => a + r.dph, 0))
          : (ocr.vat_amount ?? undefined),
      vat_rate:
        rozpisFoto.rozpis.length === 1
          ? rozpisFoto.rozpis[0]!.sadzba
          : rozpisFoto.rozpis.length > 1
            ? [...rozpisFoto.rozpis].sort((a, b) => b.zaklad - a.zaklad)[0]!.sadzba
            : (ocr.vat_rate ?? prevazujucaSadzba(items.filter((p) => !p.zaokruhlenie))),
      ...(rozpisOk
        ? {
            vat_breakdown: rozpisFoto.rozpis,
            net_amount: round2(rozpisFoto.rozpis.reduce((a, r) => a + r.zaklad, 0)),
          }
        : {}),
      ...(rozpisOk && !rozpisFoto.kontrola.ok ? { kontrola_dph: popisChybRozpisu(rozpisFoto.kontrola) } : {}),
      // Spôsob úhrady z bločku (AI) — len známe hodnoty; človek ho môže zmeniť.
      ...(ocr.payment_method === "hotovost" || ocr.payment_method === "karta" || ocr.payment_method === "prevod"
        ? { payment_method: ocr.payment_method }
        : {}),
      currency: ocr.currency ?? "EUR",
      date: ocr.date ?? undefined,
      document_number: ocr.document_number ?? undefined,
      zalohova: jeZalohovaFaktura({
        druhOdAi: ocr.document_subtype,
        nazovDokladu: ocr.document_title,
        cisloDokladu: ocr.document_number,
      }),
      items,
    };

    // Hlavička z QR kódu, položky z fotky — a bloček ostáva bločkom s QR.
    if (eet) return (await import("./blocek-eet")).zlucEetSFotkou(eet, vysledok, poznamka);

    return vysledok;
  });
