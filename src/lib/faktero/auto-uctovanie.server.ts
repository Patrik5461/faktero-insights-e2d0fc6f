/*
  Automatické zaúčtovanie — motor, fronta a potvrdenie.

  `navrhniZauctovanie` zloží návrh pre jeden doklad (pravidlo → zvyk → AI,
  členenie DPH a KV z `odvodClenenia`) a vyhodnotí blokátory. Fronta
  (`spracujAutoUctovanie`, cron každú minútu) prejde nové doklady firiem so
  zapnutým autopilotom: istý návrh bez blokátora zaúčtuje, ostatné uloží do
  `auto_uctovanie_navrh` na kontrolu.

  Doklady sa do fronty dostávajú samy: nový riadok má `auto_uctovanie_at`
  prázdne a spúšťač `faktero_auto_uctovanie_strazca` ho vynuluje, keď človek
  zmení údaje nezaúčtovaného dokladu. Preto netreba nič volať z miest, kde
  doklady vznikajú (mail, skener, import, formulár…).

  Klient: fronta píše servisným kľúčom (auth.uid() prázdne → automat),
  funkcie pre prehliadač klientom prihláseného (RLS).
*/

import {
  NAZVY_REZIMOV,
  blokatory,
  jeRezimAutopilota,
  odvodClenenia,
  polozkyNesedia,
  popisZdroja,
  smieAutopilot,
  zvykZDokladov,
  PREDVOLENY_LIMIT,
  type DokladTyp,
  type NavrhZauctovania,
  type RezimAutopilota,
  type VstupClenenia,
} from "./auto-uctovanie";
import { prvePravidlo, pravidloPohybu, typPrijatej, type Pravidlo } from "./pravidla-uctovania";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Klient = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Riadok = Record<string, any>;

export type TypDokladu = Exclude<DokladTyp, "banka">;

export const TABULKY: Record<
  TypDokladu,
  {
    tabulka: string;
    ico: string;
    icDph: string;
    meno: string;
    suma: string;
    cislo: string;
    datum: string;
    agenda: string;
  }
> = {
  prijata: {
    tabulka: "purchase_invoices",
    ico: "supplier_ico",
    icDph: "supplier_ic_dph",
    meno: "supplier_name",
    suma: "amount_total",
    cislo: "invoice_number",
    datum: "issue_date",
    agenda: "prijata",
  },
  blocek: {
    tabulka: "expense_documents",
    ico: "supplier_ico",
    icDph: "supplier_ic_dph",
    meno: "supplier_name",
    suma: "total_amount",
    cislo: "document_number",
    datum: "issue_date",
    agenda: "doklad",
  },
  vystavena: {
    tabulka: "invoices",
    ico: "customer_ico",
    icDph: "customer_ic_dph",
    meno: "customer_name",
    suma: "total",
    cislo: "invoice_number",
    datum: "issue_date",
    agenda: "faktura",
  },
};

export type Firma = {
  id: string;
  krajina: string;
  platitel: boolean;
  rezim: RezimAutopilota;
  limit: number;
  od: string | null;
  /** Firma účtovanie používa (číselník, pravidlá alebo predvolené kódy). */
  pouzivaUctovanie: boolean;
};

const STLPCE_PREDVOLENYCH = [
  "pohoda_predkontacia",
  "pohoda_predkontacia_prijata",
  "pohoda_predkontacia_doklady",
  "pohoda_predkontacia_banka",
];

export async function nacitajFirmu(sb: Klient, companyId: string): Promise<Firma> {
  const [{ data: c }, { count: kody }, { count: pravidla }] = await Promise.all([
    sb
      .from("companies")
      .select(
        `id, country, vat_payer, auto_uctovanie_rezim, auto_uctovanie_limit, auto_uctovanie_od, ${STLPCE_PREDVOLENYCH.join(", ")}`,
      )
      .eq("id", companyId)
      .maybeSingle(),
    sb
      .from("predkontacie")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId),
    sb
      .from("pravidla_uctovania")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("aktivne", true),
  ]);
  const predvolene = STLPCE_PREDVOLENYCH.some((s) => String(c?.[s] ?? "").trim());
  return {
    id: companyId,
    krajina: String(c?.country ?? "SK").toUpperCase(),
    platitel: Boolean(c?.vat_payer),
    rezim: jeRezimAutopilota(c?.auto_uctovanie_rezim) ? c.auto_uctovanie_rezim : "bezpecny",
    limit: c?.auto_uctovanie_limit != null ? Number(c.auto_uctovanie_limit) : PREDVOLENY_LIMIT,
    od: c?.auto_uctovanie_od ?? null,
    pouzivaUctovanie: predvolene || (kody ?? 0) > 0 || (pravidla ?? 0) > 0,
  };
}

