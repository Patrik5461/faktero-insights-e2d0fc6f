import { createFileRoute, Link } from "@tanstack/react-router";
import { preloz } from "@/lib/i18n/jazyk";
import type { HelpSection } from "@/components/faktero/HelpArticle";
import { PrelozenyManual } from "@/lib/i18n/prelozStrom";

export const Route = createFileRoute("/pomoc/banka")({
  head: ({ match }) => ({
    meta: [
      { title: preloz(match.context.jazyk, "Pomoc — Bankové účty — Faktero") },
      {
        name: "description",
        content: preloz(
          match.context.jazyk,
          "Pripojenie banky, sťahovanie transakcií, párovanie úhrad s faktúrami a bankové výpisy vo Faktere.",
        ),
      },
      { property: "og:url", content: "https://www.faktero.sk/pomoc/banka" },
    ],
    links: [{ rel: "canonical", href: "https://www.faktero.sk/pomoc/banka" }],
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
          <strong>Ktoré banky.</strong> Priamo Tatra banka, ďalej Wise, Wallester a Revolut
          Business. Ak máte účet v inej banke a v internetbankingu Tatra banky ho máte pripojený cez{" "}
          <strong>multibanking</strong> (Slovenská sporiteľňa, VÚB, ČSOB a ďalšie), natiahne sa
          spolu s ostatnými — zostatky aj pohyby. Oficiálne výpisy na stiahnutie ale banka vydá len
          pre účty vedené v Tatra banke.
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
    id: "fio",
    title: "Fio banka",
    body: (
      <>
        <p>
          Fio sa pripája <strong>tokenom</strong> z internetbankingu:{" "}
          <em>Nastavení → API → Přidat nový token</em>, vyberte účet a oprávnenie{" "}
          <em>Pouze sledovat účet</em>. Token vložte v Bankové účty → Pripojiť banku.
        </p>
        <p>
          Jeden token patrí jednému účtu — ak máte korunový aj eurový účet, pridajte dva tokeny. Pri
          pripojení sa hneď stiahnu pohyby za posledných 90 dní (staršie Fio bez ďalšej autorizácie
          nevydá), potom sa sťahujú každú noc.
        </p>
        <p>
          Fio pustí na jeden token len jedno stiahnutie za 30 sekúnd; keď tlačidlo stlačíte dvakrát
          rýchlo po sebe, Faktero povie, nech chvíľu počkáte.
        </p>
      </>
    ),
  },
  {
    id: "notifikacie",
    title: "Iná banka: párovanie cez e-mailové notifikácie",
    body: (
      <>
        <p>
          Banku, ktorú Faktero nevie pripojiť priamo (VÚB, Slovenská sporiteľňa, ČSOB, Prima banka,
          Česká spořitelna, Komerční banka, Air Bank a ďalšie), spárujete cez{" "}
          <strong>e-maily, ktoré banka posiela o každej platbe</strong>. V{" "}
          <Link to="/bankove-ucty/notifikacie">Bankové účty → E-mailové notifikácie</Link> vyberte
          banku a účet (alebo zadajte IBAN) a Faktero vytvorí tajnú adresu v tvare{" "}
          <em>banka-…@doklady.faktero.sk</em>.
        </p>
        <p>
          Adresu skopírujte do internetbankingu do nastavenia notifikácií (avíz, upozornení) o
          pohyboch na účte a zapnite prijaté aj odoslané platby. Pri bankách, kde to vieme, je na
          stránke návod krok za krokom.
        </p>
        <p>
          <strong>Banka dovolí len jednu adresu?</strong> Nechajte notifikácie chodiť vám a v Gmaile
          si nastavte automatické preposielanie na adresu z Faktera. Gmail najprv pošle overovací
          kód — Faktero ho zachytí a ukáže pri účte, odkiaľ ho potvrdíte.
        </p>
        <p>
          <strong>Čo sa s e-mailom stane.</strong> Faktero z neho prečíta sumu, smer, dátum,
          symboly, protistranu a správu a založí pohyb označený „z e-mailu“. Faktúra sa označí ako
          zaplatená automaticky len vtedy, keď sedí variabilný symbol aj suma; inak uvidíte návrh v
          párovaní.
        </p>
        <p>
          <strong>Na kontrolu.</strong> Pohyb sa sám založí len z e-mailu, ktorý banka elektronicky
          podpísala. Ručne preposlaný e-mail, e-mail z neznámej adresy alebo taký, ktorému Faktero
          celkom nerozumie, čaká v zozname na kontrolu — údaje skontrolujete, prípadne opravíte, a
          pohyb založíte jedným klikom, alebo e-mail zahodíte. Ten istý e-mail ani ten istý pohyb sa
          dvakrát nezaloží.
        </p>
        <p>
          Adresu nikomu nedávajte. Ak unikne, vytvorte pri účte novú — stará prestane fungovať hneď.
          Keď na ten istý účet nahráte aj výpis, pohyby, ktoré už prišli z e-mailov, sa preskočia a
          nezdvoja sa.
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
    id: "kedy",
    title: "Kedy sa pohyby objavia",
    body: (
      <>
        <p>
          Raz denne predpoludním si Faktero samo stiahne pohyby zo všetkých pripojených účtov. To je
          spodná hranica — nič viac netreba nastavovať.
        </p>
        <p>
          Pri <strong>Tatra banke</strong> to býva rýchlejšie: banka dá vedieť, že sa na účte niečo
          stalo, a Faktero si po pohyby siahne <strong>v priebehu pár sekúnd</strong>. Platba
          prijatá doobeda tak nečaká na ďalšie ráno.
        </p>
        <p>
          Sťahovanie sa nespúšťa ručne a je to zámer — nie je čo zrýchliť. Banky vydávajú pohyby s
          vlastným oneskorením: čo ešte nezaúčtovali, nepošlú ani na požiadanie. Tlačidlo{" "}
          <strong>Načítať účty</strong> v <Link to="/bankove-ucty">Bankových účtoch</Link> obnoví
          zoznam účtov a zostatky, nie zoznam pohybov.
        </p>
        <p>
          <strong>Keď pohyby neprichádzajú:</strong> banka pri vypršanom súhlase (napríklad
          Slovenská sporiteľňa cez Tatra banku po 90 dňoch) vydá zostatok, ale pohyby nie. Faktero
          to po 48 hodinách ukáže pri účte aj vo zvončeku („Súhlas banky na čítanie pohybov
          vypršal“). Kliknite pri účte na <strong>Obnoviť súhlas</strong> a potvrďte ho v banke —
          sťahovanie sa potom rozbehne samo, aj spätne za vynechané dni.
        </p>
        <p>
          <strong>Nastavenia banky</strong> v <Link to="/bankove-ucty">Bankových účtoch</Link>:{" "}
          <em>Synchronizovať banku od</em> — staršie pohyby sa pri sťahovaní neuložia;{" "}
          <em>Najskorší dátum automatického párovania</em> — staršie pohyby sa s faktúrami samy
          nespárujú a ostanú na ručné potvrdenie; <em>Ignorovať typ platby</em> pri párovaní pohybov
          s bločkami (vypnuté = bloček platený kartou sa páruje len s platbou kartou) a predvolený{" "}
          <em>text pre príjemcu</em> v hromadnom príkaze na úhradu — číslo faktúry, VS alebo účtovná
          poznámka. Prázdne voľby fungujú ako doteraz.
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
          Párovanie sa spúšťa tlačidlom <strong>Spárovať platby</strong> v prehľade faktúr (alebo{" "}
          <strong>Spárovať s faktúrami</strong> nad transakciami). Nerobí sa samo od seba — úhrada
          mení stav faktúry, a to nemá prebehnúť bez toho, aby o tom niekto vedel.
        </p>
        <p>Faktero rozdeľuje nájdené dvojice na dve kôpky:</p>
        <ul>
          <li>
            <strong>Isté</strong> — sedí variabilný symbol aj suma do haliera a žiadna iná faktúra
            neprichádza do úvahy. Tie sa dajú zapísať naraz tlačidlom „Spárovať isté“.
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
          <strong>Pohyb bez dokladu.</strong> Kliknutím na stav v stĺpci Párovanie sa otvorí detail
          pohybu. Poplatok banky, mzdu či odvod poisťovni označíte tlačidlom{" "}
          <strong>Pohyb nemá doklad</strong> (aj s poznámkou) — medzi nespárovanými sa potom
          neukazuje. Pri spárovanom pohybe detail ukáže všetky doklady so súčtom „Spolu X z Y“ a
          dajú sa odpárovať aj naraz.
        </p>
        <p>
          <strong>Transakčná daň.</strong> Pohyby, ktoré banka sama nazve transakčnou daňou (zákon
          235/2024 Z. z.), Faktero označí samo, ostatné tlačidlom{" "}
          <strong>Označiť ako transakčná daň</strong>. Vo výpise do Pohody dostanú predkontáciu,
          ktorú nastavíte v <Link to="/uctovnictvo/predkontacie">predkontáciách</Link> pri označení
          „Transakčná daň“.
        </p>
        <p>
          <strong>Pravidlá pre opakované pohyby.</strong> V detaile pohybu kliknite na{" "}
          <strong>Vytvoriť pravidlo z tohto pohybu</strong> — predvyplní IBAN protistrany, smer a
          variabilný symbol s výsledkom „Spárované bez dokladu“. Pravidlo zaberie pri každom novom
          pohybe z banky aj z nahratého výpisu a po uložení vybaví aj staršie nespárované pohyby.
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
          Pri podporovaných bankách sa dá platba odoslať priamo z Faktera. Vyžaduje si to samostatný
          súhlas — súhlas na čítanie účtu na platby nestačí.
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <PrelozenyManual
      category="Pomoc · Účtovníctvo"
      title="Bankové účty a párovanie úhrad"
      intro={<p>Pripojenie banky, sťahovanie pohybov, automatické párovanie faktúr a výpisy.</p>}
      sections={sections}
    />
  );
}
