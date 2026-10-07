import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";

export const Route = createFileRoute("/pomoc/doklady")({
  head: () => ({
    meta: [
      { title: "Pomoc — Doklady a skenovanie — Faktero" },
      {
        name: "description",
        content:
          "Doklady vo Faktere: odfotenie bločku, načítanie eKasa QR kódu z Finančnej správy, nahratie PDF, presun medzi prijaté faktúry a odovzdanie účtovníčke.",
      },
      { property: "og:url", content: "https://faktero.sk/pomoc/doklady" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/doklady" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "nespracovane",
    title: "Nespracované doklady — všetko najprv sem",
    body: (
      <>
        <p>
          Všetko, čo príde <strong>e-mailom</strong> alebo čo <strong>nahráte</strong>{" "}
          (tlačidlo Nahrať faktúru, appka, pretiahnutie súborov), čaká najprv v{" "}
          <Link to="/nespracovane">Doklady → Nespracované doklady</Link>. Faktero doklad prečíta
          a navrhne, čo to je. Kým je doklad tu, nevstupuje do DPH, pokladne ani do účtovníctva.
        </p>
        <ol>
          <li>Kliknite na doklad — vľavo uvidíte samotný doklad, vpravo vyťažené údaje.</li>
          <li>
            Vyberte <strong>druh dokladu</strong>: prijatá faktúra, zálohová faktúra, dobropis,
            bloček alebo iný doklad (zmluva, list, predpis).
          </li>
          <li>
            Skontrolujte údaje. Povinné polia, ktoré chýbajú, sú <strong>červené</strong> — pri
            faktúre číslo a splatnosť, pri bločku spôsob úhrady, pri dobropise opravovaná faktúra.
          </li>
          <li>
            Rovno <strong>zaúčtujte</strong>: predkontácia, členenie DPH a kontrolného výkazu,
            stredisko, činnosť, kategória.
          </li>
          <li>
            Kliknite na <strong>Vytvoriť</strong> — doklad sa presunie medzi prijaté faktúry,
            doklady alebo ostatné doklady (s vyplneným zaúčtovaním) a otvorí sa ďalší nespracovaný.
            <strong> Uložiť zmeny</strong> ho nechá rozpracovaný na neskôr.
          </li>
        </ol>
        <p>
          Bločky odfotené v appke alebo zadané vo formulári sú v tom istom zozname — otvoria sa vo
          formulári dokladu, kde ich spracujete tlačidlom Spracovať. Zmazaný nespracovaný doklad
          ide do koša a dá sa obnoviť.
        </p>
      </>
    ),
  },
  {
    id: "naco",
    title: "Čo sú Doklady a čím sa líšia od prijatých faktúr",
    body: (
      <>
        <p>
          <Link to="/doklady">Doklady</Link> sú drobné výdavky, ktoré nemajú faktúru — bločky z
          čerpačky, z obchodu, z parkoviska, účtenky z reštaurácie. Odfotíte ich hneď na mieste a
          účtovníčka ich má na konci mesiaca pokope.
        </p>
        <p>
          <Link to="/pomoc/prijate-faktury">Prijaté faktúry</Link> sú naproti tomu doklady so
          splatnosťou, ktoré niekomu dlžíte. Ak sa z bločku vykľuje faktúra, netreba ju prepisovať —
          pozri <a href="#presun">Presun medzi prijaté faktúry</a>.
        </p>
      </>
    ),
  },
  {
    id: "novy",
    title: "Tri spôsoby, ako doklad dostať dnu",
    body: (
      <>
        <p>
          V <Link to="/doklady/novy">Doklady → Nový doklad</Link> máte tri tlačidlá:
        </p>
        <ul>
          <li>
            <strong>Odfotiť</strong> — fotku prečíta AI a doplní dodávateľa, dátum, sumu, sadzby DPH
            aj jednotlivé položky.
          </li>
          <li>
            <strong>QR kód</strong> — naskenuje eKasa QR z bločku. To je najpresnejšia cesta, viac
            nižšie.
          </li>
          <li>
            <strong>Nahrať súbor</strong> — fotka alebo PDF z počítača. Súbor sa dá aj pretiahnuť
            myšou do vyznačenej plochy.
          </li>
        </ul>
        <p>
          Po načítaní sa formulár vyplní sám, ale <strong>zostáva na vás ho skontrolovať</strong>.
          Doplňte kategóriu (napríklad „pohonné hmoty“), spôsob platby — hotovosťou, kartou alebo
          prevodom — a prípadne poznámku.
        </p>
      </>
    ),
  },
  {
    id: "ekasa",
    title: "eKasa QR kód",
    body: (
      <>
        <p>
          QR kód na slovenskom bločku nenesie sumu ani položky — nesie{" "}
          <strong>identifikátor dokladu (UID)</strong>. Faktero si s ním vypýta celý doklad priamo z
          Finančnej správy, takže sa načíta presne to, čo predajca odoslal: dodávateľ, IČO, dátum,
          čas, položky aj rozpis DPH.
        </p>
        <p>Podľa toho, ako sa doklad podarilo získať, svieti nad formulárom štítok:</p>
        <ul>
          <li>
            <strong>✓ Načítané z Finančnej správy</strong> — údaje sú overené, netreba ich
            kontrolovať.
          </li>
          <li>
            <strong>Len z QR kódu</strong> — doklad sa vo Finančnej správe nenašiel (stáva sa pri
            čerstvých bločkoch alebo pri výpadku ich systému). Suma z QR kódu sedí, položky chýbajú.
          </li>
          <li>
            <strong>Odhadnuté z fotky</strong> — QR sa nedal prečítať a údaje odhadla AI.{" "}
            <strong>Tie si prejdite</strong>.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "hotovost",
    title: "Doklady a pokladňa",
    body: (
      <>
        <p>
          Ak dáte spôsob platby <strong>hotovosťou</strong>, doklad automaticky uberie z hotovosti v{" "}
          <Link to="/pokladna">pokladni</Link> — nemusíte k nemu robiť ešte aj výdavkový pokladničný
          doklad. Podrobne v <Link to="/pomoc/pokladna">manuáli k pokladni</Link>.
        </p>
        <p>Doklad platený kartou alebo prevodom stav pokladne nemení.</p>
      </>
    ),
  },
  {
    id: "presun",
    title: "Presun medzi prijaté faktúry",
    body: (
      <>
        <p>
          Keď sa ukáže, že nahratý doklad je v skutočnosti faktúra so splatnosťou, presuniete ho
          jedným tlačidlom na riadku v zozname dokladov. Prenesie sa aj s prílohou a{" "}
          <strong>z Dokladov zmizne</strong> — aby sa ten istý náklad nepočítal dvakrát.
        </p>
      </>
    ),
  },
  {
    id: "ostatne",
    title: "Ostatné doklady — listy, predpisy, exekúcie",
    body: (
      <>
        <p>
          Nie všetko, z čoho účtovník účtuje, je faktúra alebo bloček. Exekučný príkaz, predpis
          poistného, list z daňového úradu či zmluvu nahráte do{" "}
          <Link to="/ostatne-doklady">Doklady → Ostatné doklady</Link>. Vyberiete druh dokladu,
          odosielateľa, dátum doručenia a pripojíte PDF alebo fotky (aj viac strán). Suma a lehota
          sú nepovinné — lehota, ktorá sa blíži alebo už uplynula, sa v zozname zvýrazní.
        </p>
        <p>
          Údaje nemusíte prepisovať: po pridaní prílohy ju prečíta <strong>AI</strong> a doplní
          druh, odosielateľa, predmet, sumu, lehotu aj krátke zhrnutie pre účtovníka. V mobilnej
          appke je na skeneri voľba <strong>Iný doklad</strong> — nafotíte strany a doklad sa uloží
          sem. A keď takýto dokument príde na adresu pre{" "}
          <Link to="/doklady/mailom">doklady e-mailom</Link>, AI ho rozpozná a uloží medzi ostatné
          doklady namiesto prijatých faktúr.
        </p>
        <p>
          <strong>Exekúciu</strong> priradíte k zamestnancovi — AI ho navrhne sama, keď v dokumente
          nájde jeho celé meno — a na karte zamestnanca ju uvidíte v záložke{" "}
          <strong>Exekúcie</strong>. Doklad k leasingu či úveru priradíte k zmluve a nájdete ho v
          jej detaile v časti <strong>Doklady k zmluve</strong>. Na lehotu, ktorá príde do siedmich
          dní alebo už uplynula, upozorní zvonček, kým doklad neodovzdáte účtovníkovi.
        </p>
        <p>
          Aj tu platí <strong>Nespracované → Spracované → Odovzdané</strong>: účtovník doklad pozrie
          a klikne na <strong>Spracovať</strong>. Ostatné doklady sa do Pohody neposielajú, sú
          podkladom. V mesačnom balíku pre účtovníka sú v priečinku <strong>ostatne-doklady</strong>{" "}
          so súpisom v CSV.
        </p>
      </>
    ),
  },
  {
    id: "import",
    title: "Prechod z Doklado — import prijatých dokladov",
    body: (
      <>
        <p>
          V <Link to="/importy/doklady">Účtovníctvo → Import prijatých dokladov</Link> nahráte
          export z Doklado, Pohody alebo tabuľku. Najpresnejšie je nahrať naraz{" "}
          <strong>XML (Pohoda)</strong> a <strong>ZIP s PDF</strong>: údaje sa vezmú z XML a skeny
          sa priradia k dokladom podľa čísla, alebo podľa sumy, dátumu a dodávateľa. Ide aj{" "}
          <strong>CSV/XLSX</strong> a samotný ZIP so skenmi — ten prečíta AI.
        </p>
        <p>
          Prijaté faktúry pôjdu medzi prijaté faktúry, bločky do Dokladov a listy, predpisy či
          exekúcie do Ostatných dokladov. Pred spustením uvidíte, čo sa naimportuje, a zvolíte stav
          (napríklad „Odovzdané účtovníkovi“ pre doklady, ktoré sú už zaúčtované). Doklady, ktoré vo
          Fakteri už sú, sa preskočia, takže import sa dá pustiť aj opakovane. Hotovostné bločky sa
          do pokladne započítajú len vtedy, keď to zaškrtnete.
        </p>
      </>
    ),
  },
  {
    id: "prehlad",
    title: "Zoznam, filtre a odovzdanie účtovníčke",
    body: (
      <>
        <p>
          Každý nový doklad — z appky, z webu aj naskenovaný — padne najprv do záložky{" "}
          <strong>Nespracované</strong>. Tam ho vy alebo účtovník skontrolujete, prípadne doplníte a
          kliknete na <strong>Spracovať</strong> (viac naraz cez zaškrtnutie a{" "}
          <strong>Označiť ako spracované</strong>). Spracovať sa dá doklad so sumou a dátumom; ak
          niečo chýba, zoznam to napíše a ponúkne <strong>Doplniť</strong>.
        </p>
        <p>
          Ďalšie záložky sú <strong>Spracované</strong>, <strong>Odovzdané účtovníkovi</strong> a{" "}
          <strong>Všetky</strong>, filtrujú sa podľa mesiaca. Nespracované sa ukazujú zo všetkých
          mesiacov, aby žiadny neostal schovaný. Prepojenie s Pohodou si berie len spracované
          doklady. Pri každom doklade vidno dátum, dodávateľa, sumu a <strong>zdroj</strong> — teda
          či prišiel z eKasy, z fotky alebo bol nahratý ručne.
        </p>
        <p>
          Nad zoznamom je <strong>Hľadať</strong> (dodávateľ, IČO, číslo dokladu) a filter podľa{" "}
          <strong>spôsobu úhrady</strong> — hotovosť, karta, prevod. Tlačidlom{" "}
          <strong>Stĺpce</strong> si zvolíte, čo v tabuľke vidíte (napríklad kategóriu, základ, DPH
          či spôsob úhrady), a tlačidlom <strong>Uložiť filter</strong> si odložíte často používaný
          výber — záložku, mesiac, hľadaný text a úhradu. Uložené filtre potom vyberiete zo zoznamu{" "}
          <em>Uložené filtre</em>. Stĺpce aj filtre platia buď pre jednu firmu, alebo po zaškrtnutí{" "}
          <em>Pre všetky moje firmy</em> pre všetky naraz.
        </p>
        <p>
          Do balíka pre účtovníčku idú doklady spolu s faktúrami cez{" "}
          <Link to="/exporty">Účtovné exporty</Link>; ak účtujete v Pohode, prenesú sa aj tam —
          pozri <Link to="/pomoc/pohoda">Prepojenie s Pohodou</Link>.
        </p>
      </>
    ),
  },
  {
    id: "mailom",
    title: "Doklady e-mailom",
    body: (
      <>
        <p>
          Najrýchlejšia cesta, ako dostať faktúru od dodávateľa dnu: nechať ju tam prísť samu. Každá
          firma má vlastnú adresu, napríklad <code>vasafirma-k7f2p9@doklady.faktero.sk</code>, a čo
          na ňu prepošlete, to sa spracuje.
        </p>
        <p>
          Adresu nájdete v <Link to="/doklady/mailom">Doklady → Doklady e-mailom</Link>. Skopírujete
          ju a prepošlete na ňu mail od dodávateľa — nič sa nesťahuje a nikam sa neprihlasujete. Z
          PDF v prílohe sa prečíta dodávateľ, IČO, IČ DPH, IBAN, číslo faktúry, variabilný symbol,
          dátum vystavenia aj splatnosti, sumy a <strong>jednotlivé položky</strong> — tie sú na
          detaile dokladu len na prezretie, do skladu ani do účtovníctva nevstupujú.
        </p>
        <p>
          Na detaile dokladu je aj <strong>náhľad prílohy</strong>, takže na prezretie nemusíte nič
          sťahovať.
        </p>
        <p>
          Doklad potom čaká v <Link to="/nespracovane">Nespracovaných dokladoch</Link>.{" "}
          <strong>Nič sa nezaeviduje samo</strong> — určíte druh, skontrolujete, zaúčtujete a
          vytvoríte.
        </p>
        <p>Čo je dobré vedieť:</p>
        <ul>
          <li>
            Adresa je pre <strong>každú firmu iná</strong>. Ak máte firiem viac, prepnite sa hore v
            lište a vezmite si tú správnu — alebo použite <strong>rozdeľovač</strong> (nižšie).
          </li>
          <li>
            Berie sa <strong>PDF alebo fotka</strong> v prílohe. Mail bez prílohy sa v denníku
            označí ako „bez prílohy“ a nič sa nezaloží.
          </li>
          <li>
            Viac príloh v jednom maile znamená <strong>viac dokladov</strong> — každá sa spracuje
            zvlášť, najviac však <strong>15</strong> z jedného e-mailu.
          </li>
        </ul>
        <p>
          Adresa sa dá <strong>zmeniť na vlastnú</strong> — tlačidlom „Zvoliť vlastnú" si namiesto
          náhodného konca zadáte svoje slovo a číslo, napríklad{" "}
          <code>doklady-2026@doklady.faktero.sk</code>. Diakritiku, medzery a veľké písmená si
          Faktero opraví samo a hneď ukáže, ako bude adresa naozaj vyzerať.
        </p>
        <p>
          <strong>Pozor, adresa je zároveň heslo.</strong> Kto ju pozná, vie vám poslať doklad —
          preto sa predvolene generuje s náhodným koncom, ktorý sa nedá uhádnuť z názvu firmy.
          Krátku a logickú adresu si vie domyslieť aj cudzí človek. Ak vlastnú chcete, pridajte do
          nej niečo svoje, čo nie je na prvý pokus zrejmé.
        </p>
        <p>
          Na tej istej stránke je aj <strong>denník posledných mailov</strong> — pri každom vidno,
          ako dopadol. Keď doklad nedorazil, začnite tam. A keby sa adresa dostala tam, kam nemá, dá
          sa vypnúť alebo vymeniť za novú; stará vtedy prestane prijímať. Pri každom maile je aj{" "}
          <strong>zobraziť e-mail</strong> — text pôvodného mailu, napríklad keď dodávateľ do neho
          napísal niečo k platbe.
        </p>
        <p>
          <strong>Povolení odosielatelia.</strong> Na tej istej stránke môžete zapísať adresy alebo
          domény (napr. <code>@dodavatel.sk</code>), od ktorých sa doklady prijímajú — jednu na
          riadok. Mail od niekoho iného sa nezaloží a v denníku bude ako „Odmietnuté — nepovolený
          odosielateľ“. Prázdny zoznam znamená, že doklad prijme od kohokoľvek, kto adresu pozná.
        </p>
        <p>
          <strong>Kontrola odberateľa.</strong> Keď je na doklade iný odberateľ (iné IČO alebo IČ
          DPH) než vaša firma, doklad sa založí, ale s upozornením v poznámke aj v denníku mailov —
          aby sa vám medzi náklady nedostala cudzia faktúra.
        </p>
        <p>
          <strong>Rozdeľovač — jedna adresa pre všetky firmy.</strong> Kto vedie viac firiem (alebo
          účtovníčka s klientmi), nemusí si pamätať adresu každej. V karte <em>Rozdeľovač</em> na
          tej istej stránke je vaša osobná adresa v tvare{" "}
          <code>rozdelovac-…@doklady.faktero.sk</code>. Faktero z každej prílohy prečíta IČO alebo
          IČ DPH odberateľa a doklad založí v tej z vašich firiem, na ktorú je vystavený — jeden mail
          tak môže rozdeliť faktúry aj medzi viac firiem. Doklad, ktorý nesedí na žiadnu vašu firmu
          (alebo sedí na dve s rovnakým IČO), sa naslepo nezaloží: počká v zozname{" "}
          <em>Nepriradené doklady</em>, kde vyberiete firmu a kliknete na <strong>Priradiť</strong>,
          prípadne <strong>Zahodiť</strong>. Rozdeľovač sa dá vypnúť a adresa vymeniť za novú.
          Potvrdenie preposielania z Gmailu treba nastaviť na adresu konkrétnej firmy, nie na
          rozdeľovač.
        </p>
      </>
    ),
  },
  {
    id: "gmail",
    title: "Automatické preposielanie z Gmailu",
    body: (
      <>
        <p>
          Prepošlite si doklady <strong>raz a navždy</strong>: Gmail vie posielať kópiu pošty na inú
          adresu sám. Nastavíte to v Gmaile v{" "}
          <strong>Nastavenia → Preposielanie a POP/IMAP → Pridať adresu na preposielanie</strong>,
          kam vložíte svoju adresu z <Link to="/doklady/mailom">Doklady → Doklady e-mailom</Link>.
        </p>
        <p>
          Google si to musí overiť, a preto pošle <strong>potvrdzovací mail</strong> — lenže pošle
          ho na tú novú adresu, teda k nám. Preto ho <strong>Faktero zachytí a ukáže vám ho</strong>
          : na stránke Doklady e-mailom sa objaví žltý pruh „Google žiada potvrdenie preposielania“.
          Objaví sa sám, netreba obnovovať stránku.
        </p>
        <p>V pruhu je to, čo od vás Google chce:</p>
        <ul>
          <li>
            tlačidlo <strong>Potvrdiť preposielanie</strong> — odkaz od Googlu. Funguje len v
            prehliadači, kde ste prihlásený do <strong>tej istej</strong> schránky;
          </li>
          <li>
            <strong>kód</strong>, keď ho Google poslal — dá sa skopírovať a vložiť priamo v Gmaile
            vedľa tlačidla „Overiť“. Google ho ale posiela len niekedy, väčšinou príde iba odkaz;
          </li>
          <li>
            tlačidlo <strong>Už som potvrdil</strong>, ktorým pruh odpracete — Google nám o
            potvrdení nedá vedieť, takže sám nezmizne.
          </li>
        </ul>
        <p>
          Potom sa vráťte do Gmailu, zapnite{" "}
          <strong>„Preposielať kópiu doručenej pošty na…“</strong> a uložte. Samotné overenie
          preposielanie ešte nezapne.
        </p>
        <p>
          <strong>Odporúčame nepreposielať všetko.</strong> V Gmaile si radšej spravte filter (
          <em>Vyhľadávanie → Vytvoriť filter → Preposlať na</em>) napríklad na maily s prílohou
          alebo na konkrétnych dodávateľov. Inak sa Faktero pokúsi spraviť doklad z každého mailu,
          čo vám príde, a denník sa zaplní hláškami „bez prílohy“.
        </p>
        <p>
          Potvrdenie platí <strong>sedem dní</strong>. Keď ho prešvihnete, jednoducho pridajte
          adresu v Gmaile znova — príde nové.
        </p>
        <p>
          <strong>Prečo je to bezpečné.</strong> Potvrdzovací mail prijmeme len od skutočnej adresy
          Googlu a len vtedy, keď sedí jeho elektronický podpis (SPF a DKIM domény{" "}
          <code>google.com</code>). Podvrhnutý mail „od Googlu“ s cudzím odkazom zahodíme. Z mailu
          si navyše necháme iba kód, odkaz a adresu schránky, z ktorej sa preposiela —{" "}
          <strong>obsah mailu sa nikam neukladá</strong>.
        </p>
      </>
    ),
  },
  {
    id: "mobil",
    title: "V telefóne",
    body: (
      <>
        <p>
          Skenovanie je hlavný dôvod, prečo mať Faktero v telefóne — bloček odfotíte hneď pri
          pokladni a nemusíte ho nosiť domov. Funguje to <strong>aj bez signálu</strong>: doklad sa
          uloží do telefónu a odošle sa, keď sa pripojíte.
        </p>
        <p>
          Faktúru z PDF viete rovnakým spôsobom načítať aj v{" "}
          <Link to="/faktury/skener">Skeneri dokladov</Link> na webe.
        </p>
      </>
    ),
  },
  {
    id: "odpocet-dph",
    title: "Odpočet DPH z bločkov",
    body: (
      <>
        <p>
          Bloček je zjednodušená faktúra — do kontrolného výkazu ide do časti <strong>B.3</strong>,
          nie medzi bežné prijaté faktúry. Do 3 000 € odpočítanej dane za obdobie sa vykazuje
          sumárne, nad túto hranicu sa rozpisuje po dodávateľoch (vtedy je potrebné IČ DPH
          dodávateľa).
        </p>
        <p>
          Keď si z dokladu daň neodpočítavate, prepnite na ňom <strong>Odpočítanie dane</strong> —
          do výkazu potom nevstúpi.
        </p>
      </>
    ),
  },
  {
    id: "schvalovanie",
    title: "Schvaľovanie dokladov",
    body: (
      <>
        <p>
          V <Link to="/nastavenia/schvalovanie">Nastavenia → Schvaľovanie dokladov</Link> zapnete,
          ktoré doklady sa schvaľujú (bločky, prijaté, vystavené faktúry), sumu, pod ktorou sa schvália
          samy, a či sa vystavená faktúra smie odoslať až po schválení. Platí to pre doklady pridané
          od zapnutia.
        </p>
        <p>
          <strong>Schvaľovacia cesta</strong> má úrovne od najnižšej po najvyššiu, v každej jedného
          alebo viac schvaľovateľov. Schválenie vyššou úrovňou platí aj za nižšie. Pravidlá cesty
          (dodávateľ podľa IČO, suma od, predkontácia, druh dokladu) určia, ktorá cesta sa použije;
          inak predvolená. Bez ciest stačí jedno schválenie majiteľom, správcom alebo účtovníkom.
        </p>
        <p>
          Do úrovne cesty sa dá namiesto konkrétneho človeka vybrať <strong>manažér zákazky
          dokladu</strong> (projektový manažér). Doklad zaradený na zákazku potom schvaľuje jej
          manažér — ten sa nastavuje na detaile <Link to="/zakazky">zákazky</Link>. Keď doklad na
          zákazke nie je alebo zákazka manažéra nemá, táto úroveň sa preskočí.
        </p>
        <p>
          Doklady čakajúce na vás sú v <Link to="/schvalovanie">Doklady → Na schválenie</Link> aj
          v zvončeku; schváliť, vrátiť na opravu či zamietnuť ich viete hromadne aj na detaile
          dokladu. Do Pohody, do mesačného balíka a do príkazu na úhradu idú len schválené. Vrátený
          doklad sa po oprave vráti na schválenie odznova.
        </p>
      </>
    ),
  },
  {
    id: "kos",
    title: "Kôš, komentáre a poznámky",
    body: (
      <>
        <p>
          Zmazaný doklad ide do <strong>koša</strong> (tlačidlo Kôš v Dokladoch). Do 90 dní sa dá
          obnoviť aj s párovaním na pohyb v banke, potom sa kôš vysype sám aj so skenom.
        </p>
        <p>
          Na detaile dokladu sú <strong>komentáre</strong> — otázka účtovníčke, vysvetlenie
          výdavku. Označený kolega dostane upozornenie do zvončeka.
        </p>
        <p>
          Pri poznámke si viete opakované texty uložiť ako <strong>preddefinované</strong> a potom
          ich len vyberať.
        </p>
        <p>
          <strong>Prílohy a presun.</strong> K dokladu sa dá priložiť ďalší súbor (dodací list,
          druhá strana). Keď sa druhá strana či dodací list nahrali ako samostatný doklad,
          tlačidlom <strong>Presunúť ako prílohu</strong> ho pripojíte k správnemu dokladu,
          prijatej či vystavenej faktúre — pôvodný záznam ide do koša.
        </p>
        <p>
          <strong>Pravidlo účtovania</strong> doplní kódy samo; doklad, ktorý ich má z pravidla,
          má pri zaúčtovaní hviezdičku. Keď má dodávateľ pravidiel viac, vyberiete iné cez{" "}
          <em>Použiť pravidlo</em>. Zoznam sa dá zoradiť kliknutím na hlavičku stĺpca a stiahnuť
          do Excelu.
        </p>
        <p>
          Odovzdaný doklad je <strong>zamknutý</strong> — jeho sumy, dátumy ani zaúčtovanie sa nedajú
          zmeniť, kým ho nevrátite z Pohody.
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <HelpArticle
      category="Pomoc · Doklady"
      title="Doklady a skenovanie"
      intro={
        <p>
          Bločky a drobné výdavky — odfotené, načítané z eKasa QR kódu alebo nahraté ako PDF, vždy
          pripravené pre účtovníčku.
        </p>
      }
      sections={sections}
    />
  );
}
