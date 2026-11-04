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

  // 3.–4. Pamäť registra a register s časovým stropom.
  if (chyba().length) {
    const z = await adresyPodlaIco(chyba(), opts);
    for (const [ico, a] of Object.entries(z)) pridaj(ico, a);
  }
  return out;
}

/*
  Dodávateľ prijatej faktúry, ktorý na doklade nie je celý — typicky doklad
  z eFaktúry zaevidovaný pred 30. 10. 2026 (uložilo sa len meno a IČ DPH),
  z importu alebo z OCR. Pri exporte sa doplní to isté, čo pri bločkoch
  (adresár → iná prijatá faktúra → pamäť registra → register), navyše
  z vlastného XML eFaktúry (tam dodávateľ napísal všetko sám) a z karty
  v adresári, s ktorou je doklad spojený (`customer_id`). Hľadá sa podľa
  IČO, a keď ho doklad nemá, podľa IČ DPH a DIČ. Doplní sa len prázdne pole.
*/

/** Čo sa dá dodávateľovi prijatej faktúry doplniť (kľúč = id dokladu). */
export type DoplnenieDodavatela = AdresaDodavatela & {
  ico?: string | null;
  email?: string | null;
  /** Názvy položiek z eFaktúry — na text dokladu, keď sám nemá predmet ani položky. */
  nazvyPoloziek?: string[];
};

const POLIA_DODAVATELA: (keyof DoplnenieDodavatela)[] = [
  "ico", "dic", "ic_dph", "street", "city", "zip", "country", "email",
];

/** DIČ zo slovenského IČ DPH (SK + 10 číslic = SK + DIČ). */
export function dicZIcDph(icDph: unknown): string | null {
  const m = /^SK(\d{10})$/i.exec(String(icDph ?? "").replace(/\s+/g, ""));
  return m ? m[1] : null;
}

// Do filtra `.or()` ide len to, čo je naozaj IČ DPH (písmená a číslice) — nič, čo by ho rozbilo.
const icDphKluc = (v: unknown) => {
  const s = String(v ?? "").replace(/\s+/g, "").toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{2,13}$/.test(s) ? s : "";
};
const dicKluc = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** Prijatá faktúra (riadok alebo `prijataAkoDoklad`), ktorej chýba IČO, DIČ alebo adresa. */
export function chybaDodavatel(d: Record<string, any>): boolean {
  return (
    !icoKluc(d?.supplier_ico) ||
    !t(d?.supplier_dic) ||
    (!t(d?.supplier_street) && !t(d?.supplier_city)) ||
    !t(d?.supplier_zip)
  );
}

