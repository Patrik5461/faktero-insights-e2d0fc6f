/**
 * Oznam o plánovanej aktualizácii (tabuľka `platformove_oznamy`) — čistá
 * logika: čo z načítaných oznamov sa práve teraz ukáže. Komponent
 * `OznamAktualizacie` len načíta riadky, dodá čas a nakreslí výsledok.
 *
 * Fázy aktualizácie:
 *   - `pred`  — do začiatku zostáva najviac 30 min: okno (raz za oznam), potom pás,
 *   - `pocas` — od začiatku po začiatok + trvanie: „Prebieha aktualizácia…“,
 *   - `po`    — po skončení až do `plati_do` (inak koniec + 30 min):
 *               „Faktero je aktualizované“ + Obnoviť stránku. Stránka načítaná
 *               až po skončení už nové vydanie má, preto sa jej `po` neukazuje
 *               — vďaka tomu pás zmizne aj po kliknutí na Obnoviť.
 * Typ `info` je len pás s textom od začiatku po `plati_do`.
 */

export type PlatformovyOznam = {
  id: string;
  typ: string;
  text: string | null;
  zaciatok: string;
  trvanie_min: number;
  plati_do: string | null;
  aktivny: boolean;
};

export const PRED_ZACIATKOM_MS = 30 * 60_000;
export const PO_SKONCENI_MS = 30 * 60_000;

export type StavOznamu =
  | { faza: "nic" }
  | {
      faza: "pred" | "pocas" | "po" | "info";
      oznam: PlatformovyOznam;
      /** Okno ukázať (len `pred`, keď ho používateľ k tomuto oznamu ešte nevidel). */
      okno: boolean;
      zaciatok: number;
      koniec: number;
    };

function cas(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const n = Date.parse(iso);
  return Number.isFinite(n) ? n : null;
}

/**
 * Stav jedného oznamu v čase `teraz`.
 * @param nacitane kedy sa načítala stránka (ms) — rozhoduje o fáze `po`
 * @param videneOkno používateľ už okno k tomuto oznamu zavrel
 */
export function stavOznamu(
  o: PlatformovyOznam | null | undefined,
  teraz: number,
  nacitane: number,
  videneOkno: boolean,
): StavOznamu {
  if (!o || !o.aktivny) return { faza: "nic" };
  const zaciatok = cas(o.zaciatok);
  if (zaciatok === null) return { faza: "nic" };
  const trvanie = Math.max(1, Math.round(o.trvanie_min || 1)) * 60_000;
  const koniec = zaciatok + trvanie;
  const platiDo = cas(o.plati_do) ?? (o.typ === "info" ? null : koniec + PO_SKONCENI_MS);
  if (platiDo !== null && teraz >= platiDo) return { faza: "nic" };

  if (o.typ === "info") {
    if (teraz < zaciatok || !o.text?.trim()) return { faza: "nic" };
    return { faza: "info", oznam: o, okno: false, zaciatok, koniec };
  }
  if (o.typ !== "aktualizacia") return { faza: "nic" };

  if (teraz < zaciatok) {
    if (zaciatok - teraz > PRED_ZACIATKOM_MS) return { faza: "nic" };
    return { faza: "pred", oznam: o, okno: !videneOkno, zaciatok, koniec };
  }
  if (teraz < koniec) return { faza: "pocas", oznam: o, okno: false, zaciatok, koniec };
  if (nacitane >= koniec) return { faza: "nic" };
  return { faza: "po", oznam: o, okno: false, zaciatok, koniec };
}

const PORADIE: Record<string, number> = { pocas: 0, pred: 1, po: 2, info: 3 };

/**
 * Z viacerých aktívnych oznamov vyberie ten, ktorý sa ukáže: prebiehajúca
 * aktualizácia má prednosť pred blížiacou sa, tá pred „hotovo“ a info pásom;
 * v rovnakej fáze vyhrá skorší začiatok.
 */
export function vyberOznam(
  oznamy: readonly PlatformovyOznam[],
  teraz: number,
  nacitane: number,
  videne: (id: string) => boolean,
): StavOznamu {
  let naj: StavOznamu = { faza: "nic" };
  for (const o of oznamy) {
    const s = stavOznamu(o, teraz, nacitane, videne(o.id));
    if (s.faza === "nic") continue;
    if (
      naj.faza === "nic" ||
      PORADIE[s.faza] < PORADIE[naj.faza] ||
      (PORADIE[s.faza] === PORADIE[naj.faza] && s.zaciatok < naj.zaciatok)
    )
      naj = s;
  }
  return naj;
}

/** Hodina a minúta v Bratislave, napr. „12:30“. */
export function casVBratislave(ms: number): string {
  return new Intl.DateTimeFormat("sk-SK", {
    timeZone: "Europe/Bratislava",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

/**
 * Kľúč textu dĺžky výpadku (slovenské skloňovanie; preklad cez `t()` s `{n}`).
 * 1 → „asi 1 minútu“, 2–4 → „asi {n} minúty“, inak „asi {n} minút“.
 */
export function klucTrvania(n: number): string {
  if (n === 1) return "asi 1 minútu";
  if (n >= 2 && n <= 4) return "asi {n} minúty";
  return "asi {n} minút";
}

/** Predvolený slovenský text pásu pred aktualizáciou (aj predvyplnenie v admine). */
export function predvolenyText(zaciatokMs: number, trvanieMin: number): string {
  const trvanie = klucTrvania(trvanieMin).replace("{n}", String(trvanieMin));
  return `Aktualizácia o ${casVBratislave(zaciatokMs)} – Faktero bude ${trvanie} nedostupné. Rozpísanú prácu si uložte.`;
}

/** localStorage kľúč „okno k tomuto oznamu už videl“. */
export const klucVidenehoOkna = (id: string) => `faktero.oznam-okno.${id}`;
