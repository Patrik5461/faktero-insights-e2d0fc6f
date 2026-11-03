/*
  Kto doklad nahral a kto ho zaúčtoval (uložil) — a kedy.

  Nahratie:  `created_by` + `nahrane_at` (pri prenose z Nespracovaných čas
             nahratia nespracovaného dokladu; starší doklad nemá → `created_at`).
             Z e-mailu je v `created_by` majiteľ adresy, nie človek — ukáže
             sa preto odosielateľ (`odosielatel_mailu`).
  Uloženie:  prijatá faktúra `spracoval` / `spracovane_at` (klikol Vytvoriť),
             bloček a ostatný doklad `processed_by` / `processed_at`.
             Ručne zapísaný doklad tieto stĺpce nemá — uložiť ho = vytvoriť,
             ukáže sa `created_by` / `created_at` (Uložené nikdy nechýba).
  Zaúčtovanie: posledné — `naposledy_zauctoval` / `naposledy_zauctovane_at`
             (píše spúšťač), staršie doklady `zauctoval` / `zauctovane_at`.
             Bez človeka a so zdrojom pravidlo/zvyk/ai = automat.

  Čisté funkcie — zobrazenie je v `KtoKedyDokladu.tsx` a v zoznamoch.
*/

export type AgendaKtoKedy = "prijata" | "doklad" | "ostatny" | "faktura" | "nespracovany";

export type Kto =
  /** `cez` — zaúčtovanie pri zápise človeka urobilo pravidlo / zvyk / AI. */
  | { typ: "clovek"; id: string | null; cez?: "pravidlo" | "zvyk" | "ai" }
  /** Prihlásený člen z mobilnej appky (história dokladu). */
  | { typ: "appka"; id: string | null }
  | { typ: "mail"; adresa: string | null }
  /** `nazov` — názov API kľúča, ak ho história pozná. */
  | { typ: "api"; nazov?: string | null }
  | { typ: "import" }
  | { typ: "efaktura" }
  | { typ: "automat"; zdroj: "pravidlo" | "zvyk" | "ai" }
  /** Zmena prenesená z Doklada (účet, ktorý ju tam urobil). */
  | { typ: "doklado"; ucet: string | null }
  /** Server bez človeka (napr. Pohoda konektor, nočné párovanie). */
  | { typ: "system" };

export type Udalost = { kto: Kto; kedy: string | null };

export type KtoKedy = {
  nahrane: Udalost | null;
  /**
   * Kto doklad uložil (Vytvoriť v Nespracovaných, spracovanie bločku);
   * ručne zapísaný doklad = vytvorenie (`created_by` / `created_at`).
   */
  ulozene: Udalost | null;
  /** Uloženie odvodené z vytvorenia (doklad nešiel cez Nespracované) — zoznam ho neopakuje. */
  ulozeneVytvorenim?: boolean;
  zauctovane: Udalost | null;
};

const s = (v: unknown): string | null => {
  const t = v == null ? "" : String(v).trim();
  return t ? t : null;
};

/** Odkiaľ doklad prišiel. */
function ktoNahral(r: Record<string, any>, agenda: AgendaKtoKedy): Kto {
  const zdroj = s(agenda === "nespracovany" ? r.zdroj : r.source);
  const mail = s(r.odosielatel_mailu);
  if (zdroj === "mail" || mail || (agenda !== "nespracovany" && r.inbox_message_id))
    return { typ: "mail", adresa: mail };
  if (zdroj === "api") return { typ: "api" };
  if (zdroj === "efaktura") return { typ: "efaktura" };
  if (zdroj === "import" || (agenda === "faktura" && s(r.import_source))) return { typ: "import" };
  return { typ: "clovek", id: s(r.created_by) };
}

export function nahranieDokladu(
  r: Record<string, any> | null | undefined,
  agenda: AgendaKtoKedy,
): Udalost | null {
  if (!r) return null;
  const kedy = s(r.nahrane_at) ?? s(r.created_at);
  const kto = ktoNahral(r, agenda);
  if (!kedy && kto.typ === "clovek" && !kto.id) return null;
  return { kto, kedy };
}

export function zauctovanieDokladu(
  r: Record<string, any> | null | undefined,
  agenda: AgendaKtoKedy,
): Udalost | null {
  if (!r || agenda === "ostatny" || agenda === "nespracovany") return null;
  const kedy = s(r.naposledy_zauctovane_at) ?? s(r.zauctovane_at);
  if (!kedy) return null;
  const id = s(r.naposledy_zauctovane_at) ? s(r.naposledy_zauctoval) : s(r.zauctoval);
  const zdroj = s(r.zauctovanie_zdroj);
  if (!id && (zdroj === "pravidlo" || zdroj === "zvyk" || zdroj === "ai"))
    return { kto: { typ: "automat", zdroj }, kedy };
  return { kto: { typ: "clovek", id }, kedy };
}

export function ulozenieDokladu(
  r: Record<string, any> | null | undefined,
  agenda: AgendaKtoKedy,
): Udalost | null {
  if (!r || agenda === "faktura" || agenda === "nespracovany") return null;
  const id = s(agenda === "prijata" ? r.spracoval : r.processed_by);
  const kedy = s(agenda === "prijata" ? r.spracovane_at : r.processed_at);
  if (!id && !kedy) return null;
  return { kto: { typ: "clovek", id }, kedy };
}

