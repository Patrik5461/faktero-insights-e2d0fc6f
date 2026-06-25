import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";

export const Route = createFileRoute("/pomoc/sklad")({
  head: () => ({
    meta: [
      { title: "Pomoc — Sklad — Faktero" },
      { name: "description", content: "Skladové karty, príjem/výdaj, inventúra, automatický odpočet pri faktúre, minimálne zásoby a CSV export." },
      { property: "og:title", content: "Pomoc — Sklad — Faktero" },
      { property: "og:description", content: "Práca so skladom vo Faktere." },
      { property: "og:url", content: "https://faktero.sk/pomoc/sklad" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/sklad" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "karty",
    title: "Skladové karty",
    body: (
      <>
        <p>V <Link to="/sklad/produkty">Sklad → Produkty</Link> evidujete skladové karty s SKU, názvom, nákupnou a predajnou cenou.</p>
        <p>Pre každú kartu si nastavte, či sa <strong>sleduje stav</strong> (<code>track_stock</code>). Iba pri zapnutom sledovaní pohyby menia množstvo a Faktero bráni zápornému stavu.</p>
      </>
    ),
  },
  {
    id: "prijem-vydaj",
    title: "Príjem a výdaj",
    body: (
      <>
        <p>V <Link to="/sklad/pohyby">Sklad → Pohyby</Link> zaznamenávate:</p>
        <ul>
          <li><strong>Príjem</strong> — nákup tovaru, dotácia zo skladu (zvyšuje stav).</li>
          <li><strong>Výdaj</strong> — predaj mimo faktúry, spotreba (znižuje stav).</li>
          <li><strong>Oprava</strong> — manuálna úprava so znamienkom (+/-).</li>
        </ul>
        <p>Každý pohyb sa zapíše s dátumom, množstvom, cenou a poznámkou.</p>
      </>
    ),
  },
  {
    id: "inventura",
    title: "Inventúra",
    body: (
      <>
        <p>Inventúra vám umožní porovnať fyzický stav so stavom v systéme a rozdiel zaúčtovať.</p>
        <ol>
          <li>V <Link to="/sklad/inventura">Sklad → Inventúra</Link> založte novú inventúru.</li>
          <li>Vyplňte spočítané množstvá pre každú kartu.</li>
          <li>Po uzavretí Faktero vygeneruje pohyby <em>oprava</em> s rozdielom.</li>
        </ol>
      </>
    ),
  },
  {
    id: "auto-odpocet",
    title: "Automatický odpočet pri faktúre",
    body: (
      <>
        <p>Keď pri faktúre vyberiete položku zo skladu (<code>stock_item_id</code>) a faktúra prejde do stavu <strong>Odoslaná</strong> alebo <strong>Uhradená</strong>, Faktero automaticky vytvorí pohyb typu <em>faktúra</em> — stav skladu sa zníži o predané množstvo.</p>
        <p>Pri stornovaní faktúry sa vytvorí spätný pohyb typu <em>dobropis</em> a stav sa vráti.</p>
        <p>Po odoslaní faktúry už nemôžete meniť skladové položky — chráni to konzistenciu stavu.</p>
      </>
    ),
  },
  {
    id: "minimum",
    title: "Minimálne zásoby",
    body: (
      <>
        <p>Pre každú skladovú kartu nastavte <strong>minimálny stav</strong>. Faktero potom na dashboarde zobrazuje widget <em>Nízke zásoby</em> s počtom kariet pod limitom a odkazom na ich zoznam.</p>
      </>
    ),
  },
  {
    id: "csv",
    title: "CSV export",
    body: (
      <>
        <p>V <Link to="/sklad/produkty">Sklad → Produkty</Link> kliknite na <strong>Export skladu CSV</strong>. Súbor obsahuje:</p>
        <ul>
          <li>SKU</li>
          <li>Názov</li>
          <li>Aktuálny stav</li>
          <li>Minimálny stav</li>
          <li>Nákupná cena</li>
          <li>Predajná cena</li>
          <li>Hodnota skladu (stav × nákupná cena)</li>
        </ul>
        <p>CSV je v UTF-8 so stredníkom ako oddeľovačom, kompatibilné s Excelom.</p>
      </>
    ),
  },
];

function Page() {
  return (
    <HelpArticle
      category="Pomoc · Sklad"
      title="Sklad vo Faktere"
      intro={<p>Skladové karty, pohyby, inventúra a prepojenie s faktúrami.</p>}
      sections={sections}
    />
  );
}