const prazdne = (v: unknown) => !String(v ?? "").trim();
const t = (v: unknown) => (prazdne(v) ? null : String(v).trim());
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Doklad, ktorý motor nesmie meniť (odovzdaný, uzamknutý, zmazaný, zaúčtovaný). */
export function jeUzavrety(row: Riadok): boolean {
  return Boolean(row.exported_at || row.locked_at || row.deleted_at || row.zauctovane_at);
}

/** Vstup pre `odvodClenenia` z riadka dokladu. */
export function vstupClenenia(
  typ: TypDokladu,
  row: Riadok,
  firma: Pick<Firma, "krajina" | "platitel">,
): VstupClenenia {
  const zaklad = { krajinaFirmy: firma.krajina, firmaPlatitel: firma.platitel };
  if (typ === "vystavena")
    return {
      ...zaklad,
      smer: "vydane",
      opravny: row.type === "credit_note" || Boolean(row.opravuje_fakturu_id),
      dph: Number(row.vat_total ?? 0),
      reverseCharge: row.reverse_charge,
      reverseChargeType: row.reverse_charge_type,
      euPlnenie: row.eu_plnenie,
      osobitnaUprava: row.osobitna_uprava,
      ossKrajina: row.oss_country,
      partnerIcDph: row.customer_ic_dph,
      partnerKrajina: row.customer_country,
    };
  if (typ === "blocek")
    return {
      ...zaklad,
      smer: "prijate",
      blocek: true,
      opravny: Number(row.total_amount ?? 0) < 0,
      dph: Number(row.vat_amount ?? 0),
      odpocet: row.odpocet,
      partnerIcDph: row.supplier_ic_dph,
    };
  const pdpPolozky =
    Array.isArray(row.items) &&
    row.items.length > 0 &&
    row.items.every((x: Riadok) => x?.pdp || x?.reverse_charge);
  return {
    ...zaklad,
    smer: "prijate",
    opravny: typPrijatej(row.type, row.amount_total, row.opravuje_cislo) === "credit_note",
    dph: Number(row.vat_amount ?? 0),
    reverseCharge: Boolean(row.reverse_charge) || pdpPolozky,
    reverseChargeType: row.reverse_charge_type,
    dphRezim: row.dph_rezim,
    euPlnenie: row.eu_plnenie,
    osobitnaUprava: row.osobitna_uprava,
    odpocet: row.odpocet,
    partnerIcDph: row.supplier_ic_dph,
    partnerKrajina: row.supplier_country,
  };
}

/** Suma v domácej mene firmy (na porovnanie s limitom). */
function sumaDoma(typ: TypDokladu, row: Riadok, krajina: string): number | null {
  const domaca = krajina === "CZ" ? "CZK" : "EUR";
  const mena = String(row.currency ?? domaca).toUpperCase();
  const suma = Number(row[TABULKY[typ].suma] ?? 0);
  if (mena === domaca) return suma;
  if (typ === "prijata" && row.amount_without_vat_eur != null)
    return Number(row.amount_without_vat_eur) + Number(row.vat_amount_eur ?? 0);
  if (typ === "vystavena" && row.total_eur != null) return Number(row.total_eur);
  if (row.exchange_rate) return suma * Number(row.exchange_rate);
  return null;
}

/** Porovnávací tvar dokladu pre pravidlá. */
function porovnanie(typ: TypDokladu, row: Riadok) {
  const m = TABULKY[typ];
  return {
    supplier_ico: row[m.ico] ?? null,
    supplier_name: row[m.meno] ?? null,
    payment_method: row.payment_method ?? null,
    created_by: row.created_by ?? null,
    predmet_mailu: row.predmet_mailu ?? null,
    druh: typ,
    typ:
      typ === "prijata"
        ? typPrijatej(row.type, row.amount_total, row.opravuje_cislo)
        : typ === "vystavena"
          ? (row.type ?? null)
          : null,
  } as const;
}

/** Partner dokladu na hľadanie zvyku: IČO, inak presný názov. */
function filterPartnera(q: Klient, typ: TypDokladu, row: Riadok): Klient | null {
  const m = TABULKY[typ];
  const ico = String(row[m.ico] ?? "").replace(/\D/g, "");
  if (ico.length >= 6) return q.eq(m.ico, row[m.ico]);
  if (!prazdne(row[m.meno])) return q.eq(m.meno, row[m.meno]);
  return null;
}

