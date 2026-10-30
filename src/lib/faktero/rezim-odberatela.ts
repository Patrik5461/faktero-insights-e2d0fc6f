/**
 * Daňový režim faktúry podľa odberateľa.
 *
 * Odberateľ s IČ DPH iného členského štátu nedostáva slovenskú DPH: tovar
 * je oslobodené dodanie do EÚ (§ 43), služba má miesto dodania u odberateľa
 * (§ 15 ods. 1) a daň priznáva on (prenesenie). Kým sa to vo formulári
 * nastavovalo len ručne a predvolený bol tuzemský režim, ľahko vznikla
 * nemeckej firme faktúra s 23 % DPH — tú odberateľ nezaplatí a dodávateľ by
 * daň odviedol zbytočne.
 *
 * Tu je len návrh. Rozhoduje oň formulár, appka aj API rovnako; ručnú voľbu
 * človeka nikto neprepisuje.
 */
import { KRAJINY_EU, rozdelIcDph } from "./vies";

/** Druh plnenia, ako ho pozná faktúra (`invoices.eu_plnenie`). */
export type DruhPlnenia = "tovar" | "sluzba";

export type NavrhRezimu =
  /** Tuzemský odberateľ alebo nevieme, odkiaľ je — bežná DPH. */
  | { druh: "tuzemsko" }
  /** Firma s IČ DPH iného štátu EÚ — bez DPH, veta o oslobodení / prenesení. */
  | { druh: "eu_b2b"; krajina: string; icDph: string; plnenie: DruhPlnenia; isteZPoloziek: boolean }
  /** Občan (bez IČ DPH) z iného štátu EÚ — DPH ostáva, prípadne cez OSS. */
  | { druh: "eu_spotrebitel"; krajina: string }
  /** Odberateľ mimo EÚ — vývoz tovaru alebo služba s miestom dodania mimo EÚ. */
  | { druh: "mimo_eu"; krajina: string; plnenie: DruhPlnenia; isteZPoloziek: boolean };

/** Polia faktúry, ktoré návrh nastavuje. */
export type PoliaRezimu = {
  reverse_charge: boolean;
  reverse_charge_type: "" | "domestic_69" | "eu_b2b" | "export";
  eu_plnenie: "tovar" | "sluzba" | "trojstranny";
};

/** Položka, z ktorej sa dá odhadnúť, či ide o tovar. */
export type PolozkaPreNavrh = {
  stock_item_id?: string | null;
  colny_kod?: string | null;
  hmotnost_kg?: number | string | null;
  krajina_povodu?: string | null;
};

// XI (Severné Írsko) sa pri tovare správa ako členský štát — pozná ho len IČ DPH.
const EU = new Set<string>([...KRAJINY_EU.filter((k) => k !== "EL"), "GR"]);

/** ISO kód krajiny; grécke IČ DPH má EL, krajina je GR. */
function iso(kod: string | null | undefined): string {
  const k = String(kod ?? "")
    .trim()
    .toUpperCase();
  return k === "EL" ? "GR" : k;
}

/** Je krajina (ISO 3166-1 alfa-2) členským štátom EÚ? */
export function jeKrajinaEu(kod: string | null | undefined): boolean {
  return EU.has(iso(kod));
}

/**
 * Tovar alebo služba podľa položiek. Tovar prezradí skladová karta, colný
 * kód, hmotnosť alebo krajina pôvodu; inak to z položky nevyčítame a návrh
 * je služba — tú však treba skontrolovať (`iste: false`).
 */
export function druhPlneniaZPoloziek(polozky: PolozkaPreNavrh[] | null | undefined): {
  plnenie: DruhPlnenia;
  iste: boolean;
} {
  const tovar = (polozky ?? []).some(
    (p) =>
      Boolean(p.stock_item_id) ||
      Boolean(String(p.colny_kod ?? "").trim()) ||
      Number(p.hmotnost_kg) > 0 ||
      Boolean(String(p.krajina_povodu ?? "").trim()),
  );
  return tovar ? { plnenie: "tovar", iste: true } : { plnenie: "sluzba", iste: false };
}

