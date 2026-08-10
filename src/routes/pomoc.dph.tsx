import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";

export const Route = createFileRoute("/pomoc/dph")({
  head: () => ({
    meta: [
      { title: "Pomoc — DPH — Faktero" },
      {
        name: "description",
        content:
          "Prehľad DPH vo Faktere: sadzby 23, 19, 5 a 0 %, daň na výstupe a vstupe, prenesenie daňovej povinnosti a podklady pre priznanie.",
      },
      { property: "og:url", content: "https://faktero.sk/pomoc/dph" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/dph" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "prehlad",
    title: "Čo prehľad DPH ukazuje",
    body: (
      <>
        <p>
          <Link to="/uctovnictvo/dph">Účtovníctvo → DPH prehľad</Link> spočíta za zvolené obdobie{" "}
          <strong>daň na výstupe</strong> (z vydaných faktúr) a <strong>daň na vstupe</strong> (z
          prijatých faktúr a dokladov) a ukáže rozdiel — teda koľko máte odviesť alebo si nárokovať.
        </p>
        <p>
          Je to <strong>podklad</strong>, nie priznanie. Priznanie podáva účtovníčka; Faktero jej dá
          čísla a rozpis, z ktorých dokladov vznikli.
        </p>
      </>
    ),
  },
  {
    id: "sadzby",
    title: "Sadzby DPH",
    body: (
      <>
        <p>Faktero pracuje so slovenskými sadzbami:</p>
        <ul>
          <li>
            <strong>23 %</strong> — základná,
          </li>
          <li>
            <strong>19 %</strong> — znížená,
          </li>
          <li>
            <strong>5 %</strong> — znížená (napríklad vybrané potraviny a bývanie),
          </li>
          <li>
            <strong>0 %</strong> — oslobodené plnenia.
          </li>
        </ul>
        <p>
          Sadzba sa nastavuje na produkte a dá sa prepísať na riadku faktúry. Predvolená je 23 %.
        </p>
      </>
    ),
  },
  {
    id: "neplatca",
    title: "Ak nie ste platiteľ DPH",
    body: (
      <>
        <p>
          V <Link to="/firma">Nastaveniach firmy</Link> nechajte IČ DPH prázdne. Faktúry potom
          vychádzajú bez dane a na doklade sa objaví poznámka, že nie ste platiteľom.
        </p>
        <p>Prehľad DPH v tom prípade nepotrebujete.</p>
      </>
    ),
  },
  {
    id: "prenesenie",
    title: "Prenesenie daňovej povinnosti",
    body: (
      <>
        <p>
          Pri faktúre sa dá zapnúť <strong>prenesenie daňovej povinnosti</strong> — tuzemské podľa
          §69, dodanie do EÚ alebo vývoz. Faktúra potom ide bez DPH a nesie príslušnú poznámku;
          namiesto sadzby je na riadkoch <em>PDP</em>.
        </p>
        <p>Takéto faktúry sa v prehľade DPH vedú zvlášť, lebo daň z nich neodvádzate vy.</p>
      </>
    ),
  },
  {
    id: "obdobie",
    title: "Do ktorého obdobia doklad patrí",
    body: (
      <>
        <p>
          Rozhoduje <strong>dátum dodania</strong>, nie dátum vystavenia ani úhrady. Ak dátum dodania
          nevyplníte, Faktero použije dátum vystavenia.
        </p>
        <p>
          Preto sa oplatí dátum dodania vypĺňať vždy, keď sa líši — inak sa doklad ocitne v zlom
          mesiaci DPH.
        </p>
        <p>
          Keď je priznanie podané, obdobie{" "}
          <Link to="/pomoc/uzavierka">uzamknite</Link>. Zabránite tým dodatočným zmenám v sumách a
          dátumoch.
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <HelpArticle
      category="Pomoc · Účtovníctvo"
      title="DPH vo Faktere"
      intro={<p>Sadzby, daň na výstupe a vstupe, prenesenie povinnosti a podklady pre priznanie.</p>}
      sections={sections}
    />
  );
}
