/*
  Údaje pre hotovostné bločky do Pohody, ktoré bloček sám v DB nemá:
  adresa a DIČ dodávateľa a číselník členení DPH firmy (pozri `blocek-pohoda.ts`).

  Adresa podľa IČO, v tomto poradí: adresár firmy → posledná prijatá faktúra
  toho istého dodávateľa → pamäť registra (`company_cache`, bez ohľadu na
  vek — adresa sa mení zriedka) → register (FinStat/ARES) s časovým stropom,
  aby export neprekročil 30 s brány. Čo register vráti, ostane v pamäti
  a ďalší export ho už má. Výpadok čohokoľvek export nezastaví — doklad
  ide ako doteraz, len bez adresy.
*/
import type { KodCiselnika } from "./auto-uctovanie";
import { icoKluc, jeHotovostnyBlocek, type AdresaDodavatela } from "./blocek-pohoda";

type Klient = any;

/** Najviac toľko IČO sa v jednom exporte pýta registra. */
const MAX_Z_REGISTRA = 40;
/** Na register sa čaká spolu najviac toľko. */
const STROP_REGISTRA_MS = 8000;

const t = (v: unknown) =>
  String(v ?? "")
    .replace(/\s+/g, " ")
    .trim() || null;
const maAdresu = (a: AdresaDodavatela | undefined) => Boolean(a && (a.street || a.city));

/** IČO hotovostných bločkov, ktorým chýba adresa dodávateľa. */
export function icaBezAdresy(doklady: Record<string, any>[]): string[] {
  return [
    ...new Set(
      doklady
        .filter((d) => jeHotovostnyBlocek(d) && !t(d?.supplier_street) && !t(d?.supplier_city))
        .map((d) => icoKluc(d?.supplier_ico))
        .filter(Boolean),
    ),
  ];
}

/** Varianty IČO na dotaz (8-miestne aj bez úvodných núl, ako ich kto uložil). */
function varianty(ica: string[]): string[] {
  return [...new Set(ica.flatMap((i) => [i, i.replace(/^0+/, "")]))].filter(Boolean);
}

export async function adresyDodavatelovBlockov(
  supabase: Klient,
  companyId: string,
  doklady: Record<string, any>[],
  opts: { register?: boolean } = {},
): Promise<Record<string, AdresaDodavatela>> {
  const ica = icaBezAdresy(doklady);
  const out: Record<string, AdresaDodavatela> = {};
  if (!ica.length) return out;
  const chyba = () => ica.filter((i) => !maAdresu(out[i]));
  const pridaj = (ico: unknown, a: AdresaDodavatela) => {
    const k = icoKluc(ico);
    if (!k || maAdresu(out[k]) || !(a.street || a.city)) return;
    out[k] = a;
  };

  // 1. Adresár firmy.
  try {
    // aj-zmazane: adresa dodávateľa platí aj zo zmazanej karty.
    const { data } = await supabase
      .from("customers")
      .select("ico, name, street, city, zip, country, dic, ic_dph")
      .eq("company_id", companyId)
      .in("ico", varianty(ica));
    for (const r of data ?? [])
      pridaj(r.ico, {
        street: t(r.street),
        city: t(r.city),
        zip: t(r.zip),
        country: t(r.country),
        dic: t(r.dic),
        ic_dph: t(r.ic_dph),
      });
  } catch {
    /* adresa je doplnok — export ide ďalej */
  }

  // 2. Prijaté faktúry toho istého dodávateľa (najnovšia má prednosť).
  if (chyba().length) {
    try {
      // aj-zmazane: adresa dodávateľa platí aj zo zmazanej faktúry.
      const { data } = await supabase
        .from("purchase_invoices")
        .select(
          "supplier_ico, supplier_street, supplier_city, supplier_zip, supplier_country, supplier_dic, supplier_ic_dph, issue_date",
        )
        .eq("company_id", companyId)
        .in("supplier_ico", varianty(chyba()))
        .order("issue_date", { ascending: false })
        .limit(1000);
      for (const r of data ?? [])
        pridaj(r.supplier_ico, {
          street: t(r.supplier_street),
          city: t(r.supplier_city),
          zip: t(r.supplier_zip),
          country: t(r.supplier_country),
          dic: t(r.supplier_dic),
          ic_dph: t(r.supplier_ic_dph),
        });
    } catch {
      /* doplnok */
    }
  }

  // 3. Pamäť registra (verejné údaje z FinStatu/ARES).
  if (chyba().length) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data } = await supabaseAdmin
        .from("company_cache")
        .select("ico, data")
        .in("ico", varianty(chyba()));
      for (const r of (data ?? []) as any[]) pridaj(r.ico, zRegistra(r.data));
    } catch {
      /* doplnok */
    }
  }

  // 4. Register s časovým stropom — výsledok si uloží do pamäte sám.
  const zvysok = chyba().slice(0, MAX_Z_REGISTRA);
  if (opts.register !== false && zvysok.length) {
    try {
      const reg = await import("./company-registry.server");
      if (reg.isRegistryConfigured()) {
        const fronta = [...zvysok];
        const pracovnik = async () => {
          for (let ico = fronta.shift(); ico; ico = fronta.shift()) {
            const r = await reg.firmaZRegistraBezRezimu(ico).catch(() => null);
            if (r?.status === "ok") pridaj(ico, zRegistra(r.data));
          }
        };
        await Promise.race([
          Promise.all(Array.from({ length: 4 }, pracovnik)),
          new Promise((res) => setTimeout(res, STROP_REGISTRA_MS)),
        ]);
      }
    } catch {
      /* doplnok */
    }
  }
  return out;
}

/** Firma z registra (`NormalizedCompany`) → adresa pre Pohodu. */
export function zRegistra(d: any): AdresaDodavatela {
  if (!d || typeof d !== "object") return {};
  const krajina = String(d.country ?? "").trim();
  return {
    street: t(d.street),
    city: t(d.city),
    zip: t(String(d.zip ?? "").replace(/\s+/g, "")),
    country: /^[A-Z]{2}$/.test(krajina) ? krajina : /^(cz|česk|cesk)/i.test(krajina) ? "CZ" : null,
    dic: t(d.dic),
    ic_dph: t(d.ic_dph),
  };
}

/** Číselník členení DPH firmy (načítaný z Pohody) — pre členenie podľa zákona. */
export async function cleneniaDphFirmy(
  supabase: Klient,
  companyId: string,
): Promise<KodCiselnika[]> {
  try {
    const { data } = await supabase
      .from("predkontacie")
      .select("druh, kod, popis, agenda, aktivne")
      .eq("company_id", companyId)
      .eq("druh", "clenenie_dph")
      .eq("aktivne", true);
    return (data ?? []) as KodCiselnika[];
  } catch {
    return [];
  }
}