/**
 * Návrh režimu podľa odberateľa.
 *
 * IČ DPH rozhoduje pred krajinou v adrese: firma s IČ DPH DE… je nemecký
 * platiteľ, aj keď má v adrese omylom SK. Neplatiteľ DPH dodáva vždy bez dane,
 * pre neho návrh nič nemení.
 */
export function navrhRezimuDph(v: {
  krajinaFirmy: string;
  platitel: boolean;
  odberatel: { country?: string | null; ic_dph?: string | null } | null | undefined;
  polozky?: PolozkaPreNavrh[] | null;
  /** Ak volajúci vie, čo dodáva (napr. e-shop predáva tovar). */
  plnenie?: DruhPlnenia | null;
}): NavrhRezimu {
  const domov = iso(v.krajinaFirmy) || "SK";
  if (!v.platitel || !v.odberatel) return { druh: "tuzemsko" };
  const odhad = v.plnenie ? { plnenie: v.plnenie, iste: true } : druhPlneniaZPoloziek(v.polozky);

  const ic = rozdelIcDph(v.odberatel.ic_dph);
  const krajinaIc = ic ? iso(ic.kod) : "";
  if (krajinaIc && jeKrajinaEu(krajinaIc)) {
    if (krajinaIc === domov) return { druh: "tuzemsko" };
    return {
      druh: "eu_b2b",
      krajina: krajinaIc,
      icDph: `${ic!.kod}${ic!.cislo}`,
      plnenie: odhad.plnenie,
      isteZPoloziek: odhad.iste,
    };
  }

  const krajina = iso(v.odberatel.country);
  if (!/^[A-Z]{2}$/.test(krajina) || krajina === domov) return { druh: "tuzemsko" };
  if (jeKrajinaEu(krajina)) return { druh: "eu_spotrebitel", krajina };
  return { druh: "mimo_eu", krajina, plnenie: odhad.plnenie, isteZPoloziek: odhad.iste };
}

/**
 * Polia faktúry podľa návrhu. Občan z EÚ a tuzemsko ostávajú s DPH; o OSS
 * rozhoduje hranica 10 000 € za celú EÚ, preto sa sám nezapína.
 */
export function poliaZNavrhu(n: NavrhRezimu): PoliaRezimu {
  if (n.druh === "eu_b2b")
    return { reverse_charge: true, reverse_charge_type: "eu_b2b", eu_plnenie: n.plnenie };
  if (n.druh === "mimo_eu")
    return { reverse_charge: true, reverse_charge_type: "export", eu_plnenie: n.plnenie };
  return { reverse_charge: false, reverse_charge_type: "", eu_plnenie: "tovar" };
}

/** Kľúč návrhu — zmena kľúča znamená, že sa má režim (ak nie je ručný) prepočítať. */
export function klucNavrhu(n: NavrhRezimu): string {
  if (n.druh === "eu_b2b") return `eu_b2b:${n.krajina}:${n.icDph}:${n.plnenie}`;
  if (n.druh === "mimo_eu") return `mimo_eu:${n.krajina}:${n.plnenie}`;
  if (n.druh === "eu_spotrebitel") return `eu_spotrebitel:${n.krajina}`;
  return "tuzemsko";
}

/** Zodpovedá stav formulára návrhu? (Pri nezhode ukážeme upozornenie.) */
export function sedisNavrhom(
  n: NavrhRezimu,
  f: { reverse_charge: boolean; reverse_charge_type?: string | null; oss?: boolean },
): boolean {
  if (n.druh === "eu_b2b") return f.reverse_charge && f.reverse_charge_type === "eu_b2b";
  if (n.druh === "mimo_eu") return f.reverse_charge && f.reverse_charge_type === "export";
  if (n.druh === "eu_spotrebitel") return !f.reverse_charge;
  return !f.reverse_charge || f.reverse_charge_type === "domestic_69";
}

