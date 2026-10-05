import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";

export const Route = createFileRoute("/pomoc/prijate-faktury")({
  head: () => ({
    meta: [
      { title: "Pomoc — Prijaté faktúry — Faktero" },
      {
        name: "description",
        content:
          "Prijaté faktúry vo Faktere: zápis ručne aj e-mailom, položky a náhľad dokladu, hromadné akcie, splatnosť, úhrady, platba z banky, DPH na vstupe a samofakturácia.",
      },
      { property: "og:url", content: "https://faktero.sk/pomoc/prijate-faktury" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/prijate-faktury" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "naco",
    title: "Načo evidovať prijaté faktúry",
    body: (
      <>
        <p>Prijatá faktúra je to, čo dlžíte vy. Bez jej evidencie vám chýbajú tri veci:</p>
        <ul>
          <li>prehľad o tom, čo je splatné a kedy,</li>
          <li>
            <strong>DPH na vstupe</strong> — daň, ktorú si môžete odpočítať,
          </li>
          <li>
            náklady <Link to="/pomoc/zakazky">zákaziek</Link> — subdodávky, materiál od dodávateľa.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "zapis",
    title: "Zápis faktúry",
    body: (
      <>
        <p>
          V <Link to="/prijate-faktury/nova">Prijaté faktúry → Nová</Link> zadajte dodávateľa, číslo
          faktúry, dátum vystavenia, dodania a splatnosti, sumu bez DPH a sumu celkom.
        </p>
        <p>
          <strong>Dátum dodania</strong> rozhoduje o tom, do ktorého obdobia DPH faktúra patrí —
          vypĺňajte ho vždy, keď sa líši od dátumu vystavenia.
        </p>
        <p>
          Faktúru priraďte na <strong>zákazku</strong>, ak patrí ku konkrétnej práci. Ide to aj
          dodatočne, keď je obdobie už uzamknuté.
        </p>
      </>
    ),
  },
  {
    id: "odkial",
    title: "Štyri cesty, ako sa faktúra dostane dnu",
    body: (
      <>
        <p>Ručný zápis je len jedna z nich a väčšinou tá najpomalšia.</p>
        <ol>
          <li>
            <strong>E-mailom</strong> — faktúru od dodávateľa prepošlete na svoju adresu a zaeviduje
            sa sama. Najrýchlejšia cesta, popísaná v{" "}
            <Link to="/pomoc/doklady">manuáli k dokladom</Link>.
          </li>
          <li>
            <strong>Zo Skenera</strong> — PDF alebo fotku nahráte v{" "}
            <Link to="/faktury/skener">Skeneri dokladov</Link>.
          </li>
          <li>
            <strong>Presunom z Dokladov</strong> — keď sa z bločku vykľuje faktúra so splatnosťou,
            presuniete ju jedným tlačidlom a z Dokladov zmizne, aby sa náklad nepočítal dvakrát.
          </li>
          <li>
            <strong>Ručne</strong> — ako vyššie.
          </li>
        </ol>
        <p>
          V zozname je pri každej faktúre stĺpec <strong>Zapísal</strong>, takže vidíte, odkiaľ
          prišla: „E-mailom“, „Z dokladov“, alebo meno kolegu, ktorý ju vyplnil.
        </p>
      </>
    ),
  },
  {
    id: "detail",
    title: "Čo je na detaile faktúry",
    body: (
      <>
        <p>
          Okrem dodávateľa, dátumov a súm sú tam ešte dve veci, kvôli ktorým nemusíte otvárať
          prílohu:
        </p>
        <ul>
          <li>
            <strong>Položky z dokladu</strong> — riadky tabuľky, ktoré sa prečítali z prílohy. Sú
            len na prezretie: <strong>do skladu ani do účtovníctva nevstupujú</strong> a rozhodujú
            sumy v hlavičke. Faktúry zapísané pred zavedením tejto funkcie ich nemajú.
          </li>
          <li>
            <strong>Náhľad dokladu</strong> — PDF aj fotka sa zobrazia priamo na stránke, nič
            netreba sťahovať. Ak by ho prehliadač nezvládol (občas na mobile), je tam odkaz na
            otvorenie.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "hromadne",
    title: "Práca s viacerými naraz",
    body: (
      <>
        <p>
          Zaškrtnite riadky v zozname (alebo políčko v hlavičke pre všetky) a hore sa objaví lišta s
          akciami:
        </p>
        <ul>
          <li>
            <strong>Stiahnuť ZIP</strong> — PDF všetkých vybraných faktúr a k tomu súpiska v CSV. To
            je celý balík pre účtovníčku.
          </li>
          <li>
            <strong>Hromadný príkaz na úhradu</strong> — súbor SEPA XML, ktorý nahráte do
            internetbankingu (býva to „Import príkazov" alebo „Hromadný príkaz") a zaplatíte všetky
            vybrané faktúry naraz. Vyberiete účet, z ktorého sa platí, a dátum; faktúry môžu ísť aj
            každá až v deň splatnosti. Variabilný, špecifický a konštantný symbol sa prenesú tak,
            ako ich dodávateľ uvidí vo výpise. Faktúry bez IBAN-u, v inej mene než euro, už
            zaplatené alebo platené hotovosťou či kartou sa do príkazu nedostanú — okno povie ktoré
            a prečo. Za zaplatené sa faktúry neoznačia hneď — až keď platbu z účtu spárujete s
            faktúrou (Faktero to samo navrhne).
          </li>
          <li>
            <strong>Označiť ako prijaté</strong> — hodí sa po prezretí dávky, ktorá prišla mailom.
            Stornované a už prijaté faktúry sa preskočia.
          </li>
          <li>
            <strong>Vymazať</strong> — pýta sa na potvrdenie a povie, koľkých faktúr sa to týka.
            Doklady idú do koša, nemažú sa natvrdo.
          </li>
        </ul>
        <p>
          Zoznam sa dá filtrovať podľa stavu, mesiaca a dodávateľa, a hľadať sa dá aj podľa{" "}
          <strong>variabilného symbolu</strong>, ktorý je vo vlastnom stĺpci.
        </p>
      </>
    ),
  },
  {
    id: "uhrady",
    title: "Splatnosť a úhrady",
    body: (
      <>
        <p>
          Zoznam ukazuje, čo je splatné a čo po splatnosti. Po zaplatení faktúru označte za
          uhradenú.
        </p>
        <p>
          Ak máte pripojený <Link to="/pomoc/banka">bankový účet</Link>, úhrady sa dajú párovať s
          bankovými transakciami a nemusíte ich zapisovať ručne.
        </p>
        <p>
          Pri banke, ktorá to podporuje, sa dá faktúra rovno <strong>zaplatiť</strong> — tlačidlo
          „Zaplatiť cez banku“ na detaile pripraví príkaz a presmeruje vás do banky na podpis.{" "}
          <strong>Z účtu sa nič nestrhne, kým platbu nepodpíšete.</strong> Potrebná je k tomu
          faktúra s IBAN dodávateľa a samostatný súhlas na platby — súhlas na čítanie účtu nestačí.
        </p>
      </>
    ),
  },
  {
    id: "doklady",
    title: "Rozdiel oproti dokladom",
    body: (
      <>
        <p>
          <strong>Prijatá faktúra</strong> je záväzok s dátumom splatnosti — zaplatíte ju neskôr,
          zvyčajne prevodom.
        </p>
        <p>
          <strong>Doklad</strong> (bloček) je už zaplatený výdavok. Patrí medzi{" "}
          <Link to="/pomoc/doklady">Doklady</Link>, nie sem.
        </p>
        <p>
          Keď sa pomýlite, nič sa nedeje: doklad sa dá jedným tlačidlom presunúť sem a z Dokladov
          zmizne, aby ten istý náklad nefiguroval dvakrát.
        </p>
      </>
    ),
  },
  {
    id: "prijate-zalohy",
    title: "Prijaté zálohové faktúry",
    body: (
      <>
        <p>
          Keď vám dodávateľ pošle <strong>zálohovú faktúru</strong>, zaevidujete ju rovnako ako
          bežnú — pri <em>Druhu dokladu</em> vyberiete <em>Prijatá zálohová faktúra</em>. Má vlastný
          zoznam <strong>Fakturácia → Prijaté zálohové faktúry</strong>, aby sa nemiešala s daňovými
          dokladmi.
        </p>
        <p>
          Zálohová faktúra <strong>nie je daňový doklad</strong>: zaplatíte ju, ale daň si z nej
          neodpočítavate — tú prinesie až ostrá faktúra alebo doklad k prijatej platbe. Preto do
          výkazov k DPH ani do nákladov zákazky nevstupuje.
        </p>
        <p>
          Faktúru nemusíte prepisovať: na oboch zoznamoch je tlačidlo <strong>Nahrať</strong> —
          vyberiete PDF alebo fotku a doklad prečíta tá istá AI ako pri doklade z pošty. Zálohovú
          faktúru spozná sama (podľa nadpisu, čísla aj názvu súboru) a zaradí ju medzi prijaté
          zálohy. To isté platí pre <strong>skener v appke</strong>: naskenovaná zálohová faktúra
          neskončí medzi bločkami, ale rovno tu.
        </p>
        <p>
          Keď príde ostrá faktúra, pri jej zápise vyberiete v poli{" "}
          <strong>Zúčtováva prijatú zálohu</strong> tú zálohu, ktorú vyrovnáva. Ponúknu sa len
          nezúčtované zálohy toho istého dodávateľa. Záloha sa potom v zozname označí ako{" "}
          <em>Zúčtovaná</em> a v záväzkoch na prehľade sa už nepočíta druhýkrát.
        </p>
      </>
    ),
  },
  {
    id: "udaje-pre-dph",
    title: "Údaje pre výkazy k DPH",
    body: (
      <>
        <p>Na prijatej faktúre sú štyri polia, ktoré rozhodujú, ako sa dostane do výkazov:</p>
        <ul>
          <li>
            <strong>Režim DPH</strong> — tuzemská faktúra od platiteľa ide do časti B.2 kontrolného
            výkazu, samozdanenie podľa § 69 do B.1, nadobudnutie tovaru z EÚ do riadkov 05 až 08
            priznania. Keď pole necháte prázdne, režim sa odhadne podľa IČ DPH dodávateľa.
          </li>
          <li>
            <strong>Dátum dodania</strong> — rozhoduje o období; keď chýba, použije sa dátum
            vystavenia.
          </li>
          <li>
            <strong>Odpočítanie dane</strong> — keď si daň neodpočítavate, faktúra do časti B.2
            nepatrí.
          </li>
          <li>
            <strong>Opravuje faktúru číslo</strong> — dobropis bez čísla pôvodnej faktúry sa do
            časti C.2 zapísať nedá.
          </li>
        </ul>
        <p>
          Faktúra v cudzej mene sa po uložení prepočíta kurzom ECB — do priznania totiž vstupuje v
          eurách. Zostavenie výkazov popisuje{" "}
          <Link to="/pomoc/vykazy-dph">manuál k výkazom k DPH</Link>.
        </p>
      </>
    ),
  },
  {
    id: "samofakturacia",
    title: "Samofakturácia — faktúru za dodávateľa vyhotovíte vy",
    body: (
      <>
        <p>
          Niekedy faktúru nepíše dodávateľ, ale odberateľ: výkupca dreva či kovov od drobných
          dodávateľov, firma, ktorá vypláca provízie obchodným zástupcom, vydavateľ autorom. Zákon o
          DPH to dovoľuje (§ 72 ods. 4), ak sú splnené tri veci:
        </p>
        <ul>
          <li>
            s dodávateľom máte <strong>písomnú dohodu uzavretú vopred</strong>,
          </li>
          <li>
            dodávateľ <strong>každú faktúru odsúhlasí</strong>,
          </li>
          <li>
            na faktúre je veta <strong>„Vyhotovenie faktúry odberateľom“</strong>.
          </li>
        </ul>
        <p>
          <strong>1. Dohoda.</strong> V <Link to="/odberatelia">adresári</Link> otvorte kontakt
          dodávateľa a kliknite na <em>Dohoda o samofakturácii</em>. Zapíšte, od kedy platí (a
          prípadne do kedy) a číslo či dátum zmluvy. Bez platnej dohody samofaktúru vyhotoviť nedá.
        </p>
        <p>
          <strong>2. Vyhotovenie.</strong> V{" "}
          <Link to="/prijate-faktury">Prijaté faktúry → Samofaktúra</Link> (to isté tlačidlo je aj
          vo <Link to="/faktury">Faktúrach</Link> a v ponuke „Vytvoriť“) vyberte dodávateľa a
          zadajte položky. Faktúra je <em>jeho</em>: v hlavičke je on ako dodávateľ, vy ako
          odberateľ, sadzby DPH sú podľa jeho krajiny a keď nemá IČ DPH, faktúra je bez dane. Číslo
          dostane z vášho radu <strong>Samofaktúry</strong> (SF2026…), ktorý si upravíte v{" "}
          <Link to="/ciselne-rady">číselných radoch</Link>. IBAN si Faktero pamätá z poslednej
          samofaktúry tomu istému dodávateľovi.
        </p>
        <p>
          Samofaktúra vie všetko, čo bežná faktúra: text nad položkami, popis a zľavu na položke,
          konštantný a špecifický symbol, jazyk faktúry (aj pre zahraničného dodávateľa — veta o
          vyhotovení odberateľom sa preloží), cudziu menu s prepočtom dane kurzom ECB a osobitnú
          úpravu podľa § 65 a § 66. Pri <strong>prenesení daňovej povinnosti</strong> (kovový šrot
          a odpad, stavebné práce podľa § 69 ods. 12, alebo dodávateľ z iného štátu EÚ) daň na
          faktúre nebude — samozdaníte ju vy a dodávateľovi platíte len základ.
        </p>
        <p>
          <strong>3. Odsúhlasenie.</strong> Na detaile faktúry kliknite na{" "}
          <em>Poslať na odsúhlasenie</em>. Dodávateľ dostane e-mail s PDF a odkazom — bez
          registrácie klikne <em>Súhlasím</em>, alebo faktúru vráti s poznámkou, čo nesedí. Vy
          dostanete správu, ako rozhodol. Vrátenú faktúru opravíte a pošlete znova; úprava po
          odoslaní zruší starý odkaz, aby dodávateľ neodsúhlasil inú verziu.
        </p>
        <p>
          Keď dodávateľ odsúhlasí inak — podpíše papierovú faktúru, potvrdí e-mailom, alebo dohoda
          hovorí, že mlčanie v lehote je súhlas — použite <em>Odsúhlasil inak</em> a zapíšte ako.
        </p>
        <p>
          <strong>Čo sa deje potom.</strong> Odsúhlasená samofaktúra je obyčajná prijatá faktúra:
          vstupuje do DPH na vstupe a kontrolného výkazu (časť B.2, pri viacerých sadzbách
          rozpísaná po sadzbách), dá sa uhradiť z banky aj hromadným príkazom a PDF v odsúhlasenej
          podobe sa uloží ako príloha. Meniť sa už nedá — chyba sa opravuje dobropisom: na detaile
          kliknite na <em>Vystaviť dobropis</em>, položky sa predvyplnia so záporným množstvom a na
          dobropise bude číslo opravovanej faktúry. Aj dobropis musí dodávateľ odsúhlasiť. Kým nie je
          odsúhlasená, do výkazov ani do príkazu na úhradu nevstúpi a výkaz na ňu upozorní.
        </p>
        <p>
          Dodávateľ si faktúru zaeviduje medzi svoje <em>vydané</em> faktúry pod číslom, ktoré
          dostala u vás, a daň z nej odvádza on.
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <HelpArticle
      category="Pomoc · Fakturácia"
      title="Prijaté faktúry"
      intro={
        <p>
          Čo dlžíte, kedy to je splatné a ktorej zákazke to patrí — vrátane faktúr, ktoré si
          nechávate doručiť e-mailom.
        </p>
      }
      sections={sections}
    />
  );
}
