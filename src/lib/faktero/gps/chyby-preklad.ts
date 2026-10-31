/**
 * Preklad chybových hlášok poskytovateľov GPS do jazyka rozhrania.
 *
 * Server (adaptéry v `gps/*.server.ts`) skladá hlášky po slovensky — ukladajú
 * sa tak aj do logu a `posledna_chyba`, ktoré čítajú admin a podpora. Do
 * nemčiny a češtiny sa prekladajú až pri zobrazení: pevné vety cez slovník
 * (`i18n/{de,cs}/sto-jazdy.ts`), vety s číslom alebo textom od poskytovateľa
 * cez vzory nižšie. Čo sa nepodarí rozpoznať, ostane, ako prišlo.
 */
type T = (text: string, p?: Record<string, string | number>) => string;

const POSKYTOVATELIA = "Geotab|Traccar|Webfleet|GPS Dozor|Wialon|Webdispečink|Samsara";

/** [vzor, kľúč prekladu, mená parametrov v poradí skupín] */
const VZORY: Array<[RegExp, string, string[]]> = [
  [
    new RegExp(`^(${POSKYTOVATELIA}) odpovedal stavom (\\d+)\\.$`),
    "{p} odpovedal stavom {kod}.",
    ["p", "kod"],
  ],
  [
    new RegExp(`^(${POSKYTOVATELIA}) odpovedala stavom (\\d+)\\.$`),
    "{p} odpovedala stavom {kod}.",
    ["p", "kod"],
  ],
  [/^Webfleet vrátil HTTP (\d+)\.$/, "Webfleet vrátil HTTP {kod}.", ["kod"]],
  [
    /^Webdispečink odpovedal neočakávane \(HTTP (\d+)\)\.$/,
    "Webdispečink odpovedal neočakávane (HTTP {kod}).",
    ["kod"],
  ],
  [
    /^Webdispečink nevrátil odpoveď na (.+)\.$/,
    "Webdispečink nevrátil odpoveď na {metoda}.",
    ["metoda"],
  ],
  [
    /^Webdispečink zmenu jazdy neprijal \(kód (.+)\)\.$/,
    "Webdispečink zmenu jazdy neprijal (kód {kod}).",
    ["kod"],
  ],
  [
    /^Webfleet dovoľuje túto požiadavku len raz za (\d+) s\. Skúste to o chvíľu znova\.$/,
    "Webfleet dovoľuje túto požiadavku len raz za {s} s. Skúste to o chvíľu znova.",
    ["s"],
  ],
  [/^Server Geotab (.+) je nedostupný\.$/, "Server Geotab {server} je nedostupný.", ["server"]],
  [
    /^Server (.+) nie je verejne dostupná adresa — zadajte adresu, na ktorú sa dá pripojiť z internetu\.$/,
    "Server {server} nie je verejne dostupná adresa — zadajte adresu, na ktorú sa dá pripojiť z internetu.",
    ["server"],
  ],
  // „X vrátil chybu 123: text od poskytovateľa." — zvyšok je kód a ich vlastný text.
  [
    new RegExp(`^(${POSKYTOVATELIA}) vrátil chybu([\\s\\S]*)$`),
    "{p} vrátil chybu{zvysok}",
    ["p", "zvysok"],
  ],
];

export function prelozChybuGps(sprava: string | null | undefined, t: T): string {
  if (!sprava) return t("Chyba");
  const priamo = t(sprava);
  if (priamo !== sprava) return priamo;

  // „Vyplňte: Heslo, API kľúč." — mená polí sa prekladajú zvlášť.
  const vyplnte = /^Vyplňte: (.+)\.$/.exec(sprava);
  if (vyplnte) {
    const polia = vyplnte[1]
      .split(", ")
      .map((p) => t(p))
      .join(", ");
    return t("Vyplňte: {polia}.", { polia });
  }

  for (const [vzor, kluc, mena] of VZORY) {
    const m = vzor.exec(sprava);
    if (!m) continue;
    const p: Record<string, string> = {};
    mena.forEach((meno, i) => (p[meno] = m[i + 1] ?? ""));
    return t(kluc, p);
  }
  return sprava;
}
