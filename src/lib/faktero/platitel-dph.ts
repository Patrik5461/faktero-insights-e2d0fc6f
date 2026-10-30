/**
 * Overenie platiteľstva DPH v oficiálnych registroch — čistá logika bez siete.
 *
 * Slovensko: Finančná správa zverejňuje denne (bez kľúča) tri zoznamy ako ZIP
 * s XML na report.financnasprava.sk:
 *   - ds_dphs — subjekty registrované pre DPH vrátane paragrafu registrácie
 *     (§4, §4b, §5, §7, §7a), dátumu registrácie a „platiteľ od“,
 *   - ds_dphz — platitelia, u ktorých nastali dôvody na zrušenie registrácie,
 *   - ds_dphv — platitelia vymazaní z registra (s dátumom výmazu).
 * Ten istý obsah má aj API iz.opendata.financnasprava.sk, to však chce kľúč a
 * hľadá len podľa IČ DPH — preto sa berú súbory.
 *
 * Česko: Registr plátců DPH (ADIS, `getStatusNespolehlivySubjektRozsirenyV2`)
 * vráti typ subjektu — plátce, identifikovaná osoba, skupina, nenalezen.
 *
 * Pravidlo: nastavenie, ktoré firma už má, sa nikdy neprepíše. Doplní sa len
 * prázdny režim DPH (a prázdne IČ DPH); inak sa nesúlad iba ukáže.
 */
import { jeSchemaDph, schema as schemaZaznam, type SchemaDph } from "./dph-rezim";
import { krajinaDane } from "./vat-rates";

export type ZdrojRegistra = "fs_sk" | "adis_cz";
export type StavRegistra = "platitel" | "registrovany" | "neregistrovany" | "chyba";

/** Riadok zoznamu ds_dphs (registrovaní pre DPH). */
export type ZaznamDphs = {
  icDph: string;
  ico: string | null;
  nazov: string | null;
  druh: string | null;
  datumReg: string | null;
  datumZmenyDruhu: string | null;
  platitelOd: string | null;
};

/** Riadok zoznamu ds_dphz (dôvody na zrušenie) alebo ds_dphv (vymazaní). */
export type ZaznamZrusenia = {
  icDph: string;
  ico: string | null;
  nazov: string | null;
  rokPorusenia: string | null;
  zverejnene: string | null;
  /** Len ds_dphv. */
  vymazane: string | null;
};

export type VysledokRegistra = {
  zdroj: ZdrojRegistra;
  stav: StavRegistra;
  /** Režim podľa registra; pri chybe null. */
  schema: SchemaDph | null;
  icDph: string | null;
  /** Odkedy platí súčasná registrácia (YYYY-MM-DD). */
  platneOd: string | null;
  /** Dátum výmazu z registra (len SK, len pri zrušení z úradnej moci). */
  zruseneOd: string | null;
  /** FS zverejnila dôvody na zrušenie registrácie (§ 81 ods. 4 písm. b). */
  dovodyNaZrusenie: { rok: string | null; zverejnene: string | null } | null;
  /** Nespoľahlivý platca (CZ). */
  nespolehlivy: boolean;
  /** Deň, ku ktorému bol zoznam zverejnený. */
  zoznamK: string | null;
  /** Riadky registra, z ktorých výsledok vznikol — ukladajú sa ako dôkaz. */
  odpoved: unknown;
  chyba: string | null;
  /** Firma nemá podľa čoho hľadať (IČO, IČ DPH, DIČ) — nie je to výpadok registra. */
  bezUdajov?: boolean;
};

export type FirmaNaOverenie = {
  id?: string;
  country?: string | null;
  ico?: string | null;
  dic?: string | null;
  ic_dph?: string | null;
  vat_payer?: boolean | null;
  vat_scheme?: string | null;
};

const DRUH_NA_SCHEMU: Record<string, SchemaDph> = {
  "§4": "sk_4",
  "§4b": "sk_4b",
  "§5": "sk_5",
  "§7": "sk_7",
  "§7a": "sk_7a",
};

