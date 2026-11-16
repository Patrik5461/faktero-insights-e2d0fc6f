/**
 * Jediná brána, cez ktorú prejde KAŽDÝ výsledok čítania dokladu (AI aj
 * strojové XML) pred tým, než sa z neho čokoľvek uloží.
 *
 * Patrik 16. 11. 2026: „To sa nesmie stať, aby si to vymýšľalo sadzbu.“
 * METRO (RHJ) prišlo s jedinou sadzbou 21 % a notár (BÝVAJLEPŠIE) tiež
 * 21 % — model z fotky prečítal zle základ či DPH a sadzbu „dopočítal“.
 *
 * Pravidlo: sadzba, ktorá nie je zákonná pre krajinu dodávateľa (inak
 * krajinu firmy) a deň dodania, sa NIKDY nedostane ďalej:
 *  - riadok rozpisu s nepovolenou sadzbou sa nahradí jedinou zákonnou
 *    sadzbou, pri ktorej DPH zo základu vychádza na cent, alebo jediným
 *    rozkladom na dve zákonné sadzby (základ aj DPH sedia na cent);
 *  - keď jednoznačné riešenie nie je, rozpis sa zahodí celý a výsledok nesie
 *    `dph_na_kontrolu` (veta pre človeka) — rozpis doplní človek z dokladu;
 *  - sadzba položky (`items[].vat_rate`) a hlavičky bločku (`vat_rate`)
 *    mimo zákonných sa vymaže (null).
 *
 * Volajú ju: `precitajDoklad` (mail, nahratie, skener, appka, dočítanie,
 * import, prijaté faktúry, rozpis na kontrolu) a `ocrBlocek` (bloček
 * z fotky). Test `zakonne-sadzby-ai.test.ts` stráži, že tieto cesty ju
 * naozaj volajú. Čistá logika bez I/O.
 */
import { krajinaDane, type KrajinaDane } from "./vat-rates";
import { sadzbyStatuSHistoriou, statEu } from "./sadzby-eu";
import { dphZoZakladu, krajinaDodavatelaDph, zakonneSadzby } from "./dph-pravidlo";

type Ai = Record<string, unknown>;

export type KontextSadzieb = {
  /** Krajina firmy (SK/CZ/DE); bez nej SK. */
  krajina?: string | null;
  /** Deň dodania; bez neho `delivery_date` / `issue_date` / `date` z dokladu. */
  den?: string | null;
};

export type VysledokSadzieb = {
  ai: Ai;
  /** Čo sa zmenilo — pre log a pre vetu na kontrolu. */
  zmeny: string[];
  /** Rozpis sa zahodil — doklad ide na kontrolu s touto vetou. */
  naKontrolu: string | null;
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(typeof v === "string" ? v.replace(/\s/g, "").replace(",", ".") : v);
  return Number.isFinite(n) ? n : null;
};
const r2 = (n: number) => Math.round((n + Number.EPSILON * Math.sign(n)) * 100) / 100;
const fmt = (n: number) => String(n).replace(".", ",");
const platnyDen = (v: unknown): string | null => {
  const d = typeof v === "string" ? v.slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
};

/**
 * Zákonné sadzby pre doklad: zahraničný dodávateľ (krajina z `supplier_country`
 * alebo prefix IČ DPH) má sadzby svojho štátu, inak krajina firmy k danému dňu.
 * `null` = sadzby nevieme overiť (dodávateľ mimo EÚ) — vtedy sa nič nemení.
 */
export function povoleneSadzbyDokladu(ai: Ai, kontext: KontextSadzieb = {}): number[] | null {
  const krajina: KrajinaDane = krajinaDane(kontext.krajina ?? "SK");
  const den = platnyDen(kontext.den) ?? platnyDen(ai.delivery_date) ?? platnyDen(ai.issue_date) ?? platnyDen(ai.date);
  const kd = krajinaDodavatelaDph(
    (ai.supplier_country as string | null | undefined) ?? null,
    ((ai.supplier_ic_dph ?? ai.ic_dph) as string | null | undefined) ?? null,
  );
  // Bez dňa všetko, čo v krajine platilo (ako spúšťač v databáze).
  if (!kd || kd === krajina) return zakonneSadzby(krajina, den);
  if (kd === "SK" || kd === "CZ" || kd === "DE") return zakonneSadzby(kd, den);
  if (statEu(kd)) return sadzbyStatuSHistoriou(kd);
  return null;
}