/**
 * Uloženie ručne zapísaného dokladu = jeho vytvorenie: kto ho zapísal
 * (`created_by`) a kedy (`created_at`). Doklad z mailu, API či importu
 * uložil server bez človeka.
 */
export function ulozenieVytvorenim(
  r: Record<string, any> | null | undefined,
  agenda: AgendaKtoKedy,
): Udalost | null {
  if (!r || agenda === "faktura" || agenda === "nespracovany") return null;
  const kedy = s(r.created_at) ?? s(r.nahrane_at);
  const nahral = ktoNahral(r, agenda);
  const kto: Kto = nahral.typ === "clovek" ? nahral : nahral.typ === "mail" ? { typ: "system" } : nahral;
  if (!kedy && kto.typ === "clovek" && !kto.id) return null;
  return { kto, kedy };
}

/** Dve udalosti „v tú istú chvíľu“ — do 2 minút. */
export const ROVNAKO_MS = 2 * 60 * 1000;
export const tenIstyCas = (a: string | null, b: string | null) =>
  a != null && b != null && Math.abs(Date.parse(a) - Date.parse(b)) <= ROVNAKO_MS;

/** Všetky tri udalosti dokladu: nahratie, uloženie (ak bolo) a posledné zaúčtovanie. */
export function ktoKedyDokladu(
  r: Record<string, any> | null | undefined,
  agenda: AgendaKtoKedy,
): KtoKedy {
  const nahrane = nahranieDokladu(r, agenda);
  const zauctovane = zauctovanieDokladu(r, agenda);
  // Uloženie sa ukazuje vždy — aj keď ho ten istý človek hneď zaúčtoval
  // (požiadavka 2026-11-03: „kto doklad uložil, dátum a čas“).
  // Ručne zapísaný doklad (bez spracovania z Nespracovaných) uložil ten, kto ho vytvoril.
  const vyslovne = ulozenieDokladu(r, agenda);
  const ulozene = vyslovne ?? ulozenieVytvorenim(r, agenda);
  return { nahrane, ulozene, zauctovane, ...(!vyslovne && ulozene ? { ulozeneVytvorenim: true } : {}) };
}

/**
 * Text „kto“ — slovenský kľúč pre `t()` a jeho premenné, pri človeku jeho
 * meno z mapy mien firmy (to sa neprekladá).
 */
export function textKto(
  kto: Kto,
  mena: Record<string, string>,
): { kluc: string; premenne?: Record<string, string>; meno?: string; pripona?: string } {
  switch (kto.typ) {
    case "mail":
      return kto.adresa ? { kluc: "e-mailom z {adresa}", premenne: { adresa: kto.adresa } } : { kluc: "e-mailom" };
    case "api":
      return kto.nazov ? { kluc: "API kľúč {nazov}", premenne: { nazov: kto.nazov } } : { kluc: "cez API" };
    case "doklado":
      return kto.ucet ? { kluc: "Doklado ({ucet})", premenne: { ucet: kto.ucet } } : { kluc: "Doklado" };
    case "system":
      return { kluc: "automaticky" };
    case "import":
      return { kluc: "importom" };
    case "efaktura":
      return { kluc: "z eFaktúry" };
    case "automat":
      return {
        kluc:
          kto.zdroj === "pravidlo"
            ? "automaticky (pravidlo)"
            : kto.zdroj === "zvyk"
              ? "automaticky (podľa zvyku)"
              : "automaticky (AI)",
      };
    case "clovek":
    case "appka": {
      // Člen, ktorý z firmy odišiel, alebo ešte nenačítané mená — „kolega“.
      const meno = kto.id ? mena[kto.id] : null;
      const pripona =
        kto.typ === "appka"
          ? "z appky"
          : kto.cez === "pravidlo"
            ? "pravidlom"
            : kto.cez === "zvyk"
              ? "podľa zvyku"
              : kto.cez === "ai"
                ? "návrhom AI"
                : undefined;
      // Bez autora (starý doklad, zápis cez API) sa ukáže len čas.
      const zaklad = meno ? { kluc: "", meno } : kto.id ? { kluc: "kolega" } : { kluc: "" };
      return pripona && (meno || kto.id) ? { ...zaklad, pripona } : zaklad;
    }
  }
}

/** Dátum a čas po slovensky „2. 11. 2026 9:14“ (podľa jazyka rozhrania). */
export function casUdalosti(kedy: string | null, loc: string): string | null {
  if (!kedy) return null;
  const d = new Date(kedy);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(loc, { day: "numeric", month: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Europe/Bratislava" });
}

/** Mená členov treba načítať len vtedy, keď niektorá udalosť ukazuje človeka. */
export function potrebujeMena(k: KtoKedy): boolean {
  return [k.nahrane, k.ulozene, k.zauctovane].some((u) => (u?.kto.typ === "clovek" || u?.kto.typ === "appka") && u.kto.id);
}

/**
 * Čo sa z nespracovaného dokladu prenesie do vytvoreného o nahratí: kto ho
 * nahral (pri maile majiteľ adresy — odosielateľa doplní spúšťač z
 * `inbox_message_id`) a kedy. Bez času nahratia rozhodne databáza (teraz).
 */
export function prenosNahratia(
  r: { created_by?: string | null; created_at?: string | null },
  userId?: string,
): { created_by: string | null; nahrane_at: string | null } {
  return { created_by: r.created_by ?? userId ?? null, nahrane_at: r.created_at ?? null };
}
