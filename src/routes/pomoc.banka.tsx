import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";

export const Route = createFileRoute("/pomoc/banka")({
  head: () => ({
    meta: [
      { title: "Pomoc — Bankové účty — Faktero" },
      {
        name: "description",
        content:
          "Pripojenie banky, sťahovanie transakcií, párovanie úhrad s faktúrami a bankové výpisy vo Faktere.",
      },
      { property: "og:url", content: "https://faktero.sk/pomoc/banka" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/banka" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "naco",
    title: "Načo pripájať banku",
    body: (
      <>
        <p>
          Aby ste nemuseli ručne označovať, ktorá faktúra je zaplatená. Faktero stiahne pohyby z účtu
          a spáruje ich s faktúrami podľa variabilného symbolu a sumy.
        </p>
        <p>
          Účty sa spravujú v <Link to="/bankove-ucty">Účtovníctvo → Bankové účty</Link>.
        </p>
      </>
    ),
  },
  {
    id: "pripojenie",
    title: "Pripojenie účtu",
    body: (
      <>
        <p>
          V <Link to="/bankove-ucty/pripojit">Pripojiť banku</Link> vyberte banku a prejdite jej
          prihlásením. Súhlas na prístup k účtu má obmedzenú platnosť — po jej uplynutí ho treba
          obnoviť, Faktero na to upozorní.
        </p>
        <p>
          Účet sa dá viesť aj <strong>bez pripojenia</strong>, len ako číslo účtu na faktúrach.
        </p>
      </>
    ),
  },
  {
    id: "transakcie",
    title: "Transakcie a párovanie",
    body: (
      <>
        <p>
          <Link to="/bankove-ucty/transakcie">Bankové transakcie</Link> ukazujú pohyby na účte.
          Faktero navrhne, ku ktorej faktúre pohyb patrí; potvrdením sa faktúra označí za uhradenú s
          dátumom pohybu.
        </p>
        <p>
          Párovanie podľa variabilného symbolu funguje spoľahlivo len vtedy, keď ho odberateľ uvedie.
          Preto Faktero predvypĺňa variabilný symbol z čísla faktúry.
        </p>
        <p>
          Úhrada sa dá zapísať aj do <Link to="/pomoc/uzavierka">uzamknutého obdobia</Link> — platby
          chodia aj mesiace po vystavení faktúry.
        </p>
      </>
    ),
  },
  {
    id: "vypisy",
    title: "Bankové výpisy",
    body: (
      <>
        <p>
          <Link to="/bankove-ucty/vypisy">Bankové výpisy</Link> sú mesačné prehľady pre účtovníčku.
          Pri bankách, ktoré výpisy poskytujú, sa stiahnu priamo od nich.
        </p>
        <p>
          Pri ostatných si Faktero zostaví vlastný výpis zo stiahnutých transakcií — vo formáte
          camt.053 aj ako PDF. Taký výpis je len tak úplný, ako sú úplné transakcie, z ktorých
          vznikol.
        </p>
      </>
    ),
  },
  {
    id: "platby",
    title: "Odosielanie platieb",
    body: (
      <>
        <p>
          Pri podporovaných bankách sa dá platba odoslať priamo z Fakera. Vyžaduje si to samostatný
          súhlas — súhlas na čítanie účtu na platby nestačí.
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <HelpArticle
      category="Pomoc · Účtovníctvo"
      title="Bankové účty a párovanie úhrad"
      intro={<p>Pripojenie banky, sťahovanie pohybov, automatické párovanie faktúr a výpisy.</p>}
      sections={sections}
    />
  );
}