const jeV = (zoznam: number[], s: number) => zoznam.some((x) => Math.abs(x - s) < 0.001);

/** Jediná zákonná sadzba, pri ktorej DPH zo základu vychádza na cent. */
function jedinaSadzba(zaklad: number, dph: number, povolene: number[]): number | null {
  if (!(Math.abs(zaklad) > 0.004) || !(Math.abs(dph) > 0.004)) return null;
  const sedia = povolene.filter((s) => s > 0 && Math.abs(dphZoZakladu(Math.abs(zaklad), s) - Math.abs(dph)) <= 0.01 + 1e-9);
  return sedia.length === 1 ? sedia[0]! : null;
}

export type RozkladRiadku = { rate: number; base: number; vat: number }[];

/**
 * Rozklad riadku (základ, DPH) na dve zákonné sadzby — vrátane 0 %. Platí len
 * jediné riešenie: pri troch a viac sadzbách ich väčšinou sedí viac (23 + 19,
 * 23 + 5, 23 + 0 dajú tú istú DPH) a vtedy sa nehádá.
 */
export function rozlozNaZakonne(zaklad: number, dph: number, povolene: number[]): RozkladRiadku | null {
  const Z = r2(Math.abs(zaklad));
  const D = r2(Math.abs(dph));
  if (!(Z > 0) || !(D > 0)) return null;
  const sadzby = [...new Set(povolene)].sort((a, b) => b - a);
  const riesenia: RozkladRiadku[] = [];
  for (let i = 0; i < sadzby.length; i++)
    for (let j = i + 1; j < sadzby.length; j++) {
      const s1 = sadzby[i]!;
      const s2 = sadzby[j]!;
      if (!(s1 > 0)) continue;
      // z1 + z2 = Z; z1·s1 + z2·s2 = D·100
      const z1 = r2((D * 100 - Z * s2) / (s1 - s2));
      const z2 = r2(Z - z1);
      if (!(z1 > 0.004) || !(z2 > 0.004)) continue;
      const v1 = dphZoZakladu(z1, s1);
      const v2 = s2 > 0 ? dphZoZakladu(z2, s2) : 0;
      if (Math.abs(r2(v1 + v2) - D) > 0.01 + 1e-9) continue;
      riesenia.push([
        { rate: s1, base: z1, vat: v1 },
        { rate: s2, base: z2, vat: r2(D - v1) },
      ]);
    }
  return riesenia.length === 1 ? riesenia[0]! : null;
}

/**
 * Výsledok čítania dokladu so sadzbami len zo zákonných (pozri hlavičku).
 * Vstup sa nemení; vráti sa kópia.
 */
