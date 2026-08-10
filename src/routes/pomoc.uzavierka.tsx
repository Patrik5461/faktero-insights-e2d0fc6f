import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";

export const Route = createFileRoute("/pomoc/uzavierka")({
  head: () => ({
    meta: [
      { title: "Pomoc — Uzávierka — Faktero" },
      {
        name: "description",
        content:
          "Uzamknutie účtovného obdobia vo Faktere: čo sa zamkne, čo ostane možné a ako obdobie odomknúť.",
      },
      { property: "og:url", content: "https://faktero.sk/pomoc/uzavierka" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/uzavierka" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "naco",
    title: "Načo je uzávierka",
    body: (
      <>
        <p>
          Keď je podané daňové priznanie alebo kontrolný výkaz, doklady za to obdobie sa už nesmú
          meniť. Uzávierka je poistka proti tomu, aby niekto — aj omylom — nezmenil faktúru, ktorá je
          už odovzdaná úradu.
        </p>
        <p>
          Nastavuje sa v <Link to="/uctovnictvo/uzavierka">Účtovníctvo → Uzávierka</Link> jediným
          dátumom: <strong>uzamknuté do</strong>. Všetko s dátumom do tohto dňa vrátane je zamknuté.
        </p>
      </>
    ),
  },
  {
    id: "co-sa-zamkne",
    title: "Čo sa zamkne",
    body: (
      <>
        <p>V dokladoch s dátumom v uzamknutom období sa už nedajú meniť:</p>
        <ul>
          <li>dátumy — vystavenia, dodania, splatnosti,</li>
          <li>sumy a položky vydaných aj prijatých faktúr,</li>
          <li>odberateľ a sadzby DPH,</li>
          <li>záznamy v knihe jázd,</li>
          <li>pokladničné doklady,</li>
          <li>mazanie takýchto dokladov.</li>
        </ul>
        <p>
          Zákaz je <strong>v databáze, nie len vo formulári</strong>. Nedá sa obísť ani iným
          programom, ani rozhraním API.
        </p>
      </>
    ),
  },
  {
    id: "co-ostane",
    title: "Čo ostane možné",
    body: (
      <>
        <p>Zamykajú sa sumy a dátumy, nie práca s dokladom. Naďalej sa dá:</p>
        <ul>
          <li>
            <strong>označiť faktúru za uhradenú</strong> a zapísať dátum úhrady — platba prichádza aj
            mesiace po vystavení,
          </li>
          <li>meniť stav dokladu,</li>
          <li>dopísať poznámku,</li>
          <li>priradiť doklad na zákazku.</li>
        </ul>
        <p>
          Bez týchto výnimiek by uzavretie obdobia znamenalo, že staré faktúry sa už nikdy
          nespárujú s platbami.
        </p>
      </>
    ),
  },
  {
    id: "ako",
    title: "Ako obdobie uzamknúť",
    body: (
      <>
        <p>
          Na stránke sú rýchle tlačidlá — koniec predošlého mesiaca, štvrťroka alebo roka — alebo si
          zadajte vlastný dátum.
        </p>
        <p>
          Uzávierku môže nastaviť <strong>len majiteľ alebo správca firmy</strong>. Bežný člen ju
          vidí, ale nemení.
        </p>
        <p>
          Pred uzamknutím stránka ukáže, koľkých dokladov sa to týka. Oplatí sa najprv skontrolovať{" "}
          <Link to="/uctovnictvo/dph">prehľad DPH</Link> za dané obdobie.
        </p>
      </>
    ),
  },
  {
    id: "odomknutie",
    title: "Odomknutie",
    body: (
      <>
        <p>
          Odomknúť sa dá kedykoľvek — posunutím dátumu dozadu alebo úplným zrušením zámku. Faktero si
          pri tom vyžiada potvrdenie.
        </p>
        <p>
          Odomknutie je legitímne, napríklad pri dodatočnom daňovom priznaní. Po oprave nezabudnite
          obdobie zamknúť späť.
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <HelpArticle
      category="Pomoc · Účtovníctvo"
      title="Uzamknutie účtovného obdobia"
      intro={
        <p>
          Jedným dátumom zabránite zmenám v dokladoch, za ktoré už bolo podané priznanie — a úhrady
          napriek tomu naďalej fungujú.
        </p>
      }
      sections={sections}
    />
  );
}