/** Posledných 10 zaúčtovaných dokladov toho istého partnera a druhu. */
async function zvykPartnera(sb: Klient, typ: TypDokladu, row: Riadok) {
  const m = TABULKY[typ];
  let q = sb
    .from(m.tabulka)
    .select("pohoda_predkontacia, stredisko, cinnost, category, type, amount_total, opravuje_cislo")
    .eq("company_id", row.company_id)
    .neq("id", row.id)
    .not("pohoda_predkontacia", "is", null)
    .not("zauctovane_at", "is", null);
  if (typ === "blocek")
    q = sb
      .from(m.tabulka)
      .select("pohoda_predkontacia, stredisko, cinnost, category")
      .eq("company_id", row.company_id)
      .neq("id", row.id)
      .not("pohoda_predkontacia", "is", null)
      .or("zauctovane_at.not.is.null,exported_at.not.is.null");
  if (typ === "vystavena")
    q = sb
      .from(m.tabulka)
      .select("pohoda_predkontacia, stredisko, cinnost, type")
      .eq("company_id", row.company_id)
      .neq("id", row.id)
      .not("pohoda_predkontacia", "is", null)
      .not("zauctovane_at", "is", null)
      .eq("type", row.type);
  if (typ !== "blocek") q = q.is("deleted_at", null);
  const sPartnerom = filterPartnera(q, typ, row);
  if (!sPartnerom) return null;
  const { data } = await sPartnerom
    .order(typ === "blocek" ? "created_at" : "zauctovane_at", { ascending: false })
    .limit(30);
  let riadky = (data ?? []) as Riadok[];
  if (typ === "prijata") {
    const druh = typPrijatej(row.type, row.amount_total, row.opravuje_cislo);
    riadky = riadky.filter((r) => typPrijatej(r.type, r.amount_total, r.opravuje_cislo) === druh);
  }
  return zvykZDokladov(
    riadky.map((r) => ({
      predkontacia: r.pohoda_predkontacia,
      stredisko: r.stredisko,
      cinnost: r.cinnost,
      kategoria: r.category ?? null,
    })),
  );
}

/** Naučená voľba z `doklad_navyky` — slabší zvyk (pod prahom autopilota). */
async function navykPartnera(sb: Klient, typ: TypDokladu, row: Riadok): Promise<string | null> {
  if (typ === "vystavena") return null;
  const { klucDodavatela, navrhPola, druhPrijatej } = await import("./ucenie-z-oprav");
  const kluc = klucDodavatela({
    ico: row.supplier_ico,
    icDph: row.supplier_ic_dph,
    nazov: row.supplier_name,
  });
  if (!kluc) return null;
  const { data } = await sb
    .from("doklad_navyky")
    .select("polia")
    .eq("company_id", row.company_id)
    .eq("kluc_dodavatela", kluc)
    .eq("druh", typ === "blocek" ? "blocek" : druhPrijatej(row))
    .maybeSingle();
  return navrhPola((data?.polia as Riadok | null)?.predkontacia ?? null);
}

async function prvyOdPartnera(sb: Klient, typ: TypDokladu, row: Riadok): Promise<boolean> {
  const m = TABULKY[typ];
  let q = sb
    .from(m.tabulka)
    .select("id", { count: "exact", head: true })
    .eq("company_id", row.company_id)
    .neq("id", row.id)
    .lt("created_at", row.created_at);
  if (typ !== "blocek") q = q.is("deleted_at", null);
  const s = filterPartnera(q, typ, row);
  if (!s) return true;
  const { count } = await s;
  return !count;
}

async function viesPlatne(sb: Klient, companyId: string, icDph: unknown): Promise<boolean> {
  const { upravIcDph } = await import("./vies");
  const ic = upravIcDph(String(icDph ?? ""));
  if (!ic) return false;
  const { data } = await sb
    .from("vies_checks")
    .select("platne")
    .eq("company_id", companyId)
    .eq("ic_dph", ic)
    .order("overene_at", { ascending: false })
    .limit(1);
  return Boolean(data?.[0]?.platne);
}

export type VolbyMotora = {
  /** Smie sa pýtať AI (predvolene áno; len prijaté a bločky). */
  ai?: boolean;
  firma?: Firma;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  kontext?: any;
};

/**
 * Návrh zaúčtovania jedného dokladu. Hodnoty, ktoré už na doklade sú
 * (napísal ich človek alebo spúšťač pravidla), majú vždy prednosť — motor
 * dopĺňa len prázdne polia.
 */
