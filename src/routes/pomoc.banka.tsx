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
          Párovanie sa spúšťa tlačidlom <strong>Spárovať platby</strong> v prehľade faktúr (alebo
          <strong> Spárovať s faktúrami</strong> nad transakciami). Nerobí sa samo od seba — úhrada
          mení stav faktúry, a to nemá prebehnúť bez toho, aby o tom niekto vedel.
        </p>
        <p>Faktero rozdeľuje nájdené dvojice na dve kôpky:</p>
        <ul>
          <li>
            <strong>Isté</strong> — sedí variabilný symbol aj suma do haliera a žiadna iná faktúra
            neprichádza do úvahy. Tie sa dajú zapísať naraz tlačidlom „Spárovať isté".
          </li>
          <li>
            <strong>Na rozhodnutie</strong> — čiastočná platba, chýbajúci variabilný symbol, alebo
            rovnako dobre sedia dve faktúry. Pri každej dvojici je napísané, prečo ju Faktero
            ponúka, a rozhodujete vy.
          </li>
        </ul>
        <p>
          Čiastočná úhrada nechá faktúru otvorenú so zvyškom — ďalšia platba sa napáruje na to, čo
          ostalo. Za uhradenú sa faktúra označí, až keď je pokrytá celá.
        </p>
        <p>
          Párovanie sa dá vrátiť: v zozname transakcií je pri spárovanom pohybe krížik, ktorý úhradu
          zmaže a faktúru vráti medzi otvorené.
        </p>
        <p>
          Odchádzajúce platby sa nepárujú — tie patria k prijatým faktúram, nie k vystaveným.
          Párovanie podľa variabilného symbolu funguje spoľahlivo len vtedy, keď ho odberateľ uvedie;
          preto Faktero predvypĺňa variabilný symbol z čísla faktúry.
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