export function zakonneSadzbyZAi(ai: Ai | null | undefined, kontext: KontextSadzieb = {}): VysledokSadzieb {
  if (!ai || typeof ai !== "object") return { ai: (ai ?? {}) as Ai, zmeny: [], naKontrolu: null };
  const out: Ai = { ...ai };
  const zmeny: string[] = [];
  const povolene = povoleneSadzbyDokladu(ai, kontext);
  if (!povolene) return { ai: out, zmeny, naKontrolu: null };
  const zoznam = [...povolene].sort((a, b) => b - a).join(", ");
  const neplatne = new Set<number>();

  // 1. Rozpis DPH (tabuľka rekapitulácie).
  let naKontrolu: string | null = null;
  if (Array.isArray(ai.vat_breakdown)) {
    const nove: Ai[] = [];
    let zahodit = false;
    for (const x of ai.vat_breakdown as Ai[]) {
      const s = num(x?.rate ?? x?.sadzba);
      const zaklad = num(x?.base ?? x?.zaklad) ?? 0;
      const dph = num(x?.vat ?? x?.dph) ?? 0;
      // 0 % bez dane (oslobodené, mimo DPH, prenesenie) je zákonná vždy; sadzbu riadku v prenesení nechávame.
      const bezDane = !(Math.abs(dph) > 0.004);
      if (s === null || jeV(povolene, s) || (bezDane && (s === 0 || x?.vat_category === "reverse_charge" || x?.reverse_charge === true))) {
        nove.push(x);
        continue;
      }
      // Záporný riadok (odpočet zálohy z minulého obdobia, dobropis) smie historickú sadzbu krajiny.
      if ((zaklad < 0 || dph < 0) && jeV(zakonneSadzby(krajinaDane(kontext.krajina ?? "SK"), null), s)) {
        nove.push(x);
        continue;
      }
      neplatne.add(s);
      const jedna = jedinaSadzba(zaklad, dph, povolene);
      if (jedna != null) {
        nove.push({ ...x, rate: jedna, vat_category: "standard" });
        zmeny.push(`sadzba ${fmt(s)} % → ${fmt(jedna)} % (DPH zo základu sedí na cent)`);
        continue;
      }
      const rozklad = rozlozNaZakonne(zaklad, dph, povolene);
      if (rozklad) {
        const zn = zaklad < 0 ? -1 : 1;
        for (const r of rozklad)
          nove.push({
            rate: r.rate,
            base: zn * r.base,
            vat: zn * r.vat,
            vat_category: r.rate > 0 ? "standard" : null,
          });
        zmeny.push(`sadzba ${fmt(s)} % rozložená na ${rozklad.map((r) => `${fmt(r.rate)} %`).join(" + ")}`);
        continue;
      }
      zahodit = true;
    }
    if (zahodit) {
      out.vat_breakdown = [];
      naKontrolu =
        `Sadzbu DPH ${[...neplatne].map(fmt).join(", ")} % na doklade nevieme prečítať — zákonné sú ${zoznam} %. ` +
        "Rozpis DPH doplňte podľa dokladu (a skontrolujte dátum dodania).";
      zmeny.push("rozpis DPH zahodený — nepovolená sadzba bez jednoznačného rozkladu");
    } else out.vat_breakdown = nove;
  }

  // 2. Sadzby položiek.
  if (Array.isArray(ai.items)) {
    out.items = (ai.items as Ai[]).map((p) => {
      const s = num(p?.vat_rate);
      if (s === null || jeV(povolene, s)) return p;
      const zaporna = (num(p?.total) ?? num(p?.unit_price) ?? 0) < 0;
      if (zaporna && jeV(zakonneSadzby(krajinaDane(kontext.krajina ?? "SK"), null), s)) return p;
      neplatne.add(s);
      zmeny.push(`položka „${String(p?.name ?? "").slice(0, 40)}“: sadzba ${fmt(s)} % vymazaná`);
      return { ...p, vat_rate: null };
    });
  }

  // 3. Jediná sadzba hlavičky (bloček z fotky).
  const sh = num(ai.vat_rate);
  if (sh !== null && !jeV(povolene, sh)) {
    neplatne.add(sh);
    const jedna = jedinaSadzba(num(ai.net_amount ?? ai.amount_without_vat) ?? 0, num(ai.vat_amount) ?? 0, povolene);
    out.vat_rate = jedna;
    zmeny.push(jedna != null ? `sadzba hlavičky ${fmt(sh)} % → ${fmt(jedna)} %` : `sadzba hlavičky ${fmt(sh)} % vymazaná`);
    if (jedna == null && !naKontrolu)
      naKontrolu = `Sadzbu DPH ${fmt(sh)} % na doklade nevieme prečítať — zákonné sú ${zoznam} %. Rozpis DPH doplňte podľa dokladu.`;
  }

  if (naKontrolu) out.dph_na_kontrolu = naKontrolu;
  if (zmeny.length) out.dph_upravy = zmeny;
  return { ai: out, zmeny, naKontrolu };
}

/** Je sadzba zákonná pre doklad? (Pre testy a kontrolu uložených údajov.) */
export function jeZakonnaSadzbaDokladu(sadzba: number, ai: Ai, kontext: KontextSadzieb = {}): boolean {
  const p = povoleneSadzbyDokladu(ai, kontext);
  return p === null || jeV(p, sadzba);
}