export async function navrhniZauctovanie(
  sb: Klient,
  dokladTyp: DokladTyp,
  dokladId: string,
  volby: VolbyMotora = {},
): Promise<NavrhZauctovania> {
  if (dokladTyp === "banka") return navrhPohybu(sb, dokladId);
  const m = TABULKY[dokladTyp];
  const { data: row, error } = await sb
    .from(m.tabulka)
    .select("*")
    .eq("id", dokladId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Doklad sa nenašiel.");
  return navrhPreRiadok(sb, dokladTyp, row, volby);
}

export async function navrhPreRiadok(
  sb: Klient,
  typ: TypDokladu,
  row: Riadok,
  volby: VolbyMotora = {},
): Promise<NavrhZauctovania> {
  const kedy = new Date().toISOString();
  const prazdnyNavrh = (x: Partial<NavrhZauctovania>): NavrhZauctovania => ({
    predkontacia: t(row.pohoda_predkontacia),
    clenenieDph: t(row.pohoda_clenenie_dph),
    kvClenenie: t(row.kv_clenenie),
    stredisko: t(row.stredisko),
    cinnost: t(row.cinnost),
    zdroj: null,
    istota: 0,
    zdovodnenie: "",
    blokatory: [],
    kedy,
    ...x,
  });
  if (row.exported_at || row.locked_at || row.deleted_at)
    return prazdnyNavrh({ neprepisovat: true, blokatory: ["uzamknuty"] });

  const firma = volby.firma ?? (await nacitajFirmu(sb, row.company_id));
  const { nacitajKontext } = await import("./ai-predkontacia.server");
  const kontext = volby.kontext ?? (await nacitajKontext(sb, row.company_id));
  const pravidla = (kontext.pravidla ?? []) as (Pravidlo & { id: string })[];

  // Členenie DPH a KV — vždy z režimu dane, nikdy od AI.
  const clen = odvodClenenia(vstupClenenia(typ, row, firma), kontext.ciselnik ?? []);

  // a) pravidlo — to, ktoré uplatnil spúšťač, alebo prvé zhodné.
  const pravidlo =
    (row.pravidlo_id ? pravidla.find((p) => p.id === row.pravidlo_id) : null) ??
    prvePravidlo(pravidla, porovnanie(typ, row));

  let predkontacia = t(row.pohoda_predkontacia);
  let zdroj: NavrhZauctovania["zdroj"] = null;
  let istota = 0;
  let zdovodnenie = "";
  let stredisko = t(row.stredisko);
  let cinnost = t(row.cinnost);
  let kategoria = t(row.category);

  if (
    pravidlo &&
    !prazdne(pravidlo.predkontacia) &&
    (!predkontacia || predkontacia === pravidlo.predkontacia)
  ) {
    predkontacia = String(pravidlo.predkontacia).trim();
    zdroj = "pravidlo";
    istota = 100;
    zdovodnenie = `Pravidlo „${pravidlo.nazov}“`;
    kategoria = kategoria ?? t(pravidlo.kategoria);
  }

  // b) zvyk partnera.
  if (!predkontacia) {
    const z = await zvykPartnera(sb, typ, row);
    if (z) {
      predkontacia = z.predkontacia;
      zdroj = "zvyk";
      istota = z.istota;
      zdovodnenie = `${z.zhoda} z ${z.pocet} posledných dokladov od partnera malo ${z.predkontacia}`;
      stredisko = stredisko ?? z.stredisko;
      cinnost = cinnost ?? z.cinnost;
      kategoria = kategoria ?? z.kategoria;
    } else {
      const n = await navykPartnera(sb, typ, row).catch(() => null);
      if (n) {
        predkontacia = n;
        zdroj = "zvyk";
        istota = 80;
        zdovodnenie = `Naučené z vašich opráv pri tomto partnerovi`;
      }
    }
  }

  // c) AI — len prijaté a bločky slovenských a českých firiem.
  if (
    !predkontacia &&
    volby.ai !== false &&
    typ !== "vystavena" &&
    (firma.krajina === "SK" || firma.krajina === "CZ")
  ) {
    const ai = await import("./ai-predkontacia.server");
    try {
      const v =
        typ === "prijata"
          ? await ai.navrhPrijatej(sb, row, kontext, null)
          : await ai.navrhBlocku(sb, row, kontext, null);
      const pk = v.polia?.predkontacia;
      if (pk && pk.zdroj === "ai") {
        predkontacia = pk.hodnota;
        zdroj = "ai";
        istota = v.istota ?? 70;
        zdovodnenie = v.dovod ? `AI: ${v.dovod}` : "Návrh AI";
        const kat = v.polia?.kategoria;
        if (kat && !kategoria) kategoria = kat.hodnota;
      }
    } catch (e) {
      console.warn(
        "[auto-uctovanie] AI návrh zlyhal:",
        String((e as Error)?.message ?? e).slice(0, 160),
      );
    }
  }

  // Hodnoty na doklade a v pravidle prebíjajú odvodené členenie.
  const clenenieDph = t(row.pohoda_clenenie_dph) ?? t(pravidlo?.clenenie_dph) ?? clen.clenenieDph;
  const kvClenenie = t(row.kv_clenenie) ?? t(pravidlo?.kv_clenenie) ?? clen.kvClenenie;
  const rezimText = `${NAZVY_REZIMOV[clen.rezim]}${clenenieDph ? ` → ${clenenieDph}` : ""}${kvClenenie ? ` / KV ${kvClenenie}` : ""}`;

  const m = TABULKY[typ];
  const [prvy, vies] = await Promise.all([
    typ === "vystavena" ? Promise.resolve(false) : prvyOdPartnera(sb, typ, row),
    viesPlatne(sb, row.company_id, row[m.icDph]),
  ]);
  const zakladStlpec =
    typ === "prijata" ? "amount_without_vat" : typ === "blocek" ? "net_amount" : "subtotal";
  const dphStlpec = typ === "vystavena" ? "vat_total" : "vat_amount";
  const bl = blokatory({
    polozkyNesedia:
      typ !== "vystavena" &&
      !(Array.isArray(row.polozky_vypnute) && row.polozky_vypnute.length) &&
      polozkyNesedia(row.items, row[zakladStlpec], row[m.suma]),
    // Vystavená môže mať odpočet zálohy či zľavu na doklad — súčet sa tu nekontroluje.
    zaklad: typ === "vystavena" ? null : row[zakladStlpec],
    dph: typ === "vystavena" ? null : row[dphStlpec],
    celkom: typ === "vystavena" ? null : row[m.suma],
    rezim: clen.rezim,
    viesPlatne: vies,
    sumaEur: sumaDoma(typ, row, firma.krajina),
    limit: firma.limit,
    prvyOdPartnera: prvy,
    predkontacia,
    clenenieDph,
  });

  return {
    predkontacia,
    clenenieDph,
    kvClenenie,
    stredisko,
    cinnost,
    kategoria,
    zdroj,
    istota,
    pravidloId: zdroj === "pravidlo" ? (pravidlo?.id ?? null) : null,
    pravidloNazov: zdroj === "pravidlo" ? (pravidlo?.nazov ?? null) : null,
    zdovodnenie: [zdovodnenie, rezimText].filter(Boolean).join(" · "),
    blokatory: bl,
    rezimDph: clen.rezim,
    kedy,
  };
}

/**
 * Bankový pohyb sa neukladá — zaúčtuje sa pri výpise do Pohody. Návrh:
 * pravidlo pre banku (účet, smer, protistrana), inak pri spárovanom pohybe
 * úhradová predkontácia firmy. Nespárovaný pohyb bez pravidla nedostane nič
 * a AI sa pri banke nepýta.
 */
export async function navrhPohybu(sb: Klient, id: string): Promise<NavrhZauctovania> {
  const kedy = new Date().toISOString();
  const { data: p } = await sb.from("bank_transactions").select("*").eq("id", id).maybeSingle();
  if (!p) throw new Error("Pohyb sa nenašiel.");
  const [{ data: ucet }, { data: pravidla }, { data: firma }] = await Promise.all([
    p.bank_account_id
      ? sb.from("bank_accounts").select("iban").eq("id", p.bank_account_id).maybeSingle()
      : Promise.resolve({ data: null }),
    sb
      .from("pravidla_uctovania")
      .select("*")
      .eq("company_id", p.company_id)
      .eq("druh", "banka")
      .eq("aktivne", true),
    sb.from("companies").select("pohoda_predkontacia_banka").eq("id", p.company_id).maybeSingle(),
  ]);
  const smer = Number(p.amount) < 0 ? "vydaj" : "prijem";
  const r = pravidloPohybu(
    (pravidla ?? []) as Pravidlo[],
    { smer, protistrana: p.counterparty, popis: p.description },
    ucet?.iban,
  );
  const sparovany = Boolean(
    p.matched_invoice_id ||
    p.matched_purchase_invoice_id ||
    p.matched_expense_id ||
    p.matched_installment_id,
  );
  const zaklad: NavrhZauctovania = {
    predkontacia: null,
    clenenieDph: null,
    kvClenenie: null,
    stredisko: null,
    cinnost: null,
    zdroj: null,
    istota: 0,
    zdovodnenie: "",
    blokatory: [],
    kedy,
  };
  if (r)
    return {
      ...zaklad,
      predkontacia: r.predkontacia,
      zdroj: "pravidlo",
      istota: 100,
      pravidloId: (r as Pravidlo).id ?? null,
      pravidloNazov: r.nazov,
      zdovodnenie: `Pravidlo „${r.nazov}“`,
    };
  if (sparovany && !prazdne(firma?.pohoda_predkontacia_banka)) {
    const druh = p.matched_invoice_id
      ? "úhrada vystavenej faktúry"
      : p.matched_purchase_invoice_id
        ? "úhrada prijatej faktúry"
        : p.matched_expense_id
          ? "úhrada dokladu"
          : "splátka";
    return {
      ...zaklad,
      predkontacia: String(firma!.pohoda_predkontacia_banka).trim(),
      zdovodnenie: `Spárovaný pohyb (${druh}) — predvolená predkontácia pre banku`,
    };
  }
  return {
    ...zaklad,
    blokatory: ["predkontacia"],
    zdovodnenie: sparovany ? "" : "Nespárovaný pohyb bez pravidla",
  };
}

/** Uloží návrh na kontrolu (nič nezaúčtuje). */
export async function ulozNavrh(
  sb: Klient,
  typ: TypDokladu,
  id: string,
  n: NavrhZauctovania | null,
) {
  const { error } = await sb
    .from(TABULKY[typ].tabulka)
    .update({ auto_uctovanie_navrh: n, auto_uctovanie_at: new Date().toISOString() })
    .eq("id", id)
    .is("zauctovane_at", null)
    .is("exported_at", null);
  if (error) throw new Error(error.message);
}

/**
 * Zaúčtuje doklad podľa návrhu. Prázdne polia doplní, vyplnené nechá.
 * `automat` = fronta (servisný kľúč): zdroj a istota sa zapíšu, `zauctoval`
 * ostane prázdne. Človek (`automat: false`) dostane zdroj „manual“ od
 * spúšťača v databáze.
 */
export async function potvrdNavrh(
  sb: Klient,
  typ: TypDokladu,
  row: Riadok,
  n: NavrhZauctovania,
  args: { automat: boolean; userId?: string | null },
): Promise<boolean> {
  if (jeUzavrety(row)) return false;
  const zmena: Riadok = {
    zauctovane_at: new Date().toISOString(),
    zauctoval: args.automat ? null : (args.userId ?? null),
    auto_uctovanie_at: new Date().toISOString(),
    auto_uctovanie_navrh: n,
  };
  if (args.automat) {
    zmena.zauctovanie_zdroj = n.zdroj;
    zmena.zauctovanie_istota = Math.max(0, Math.min(100, Math.round(n.istota)));
  }
  const dopln = (stlpec: string, h: string | null | undefined) => {
    if (prazdne(row[stlpec]) && !prazdne(h)) zmena[stlpec] = String(h).trim();
  };
  dopln("pohoda_predkontacia", n.predkontacia);
  dopln("pohoda_clenenie_dph", n.clenenieDph);
  dopln("kv_clenenie", n.kvClenenie);
  if (typ !== "vystavena") {
    dopln("stredisko", n.stredisko);
    dopln("cinnost", n.cinnost);
    dopln("category", n.kategoria);
  }
  if (n.pravidloId && !row.pravidlo_id) zmena.pravidlo_id = n.pravidloId;
  let q = sb
    .from(TABULKY[typ].tabulka)
    .update(zmena)
    .eq("id", row.id)
    .is("zauctovane_at", null)
    .is("exported_at", null);
  if (typ !== "blocek") q = q.is("deleted_at", null);
  const { data, error } = await q.select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) return false;
  // „Prijatá“ sa zaúčtovaním stáva „zaúčtovanou“; zaplatená ostáva zaplatená.
  if (typ === "prijata")
    await sb
      .from("purchase_invoices")
      .update({ status: "booked" })
      .eq("id", row.id)
      .eq("status", "received");
  return true;
}

