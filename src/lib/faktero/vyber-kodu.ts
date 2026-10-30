/*
  Logika výberu kódu s hľadaním (predkontácia, členenie DPH a KV).

  Čisté funkcie bez Reactu, aby sa dali skúšať: filter bez ohľadu na
  diakritiku a veľkosť písmen a pohyb po zozname šípkami.
*/

export type MoznostVyberu = { hodnota: string; text: string; popis?: string | null };

/** Malé písmená bez diakritiky — „Nákup PHM“ aj „nakup phm“ sa nájdu rovnako. */
export function bezDiakritiky(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Text, v ktorom sa hľadá: kód, názov aj účty MD/D. */
function hladanyText(m: MoznostVyberu): string {
  return bezDiakritiky(`${m.hodnota} ${m.text} ${m.popis ?? ""}`);
}

/**
 * Voľby, ktoré zodpovedajú hľadanému textu. Každé slovo musí byť niekde
 * v kóde, názve alebo účtoch („phm 501“ nájde „Nákup PHM · 1Fk · 501/325“).
 * Poradie ostáva pôvodné (zoradenie podľa druhu dokladu a platby), len
 * voľby, ktorých kód presne sedí alebo ním začína, idú navrch.
 */
export function filtrujMoznosti(moznosti: MoznostVyberu[], hladane: string): MoznostVyberu[] {
  const q = bezDiakritiky(hladane.trim());
  if (!q) return moznosti;
  const slova = q.split(/\s+/).filter(Boolean);
  const zhodne = moznosti.filter((m) => {
    const h = hladanyText(m);
    return slova.every((s) => h.includes(s));
  });
  const skore = (m: MoznostVyberu) => {
    const k = bezDiakritiky(m.hodnota);
    if (k === q) return 0;
    if (k.startsWith(q)) return 1;
    return 2;
  };
  // Stabilné zoradenie — v rámci rovnakého skóre ostane pôvodné poradie.
  return zhodne
    .map((m, i) => ({ m, i, s: skore(m) }))
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .map((x) => x.m);
}

export type Klavesa = "ArrowDown" | "ArrowUp" | "Home" | "End" | "PageDown" | "PageUp";

/**
 * Nová aktívna položka po stlačení klávesy. `-1` = nič nie je aktívne.
 * Šípky na konci zoznamu prejdú na začiatok (a naopak), Page o 8 riadkov.
 */
export function posunAktivny(aktivny: number, klavesa: Klavesa, dlzka: number): number {
  if (dlzka <= 0) return -1;
  switch (klavesa) {
    case "ArrowDown":
      return aktivny < 0 || aktivny >= dlzka - 1 ? 0 : aktivny + 1;
    case "ArrowUp":
      return aktivny <= 0 ? dlzka - 1 : aktivny - 1;
    case "Home":
      return 0;
    case "End":
      return dlzka - 1;
    case "PageDown":
      return Math.min(dlzka - 1, Math.max(0, aktivny) + 8);
    case "PageUp":
      return Math.max(0, aktivny - 8);
  }
}

/** Položka zoznamu v okne: prázdna voľba, voľby a prípadne „Použiť kód“. */
export type PolozkaZoznamu =
  | { druh: "prazdne"; hodnota: "" }
  | { druh: "moznost"; hodnota: string; moznost: MoznostVyberu }
  | { druh: "vlastny"; hodnota: string };

/**
 * Celý zoznam, ako sa ukáže v okne. Prázdna voľba („Nedefinované“) je len bez
 * hľadania; vlastný kód sa ponúkne, keď je dovolený a napísaný text nie je
 * presne kódom žiadnej voľby.
 */
export function polozkyZoznamu(
  moznosti: MoznostVyberu[],
  hladane: string,
  volby: { prazdne?: boolean; vlastny?: boolean },
): PolozkaZoznamu[] {
  const q = hladane.trim();
  const out: PolozkaZoznamu[] = [];
  if (volby.prazdne && !q) out.push({ druh: "prazdne", hodnota: "" });
  for (const m of filtrujMoznosti(moznosti, q))
    out.push({ druh: "moznost", hodnota: m.hodnota, moznost: m });
  if (
    volby.vlastny &&
    q &&
    q.length <= 30 &&
    !moznosti.some((m) => bezDiakritiky(m.hodnota) === bezDiakritiky(q))
  )
    out.push({ druh: "vlastny", hodnota: q });
  return out;
}

/** Ktorá položka je aktívna po otvorení — vybraná hodnota, inak prvá. */
export function zaciatocnyAktivny(
  polozky: PolozkaZoznamu[],
  hodnota: string | null | undefined,
): number {
  if (!polozky.length) return -1;
  const i = polozky.findIndex((p) => p.druh !== "vlastny" && p.hodnota === (hodnota ?? ""));
  return i >= 0 ? i : 0;
}

/**
 * Popisy otvoreného výberu pre čítačku. Na stránke býva predkontácia,
 * členenie DPH aj riadok KV vedľa seba — keď sa všetky hľadania volali
 * „Hľadať kód…“ a zoznamy „Voľby“, nedali sa od seba rozlíšiť. S názvom
 * poľa (`nazov`, už preložený) nesú obe aj to, čo sa vyberá.
 */
export function popisyVyberu(
  nazov: string | null | undefined,
  t: (text: string, p?: Record<string, string | number>) => string,
): { hladanie: string; zoznam: string } {
  const n = String(nazov ?? "").trim();
  if (!n) return { hladanie: t("Hľadať kód, názov alebo účet"), zoznam: t("Voľby") };
  return {
    hladanie: t("{nazov} — hľadať kód, názov alebo účet", { nazov: n }),
    zoznam: t("{nazov} — voľby", { nazov: n }),
  };
}
