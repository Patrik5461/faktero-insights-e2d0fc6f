import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";

export const Route = createFileRoute("/pomoc/zamestnanci")({
  head: () => ({
    meta: [
      { title: "Pomoc — Zamestnanci — Faktero" },
      {
        name: "description",
        content:
          "Personalistika vo Fakteru: karta zamestnanca, zmluvy a dokumenty zo šablón, dochádzka, neprítomnosti a pripomienky lehôt.",
      },
      { property: "og:url", content: "https://faktero.sk/pomoc/zamestnanci" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/zamestnanci" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "co-to-je",
    title: "Čo modul rieši",
    body: (
      <>
        <p>
          <strong>Personalistiku bez miezd</strong> — karty zamestnancov, zmluvy a dokumenty,
          dochádzku, neprítomnosti a lehoty, ktoré nesmú ujsť. Mzdy sa počítajú inde; Faktero má
          podklady, z ktorých sa počítajú.
        </p>
        <p>Modul má zapnutý každá firma; vypnúť sa dá na požiadanie.</p>
      </>
    ),
  },
  {
    id: "karta",
    title: "Karta zamestnanca",
    body: (
      <>
        <p>
          Osobné a kontaktné údaje, druh pracovnoprávneho vzťahu (pracovná zmluva, dohoda o vykonaní
          práce, brigádnická práca študentov), miesto výkonu práce, odmena a skúšobná doba.
        </p>
        <p>
          <strong>Rodné číslo a číslo dokladu sú šifrované</strong> aj v databáze a ich zobrazenie
          sa zaznamenáva. Kto ich uvidí, určuje rola alebo{" "}
          <Link to="/pomoc/role">vlastný prístup</Link> — oblasť „Zamestnanci" sa dá zapnúť
          samostatne.
        </p>
      </>
    ),
  },
  {
    id: "dokumenty",
    title: "Zmluvy a dokumenty zo šablón",
    body: (
      <>
        <p>
          V šablónach sa pripraví text raz a Faktero doň doplní údaje zamestnanca — pracovná zmluva,
          dodatok, výpoveď, potvrdenie o príjme, prihláška do zdravotnej a Sociálnej poisťovne,
          školenie BOZP a ďalšie. Hotový dokument sa uloží ku karte ako PDF.
        </p>
      </>
    ),
  },
  {
    id: "dochadzka",
    title: "Dochádzka a neprítomnosti",
    body: (
      <>
        <p>
          Zapisuje sa práca, dovolenka, náhradné voľno, neplatené voľno, služobná cesta, sviatok aj
          home office; hodiny sa dajú zadať priamo alebo časom od–do s prestávkou. Mesačný súhrn
          ukáže odpracované hodiny a čerpanú dovolenku a dá sa vyexportovať pre mzdovú účtovníčku.
        </p>
      </>
    ),
  },
  {
    id: "pripomienky",
    title: "Lehoty, ktoré sa pripomínajú",
    body: (
      <>
        <p>
          Koniec pracovného pomeru, koniec skúšobnej doby, lekárska prehliadka a školenie BOZP —
          Faktero na ne upozorní vopred, aby sa nezmeškali. Pripomienky vidno v prehľade
          zamestnancov aj na zvončeku.
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <HelpArticle
      category="Pomoc · Firma"
      title="Zamestnanci"
      intro={<p>Karty, zmluvy zo šablón, dochádzka a lehoty — personalistika bez miezd.</p>}
      sections={sections}
    />
  );
}