/** Doklad, ktorý fronta (aj ručné potvrdenie) smie zaúčtovať. */
export async function smieSaZauctovat(typ: TypDokladu, row: Riadok): Promise<boolean> {
  if (jeUzavrety(row)) return false;
  if (typ === "prijata") {
    if (!["received", "paid"].includes(String(row.status))) return false;
    // Zálohová nie je náklad a konektor ju neberie.
    if (row.type === "proforma") return false;
    const { zapocitatelna } = await import("./samofakturacia");
    return zapocitatelna(row);
  }
  if (typ === "vystavena")
    return !["draft", "cancelled"].includes(String(row.status)) && row.type !== "proforma";
  return row.status === "processed";
}

const STLPCE_FRONTY: Record<TypDokladu, string> = {
  prijata: "*",
  blocek: "*",
  vystavena: "*",
};

let bezi = false;

/**
 * Fronta: nové doklady firiem so zapnutým autopilotom. Beží v rozpočte času
 * (nginx strihá po 30 s) — čo nestihne, vezme o minútu.
 */
export async function spracujAutoUctovanie(
  admin: Klient,
  args: { rozpocetMs?: number; naraz?: number } = {},
): Promise<{ navrhov: number; zauctovanych: number; preskocenych: number; zostava: boolean }> {
  const vysledok = { navrhov: 0, zauctovanych: 0, preskocenych: 0, zostava: false };
  if (bezi) return vysledok;
  bezi = true;
  const zaciatok = Date.now();
  const rozpocet = args.rozpocetMs ?? 20_000;
  try {
    const { data: firmy } = await admin
      .from("companies")
      .select("id, auto_uctovanie_od")
      .neq("auto_uctovanie_rezim", "vypnuty")
      .in("country", ["SK", "CZ"]);
    const odFirmy = new Map<string, string>(
      ((firmy ?? []) as Riadok[]).map((f) => [f.id, f.auto_uctovanie_od]),
    );
    if (!odFirmy.size) return vysledok;
    const najstarsie = [...odFirmy.values()].sort()[0];
    const ids = [...odFirmy.keys()];
    const kandidati: { typ: TypDokladu; row: Riadok }[] = [];
    for (const typ of ["prijata", "blocek", "vystavena"] as TypDokladu[]) {
      let q = admin
        .from(TABULKY[typ].tabulka)
        .select(STLPCE_FRONTY[typ])
        .in("company_id", ids)
        .is("auto_uctovanie_at", null)
        .is("zauctovane_at", null)
        .is("exported_at", null)
        .gte("created_at", najstarsie)
        .order("created_at", { ascending: true })
        .limit(args.naraz ?? 40);
      if (typ !== "blocek") q = q.is("deleted_at", null);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      for (const row of (data ?? []) as Riadok[])
        if (String(row.created_at) >= String(odFirmy.get(row.company_id) ?? ""))
          kandidati.push({ typ, row });
    }
    const firmyCache = new Map<string, Firma>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kontexty = new Map<string, any>();
    const { nacitajKontext } = await import("./ai-predkontacia.server");
    for (const { typ, row } of kandidati) {
      if (Date.now() - zaciatok > rozpocet) {
        vysledok.zostava = true;
        break;
      }
      try {
        let firma = firmyCache.get(row.company_id);
        if (!firma) {
          firma = await nacitajFirmu(admin, row.company_id);
          firmyCache.set(row.company_id, firma);
        }
        // Firma bez účtovania (nič neexportuje) — návrhy by nikto nečítal.
        if (!firma.pouzivaUctovanie || firma.rezim === "vypnuty") {
          await ulozNavrh(admin, typ, row.id, null);
          vysledok.preskocenych++;
          continue;
        }
        /*
          Koncept, stornovaný či ešte nespracovaný doklad sa neúčtuje. Označí
          sa ako prejdený — keď ho človek dokončí (zmena stavu), spúšťač ho
          vráti do fronty.
        */
        if (!(await smieSaZauctovat(typ, row))) {
          await ulozNavrh(admin, typ, row.id, null);
          vysledok.preskocenych++;
          continue;
        }
        let kontext = kontexty.get(row.company_id);
        if (!kontext) {
          kontext = await nacitajKontext(admin, row.company_id);
          kontexty.set(row.company_id, kontext);
        }
        const n = await navrhPreRiadok(admin, typ, row, { firma, kontext, ai: true });
        if (smieAutopilot(firma.rezim, n)) {
          if (await potvrdNavrh(admin, typ, row, n, { automat: true })) {
            vysledok.zauctovanych++;
            continue;
          }
        }
        await ulozNavrh(admin, typ, row.id, n);
        vysledok.navrhov++;
      } catch (e) {
        console.warn(
          "[auto-uctovanie] doklad",
          row.id,
          String((e as Error)?.message ?? e).slice(0, 200),
        );
        // Chybný doklad nesmie zablokovať frontu — označí sa a ide sa ďalej.
        await ulozNavrh(admin, typ, row.id, null).catch(() => {});
        vysledok.preskocenych++;
      }
    }
    return vysledok;
  } finally {
    bezi = false;
  }
}

