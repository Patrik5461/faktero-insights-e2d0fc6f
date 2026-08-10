import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";

export const Route = createFileRoute("/pomoc/jazdy")({
  head: () => ({
    meta: [
      { title: "Pomoc — Kniha jázd — Faktero" },
      {
        name: "description",
        content:
          "Kniha jázd vo Faktere: vozidlá, spotreba, tankovanie, GPS záznam, priradenie jazdy na zákazku a export.",
      },
      { property: "og:url", content: "https://faktero.sk/pomoc/jazdy" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/jazdy" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "zaciatok",
    title: "Než zapíšete prvú jazdu",
    body: (
      <>
        <p>
          Najprv založte vozidlo v <Link to="/jazdy/vozidla">Jazdy → Vozidlá a tankovanie</Link>.
          Okrem značky a evidenčného čísla vyplňte <strong>spotrebu v litroch na 100 km</strong>.
        </p>
        <p>
          Bez spotreby Faktero neurčí, koľko paliva sa minulo — a náklad na dopravu vyjde nula,
          vrátane <Link to="/pomoc/zakazky">vyhodnotenia zákaziek</Link>.
        </p>
      </>
    ),
  },
  {
    id: "jazda",
    title: "Zápis jazdy",
    body: (
      <>
        <p>
          V <Link to="/jazdy/nova">Jazdy → Nová jazda</Link> zadajte vozidlo, dátum, odkiaľ a kam,
          počet kilometrov a účel.
        </p>
        <p>
          Spotrebované palivo Faktero dopočíta zo spotreby vozidla. Jazdu možno priradiť na{" "}
          <strong>zákazku</strong> — potom sa jej cena objaví v nákladoch tej zákazky.
        </p>
        <p>
          Rozlišuje sa <strong>služobná</strong> a <strong>súkromná</strong> jazda; do nákladov idú
          len služobné.
        </p>
      </>
    ),
  },
  {
    id: "tankovanie",
    title: "Tankovanie a cena paliva",
    body: (
      <>
        <p>
          Tankovania sa zapisujú pri vozidle. Z nich Faktero berie <strong>cenu za liter</strong>,
          ktorou oceňuje jazdy.
        </p>
        <p>
          Použije sa posledná cena z tankovaní daného vozidla; ak vozidlo tankovanie nemá, posledná
          cena ktoréhokoľvek vozidla firmy. Kým nie je ani jedno tankovanie, jazdy sa neocenia.
        </p>
      </>
    ),
  },
  {
    id: "gps",
    title: "GPS a automatický záznam",
    body: (
      <>
        <p>
          <Link to="/jazdy/gps">GPS jazda</Link> zaznamená trasu priamo v mobile — stačí spustiť na
          začiatku a ukončiť na konci cesty. Kilometre sa dopočítajú samy.
        </p>
        <p>
          Cez <Link to="/jazdy/integracie">Integrácie</Link> sa dajú jazdy sťahovať automaticky z
          jednotky Commander GPS alebo z vozidla Tesla.
        </p>
      </>
    ),
  },
  {
    id: "prehlad-export",
    title: "Prehľad a export",
    body: (
      <>
        <p>
          <Link to="/jazdy/prehlad">Prehľad</Link> ukazuje najazdené kilometre a náklady po
          vozidlách a obdobiach.
        </p>
        <p>
          <Link to="/jazdy/export">Export</Link> pripraví knihu jázd na odovzdanie účtovníčke alebo
          na kontrolu.
        </p>
        <p>
          Na knihu jázd platí <Link to="/pomoc/uzavierka">uzamknutie období</Link> — po uzavretí sa
          staré jazdy už nedajú meniť.
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <HelpArticle
      category="Pomoc · Kniha jázd"
      title="Kniha jázd"
      intro={<p>Vozidlá, spotreba, tankovanie, GPS záznam a prepojenie jázd so zákazkami.</p>}
      sections={sections}
    />
  );
}