type TypPrenosu = "domestic_69" | "eu_b2b" | "export";
type EuPlnenie = "tovar" | "sluzba" | "trojstranny";

/** Režim faktúry vystavenej mimo formulára (API, e-shop, appka). */
export type RezimNovejFaktury = {
  reverse_charge: boolean;
  reverse_charge_type: TypPrenosu | null;
  eu_plnenie: EuPlnenie | null;
  /** Režim určil odberateľ, nie volajúci. */
  zNavrhu: boolean;
};

/**
 * Režim novej faktúry z API alebo appky.
 *
 * Výslovný režim volajúceho platí. Bez neho rozhodne odberateľ — ale len
 * vtedy, keď položky nenesú nenulovú DPH: e-shop, ktorý DPH zákazníkovi
 * naúčtoval (a ten ju zaplatil), musí dostať faktúru s tou istou sumou.
 * Plnenie bez údaja je tovar — cez API fakturujú hlavne e-shopy.
 */
export function rezimNovejFaktury(v: {
  vstup: {
    reverse_charge?: boolean;
    reverse_charge_type?: TypPrenosu | null;
    eu_plnenie?: EuPlnenie | null;
    items: { vat_rate?: number; vat_amount?: number }[];
  };
  krajinaFirmy: string;
  platitel: boolean;
  odberatel: { country?: string | null; ic_dph?: string | null } | null | undefined;
  /** Plnenie, keď ho volajúci nepovie (predvolene tovar). */
  predvolenePlnenie?: DruhPlnenia;
}): RezimNovejFaktury | { chyba: string } {
  const d = v.vstup;
  const plnenieTypu = (typ: TypPrenosu): EuPlnenie | null => {
    if (typ === "eu_b2b") return d.eu_plnenie ?? v.predvolenePlnenie ?? "tovar";
    if (typ === "export")
      return (d.eu_plnenie ?? v.predvolenePlnenie) === "sluzba" ? "sluzba" : "tovar";
    return null;
  };
  const sDph = d.items.some((i) => Number(i.vat_rate) > 0 || Number(i.vat_amount) > 0);

  if (d.reverse_charge === false)
    return { reverse_charge: false, reverse_charge_type: null, eu_plnenie: null, zNavrhu: false };
  if (d.reverse_charge === true || d.reverse_charge_type) {
    if (sDph)
      return {
        chyba:
          "Pri prenesení daňovej povinnosti, dodaní do EÚ alebo vývoze nesmie mať položka DPH — pošlite vat_rate 0 alebo ho vynechajte.",
      };
    const typ = d.reverse_charge_type ?? "domestic_69";
    return {
      reverse_charge: true,
      reverse_charge_type: typ,
      eu_plnenie: plnenieTypu(typ),
      zNavrhu: false,
    };
  }
  if (sDph)
    return { reverse_charge: false, reverse_charge_type: null, eu_plnenie: null, zNavrhu: false };

  const navrh = navrhRezimuDph({
    krajinaFirmy: v.krajinaFirmy,
    platitel: v.platitel,
    odberatel: v.odberatel,
    plnenie:
      d.eu_plnenie === "sluzba" || d.eu_plnenie === "tovar"
        ? d.eu_plnenie
        : (v.predvolenePlnenie ?? "tovar"),
  });
  if (navrh.druh !== "eu_b2b" && navrh.druh !== "mimo_eu")
    return { reverse_charge: false, reverse_charge_type: null, eu_plnenie: null, zNavrhu: false };
  const typ: TypPrenosu = navrh.druh === "eu_b2b" ? "eu_b2b" : "export";
  return {
    reverse_charge: true,
    reverse_charge_type: typ,
    eu_plnenie: typ === "eu_b2b" && d.eu_plnenie === "trojstranny" ? "trojstranny" : navrh.plnenie,
    zNavrhu: true,
  };
}