/**
 * „Navrhnúť zaúčtovanie pre nezaúčtované“ — len návrhy, nič sa nezaúčtuje.
 * Volá sa opakovane z prehliadača, kým `zostava` nie je nula.
 */
export async function navrhniPreNezauctovane(
  sb: Klient,
  companyId: string,
  args: { rozpocetMs?: number; ai?: boolean } = {},
): Promise<{ spracovanych: number; zostava: number }> {
  const zaciatok = Date.now();
  const rozpocet = args.rozpocetMs ?? 18_000;
  const firma = await nacitajFirmu(sb, companyId);
  const { nacitajKontext } = await import("./ai-predkontacia.server");
  const kontext = await nacitajKontext(sb, companyId);
  let spracovanych = 0;
  let zostava = 0;
  for (const typ of ["prijata", "blocek", "vystavena"] as TypDokladu[]) {
    let q = sb
      .from(TABULKY[typ].tabulka)
      .select("*", { count: "exact" })
      .eq("company_id", companyId)
      .is("zauctovane_at", null)
      .is("exported_at", null)
      .is("auto_uctovanie_navrh", null)
      .order("created_at", { ascending: false })
      .limit(25);
    if (typ !== "blocek") q = q.is("deleted_at", null);
    if (typ === "prijata") q = q.in("status", ["received", "paid"]).neq("type", "proforma");
    if (typ === "vystavena") q = q.not("status", "in", "(draft,cancelled)");
    if (typ === "blocek") q = q.eq("status", "processed");
    const { data, count, error } = await q;
    if (error) throw new Error(error.message);
    const riadky = (data ?? []) as Riadok[];
    let hotovo = 0;
    for (const row of riadky) {
      if (Date.now() - zaciatok > rozpocet) break;
      const n = await navrhPreRiadok(sb, typ, row, { firma, kontext, ai: args.ai !== false });
      await ulozNavrh(sb, typ, row.id, n);
      hotovo++;
    }
    spracovanych += hotovo;
    zostava += Math.max(0, (count ?? 0) - hotovo);
  }
  return { spracovanych, zostava };
}

