/*
  Interné manuály podpory (`docs/podpora/*.md`) — čisté pomocné funkcie pre
  stránku Admin → Podpora → Manuály podpory.

  Obsah manuálov sem nepatrí: číta ho len server (`manualy-podpory.server.ts`)
  a vydá ho len platformovému adminovi s dvojfaktorom
  (`manualy-podpory.functions.ts`). Do verejnej pomoci, sitemapy ani do
  znalostí AI asistenta pre zákazníkov sa nedostanú.
*/

export type ManualPodpory = {
  /** Názov súboru bez `.md`, napr. `03-vystavene-faktury`. */
  slug: string;
  /** Poradové číslo z názvu súboru, napr. `03`. */
  cislo: string;
  /** Prvý nadpis `# …` manuálu. */
  nazov: string;
  obsah: string;
};

export type NadpisManualu = {
  uroven: number;
  text: string;
  /** Kotva (id) nadpisu — jedinečná v rámci manuálu. */
  id: string;
  /** Riadok v markdowne (od 1) — podľa neho sa nadpis spáruje s vykresleným. */
  riadok: number;
};

/** Malé písmená bez diakritiky; dĺžka reťazca ostáva rovnaká (kvôli ukážkam). */
export function normalizuj(s: string): string {
  let out = "";
  for (const ch of s) out += (ch.normalize("NFD")[0] ?? ch).toLowerCase()[0] ?? ch;
  return out;
}

/** Inline markdown na čistý text (nadpisy, ukážky vo vyhľadávaní). */
export function cistyText(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|\W)[*_](\S[^*_]*?)[*_](?=\W|$)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

/** Kotva z textu nadpisu: „Dobropis — rozpor“ → `dobropis-rozpor`. */
export function slugNadpisu(text: string): string {
  const s = normalizuj(cistyText(text))
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "sekcia";
}

const NADPIS = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const PLOT = /^\s{0,3}(```|~~~)/;

/** Nadpisy manuálu v poradí, s jedinečnými kotvami. Bloky kódu sa preskočia. */
export function nadpisyManualu(md: string): NadpisManualu[] {
  const out: NadpisManualu[] = [];
  const pouzite = new Map<string, number>();
  let vKode = false;
  md.split("\n").forEach((riadok, i) => {
    if (PLOT.test(riadok)) {
      vKode = !vKode;
      return;
    }
    if (vKode) return;
    const m = NADPIS.exec(riadok);
    if (!m) return;
    const text = cistyText(m[2]);
    const zaklad = slugNadpisu(m[2]);
    const n = pouzite.get(zaklad) ?? 0;
    pouzite.set(zaklad, n + 1);
    out.push({ uroven: m[1].length, text, id: n ? `${zaklad}-${n}` : zaklad, riadok: i + 1 });
  });
  return out;
}

/** Názov manuálu = prvý nadpis prvej úrovne, inak názov súboru. */
export function nazovManualu(md: string, slug: string): string {
  const h1 = nadpisyManualu(md).find((n) => n.uroven === 1);
  return h1?.text ?? slug;
}

/** Manuál z názvu súboru a obsahu. */
export function manualZoSuboru(subor: string, obsah: string): ManualPodpory {
  const slug = subor.replace(/^.*\//, "").replace(/\.md$/, "");
  return {
    slug,
    cislo: /^(\d+)/.exec(slug)?.[1] ?? "",
    nazov: nazovManualu(obsah, slug),
    obsah,
  };
}

/*
  Manuály sa odvolávajú jeden na druhý názvom súboru („pozri
  14-mobilna-appka-a-kniha-jazd.md“). Holý názov v texte sa zmení na odkaz
  `?m=…`; v `spätných úvodzovkách` ho prelinkuje až komponent pre kód.
*/
const ODKAZ_NA_MANUAL = /(?<![`\w/[-])(\d{2}-[a-z0-9-]+)\.md(?![`\w])/g;

export function prelinkujManualy(md: string, slugy: ReadonlySet<string>): string {
  let vKode = false;
  return md
    .split("\n")
    .map((riadok) => {
      if (PLOT.test(riadok)) {
        vKode = !vKode;
        return riadok;
      }
      if (vKode) return riadok;
      return riadok.replace(ODKAZ_NA_MANUAL, (cele, slug: string) =>
        slugy.has(slug) ? `[${slug}.md](?m=${slug})` : cele,
      );
    })
    .join("\n");
}

/** Slug manuálu z `03-vystavene-faktury.md` (inline kód), inak null. */
export function slugZOdkazu(text: string, slugy: ReadonlySet<string>): string | null {
  const m = /^(\d{2}-[a-z0-9-]+)\.md$/.exec(text.trim());
  return m && slugy.has(m[1]) ? m[1] : null;
}

export type VysledokHladania = {
  slug: string;
  nazovManualu: string;
  /** Kotva sekcie; prázdna = začiatok manuálu. */
  kotva: string;
  nadpis: string;
  ukazka: string;
};

type Sekcia = { kotva: string; nadpis: string; text: string };

function sekcieManualu(m: ManualPodpory): Sekcia[] {
  const nadpisy = nadpisyManualu(m.obsah);
  const riadky = m.obsah.split("\n");
  const sekcie: Sekcia[] = [];
  let zaciatok = 0;
  let aktualny: NadpisManualu | null = null;
  const uzavri = (koniec: number) => {
    const text = cistyText(
      riadky
        .slice(zaciatok, koniec)
        .filter((r) => !/^\|?[\s:|-]+\|?$/.test(r)) // oddeľovač tabuľky
        .map((r) => r.replace(/^\s*(#{1,6}|>|[-*]|\d+\.)\s+/, "").replace(/\|/g, " "))
        .join(" "),
    );
    if (text || aktualny)
      sekcie.push({ kotva: aktualny?.id ?? "", nadpis: aktualny?.text ?? m.nazov, text });
  };
  for (const n of nadpisy) {
    uzavri(n.riadok - 1);
    aktualny = n;
    zaciatok = n.riadok; // samotný nadpis do textu nepatrí — je v `nadpis`
  }
  uzavri(riadky.length);
  return sekcie;
}

function ukazka(text: string, normText: string, slova: string[], dlzka = 160): string {
  const pozicie = slova.map((s) => normText.indexOf(s)).filter((p) => p >= 0);
  const prva = pozicie.length ? Math.min(...pozicie) : 0;
  const od = Math.max(0, prva - 50);
  const kus = text.slice(od, od + dlzka).trim();
  return (od > 0 ? "… " : "") + kus + (od + dlzka < text.length ? " …" : "");
}

/**
 * Fulltext nad názvami, nadpismi aj obsahom. Sekcia vyhovie, keď obsahuje
 * všetky slová dotazu (bez ohľadu na veľkosť písmen a diakritiku).
 */
export function hladajVManualoch(
  manualy: ManualPodpory[],
  dotaz: string,
  limit = 60,
): VysledokHladania[] {
  const slova = normalizuj(dotaz).split(/\s+/).filter(Boolean);
  if (!slova.length) return [];
  const out: VysledokHladania[] = [];
  for (const m of manualy) {
    for (const s of sekcieManualu(m)) {
      const normText = normalizuj(s.text);
      const vsetko = `${normalizuj(m.nazov)} ${normalizuj(s.nadpis)} ${normText}`;
      if (!slova.every((w) => vsetko.includes(w))) continue;
      out.push({
        slug: m.slug,
        nazovManualu: m.nazov,
        kotva: s.kotva,
        nadpis: s.nadpis,
        ukazka: ukazka(s.text, normText, slova),
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}
