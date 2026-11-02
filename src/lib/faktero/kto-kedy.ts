/*
  Kto doklad nahral a kto ho zaúčtoval (uložil) — a kedy.

  Nahratie:  `created_by` + `nahrane_at` (pri prenose z Nespracovaných čas
             nahratia nespracovaného dokladu; starší doklad nemá → `created_at`).
             Z e-mailu je v `created_by` majiteľ adresy, nie človek — ukáže
             sa preto odosielateľ (`odosielatel_mailu`).
  Uloženie:  prijatá faktúra `spracoval` / `spracovane_at` (klikol Vytvoriť),
             bloček a ostatný doklad `processed_by` / `processed_at`.
  Zaúčtovanie: posledné — `naposledy_zauctoval` / `naposledy_zauctovane_at`
             (píše spúšťač), staršie doklady `zauctoval` / `zauctovane_at`.
             Bez človeka a so zdrojom pravidlo/zvyk/ai = automat.

  Čisté funkcie — zobrazenie je v `KtoKedyDokladu.tsx` a v zoznamoch.
*/

export type AgendaKtoKedy = "prijata" | "doklad" | "ostatny" | "faktura" | "nespracovany";

export type Kto =
  | { typ: "clovek"; id: string | null }
  | { typ: "mail"; adresa: string | null }
  | { typ: "api" }
  | { typ: "import" }
  | { typ: "efaktura" }
  | { typ: "automat"; zdroj: "pravidlo" | "zvyk" | "ai" };

export type Udalost = { kto: Kto; kedy: string | null };

export type KtoKedy = {
  nahrane: Udalost | null;
  /** Kto doklad uložil (Vytvoriť v Nespracovaných, spracovanie bločku) — len keď sa líši od zaúčtovania. */
  ulozene: Udalost | null;
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

const ROVNAKO_MS = 2 * 60 * 1000;
const tenIstyCas = (a: string | null, b: string | null) =>
  a != null && b != null && Math.abs(Date.parse(a) - Date.parse(b)) <= ROVNAKO_MS;
const tenIstyClovek = (a: Kto, b: Kto) =>
  a.typ === "clovek" && b.typ === "clovek" && a.id === b.id;

/**
 * Všetky tri udalosti dokladu. Uloženie sa vynechá, keď ho zakryje
 * zaúčtovanie (ten istý človek v tú istú chvíľu — Vytvoriť s predkontáciou)
 * alebo nahratie (bloček zapísaný ručne a hneď spracovaný).
 */
export function ktoKedyDokladu(
  r: Record<string, any> | null | undefined,
  agenda: AgendaKtoKedy,
): KtoKedy {
  const nahrane = nahranieDokladu(r, agenda);
  const zauctovane = zauctovanieDokladu(r, agenda);
  let ulozene = ulozenieDokladu(r, agenda);
  if (ulozene && zauctovane && tenIstyClovek(ulozene.kto, zauctovane.kto) && tenIstyCas(ulozene.kedy, zauctovane.kedy))
    ulozene = null;
  if (ulozene && nahrane && tenIstyClovek(ulozene.kto, nahrane.kto) && tenIstyCas(ulozene.kedy, nahrane.kedy))
    ulozene = null;
  return { nahrane, ulozene, zauctovane };
}

/**
 * Text „kto“ — slovenský kľúč pre `t()` a jeho premenné, pri človeku jeho
 * meno z mapy mien firmy (to sa neprekladá).
 */
export function textKto(
  kto: Kto,
  mena: Record<string, string>,
): { kluc: string; premenne?: Record<string, string>; meno?: string } {
  switch (kto.typ) {
    case "mail":
      return kto.adresa ? { kluc: "e-mailom z {adresa}", premenne: { adresa: kto.adresa } } : { kluc: "e-mailom" };
    case "api":
      return { kluc: "cez API" };
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
    case "clovek": {
      // Člen, ktorý z firmy odišiel, alebo ešte nenačítané mená — „kolega“.
      const meno = kto.id ? mena[kto.id] : null;
      // Bez autora (starý doklad, zápis cez API) sa ukáže len čas.
      return meno ? { kluc: "", meno } : kto.id ? { kluc: "kolega" } : { kluc: "" };
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
  return [k.nahrane, k.ulozene, k.zauctovane].some((u) => u?.kto.typ === "clovek" && u.kto.id);
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
