/*
  Kam sa zaradí zaevidovaná prijatá eFaktúra — nastavenie firmy (eFaktúra →
  Príjem) a rozhodnutie podľa druhu dokladu.

  Nastavenie platí pre bežnú faktúru a dobropis:
  - `prijate` (predvolené) — rovno medzi Prijaté faktúry, voliteľne v stave
    dokladu firmy (`stavy_dokladov`);
  - `nespracovane` — do Nespracovaných dokladov na kontrolu, ako doklady
    z e-mailu, len s údajmi zo štruktúrovanej eFaktúry namiesto čítania AI.

  Zálohová faktúra ide vždy medzi Prijaté zálohové faktúry (`proforma`) —
  v Nespracovaných by ju človek musel znova zaradiť a nič by tým nezískal.
  Samofaktúru za nás vyhotovil náš odberateľ, je to naša vydaná faktúra;
  medzi prijaté nepatrí a sama sa nezaraďuje nikam.

  Schvaľovanie sa tu nevolí: keď ho má firma zapnuté pre prijaté faktúry,
  zaevidovaná faktúra naň ide sama (`zabezpecSchvalovanie`).

  Čisté funkcie — testy v `zaevidovanie-efaktury.test.ts`.
*/

import type { DruhPrijatejEfaktury } from "./prijata-z-ubl";

export type CielPrijmu = "prijate" | "nespracovane";

export type NastaveniePrijmu = {
  ciel: CielPrijmu;
  /** Stav dokladu firmy pre novú prijatú faktúru (len pri `prijate`). */
  stavId: string | null;
  /** Zaevidovať hneď po stiahnutí, bez kliknutia. */
  automaticky: boolean;
  /** Po ručnom zaevidovaní otvoriť doklad; inak ostať v zozname. */
  otvorit: boolean;
};

export const PREDVOLENE_NASTAVENIE_PRIJMU: NastaveniePrijmu = {
  ciel: "prijate",
  stavId: null,
  automaticky: false,
  otvorit: true,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Nastavenie z riadku `efaktura_profiles` (chýbajúci profil = predvolené). */
export function nastaveniePrijmu(
  profil: Record<string, unknown> | null | undefined,
): NastaveniePrijmu {
  if (!profil) return { ...PREDVOLENE_NASTAVENIE_PRIJMU };
  const stav =
    typeof profil.prijem_stav_id === "string" && UUID.test(profil.prijem_stav_id)
      ? profil.prijem_stav_id
      : null;
  return {
    ciel: profil.prijem_ciel === "nespracovane" ? "nespracovane" : "prijate",
    stavId: stav,
    automaticky: profil.prijem_automaticky === true,
    otvorit: profil.prijem_otvorit !== false,
  };
}

export type Zaradenie =
  | { kam: "prijate"; typ: "regular" | "proforma"; stavId: string | null }
  | { kam: "nespracovane"; druh: "faktura" | "dobropis" }
  | { kam: "samofaktura" };

/** Kam zaradiť eFaktúru daného druhu podľa nastavenia firmy. */
export function kamZaradit(nast: NastaveniePrijmu, druh: DruhPrijatejEfaktury): Zaradenie {
  if (druh === "samofaktura" || druh === "samofaktura_dobropis") return { kam: "samofaktura" };
  if (druh === "zalohova") return { kam: "prijate", typ: "proforma", stavId: null };
  if (nast.ciel === "nespracovane") return { kam: "nespracovane", druh };
  return { kam: "prijate", typ: "regular", stavId: nast.stavId };
}

/** Druh z uloženého `parsed_data` (typ 386 = zálohová; staršie riadky ho nemajú v `documentKind`). */
export function druhZRozobratia(
  p: { documentKind?: string | null; typeCode?: string | null } | null | undefined,
): DruhPrijatejEfaktury {
  const k = p?.documentKind;
  if (k === "self_billing") return "samofaktura";
  if (k === "self_billing_credit_note") return "samofaktura_dobropis";
  if (k === "credit_note") return "dobropis";
  if (p?.typeCode === "386") return "zalohova";
  return "faktura";
}

export type VysledokZaevidovania = {
  kam: "prijate" | "nespracovane";
  /** Id prijatej faktúry alebo nespracovaného dokladu. */
  id: string;
  typ?: "regular" | "proforma";
  /** Doklad už bol zaevidovaný skôr (alebo práve beží iné zaevidovanie). */
  uzExistoval: boolean;
  /** Tá istá faktúra prišla inou cestou — eFaktúra je pripojená k nej. */
  pripojena?: boolean;
};

/** Adresa, kam zaevidovaný doklad patrí (na odkaz v toaste a „Otvoriť doklad“). */
export function odkazNaZaradenie(v: Pick<VysledokZaevidovania, "kam" | "id">): string {
  return v.kam === "nespracovane" ? `/nespracovane/${v.id}` : `/prijate-faktury/${v.id}`;
}

/**
 * Či sa riadok prijatej eFaktúry dá zaevidovať teraz. Zaevidovaný (alebo
 * odložený v Nespracovaných) už nie; rozbehnuté zaevidovanie drží zámok
 * dve minúty, potom sa pokladá za spadnuté.
 */
export function daSaZaevidovat(
  r: {
    matched_supplier_invoice_id?: string | null;
    nespracovany_id?: string | null;
    zaevidovanie_at?: string | null;
  },
  teraz: Date = new Date(),
): boolean {
  if (r.matched_supplier_invoice_id || r.nespracovany_id) return false;
  if (!r.zaevidovanie_at) return true;
  const kedy = new Date(r.zaevidovanie_at).getTime();
  return !Number.isFinite(kedy) || teraz.getTime() - kedy > 2 * 60 * 1000;
}
