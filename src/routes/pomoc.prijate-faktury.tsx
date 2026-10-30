import { createFileRoute, Link } from "@tanstack/react-router";
import { preloz } from "@/lib/i18n/jazyk";
import type { HelpSection } from "@/components/faktero/HelpArticle";
import { PrelozenyManual } from "@/lib/i18n/prelozStrom";

export const Route = createFileRoute("/pomoc/prijate-faktury")({
  head: ({ match }) => ({
    meta: [
      { title: preloz(match.context.jazyk, "Pomoc — Prijaté faktúry — Faktero") },
      {
        name: "description",
        content: preloz(
          match.context.jazyk,
          "Prijaté faktúry vo Faktere: zápis ručne aj e-mailom, položky a náhľad dokladu, hromadné akcie, splatnosť, úhrady, platba z banky, DPH na vstupe a samofakturácia.",
        ),
      },
      { property: "og:url", content: "https://www.faktero.sk/pomoc/prijate-faktury" },
    ],
    links: [{ rel: "canonical", href: "https://www.faktero.sk/pomoc/prijate-faktury" }],
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
            <strong>E-mailom</strong> — faktúru od dodávateľa prepošlete na svoju adresu a pripraví
            sa sama v Nespracovaných dokladoch. Najrýchlejšia cesta, popísaná v{" "}
            <Link to="/pomoc/doklady">manuáli k dokladom</Link>. Kto vedie viac firiem, môže použiť{" "}
            <strong>rozdeľovač</strong> — jednu adresu pre všetky firmy; doklad pôjde do
            Nespracovaných tej, na ktorú je vystavený (podľa IČO, IČ DPH či DIČ odberateľa), a čo
            nesedí práve na jednu, počká na ručné priradenie.
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
        <p>
          Cez <strong>Stĺpce</strong> si zvolíte, čo v zozname vidíte (napríklad IČO, DUZP, základ,
          DPH či predkontáciu), a cez <strong>Uložiť filter</strong> si odložíte často používaný
          výber. Oboje platí buď pre jednu firmu, alebo pre všetky vaše firmy naraz.
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
        <p>
          V <strong>kompaktnom rozložení</strong> je detail prijatej faktúry jeden stĺpec kariet:
          hlavička s kartou úhrady, účtovanie priamo na stránke (účtovná poznámka, komentár, dátum
          daňovej povinnosti, typ platby, predkontácia, členenie DPH a KV — každá zmena sa hneď
          uloží), prílohy, dodávateľ a odberateľ, položky, platobné údaje s kopírovaním a sumár po
          sadzbách DPH. Ceruzka otvorí úpravu s náhľadom dokladu vedľa polí, rovnako ako v
          Nespracovaných dokladoch. Odovzdaná alebo zamknutá faktúra sa dá len prezerať.
        </p>
      </>
    ),
  },
  {
    id: "cudzia",
    title: "Faktúra, ktorá nepatrí vašej firme",
    body: (
      <>
        <p>
          Faktero pri každej prijatej faktúre porovná odberateľa na doklade s vašou firmou — podľa
          IČO, DIČ a IČ DPH, a keď čísla na doklade chýbajú, aj podľa názvu. Keď odberateľ nesedí,
          faktúra pravdepodobne patrí inej firme: prišla na zlú adresu, preposlal ju kolega alebo
          účtovník s viacerými klientmi.
        </p>
        <p>
          V Nespracovaných dokladoch sa vtedy nad údajmi ukáže červené upozornenie „Faktúra nepatrí
          firme …, odberateľ je …“ a pri Vytvoriť máte tri možnosti: faktúru zmazať do koša,
          presunúť k firme, ktorej patrí, alebo ju uložiť aj tak.
        </p>
        <ul>
          <li>
            Uložená faktúra má v zozname aj v detaile červený výkričník a kým ho má, nedá sa
            zaúčtovať — ručne, hromadne, pravidlom ani automatickým zaúčtovaním. Export a odovzdanie
            do Pohody či iného programu ju vynechajú s dôvodom a do hromadného príkazu na úhradu sa
            nedostane.
          </li>
          <li>
            Keď je odberateľ zle prečítaný alebo ste ho opravili, v detaile faktúry kliknite na
            „Faktúra patrí tejto firme“. Potvrdenie sa zapíše do histórie dokladu a faktúra sa dá
            zaúčtovať.
          </li>
          <li>
            Presunúť sa dá len do firmy, ku ktorej máte vo Faktere prístup a smiete v nej zapisovať
            doklady. Faktúra prejde aj so súbormi a väzby z vašej firmy (párovanie s bankou,
            zaúčtovanie, pravidlo, štítky) sa zrušia. O firmách, ku ktorým prístup nemáte, Faktero
            nič neprezradí — ani to, či vôbec existujú.
          </li>
        </ul>
        <p>
          Rovnako sa kontrolujú faktúry z eFaktúry, z importu a z API. Keď údaje odberateľa na
          doklade nie sú, Faktero nič neblokuje.
        </p>
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
            internetbankingu (býva to „Import príkazov“ alebo „Hromadný príkaz“) a zaplatíte všetky
            vybrané faktúry naraz. Vyberiete účet, z ktorého sa platí, a dátum; faktúry môžu ísť aj
            každá až v deň splatnosti. Variabilný, špecifický a konštantný symbol sa prenesú tak,
            ako ich dodávateľ uvidí vo výpise. Symbol dlhší ako 10 číslic alebo s písmenami (napr.
            referencia <code>RF…</code> zahraničného dodávateľa) sa neoreže — ide celý ako{" "}
            <strong>referencia platiteľa</strong>. Faktúry bez IBAN-u, v inej mene než euro, už
            zaplatené alebo platené hotovosťou či kartou sa do príkazu nedostanú — okno povie ktoré
            a prečo. Za zaplatené sa faktúry neoznačia hneď — až keď platbu z účtu spárujete s
            faktúrou (Faktero to samo navrhne).
          </li>
          <li>
            <strong>XML pre Pohodu</strong> — vybrané faktúry na import do Pohody, zaúčtované aj
            nezaúčtované (nezaúčtované dostanú predvolenú predkontáciu firmy). Koncepty a stornované
            sa vynechajú. Pri zapnutom schvaľovaní ide do príkazu na úhradu aj na platbu cez banku
            len schválená faktúra.
          </li>
          <li>
            <strong>Hromadná akcia</strong> — účtovná položka, typ platby, členenie DPH a KV,
            poznámka, komentár, vlastný stav, štítky či úhrada pre všetky označené naraz; pozri{" "}
            <Link to="/pomoc/doklady">manuál k dokladom</Link>.
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
          Dole pod zoznamom sa pri výbere ukáže súčet: koľko dokladov je označených, koľko stoja s
          DPH aj bez DPH, koľko z nich ešte čaká na export do účtovníctva a koľko na úhradu.
          Zálohová faktúra sa do súčtu nepočíta, dobropis ho znižuje a rôzne meny sa sčítavajú
          zvlášť. Tlačidlo Uhradiť v tej istej lište pripraví hromadný príkaz na úhradu z označených
          faktúr; rovnako to funguje aj v Nespracovaných dokladoch, kde sa IBAN, symbol a suma berú
          z vyčítaných údajov. Tá istá lišta je aj pri bločkoch a vystavených faktúrach.
        </p>
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
        <p>
          Úhrady sa dajú zapisovať aj <strong>po častiach</strong>. Na detaile faktúry je karta
          úhrady so splatnosťou a sumou, ktorá ešte zostáva. Tlačidlo <strong>Pridať úhradu</strong>{" "}
          otvorí okno Úhrady: celková suma, už uhradené, aktuálna úhrada a koľko zostane. Čiastočne
          uhradená faktúra ostáva otvorená, kým súčet úhrad nedosiahne jej sumu — potom sa sama
          označí ako uhradená. Spárovaný pohyb z banky sa do úhrad započíta sám a zmizne, keď
          spárovanie zrušíte.
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
            výkazu, samozdanenie podľa § 69 do B.1, nadobudnutie tovaru z EÚ do riadkov 05 až 08
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
    id: "zauctovanie",
    title: "Zaúčtovanie — predkontácia a členenie DPH",
    body: (
      <>
        <p>
          Na detaile prijatej faktúry je časť <strong>Zaúčtovanie</strong> s predkontáciou, členením
          DPH (plnením) a kategóriou nákladu. Kódy píšete také, aké máte v Pohode; Faktero ponúkne
          tie, ktoré už používate. Prázdne pole znamená predvolenú hodnotu z{" "}
          <Link to="/uctovnictvo/pohoda">nastavení prepojenia s Pohodou</Link>.
        </p>
        <p>
          <strong>Hľadanie kódu:</strong> výber predkontácie či členenia DPH sa po kliknutí otvorí s
          políčkom na hľadanie — stačí napísať časť kódu, názvu alebo účtu (napríklad „phm“ alebo
          „501“), na diakritike ani veľkých písmenách nezáleží. Šípkami a Enterom vyberiete bez
          myši, Escape výber zavrie. Kód, ktorý v číselníku nie je, použijete voľbou{" "}
          <em>Použiť kód</em>. Hneď vedľa členenia DPH je <strong>členenie KV DPH</strong> — prázdne
          znamená automaticky (faktúra B.2, prenesenie B.1, opravná faktúra C.2).
        </p>
        <p>
          Viac faktúr naraz zaúčtujete v zozname: označte ich a kliknite na <em>Zaúčtovať</em>.
          Vyplnené pole sa nastaví všetkým, prázdne nechá, čo na faktúre je. Opakujúcich sa
          dodávateľov zaúčtuje samo <Link to="/uctovnictvo/pravidla">pravidlo účtovania</Link>{" "}
          (napríklad „Orange → predkontácia 5Fp, členenie PD“). Keď členenie DPH v okne nevyberiete
          a faktúra ho nemá, doplní sa z pravidla alebo zo zvyku dodávateľa. Faktúru, pre ktorú sa
          členenie nedá určiť ani z kategórie, predvolených či rozúčtovania, platiteľ DPH nezaúčtuje
          — okno ju vymenuje a tlačidlo Zaúčtovať ostane vypnuté.
        </p>
        <p>
          Faktúra vytvorená z <Link to="/nespracovane">Nespracovaných dokladov</Link> je zaúčtovaná
          už vytvorením, keď sa pre ňu dá určiť predkontácia aj členenie DPH (z dokladu, pravidla,
          kategórie alebo predvolených). Kto chce každú faktúru zaúčtovať zvlášť, vypne to v
          Predkontáciách voľbou <em>Vytvorený doklad je zaúčtovaný a pripravený na export</em>.
        </p>
        <p>
          Zaúčtované faktúry si berie konektor do Pohody — ako prijatú faktúru s číslom dodávateľa,
          dátumom dodania, splatnosťou a rozpisom DPH. Odovzdaná faktúra je označená{" "}
          <em>V Pohode</em> a vo Fakteri sa jej zaúčtovanie už nemení. Samofaktúra sa dá zaúčtovať
          až po odsúhlasení dodávateľom.
        </p>
        <p>
          <strong>Rozúčtovanie na viac predkontácií:</strong> v časti Zaúčtovanie kliknite na{" "}
          <em>Rozúčtovať na viac predkontácií</em>. Každý riadok má vlastnú predkontáciu, členenie
          DPH, sadzbu, základ a DPH (napr. 80 € materiál 1Fp/PD a 20 € réžia 2Fp/PN). Súčty po
          sadzbách musia sedieť s faktúrou na cent — tlačidlo <em>= zvyšok</em> doplní rozdiel. Do
          Pohody ide faktúra s hlavičkou „Rozúčtovať“ a s položkami, z ktorých každá nesie svoje
          kódy. Rovnako sa dá rozúčtovať aj bloček (Doklady → otvoriť doklad → Zaúčtovanie).
        </p>
        <p>
          <strong>Stiahnuť hneď:</strong> zaúčtovaná faktúra má tlačidlo{" "}
          <em>Stiahnuť XML pre Pohodu</em> (v zozname aj hromadne pre označené). Faktúra sa tým
          označí ako odovzdaná, aby ju konektor neposlal druhýkrát.
        </p>
        <p>
          <strong>Zle zaúčtované alebo zatriedené:</strong> odovzdanú faktúru vrátite tlačidlom{" "}
          <em>Vrátiť z Pohody (opraviť)</em> — zaúčtovanie sa zruší a po oprave pôjde znova; v
          Pohode ju predtým zmažte, inak tam bude dvakrát. Bloček zaradený medzi faktúry presuniete
          späť tlačidlom <em>Presunúť medzi doklady</em> (aj s prílohou a úhradou z účtu). Odovzdaný
          bloček sa vracia v úprave dokladu, rovnako tlačidlom <em>Vrátiť z Pohody</em>. Dátum
          dodania (deň daňového plnenia) je vo formulári hneď pri dátume vystavenia — rozhoduje o
          období DPH.
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
          DPH to dovoľuje (§ 72 ods. 4), ak sú splnené tri veci:
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
          úpravu podľa § 65 a § 66, zľavu na celú faktúru a zúčtovanie zaplatenej zálohy (prijatej
          zálohovej faktúry od toho istého dodávateľa). Položky sa dajú vybrať z cenníka a skladu —
          pri skladovej karte sa ponúkne posledná nákupná cena. Pri{" "}
          <strong>prenesení daňovej povinnosti</strong> (kovový šrot a odpad, stavebné práce podľa
          § 69 ods. 12, alebo dodávateľ z iného štátu EÚ) daň na faktúre nebude — samozdaníte ju vy
          a dodávateľovi platíte len základ. Pri dodávateľovi z iného štátu EÚ faktúra odkazuje na
          smernicu (čl. 138 pri tovare, čl. 196 pri službe).
        </p>
        <p>
          Dodávateľ dostane e-mail aj stránku na odsúhlasenie <strong>v jazyku faktúry</strong> — po
          slovensky, česky, anglicky, nemecky alebo maďarsky.
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
          vstupuje do DPH na vstupe a kontrolného výkazu (časť B.2, pri viacerých sadzbách rozpísaná
          po sadzbách), dá sa uhradiť z banky aj hromadným príkazom a PDF v odsúhlasenej podobe sa
          uloží ako príloha. Meniť sa už nedá — chyba sa opravuje dobropisom: na detaile kliknite na{" "}
          <em>Vystaviť dobropis</em>, položky sa predvyplnia so záporným množstvom a na dobropise
          bude číslo opravovanej faktúry. Aj dobropis musí dodávateľ odsúhlasiť. Výkup tovaru na
          sklad prijmete z odsúhlasenej samofaktúry tlačidlom <em>Prijať na sklad</em> — nákupná
          cena je cena z faktúry po zľavách, v pohyboch skladu je pri ňom odkaz na samofaktúru. Kým
          nie je odsúhlasená, do výkazov ani do príkazu na úhradu nevstúpi a výkaz na ňu upozorní.
        </p>
        <p>
          Dodávateľ si faktúru zaeviduje medzi svoje <em>vydané</em> faktúry pod číslom, ktoré
          dostala u vás, a daň z nej odvádza on.
        </p>
      </>
    ),
  },
  {
    id: "registr-platcu-dph",
    title: "Česká firma: spoľahlivý platca a zverejnený účet",
    body: (
      <>
        <p>
          Pri prijatej faktúre od dodávateľa s českým DIČ si Faktero samo overí dodávateľa v{" "}
          <strong>Registri plátců DPH</strong> Finančnej správy ČR: či nie je{" "}
          <strong>nespoľahlivý platca</strong> a či je IBAN z faktúry medzi jeho{" "}
          <strong>zverejnenými účtami</strong>. Výsledok je na detaile faktúry aj vo formulári hneď
          po zadaní DIČ a IBAN-u, s dátumom overenia; tlačidlom <em>Ověřit znovu</em> sa dá overiť
          pred úhradou.
        </p>
        <p>
          Prečo na tom záleží: odberateľ ručí za DPH dodávateľa (§ 109 zákona o DPH), keď zaplatí
          nespoľahlivému platcovi, alebo pri sume nad 540 000 Kč na účet, ktorý platca nezverejnil.
          Overenie sa týka len firiem s krajinou Česko.
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <PrelozenyManual
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
