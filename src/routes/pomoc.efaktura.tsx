import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";

export const Route = createFileRoute("/pomoc/efaktura")({
  head: () => ({
    meta: [
      { title: "Pomoc — eFaktúra — Faktero" },
      { name: "description", content: "Čo je eFaktúra, prečo to nie je PDF a ako vám Faktero pomôže pripraviť sa na rok 2027." },
      { property: "og:title", content: "Pomoc — eFaktúra — Faktero" },
      { property: "og:description", content: "Pripravenosť na povinnú elektronickú fakturáciu v SR." },
      { property: "og:url", content: "https://faktero.sk/pomoc/efaktura" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/efaktura" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "co-je",
    title: "Čo je eFaktúra",
    body: (
      <>
        <p>eFaktúra je <strong>štruktúrovaný elektronický dokument</strong> (XML), ktorý si vystavovateľ a príjemca vymieňajú strojovo čitateľnou formou. Spĺňa európsku normu <code>EN 16931</code> a v SR sa odovzdáva cez informačný systém Finančnej správy.</p>
        <p>Slovensko zavádza povinnú eFakturáciu pre B2B postupne v roku <strong>2027</strong>.</p>
      </>
    ),
  },
  {
    id: "nie-pdf",
    title: "eFaktúra nie je PDF",
    body: (
      <>
        <p>PDF je obrázok faktúry pre ľudí. eFaktúra je <strong>XML súbor pre stroje</strong> — účtovný systém príjemcu ho vie spracovať automaticky bez ručného prepisovania.</p>
        <p>PDF prílohu môžete posielať aj naďalej, ale právne záväzná bude eFaktúra v XML formáte podľa normy EN 16931 / Peppol BIS.</p>
      </>
    ),
  },
  {
    id: "readiness",
    title: "Faktero readiness score",
    body: (
      <>
        <p>Na dashboarde vidíte <strong>skóre pripravenosti</strong> vašej firmy na eFakturáciu. Skóre zohľadňuje:</p>
        <ul>
          <li>Doplnené identifikačné údaje firmy (IČO, DIČ, IČ DPH, adresa).</li>
          <li>Vyplnené údaje odberateľov.</li>
          <li>Korektne nastavené sadzby DPH a meny.</li>
          <li>Validitu vygenerovaných XML dokumentov.</li>
        </ul>
        <p>Čím vyššie skóre, tým menej úprav vás čaká pred povinným prechodom.</p>
      </>
    ),
  },
  {
    id: "xml-peppol",
    title: "XML / Peppol pripravenosť",
    body: (
      <>
        <p>Faktero už dnes vie vygenerovať XML eFaktúry vo formáte kompatibilnom s normou EN 16931 (UBL 2.1). Súbor si môžete stiahnuť na detaile faktúry.</p>
        <p>Pre Peppol sieť pripravujeme priame napojenie cez akreditovaný Access Point — bude k dispozícii pred spustením povinnej eFakturácie.</p>
      </>
    ),
  },
  {
    id: "2027",
    title: "Čo bude dostupné pred rokom 2027",
    body: (
      <>
        <ul>
          <li><strong>Validátor</strong> XML voči SK rozšíreniam EN 16931.</li>
          <li><strong>Priame odosielanie</strong> do IS Finančnej správy (IS EFA).</li>
          <li><strong>Príjem</strong> eFaktúr od dodávateľov priamo do Faktera.</li>
          <li><strong>Archív</strong> v zákonom požadovanej lehote.</li>
        </ul>
        <p>Ak chcete byť informovaní o spustení, prihláste sa cez <Link to="/efaktura">stránku eFaktúra</Link>.</p>
      </>
    ),
  },
];

function Page() {
  return (
    <HelpArticle
      category="Pomoc · eFaktúra"
      title="Elektronická fakturácia (eFaktúra)"
      intro={<p>Príprava na povinnú elektronickú fakturáciu v Slovenskej republike.</p>}
      sections={sections}
    />
  );
}