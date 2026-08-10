import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";

export const Route = createFileRoute("/pomoc/objednavky-dodavatel")({
  head: () => ({
    meta: [
      { title: "Pomoc — Objednávky u dodávateľov — Faktero" },
      {
        name: "description",
        content:
          "Objednávky u dodávateľov: návrh doobjednania podľa minimálnych zásob, odoslanie, čiastočný príjem tovaru a stav objednávky.",
      },
      { property: "og:url", content: "https://faktero.sk/pomoc/objednavky-dodavatel" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/objednavky-dodavatel" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "naco",
    title: "Načo sú objednávky u dodávateľov",
    body: (
      <>
        <p>
          Objednávka u dodávateľa je opak <Link to="/pomoc/objednavky">prijatej objednávky</Link>:
          tentokrát ste odberateľom vy. Drží prehľad o tom, čo je objednané, čo už prišlo a čo ešte
          čakáte.
        </p>
        <p>
          Vďaka nej viete, že tovar je „na ceste" — a nemusíte ho objednávať druhýkrát len preto, že
          na sklade nie je.
        </p>
      </>
    ),
  },
  {
    id: "vytvorenie",
    title: "Vytvorenie objednávky",
    body: (
      <>
        <p>
          V <Link to="/sklad/objednavky/nova">Sklad → Objednávky u dodávateľov → Nová</Link> vyberte
          dodávateľa, sklad, kam tovar príde, a položky.
        </p>
        <p>
          Rýchlejšia cesta vedie cez <Link to="/sklad/minimum">Sklad → Pod minimom</Link>. Faktero
          navrhne, čo doobjednať a v akom množstve, aby ste sa dostali na{" "}
          <strong>optimálny stav</strong> karty. Návrh sa dá pred odoslaním upraviť.
        </p>
        <p>
          Objednávka sa dá priradiť na <Link to="/pomoc/zakazky">zákazku</Link>. Pozor:{" "}
          <strong>objednaný tovar ešte nie je náklad zákazky</strong> — nákladom sa stane až jeho
          výdajom zo skladu.
        </p>
      </>
    ),
  },
  {
    id: "stavy",
    title: "Stavy a príjem tovaru",
    body: (
      <>
        <ul>
          <li>
            <strong>Rozpracovaná</strong> — dá sa voľne meniť aj zmazať.
          </li>
          <li>
            <strong>Odoslaná</strong> — odteraz je to doklad. Nemaže sa, len ruší.
          </li>
          <li>
            <strong>Čiastočne prijatá</strong> — časť tovaru prišla.
          </li>
          <li>
            <strong>Prijatá</strong> — prišlo všetko.
          </li>
          <li>
            <strong>Zrušená</strong>.
          </li>
        </ul>
        <p>
          Stav sa <strong>počíta z prijatých množstiev</strong>, nenastavuje sa ručne. Príjem
          zapisujte priamo na objednávku — vtedy vznikne skladový pohyb a objednávka si sama posunie
          stav.
        </p>
        <p>
          Pri príjme <strong>vyplňte nákupnú cenu</strong>. Bez nej sa pokazí vážená cena skladu a
          marža na predaji bude nepravdivá.
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <HelpArticle
      category="Pomoc · Sklad"
      title="Objednávky u dodávateľov"
      intro={<p>Čo máte objednané, čo už prišlo a čo ešte čakáte.</p>}
      sections={sections}
    />
  );
}