export async function dodavateliaPrijatych(
  supabase: Klient,
  companyId: string,
  doklady: Record<string, any>[],
  opts: { register?: boolean } = {},
): Promise<Record<string, DoplnenieDodavatela>> {
  const out: Record<string, DoplnenieDodavatela> = {};
  const ciele = doklady.filter((d) => d?.id && chybaDodavatel(d)).slice(0, 500);
  if (!ciele.length) return out;
  const stav = (d: Record<string, any>) => {
    const o = (out[String(d.id)] ??= {});
    return {
      ico: icoKluc(o.ico ?? d.supplier_ico) || null,
      dic: t(o.dic ?? d.supplier_dic),
      ic_dph: icDphKluc(o.ic_dph ?? d.supplier_ic_dph) || null,
      adresa: Boolean(t(o.street ?? d.supplier_street) || t(o.city ?? d.supplier_city)),
    };
  };
  const pridaj = (d: Record<string, any>, z: Partial<DoplnenieDodavatela>) => {
    const o = (out[String(d.id)] ??= {});
    for (const k of POLIA_DODAVATELA) {
      const mam = t((o as any)[k]) || t(d[k === "ic_dph" ? "supplier_ic_dph" : `supplier_${k}`]);
      const nove = t((z as any)[k]);
      if (!mam && nove) (o as any)[k] = k === "ico" ? icoKluc(nove) || nove : nove;
    }
    if (z.nazvyPoloziek?.length && !o.nazvyPoloziek?.length) o.nazvyPoloziek = z.nazvyPoloziek;
  };
  const neuplne = () => ciele.filter((d) => {
    const s = stav(d);
    return !s.ico || !s.dic || !s.adresa;
  });

  // 1. Vlastné XML eFaktúry — dodávateľ ho vyplnil sám (BG-4, BT-29…BT-43).
  const efaktury = ciele.filter((d) => d.source === "efaktura").slice(0, MAX_Z_REGISTRA);
  if (efaktury.length) {
    try {
      const { data } = await supabase
        .from("efaktura_received_documents")
        .select("matched_supplier_invoice_id, xml_payload")
        .eq("company_id", companyId)
        .in("matched_supplier_invoice_id", efaktury.map((d) => d.id));
      const { rozoberPrijatuUbl } = await import("./efaktura/prijata-z-ubl");
      for (const r of data ?? []) {
        const d = efaktury.find((x) => x.id === r.matched_supplier_invoice_id);
        const u = d && r.xml_payload ? rozoberPrijatuUbl(String(r.xml_payload)) : null;
        if (!d || !u) continue;
        pridaj(d, {
          ico: u.dodavatel.ico,
          dic: u.dodavatel.dic,
          ic_dph: u.dodavatel.icDph,
          street: u.dodavatel.ulica,
          city: u.dodavatel.mesto,
          zip: u.dodavatel.psc,
          country: u.dodavatel.krajina,
          email: u.dodavatel.email,
          nazvyPoloziek: u.polozky.map((x) => t(x.name)).filter(Boolean) as string[],
        });
      }
    } catch {
      /* doplnok */
    }
  }

  // 2. Karta v adresári, s ktorou je doklad spojený, potom podľa IČO / IČ DPH / DIČ.
  const zKarty = (r: any): Partial<DoplnenieDodavatela> => ({
    ico: r.ico, dic: r.dic, ic_dph: r.ic_dph, street: r.street, city: r.city,
    zip: r.zip, country: r.country, email: r.email,
  });
  if (neuplne().length) {
    try {
      const ids = [...new Set(neuplne().map((d) => d.customer_id).filter(Boolean))];
      const ica = varianty(neuplne().map((d) => stav(d).ico).filter(Boolean) as string[]);
      const icDph = [...new Set(neuplne().map((d) => stav(d).ic_dph).filter(Boolean))] as string[];
      const dic = [...new Set(neuplne().map((d) => stav(d).dic || dicZIcDph(stav(d).ic_dph)).filter(Boolean))] as string[];
      const podmienky = [
        ids.length ? `id.in.(${ids.join(",")})` : "",
        ica.length ? `ico.in.(${ica.join(",")})` : "",
        icDph.length ? `ic_dph.in.(${icDph.join(",")})` : "",
        dic.length ? `dic.in.(${dic.join(",")})` : "",
      ].filter(Boolean);
      // aj-zmazane: údaje dodávateľa platia aj zo zmazanej karty.
      const { data } = podmienky.length
        ? await supabase
            .from("customers")
            .select("id, ico, dic, ic_dph, street, city, zip, country, email")
            .eq("company_id", companyId)
            .or(podmienky.join(","))
            .limit(1000)
        : { data: [] };
      const karty = (data ?? []) as any[];
      for (const d of neuplne()) {
        const s = stav(d);
        const dicD = s.dic || dicZIcDph(s.ic_dph);
        const k =
          karty.find((r) => d.customer_id && r.id === d.customer_id) ??
          karty.find((r) => s.ico && icoKluc(r.ico) === s.ico) ??
          karty.find((r) => s.ic_dph && icDphKluc(r.ic_dph) === s.ic_dph) ??
          karty.find((r) => dicD && dicKluc(r.dic) === dicD);
        if (k) pridaj(d, zKarty(k));
      }
    } catch {
      /* doplnok */
    }
  }

  // 3. Iná prijatá faktúra toho istého dodávateľa (najnovšia), podľa IČO alebo IČ DPH.
  if (neuplne().length) {
    try {
      const ica = varianty(neuplne().map((d) => stav(d).ico).filter(Boolean) as string[]);
      const icDph = [...new Set(neuplne().map((d) => stav(d).ic_dph).filter(Boolean))] as string[];
      const podmienky = [
        ica.length ? `supplier_ico.in.(${ica.join(",")})` : "",
        icDph.length ? `supplier_ic_dph.in.(${icDph.join(",")})` : "",
      ].filter(Boolean);
      // aj-zmazane: údaje dodávateľa platia aj zo zmazanej faktúry.
      const { data } = podmienky.length
        ? await supabase
            .from("purchase_invoices")
            .select(
              "supplier_ico, supplier_dic, supplier_ic_dph, supplier_street, supplier_city, supplier_zip, supplier_country, supplier_email, issue_date",
            )
            .eq("company_id", companyId)
            .or(podmienky.join(","))
            .not("supplier_street", "is", null)
            .order("issue_date", { ascending: false })
            .limit(1000)
        : { data: [] };
      for (const d of neuplne()) {
        const s = stav(d);
        const r = ((data ?? []) as any[]).find(
          (x) => (s.ico && icoKluc(x.supplier_ico) === s.ico) || (s.ic_dph && icDphKluc(x.supplier_ic_dph) === s.ic_dph),
        );
        if (r)
          pridaj(d, {
            ico: r.supplier_ico, dic: r.supplier_dic, ic_dph: r.supplier_ic_dph, street: r.supplier_street,
            city: r.supplier_city, zip: r.supplier_zip, country: r.supplier_country, email: r.supplier_email,
          });
      }
    } catch {
      /* doplnok */
    }
  }

  // 4.–5. Pamäť registra a register — len podľa IČO (register IČ DPH nehľadá).
  const icaRegistra = () =>
    [...new Set(neuplne().map((d) => stav(d).ico).filter(Boolean))] as string[];
  if (icaRegistra().length) {
    const adresy = await adresyPodlaIco(icaRegistra(), opts);
    for (const d of neuplne()) {
      const a = adresy[stav(d).ico ?? ""];
      if (a) pridaj(d, a);
    }
  }

  // Slovenské IČ DPH je „SK“ + DIČ — to sa dá doplniť bez hľadania.
  for (const d of ciele) {
    const s = stav(d);
    if (!s.dic && dicZIcDph(s.ic_dph)) pridaj(d, { dic: dicZIcDph(s.ic_dph) });
  }
  for (const [k, v] of Object.entries(out)) if (!Object.keys(v).length) delete out[k];
  return out;
}


/**
 * Adresa podľa IČO z pamäte registra (`company_cache`, bez ohľadu na vek)
 * a z registra s časovým stropom — výsledok si register uloží do pamäte sám.
 */
async function adresyPodlaIco(
  ica: string[],
  opts: { register?: boolean } = {},
): Promise<Record<string, AdresaDodavatela>> {
  const out: Record<string, AdresaDodavatela> = {};
  const chyba = () => ica.filter((i) => !maAdresu(out[i]));
  const pridaj = (ico: unknown, a: AdresaDodavatela) => {
    const k = icoKluc(ico);
    if (!k || maAdresu(out[k]) || !(a.street || a.city)) return;
    out[k] = a;
  };
  // Pamäť registra (verejné údaje z FinStatu/ARES).
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

  // Register s časovým stropom — výsledok si uloží do pamäte sám.
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
