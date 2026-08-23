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
          Aby ste nemuseli ručne označovať, ktorá faktúra je zaplatená. Faktero stiahne pohyby z
          účtu a spáruje ich s faktúrami podľa variabilného symbolu a sumy.
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
    id: "wise",
    title: "Wise",
    body: (
      <>
        <p>
          Wise sa nepripája prihlásením ako banka, ale <strong>osobným tokenom</strong>. Vo Wise
          otvorte <em>Settings → API tokens</em>, vytvorte token na čítanie a vložte ho do Faktera.
        </p>
        <p>
          Potom je ešte jeden krok, na ktorý sa ľahko zabudne:{" "}
          <strong>výpisy vo Wise chráni podpis</strong>. Faktero vám ukáže verejný kľúč — stiahnite
          si ho ako súbor a nahrajte ho vo Wise k tomu istému tokenu. Kým to nespravíte, zostatky sa
          načítajú, ale pohyby nie.
        </p>
        <p>
          Každá mena je vo Fakteri samostatný účet, pretože tak ich vedie aj Wise. Sumy v rôznych
          menách sa nikdy nesčítavajú.
        </p>
      </>
    ),
  },
  {
    id: "wallester",
    title: "Wallester",
    body: (
      <>
        <p>
          Wallester vydáva firemné karty a jeho pohyby sú platby kartou — teda presne to, čo sa dá
          spárovať s naskenovanými bločkami podľa mena obchodníka.
        </p>
        <p>
          Prístup k ich rozhraniu <strong>nie je samoobslužný</strong>: treba oň požiadať Wallester
          (podpora alebo váš kontakt). Postup je potom takýto:
        </p>
        <ol>
          <li>
            V <Link to="/bankove-ucty/pripojit">Pripojiť banku</Link> kliknite na{" "}
            <em>Vyrobiť verejný kľúč</em> a stiahnite si ho ako súbor.
          </li>
          <li>Pošlite ten súbor Wallesteru.</li>
          <li>
            Oni vám vrátia <strong>issuer ID</strong>, <strong>audience ID</strong>, kód produktu a
            maximálnu platnosť tokenu.
          </li>
          <li>Tie štyri údaje doplňte vo Fakteri a dokončite pripojenie.</li>
        </ol>
        <p>
          Súkromný kľúč ostáva u nás zašifrovaný a nikam sa neposiela; Wallesteru ide len tá verejná
          polovica. Pripojenie sa hneď skúsi, takže o preklepe v údajoch viete okamžite.
        </p>
        <p>
          Wallester nie je bežný účet s IBAN-om — je to kartový účet, takže pri ňom neuvidíte číslo
          účtu ani variabilné symboly.
        </p>
      </>
    ),
  },
  {
    id: "revolut",
    title: "Revolut Business",
    body: (
      <>
        <p>
          Revolut sa pripája certifikátom a potvrdením v prehliadači. Postup má tri kroky, v takomto
          poradí ich vyžaduje Revolut:
        </p>
        <ol>
          <li>
            V <Link to="/bankove-ucty/pripojit">Pripojiť banku</Link> kliknite na{" "}
            <em>Vyrobiť certifikát</em> a stiahnite si ho.
          </li>
          <li>
            V Revolut Business otvorte <em>Settings → APIs → Business API</em>, nahrajte certifikát
            a ako návratovú adresu zadajte <strong>presne tú</strong>, ktorú Faktero na obrazovke
            ukazuje. Musí sedieť na znak.
          </li>
          <li>
            Portál vám ukáže <strong>client ID</strong>. Vložte ho do Faktera, kliknite na{" "}
            <em>Potvrdiť prístup</em> a v Revolute potvrďte, čo Fakteru dovolíte. Stačí čítanie.
          </li>
        </ol>
        <p>
          <strong>Súhlas platí približne 90 dní.</strong> Keď vyprší, sťahovanie prestane a
          potvrdenie treba zopakovať — je to tá istá cesta, len bez vyrábania certifikátu.
        </p>
        <p>
          Prevod medzi vlastnými menami je v Revolute jedna transakcia, ktorá sa dotýka dvoch účtov.
          Faktero ju preto zapíše na oba — z jedného odíde, na druhý príde.
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
          Párovanie podľa variabilného symbolu funguje spoľahlivo len vtedy, keď ho odberateľ
          uvedie; preto Faktero predvypĺňa variabilný symbol z čísla faktúry.
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