/**
 * Oprava automatického návrhu človekom: zapíše sa do histórie dokladu a pri
 * druhej rovnakej oprave u toho istého partnera vráti ponuku pravidla.
 * `admin` — história má len spúšťače, priamy zápis cez servisný kľúč
 * (volá sa až po tom, čo klient prihláseného doklad uložil).
 */
export async function zaznamenajOpravu(
  admin: Klient,
  args: {
    companyId: string;
    typ: TypDokladu;
    dokladId: string;
    userId: string | null;
    partner: { ico: string | null; nazov: string | null };
    pred: { predkontacia: string | null; zdroj: string | null; istota: number | null };
    po: { predkontacia: string | null; clenenie: string | null; kv: string | null };
  },
): Promise<null | {
  nazov: string;
  ico: string | null;
  text: string | null;
  druh: TypDokladu;
  predkontacia: string;
  clenenie: string | null;
  kv: string | null;
}> {
  const po = t(args.po.predkontacia);
  if (!po || po === t(args.pred.predkontacia)) return null;
  const ico = t(args.partner.ico);
  const agenda = TABULKY[args.typ].agenda;
  await admin.from("historia_dokladov").insert({
    company_id: args.companyId,
    agenda,
    doklad_id: args.dokladId,
    pole: "zauctovanie_oprava",
    pred: args.pred,
    po: { ...args.po, ico, nazov: args.partner.nazov },
    kto: args.userId,
  });
  let q = admin
    .from("historia_dokladov")
    .select("id", { count: "exact", head: true })
    .eq("company_id", args.companyId)
    .eq("agenda", agenda)
    .eq("pole", "zauctovanie_oprava")
    .eq("po->>predkontacia", po);
  q = ico ? q.eq("po->>ico", ico) : q.eq("po->>nazov", args.partner.nazov ?? "");
  const { count } = await q;
  if ((count ?? 0) < 2) return null;
  // Pravidlo pre partnera už je — neponúkať druhé.
  const { data: uz } = await admin
    .from("pravidla_uctovania")
    .select("id")
    .eq("company_id", args.companyId)
    .eq("druh", args.typ)
    .eq(ico ? "dodavatel_ico" : "dodavatel_text", ico ?? args.partner.nazov ?? "")
    .limit(1);
  if (uz?.length) return null;
  return {
    nazov: `${args.partner.nazov ?? ico ?? "Partner"} → ${po}`.slice(0, 80),
    ico,
    text: ico ? null : args.partner.nazov,
    druh: args.typ,
    predkontacia: po,
    clenenie: t(args.po.clenenie),
    kv: t(args.po.kv),
  };
}

/** Podiel automaticky zaúčtovaných dokladov v mesiaci (dashboard). */
export async function statistikaMesiaca(sb: Klient, companyId: string, od: string) {
  const out = { spolu: 0, automaticky: 0, naKontrolu: 0 };
  for (const typ of ["prijata", "blocek", "vystavena"] as TypDokladu[]) {
    const m = TABULKY[typ];
    const zaklad = () => {
      let q = sb
        .from(m.tabulka)
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId);
      if (typ !== "blocek") q = q.is("deleted_at", null);
      return q;
    };
    const [spolu, auto, cakaju] = await Promise.all([
      zaklad().gte("zauctovane_at", od),
      zaklad().gte("zauctovane_at", od).in("zauctovanie_zdroj", ["pravidlo", "zvyk", "ai"]),
      zaklad()
        .is("zauctovane_at", null)
        .is("exported_at", null)
        .not("auto_uctovanie_navrh", "is", null),
    ]);
    out.spolu += spolu.count ?? 0;
    out.automaticky += auto.count ?? 0;
    out.naKontrolu += cakaju.count ?? 0;
  }
  return { ...out, percent: out.spolu ? Math.round((out.automaticky / out.spolu) * 100) : null };
}

export { popisZdroja, r2 };
