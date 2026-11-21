#!/usr/bin/env node
/**
 * Znalostná báza z manuálov.
 *
 * AI asistent poznal len zoznam funkcií — teda čo Faktero vie, nie ako sa to
 * robí. Návody pritom v aplikácii sú, len ich mal kto prečítať. Tento skript
 * z nich vyrobí text: z každej stránky `pomoc.*.tsx` vytiahne nadpisy sekcií
 * a ich obsah bez značiek.
 *
 * Spúšťa sa ručne po úprave manuálov:  node scripts/znalosti-manualy.mjs
 * Výsledok sa commituje, aby beh servera nezávisel od zdrojákov stránok.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { vyradPodmienene, zapnutePodmienky } from "./znalosti-podmienky.mjs";

const KOREN = path.resolve(import.meta.dirname, "..");
const PRIECINOK = path.join(KOREN, "src/routes");
const VYSTUP = path.join(KOREN, "src/lib/faktero/znalosti-manualy.json");
/** Len titulky a nadpisy s kotvami — pre hľadanie v hlavičke (bez 300 kB textu). */
const VYSTUP_NADPISY = path.join(KOREN, "src/lib/faktero/pomoc-nadpisy.gen.ts");
/** Podmienené sekcie (WhatsApp…) idú do bázy len pri zapnutej integrácii. */
const ZAPNUTE = zapnutePodmienky(process.env);