/** „§ 4“, „§4b“ → kód režimu. Neznámy druh → null. */
export function schemaZDruhu(druh: string | null | undefined): SchemaDph | null {
  const k = String(druh ?? "")
    .replace(/\s+/g, "")
    .toLowerCase();
  return DRUH_NA_SCHEMU[k] ?? null;
}

/** „01.08.1998“ → „1998-08-01“; „30102026“ (hlavička zoznamu) tiež. */
export function datumFs(v: string | null | undefined): string | null {
  const s = String(v ?? "").trim();
  let m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = /^(\d{2})(\d{2})(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

export function lenCislice(v: string | null | undefined): string {
  return String(v ?? "").replace(/\D/g, "");
}

/** IČ DPH v tvare SK1234567890 (veľké písmená, bez medzier). */
export function upravIcDph(v: string | null | undefined): string {
  return String(v ?? "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

/** Text elementu z jednej položky XML zoznamu FS (bez entít okrem základných). */
function element(item: string, meno: string): string | null {
  const m = new RegExp(`<${meno}>([^<]*)</${meno}>`).exec(item);
  if (!m) return null;
  const v = m[1]
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
  return v || null;
}

export function zaznamDphs(item: string): ZaznamDphs | null {
  const icDph = element(item, "IC_DPH");
  if (!icDph) return null;
  return {
    icDph: upravIcDph(icDph),
    ico: lenCislice(element(item, "ICO")) || null,
    nazov: element(item, "NAZOV_DS"),
    druh: element(item, "DRUH_REG_DPH"),
    datumReg: element(item, "DATUM_REG"),
    datumZmenyDruhu: element(item, "DATUM_ZMENY_DRUHU_REG"),
    platitelOd: element(item, "PLAT_DPH_OD"),
  };
}

export function zaznamZrusenia(item: string): ZaznamZrusenia | null {
  const icDph = element(item, "IC_DPH");
  if (!icDph) return null;
  return {
    icDph: upravIcDph(icDph),
    ico: lenCislice(element(item, "ICO")) || null,
    nazov: element(item, "NAZOV"),
    rokPorusenia: element(item, "ROK_PORUSENIA"),
    zverejnene: element(item, "DAT_ZVEREJNENIA"),
    vymazane: element(item, "DAT_VYMAZU"),
  };
}

/**
 * Položky `<ITEM>…</ITEM>` z kúska XML. Vráti aj nespracovaný zvyšok, ktorý
 * treba prilepiť pred ďalší kúsok — súbor sa číta po častiach (127 MB).
 */
export function polozkyXml(buffer: string): { polozky: string[]; zvysok: string } {
  const polozky: string[] = [];
  let od = 0;
  for (;;) {
    const a = buffer.indexOf("<ITEM>", od);
    if (a < 0) break;
    const b = buffer.indexOf("</ITEM>", a);
    if (b < 0) {
      od = a;
      return { polozky, zvysok: buffer.slice(a) };
    }
    polozky.push(buffer.slice(a, b + 7));
    od = b + 7;
  }
  // Bez rozpracovanej položky stačí podržať koniec, v ktorom môže začínať „<ITEM>“.
  return { polozky, zvysok: buffer.slice(Math.max(od, buffer.length - 6)) };
}

/** Dátum aktualizácie zoznamu z hlavičky XML. */
export function datumZoznamu(xmlZaciatok: string): string | null {
  const m = /<DatumAktualizacieZoznamu>(\d{8})<\/DatumAktualizacieZoznamu>/.exec(xmlZaciatok);
  return m ? datumFs(m[1]) : null;
}

/*
  Kompaktný riadok indexu (TSV) — celý zoznam ds_dphs má ~320 000 subjektov a
  v pamäti sa drží len toto, nie objekty.
*/
export function dphsNaRiadok(z: ZaznamDphs): string {
  return [
    z.ico ?? "",
    z.icDph,
    z.druh ?? "",
    z.datumReg ?? "",
    z.platitelOd ?? "",
    z.datumZmenyDruhu ?? "",
    (z.nazov ?? "").replace(/[\t\n]/g, " "),
  ].join("\t");
}

export function riadokNaDphs(r: string): ZaznamDphs {
  const [ico, icDph, druh, datumReg, platitelOd, datumZmenyDruhu, nazov] = r.split("\t");
  return {
    ico: ico || null,
    icDph,
    druh: druh || null,
    datumReg: datumReg || null,
    platitelOd: platitelOd || null,
    datumZmenyDruhu: datumZmenyDruhu || null,
    nazov: nazov || null,
  };
}

export function zruseniaNaRiadok(z: ZaznamZrusenia): string {
  return [
    z.ico ?? "",
    z.icDph,
    z.rokPorusenia ?? "",
    z.zverejnene ?? "",
    z.vymazane ?? "",
    (z.nazov ?? "").replace(/[\t\n]/g, " "),
  ].join("\t");
}

export function riadokNaZrusenie(r: string): ZaznamZrusenia {
  const [ico, icDph, rokPorusenia, zverejnene, vymazane, nazov] = r.split("\t");
  return {
    ico: ico || null,
    icDph,
    rokPorusenia: rokPorusenia || null,
    zverejnene: zverejnene || null,
    vymazane: vymazane || null,
    nazov: nazov || null,
  };
}

/**
 * Riadky indexu pre IČO alebo IČ DPH. Index začína „\n“ a každý riadok končí
 * „\n“, takže sa dá hľadať cez indexOf bez rozdelenia celého textu.
 */
export function najdiVIndexe(index: string, ico: string | null, icDph: string | null): string[] {
  const out = new Set<string>();
  const hladaj = (vzor: string, odZaciatku: boolean) => {
    let od = 0;
    for (;;) {
      const i = index.indexOf(vzor, od);
      if (i < 0) return;
      const zaciatok = odZaciatku ? i + 1 : index.lastIndexOf("\n", i) + 1;
      const koniec = index.indexOf("\n", i + 1);
      out.add(index.slice(zaciatok, koniec < 0 ? undefined : koniec));
      od = i + vzor.length;
    }
  };
  if (ico) hladaj(`\n${ico}\t`, true);
  if (icDph) hladaj(`\t${icDph}\t`, false);
  return [...out];
}

/** Firma pri hľadaní: IČO (8 číslic, doplnené nulami) a IČ DPH so SK. */
export function identifikatorySk(f: FirmaNaOverenie): { ico: string | null; icDph: string | null } {
  const ico = lenCislice(f.ico);
  const ic = upravIcDph(f.ic_dph);
  return {
    ico: ico.length >= 6 && ico.length <= 8 ? ico.padStart(8, "0") : null,
    icDph: /^SK\d{10}$/.test(ic) ? ic : null,
  };
}

/**
 * Výsledok pre slovenskú firmu zo záznamov troch zoznamov.
 *
 * Prednosť má zhoda podľa IČ DPH (skupinová registrácia § 4b má jedno IČ DPH
 * pre viac IČO), potom podľa IČO. Keď firma v ds_dphs nie je, z ds_dphv sa
 * zistí, odkedy registrácia neplatí.
 */
export function vysledokSk(
  firma: FirmaNaOverenie,
  zaznamy: { dphs: ZaznamDphs[]; dphz: ZaznamZrusenia[]; dphv: ZaznamZrusenia[] },
  zoznamK: string | null,
): VysledokRegistra {
  const { icDph } = identifikatorySk(firma);
  const reg =
    (icDph && zaznamy.dphs.find((z) => z.icDph === icDph)) ||
    zaznamy.dphs.find((z) => schemaZDruhu(z.druh) != null) ||
    null;
  const odpoved = { zoznamK, ...zaznamy };
  if (reg) {
    const kod = schemaZDruhu(reg.druh);
    const dovod =
      zaznamy.dphz.find((z) => z.icDph === reg.icDph) ??
      (zaznamy.dphz.length ? zaznamy.dphz[0] : null);
    return {
      zdroj: "fs_sk",
      stav: kod && schemaZaznam(kod).platitel ? "platitel" : "registrovany",
      schema: kod,
      icDph: reg.icDph,
      platneOd:
        datumFs(reg.datumZmenyDruhu) ?? datumFs(reg.platitelOd) ?? datumFs(reg.datumReg) ?? null,
      zruseneOd: null,
      dovodyNaZrusenie: dovod
        ? { rok: dovod.rokPorusenia, zverejnene: datumFs(dovod.zverejnene) }
        : null,
      nespolehlivy: false,
      zoznamK,
      odpoved,
      chyba: null,
    };
  }
  // Najnovší výmaz — firma mohla byť registrovaná a vymazaná viackrát.
  const vymaz = [...zaznamy.dphv]
    .filter((z) => datumFs(z.vymazane))
    .sort((a, b) => String(datumFs(b.vymazane)).localeCompare(String(datumFs(a.vymazane))))[0];
  return {
    zdroj: "fs_sk",
    stav: "neregistrovany",
    schema: "sk_neplatitel",
    icDph: null,
    platneOd: vymaz ? datumFs(vymaz.vymazane) : null,
    zruseneOd: vymaz ? datumFs(vymaz.vymazane) : null,
    dovodyNaZrusenie: null,
    nespolehlivy: false,
    zoznamK,
    odpoved,
    chyba: null,
  };
}

export type TypSubjektuCz =
  "PLATCE_DPH" | "IDENTIFIKOVANA_OSOBA" | "SKUPINA_DPH" | "NENALEZEN" | "NESPOLEHLIVA_OSOBA";

/** DIČ pre Registr plátců DPH: z DIČ, IČ DPH, inak IČO právnickej osoby. */
export function dicPreCz(f: FirmaNaOverenie): string | null {
  for (const v of [f.ic_dph, f.dic]) {
    const s = upravIcDph(v).replace(/^CZ/, "");
    if (/^\d{8,10}$/.test(s)) return s;
  }
  const ico = lenCislice(f.ico);
  return ico.length === 8 ? ico : null;
}

/** Výsledok pre českú firmu z odpovede Registra plátců DPH. */
export function vysledokCz(
  dic: string,
  typ: TypSubjektuCz | string,
  nespolehlivy: boolean,
  odpoved: unknown,
  zoznamK: string | null,
): VysledokRegistra {
  const zaklad = {
    zdroj: "adis_cz" as const,
    platneOd: null,
    zruseneOd: null,
    dovodyNaZrusenie: null,
    nespolehlivy,
    zoznamK,
    odpoved,
    chyba: null,
  };
  if (typ === "PLATCE_DPH" || typ === "SKUPINA_DPH")
    return { ...zaklad, stav: "platitel", schema: "cz_platce", icDph: `CZ${dic}` };
  if (typ === "IDENTIFIKOVANA_OSOBA")
    return { ...zaklad, stav: "registrovany", schema: "cz_identifikovana", icDph: `CZ${dic}` };
  // NESPOLEHLIVA_OSOBA nie je platcom — v registri je len kvôli nespoľahlivosti.
  return { ...zaklad, stav: "neregistrovany", schema: "cz_neplatce", icDph: null };
}

export function chybaRegistra(
  zdroj: ZdrojRegistra,
  chyba: string,
  bezUdajov = false,
): VysledokRegistra {
  return {
    bezUdajov,
    zdroj,
    stav: "chyba",
    schema: null,
    icDph: null,
    platneOd: null,
    zruseneOd: null,
    dovodyNaZrusenie: null,
    nespolehlivy: false,
    zoznamK: null,
    odpoved: null,
    chyba,
  };
}

/** Ktorý register sa na firmu pýta. Nemecko žiadny verejný register nemá. */
export function zdrojPreFirmu(f: FirmaNaOverenie): ZdrojRegistra | null {
  const k = krajinaDane(f.country);
  if (k === "SK") return "fs_sk";
  if (k === "CZ") return "adis_cz";
  return null;
}

export type Porovnanie = {
  /** Čo sa smie doplniť do firmy (len prázdne polia). */
  doplnit: { vat_payer?: boolean; vat_scheme?: SchemaDph; ic_dph?: string } | null;
  /** Nastavenie firmy s registrom nesedí. */
  nesulad: boolean;
};

/**
 * Porovná firmu s registrom. Vyplnený režim sa nikdy neprepisuje; prázdny sa
 * doplní celý (aj zaškrtnutie platiteľa), prázdne IČ DPH sa doplní, len keď
 * ho registrácia má.
 */
export function porovnaj(f: FirmaNaOverenie, v: VysledokRegistra): Porovnanie {
  if (v.stav === "chyba" || !v.schema) return { doplnit: null, nesulad: false };
  const doplnit: NonNullable<Porovnanie["doplnit"]> = {};
  const maSchemu = jeSchemaDph(f.vat_scheme);
  if (!maSchemu) {
    doplnit.vat_scheme = v.schema;
    doplnit.vat_payer = schemaZaznam(v.schema).platitel;
  }
  // IČ DPH len k režimu, ktorý s registrom sedí — neplatiteľovi by sa inak
  // dostalo na faktúry číslo, ktoré k jeho nastaveniu nepatrí.
  if (!String(f.ic_dph ?? "").trim() && v.icDph && (!maSchemu || f.vat_scheme === v.schema))
    doplnit.ic_dph = v.icDph;

  let nesulad = false;
  if (maSchemu) {
    nesulad = f.vat_scheme !== v.schema;
  }
  // IČ DPH vo Faktere iné, než má register (preklep, staré číslo).
  if (!nesulad && v.icDph && String(f.ic_dph ?? "").trim() && upravIcDph(f.ic_dph) !== v.icDph)
    nesulad = true;
  return { doplnit: Object.keys(doplnit).length ? doplnit : null, nesulad };
}

export type PredoslyZaznam = {
  stav: StavRegistra;
  schema: string | null;
  ic_dph: string | null;
  platne_od?: string | null;
};

/** Zmena registrácie oproti predošlému overeniu (chyby sa nepočítajú). */
export function zmenaRegistracie(
  predosly: PredoslyZaznam | null,
  novy: VysledokRegistra,
): "nova_registracia" | "zrusenie" | "zmena_druhu" | null {
  if (!predosly || predosly.stav === "chyba" || novy.stav === "chyba") return null;
  const bol = predosly.stav !== "neregistrovany";
  const je = novy.stav !== "neregistrovany";
  if (!bol && je) return "nova_registracia";
  if (bol && !je) return "zrusenie";
  if (bol && je && predosly.schema !== novy.schema) return "zmena_druhu";
  return null;
}

/** Je nový výsledok rovnaký ako posledný uložený? Potom sa len posunie dátum. */
export function rovnakyVysledok(
  predosly: (PredoslyZaznam & { zdroj?: string; nesulad?: unknown }) | null,
  novy: VysledokRegistra,
  nesulad: boolean,
): boolean {
  if (!predosly) return false;
  return (
    predosly.stav === novy.stav &&
    (predosly.schema ?? null) === (novy.schema ?? null) &&
    (predosly.ic_dph ?? null) === (novy.icDph ?? null) &&
    (predosly.platne_od ?? null) === (novy.platneOd ?? null) &&
    Boolean(predosly.nesulad) === nesulad
  );
}

/** Nastavenie firmy do stĺpca `nesulad` — čo vo Faktere bolo, keď register povedal iné. */
export function nastavenieFirmy(f: FirmaNaOverenie) {
  return {
    vat_payer: f.vat_payer ?? null,
    vat_scheme: f.vat_scheme ?? null,
    ic_dph: f.ic_dph ?? null,
  };
}

/** Riadok `dph_overenia`, ako ho číta zvonček a nastavenia firmy. */
export type ZaznamOverenia = {
  id: string;
  overene_at: string;
  stav: StavRegistra;
  zdroj: ZdrojRegistra;
  schema: string | null;
  ic_dph: string | null;
  platne_od: string | null;
  zrusene_od: string | null;
  zmena: "nova_registracia" | "zrusenie" | "zmena_druhu" | null;
  odpoved?: { dovodyNaZrusenie?: { rok: string | null; zverejnene: string | null } | null } | null;
};

/** „2026-10-30“ → „30. 10. 2026“. */
export function datumSk(d: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d ?? ""));
  return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]}` : "";
}

export function nazovRezimu(kod: string | null | undefined): string {
  return jeSchemaDph(kod) ? schemaZaznam(kod).nazov : "—";
}

/** Zdroj na zobrazenie. */
export function nazovZdroja(z: ZdrojRegistra): string {
  return z === "fs_sk" ? "registra Finančnej správy SR" : "Registra plátců DPH (ČR)";
}

type Upozornenie = {
  key: string;
  severity: "info" | "warning" | "danger";
  title: string;
  detail: string;
  to: string;
  params?: Record<string, string | number>;
  date: string;
};

/**
 * Upozornenia do zvončeka: zmena registrácie za posledných 30 dní, nesúlad
 * nastavenia firmy s registrom a dôvody na zrušenie registrácie (SK).
 * Kľúč nesie id záznamu — nová zmena je nová notifikácia.
 */
export function upozorneniaDph(
  firma: FirmaNaOverenie,
  zaznamy: ZaznamOverenia[],
  dnes: string,
): Upozornenie[] {
  const out: Upozornenie[] = [];
  const platne = zaznamy.filter((z) => z.stav !== "chyba");
  const posledny = platne[0];
  if (!posledny) return out;
  const od = new Date(`${dnes}T00:00:00Z`);
  od.setUTCDate(od.getUTCDate() - 30);
  const hranica = od.toISOString().slice(0, 10);

  for (const z of platne) {
    if (!z.zmena || z.overene_at.slice(0, 10) < hranica) continue;
    const params = {
      rezim: nazovRezimu(z.schema),
      od: datumSk(z.zrusene_od ?? z.platne_od) || "—",
    };
    out.push({
      key: `dph_registracia:${z.id}`,
      severity: "warning",
      title:
        z.zmena === "nova_registracia"
          ? "Firma je podľa registra registrovaná pre DPH"
          : z.zmena === "zrusenie"
            ? "Registrácia DPH firmy bola podľa registra zrušená"
            : "Zmenil sa druh registrácie DPH",
      detail:
        z.zmena === "zrusenie"
          ? "Od {od}. Skontrolujte nastavenie DPH firmy."
          : "{rezim} od {od}. Skontrolujte nastavenie DPH firmy.",
      to: "/firma",
      params,
      date: z.overene_at.slice(0, 10),
    });
  }

  const nesulad = porovnaj(firma, {
    zdroj: posledny.zdroj,
    stav: posledny.stav,
    schema: jeSchemaDph(posledny.schema) ? posledny.schema : null,
    icDph: posledny.ic_dph,
    platneOd: posledny.platne_od,
    zruseneOd: posledny.zrusene_od,
    dovodyNaZrusenie: null,
    nespolehlivy: false,
    zoznamK: null,
    odpoved: null,
    chyba: null,
  }).nesulad;
  if (nesulad)
    out.push({
      // Schéma vo Faktere v kľúči: po zmene nastavenia na iný nesprávny režim sa ozve znova.
      key: `dph_nesulad:${posledny.id}:${firma.vat_scheme ?? ""}:${firma.ic_dph ?? ""}`,
      severity: "danger",
      title: "Nastavenie DPH firmy nesedí s registrom",
      detail: "Podľa registra: {rezim}. Vo Faktere: {nastavene}.",
      to: "/firma",
      params: { rezim: nazovRezimu(posledny.schema), nastavene: nazovRezimu(firma.vat_scheme) },
      date: posledny.overene_at.slice(0, 10),
    });

  const dovod = posledny.odpoved?.dovodyNaZrusenie;
  if (dovod && posledny.stav !== "neregistrovany")
    out.push({
      key: `dph_dovody_zrusenia:${posledny.id}`,
      severity: "warning",
      title: "Finančná správa eviduje dôvody na zrušenie registrácie DPH",
      detail: "Zverejnené {datum}. Registrácia môže byť zrušená z úradnej moci.",
      to: "/firma",
      params: { datum: datumSk(dovod.zverejnene) || "—" },
      date: posledny.overene_at.slice(0, 10),
    });
  return out;
}