/** JSX na čistý text: značky preč, odkazy ostanú ako „text (cesta)". */
function naText(jsx) {
  let s = jsx;
  // Odkaz si zaslúži cestu — asistent potom vie povedať, kam kliknúť.
  s = s.replace(
    /<Link\s+to="([^"]+)"[^>]*>([\s\S]*?)<\/Link>/g,
    (_, cesta, text) => `${text.replace(/<[^>]+>/g, "")} (${cesta})`,
  );
  s = s.replace(
    /<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g,
    (_, cesta, text) => `${text.replace(/<[^>]+>/g, "")} (${cesta})`,
  );
  s = s.replace(/<li>/g, "\n- ");
  s = s.replace(/<\/(p|li|ul|ol|div|h[1-6]|table|tr)>/g, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  // Zvyšky JSX: {" "}, {"{"}, výrazy v zátvorkách.
  s = s.replace(/\{"\s*"\}/g, " ");
  s = s.replace(/\{"([^"]*)"\}/g, "$1");
  s = s.replace(/\{[^{}]*\}/g, " ");
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  return s
    .split("\n")
    .map((r) => r.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function vytiahni(subor) {
  const zdroj = readFileSync(subor, "utf8");
  const cesta =
    "/" +
    path
      .basename(subor)
      .replace(/\.tsx$/, "")
      .replace(/\./g, "/");
  const titulok =
    // Titulok býva obalený do `preloz(jazyk, "…")` (nemecká verzia webu).
    zdroj.match(/title:\s*(?:preloz\([^,]+,\s*)?"Pomoc\s*—\s*([^"]+?)\s*—\s*Faktero"/)?.[1] ??
    zdroj.match(/<(?:HelpArticle|PrelozenyManual)[\s\S]*?title="([^"]+)"/)?.[1] ??
    path.basename(subor);

  const sekcie = [];
  // Každá položka poľa `sections` má `title` a `body`, väčšinou aj `id`.
  const re =
    /(?:id:\s*"([^"]+)",\s*\n\s*)?title:\s*"([^"]+)",\s*\n\s*body:\s*\(([\s\S]*?)\n\s*\),\s*\n\s*\},/g;
  let m;
  while ((m = re.exec(zdroj))) {
    const text = naText(m[3]);
    if (text.length > 20) sekcie.push({ id: m[1], nadpis: m[2], text });
  }
  /*
    Dve stránky (online platby, videá) sekcie nemajú — sú napísané ako obyčajné
    JSX s nadpismi. Bez tejto vetvy by asistent o nich nevedel vôbec.
  */
  if (!sekcie.length) {
    // Komponent sa nemusí volať Page — berie sa od prvého `function X()` s JSX.
    const zaciatok = zdroj.search(/\nfunction [A-Z]\w*\(\)/);
    const telo = zdroj.slice(zaciatok > 0 ? zaciatok : 0);
    const kusy = telo.split(/<h2[^>]*>/).slice(1);
    for (const kus of kusy) {
      const nadpis = naText(kus.slice(0, kus.indexOf("</h2>")));
      const text = naText(kus.slice(kus.indexOf("</h2>") + 5));
      if (nadpis && text.length > 20) sekcie.push({ nadpis, text: text.slice(0, 4000) });
    }
  }

  // `id` do JSON nejde (vyraďujú sa podľa neho podmienené sekcie); kotvu
  // potrebuje len hľadanie v hlavičke — ide do `pomoc-nadpisy.gen.ts`.
  const ponechane = vyradPodmienene(cesta, sekcie, ZAPNUTE);
  const ostatne = ponechane.map(({ nadpis, text }) => ({ nadpis, text }));
  const kotvy = ponechane.map(({ id, nadpis }) => (id ? { id, nadpis } : { nadpis }));
  return ostatne.length ? { cesta, titulok, sekcie: ostatne, kotvy } : null;
}

const subory = readdirSync(PRIECINOK)
  .filter((f) => f.startsWith("pomoc.") && f.endsWith(".tsx") && f !== "pomoc.index.tsx")
  .sort();

const clanky = subory.map((f) => vytiahni(path.join(PRIECINOK, f))).filter(Boolean);

/*
  Stránka s videami sa skladá z dát, nie z textu — asistent by o nej inak
  nevedel. Zoznam návodov sa vytiahne priamo zo zdroja dát.
*/
try {
  const zdrojVidei = readFileSync(path.join(KOREN, "src/lib/faktero/video-navody.ts"), "utf8");
  const nazvy = [...zdrojVidei.matchAll(/title:\s*"([^"]+)"/g)].map((m) => m[1]);
  if (nazvy.length) {
    clanky.push({
      cesta: "/pomoc/videa",
      titulok: "Video návody",
      sekcie: [
        {
          nadpis: "Aké videá sú k dispozícii",
          text:
            "Krátke videá so slovenským komentárom a titulkami, kde je krok za krokom ukázané, ako vo Faktere urobiť bežné veci. Nájdete ich na /pomoc/videa. Zoznam návodov:\n- " +
            nazvy.join("\n- "),
        },
      ],
    });
  }
} catch {
  /* bez videí sa znalosti vyrobia aj tak */
}
clanky.sort((a, b) => a.cesta.localeCompare(b.cesta));

/* Titulky a nadpisy s kotvou pre hľadanie v hlavičke (GlobalneHladanie). */
const nadpisy = clanky.map((c) => ({
  cesta: c.cesta,
  titulok: c.titulok,
  sekcie: c.kotvy ?? c.sekcie.map((s) => ({ nadpis: s.nadpis })),
}));
for (const c of clanky) delete c.kotvy;
writeFileSync(
  VYSTUP_NADPISY,
  "/* Vygenerované: node scripts/znalosti-manualy.mjs (z src/routes/pomoc.*.tsx). Ručne neupravovať. */\n\n" +
    "export type NadpisPomoci = { id?: string; nadpis: string };\n" +
    "export type ClanokPomoci = { cesta: string; titulok: string; sekcie: NadpisPomoci[] };\n\n" +
    `export const NADPISY_POMOCI: ClanokPomoci[] = ${JSON.stringify(nadpisy, null, 2)};\n`,
);
const znakov = clanky.reduce((a, c) => a + c.sekcie.reduce((b, s) => b + s.text.length, 0), 0);

writeFileSync(
  VYSTUP,
  JSON.stringify({ vytvorene: new Date().toISOString().slice(0, 10), clanky }, null, 1) + "\n",
);
console.log(
  `✓ ${clanky.length} manuálov, ${clanky.reduce((a, c) => a + c.sekcie.length, 0)} sekcií, ${Math.round(znakov / 1024)} kB textu → ${path.relative(KOREN, VYSTUP)}`,
);
for (const c of clanky.slice(0, 3))
  console.log(
    `  ${c.titulok}: ${c.sekcie
      .map((s) => s.nadpis)
      .join(" · ")
      .slice(0, 90)}`,
  );
