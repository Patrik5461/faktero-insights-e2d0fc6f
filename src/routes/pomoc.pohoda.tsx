import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";

export const Route = createFileRoute("/pomoc/pohoda")({
  head: () => ({
    meta: [
      { title: "Pomoc — Prepojenie s Pohodou — Faktero" },
      {
        name: "description",
        content:
          "Ako dostať doklady z Faktera do programu POHODA: mesačné podklady mailom, automatické odosielanie a priame prepojenie, pri ktorom si Pohoda doklady vezme sama.",
      },
      { property: "og:url", content: "https://faktero.sk/pomoc/pohoda" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/pohoda" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "tri-cesty",
    title: "Tri spôsoby, vyberte si jeden",
    body: (
      <>
        <p>Doklady sa dajú do Pohody dostať tromi spôsobmi. Líšia sa len tým, kto nesie súbor:</p>
        <ol>
          <li>
            <strong>Stiahnem a pošlem sám</strong> — v{" "}
            <Link to="/exporty">Účtovníctvo → Účtovné exporty</Link> vyberiete mesiac a stiahnete
            ZIP.
          </li>
          <li>
            <strong>Odíde mailom samo</strong> — 5. v mesiaci, keď si to zapnete.
          </li>
          <li>
            <strong>Pohoda si to vezme sama</strong> — priame prepojenie, žiadne súbory ani maily.
          </li>
        </ol>
        <p>
          Všetky tri si pamätajú, čo už odišlo, takže sa doklad neodovzdá dvakrát. Pokojne ich aj
          kombinujte — keď si účtovníčka niečo natiahne konektorom, mail jej to už znova nepošle.
        </p>
      </>
    ),
  },
  {
    id: "skratky",
    title: "Najprv skratky z Pohody (5 minút, oplatí sa)",
    body: (
      <>
        <p>
          V <Link to="/uctovnictvo/pohoda">Účtovníctvo → Prepojenie s Pohodou</Link> vyplňte
          skratky, ktoré má účtovníčka vo svojej Pohode: <strong>predkontácie</strong> (napr.{" "}
          <code>3Fv</code>) a <strong>členenia DPH</strong> (napr. <code>UD</code>).
        </p>
        <p>
          Bez nich doklady naimportuje bez chyby, ale zaúčtovanie si ku každému doklikáva ručne —
          teda presne tú prácu, ktorú mal export ušetriť. Stačí sa jej raz opýtať a prepísať to sem.
        </p>
        <p>
          Sem patrí aj <strong>e-mail účtovníčky</strong>, na ktorý chodia mesačné podklady.
        </p>
      </>
    ),
  },
  {
    id: "mesacne",
    title: "Mesačné podklady",
    body: (
      <>
        <p>
          V <Link to="/exporty">Účtovných exportoch</Link> vyberiete mesiac a Faktero povie, koľko z
          neho ešte neodišlo. Vznikne jeden ZIP:
        </p>
        <ul>
          <li>XML na priamy import do Pohody — vydané faktúry, prijaté doklady, pokladňa</li>
          <li>súpisky v CSV na kontrolu</li>
          <li>PDF faktúr a skeny dokladov</li>
        </ul>
        <p>
          Keď máte zapnuté číselníky (adresár, sklad, zákazky), sú v balíku tiež — každý ako vlastný
          súbor, aby si účtovníčka naimportovala len to, čo chce. Balík teda nesie to isté čo priame
          prepojenie.
        </p>
        <p>
          <strong>Stiahnuť balík</strong> nič nezapisuje, takže sa dá stiahnuť koľkokrát chcete.{" "}
          <strong>Označiť za odovzdané</strong> a <strong>Poslať účtovníčke</strong> si už
          zapamätajú, čo odišlo, a nabudúce priložia len nové doklady.
        </p>
        <p>
          Pri odoslaní mailom platí strop na prílohy. Keď sa PDF a skeny nezmestia, balík odíde bez
          nich a v maile je o tom poznámka — údaje na zaúčtovanie sú dôležitejšie než obrázky a
          doklady zostanú vo Fakteru.
        </p>
      </>
    ),
  },
  {
    id: "automaticky",
    title: "Automatické odosielanie 5. v mesiaci",
    body: (
      <>
        <p>
          V <Link to="/uctovnictvo/pohoda">Účtovníctvo → Prepojenie s Pohodou</Link> zaškrtnite{" "}
          <strong>Posielať automaticky</strong>. Podklady za minulý mesiac potom odídu 5. ráno samy
          na adresu účtovníčky.
        </p>
        <p>
          Piaty preto, že dovtedy bývajú doklady doplnené a zároveň ostáva čas do daňových termínov.
        </p>
        <p>
          Je to <strong>vypnuté, kým to nezapnete</strong> — e-mail odchádza v mene vašej firmy,
          takže to musí byť vedomé rozhodnutie. Posiela sa vždy len to, čo ešte neodišlo.
        </p>
      </>
    ),
  },
  {
    id: "konektor",
    title: "Priame prepojenie — Pohoda si doklady vezme sama",
    body: (
      <>
        <p>
          Najpohodlnejšia cesta. Raz denne v noci si Pohoda stiahne doklady, ktoré v nej ešte nie
          sú, načíta ich a pošle späť správu o tom, ako import dopadol. Vďaka tomu Faktero vie,
          ktoré doklady sa naozaj založili a <strong>aké čísla dostali</strong>.
        </p>
        <p>
          <strong>Nič sa neinštaluje.</strong> POHODA vie import spustiť sama z príkazového riadku,
          takže celé prepojenie je priečinok s dávkovým súborom a jedna naplánovaná úloha Windows.
          Neotvárajú sa žiadne porty — von ide len bežné zabezpečené spojenie, rovnako ako keby si
          niekto otvoril webovú stránku.
        </p>
        <p>
          Pohoda ani nemusí byť spustená; dávkový súbor si ju otvorí a po skončení zavrie. Počítač
          však musí byť v tom čase zapnutý — keď nie je, prenos sa vynechá a doklady prídu ďalšiu
          noc.
        </p>
      </>
    ),
  },
  {
    id: "konektor-navod",
    title: "Ako prepojenie zapnúť",
    body: (
      <>
        <ol>
          <li>
            V <Link to="/uctovnictvo/pohoda">Účtovníctvo → Prepojenie s Pohodou</Link> dole kliknite
            na <strong>Stiahnuť balíček pre účtovníčku</strong> a pošlite jej ho.
          </li>
          <li>
            Účtovníčka priečinok skopíruje na počítač, kde je POHODA — ideálne{" "}
            <code>C:\Faktero</code>, teda cesta bez medzier a diakritiky.
          </li>
          <li>
            V súbore <code>faktero-pohoda.cmd</code> vyplní štyri riadky: cestu k Pohode,
            prihlasovacie meno a heslo do nej a názov databázy účtovnej jednotky (nájde ho v Pohode
            v <em>Súbor → Účtovné jednotky</em>, stĺpec Databáza).
          </li>
          <li>
            Dvakrát klikne na ten istý súbor a pozrie sa, čo vypíše. Prvý beh najlepšie vtedy, keď v
            Pohode nikto nepracuje.
          </li>
          <li>
            Keď prvý beh prejde, spustí <code>nastav-ulohu.cmd</code> — založí naplánovanú úlohu na
            druhú hodinu v noci.
          </li>
        </ol>
        <p>
          V priečinku vzniká <code>protokol.txt</code>, kde je vidieť, čo sa kedy stalo. Keď niečo
          nesedí, začnite tam.
        </p>
        <p>
          <strong>Keď prepojenie prestane chodiť, ozveme sa.</strong> Po týždni ticha vám príde
          e-mail — doklady sa medzitým nestratia, čakajú a odídu, hneď ako sa spojenie obnoví.
        </p>
        <p>
          Kľúč je vložený priamo v súbore a dá sa kedykoľvek zneplatniť v{" "}
          <Link to="/api-kluce">Nastavenia → API kľúče</Link>. Prepojenie zrušíte zmazaním
          naplánovanej úlohy alebo celého priečinka.
        </p>
      </>
    ),
  },
  {
    id: "co-chodi",
    title: "Čo do Pohody chodí",
    body: (
      <>
        <p>Vždy:</p>
        <ul>
          <li>
            <strong>vydané faktúry</strong>, zálohové faktúry a dobropisy
          </li>
          <li>
            <strong>prijaté doklady</strong> — bločky aj prijaté faktúry, s rozpisom DPH po sadzbách
          </li>
          <li>
            <strong>pokladňa</strong> — príjmové a výdavkové doklady
          </li>
        </ul>
        <p>Naviac, keď si ich zapnete v Účtovníctvo → Prepojenie s Pohodou:</p>
        <ul>
          <li>
            <strong>adresár</strong> — odberatelia idú do Pohody aj vtedy, keď im ten mesiac nič
            nefakturujete. Zmenený kontakt sa prepíše, nezaloží sa druhý.
          </li>
          <li>
            <strong>skladové karty</strong> — číselník zásob. Potrebuje vyplnené členenie skladu.
          </li>
          <li>
            <strong>skladové pohyby</strong> — príjemky a výdajky, aby v Pohode sedeli aj{" "}
            <strong>stavy</strong> skladu, nielen karty. Potrebuje zapnuté skladové karty.
          </li>
          <li>
            <strong>zákazky</strong> — a čo je hlavné, faktúra potom v Pohode nesie zákazku, takže z
            nej vidno výnos po zákazkách.
          </li>
        </ul>
        <p>
          Pri priamom prepojení sa navyše k faktúre pripne <strong>odkaz na jej PDF</strong> — v
          Pohode ho účtovníčka nájde v záložke Dokumenty a otvorí jedným kliknutím. Dá sa vypnúť.
        </p>
      </>
    ),
  },
  {
    id: "vypis",
    title: "Bankový výpis z banky do Pohody",
    body: (
      <>
        <p>
          <Link to="/uctovnictvo/vypis-do-pohody">Účtovníctvo → Bankový výpis do Pohody</Link> vezme
          výpis stiahnutý z internetbankingu a vyrobí z neho súbor, ktorý POHODA načíta ako bankové
          doklady.
        </p>
        <p>
          <strong>Keď banka ponúka XML, nahrajte XML</strong> — v internetbankingu mu hovoria{" "}
          <em>SEPA XML</em> alebo <em>camt.053</em>. Suma, variabilný symbol aj protistrana sú v ňom
          vlastnými poľami, takže sa nič nerozpoznáva a nič sa nemôže prečítať zle; načíta sa hneď,
          bez čakania. <strong>PDF</strong> zvládne tiež, aj naskenované, ale riadky z neho treba
          prejsť očami.
        </p>
        <p>
          Popis, protistranu aj symboly si viete pred vývozom prepísať — doklad potom v Pohode rovno
          sedí a účtovník ho neopravuje. Odčiarknutý riadok sa nevyvezie.
        </p>
        <p>
          Von idú dva súbory a každý patrí inam. <strong>SEPA XML (camt.053)</strong> do{" "}
          <em>Banka → Načítanie výpisov</em>: Pohoda ho vezme ako výpis od banky a platby si spáruje
          podľa variabilného symbolu. <strong>XML pre Pohodu</strong> je dávka dokladov do{" "}
          <em>Súbor → Dátová komunikácia → XML import</em>. Keď sa zamenia, Pohoda odpovie jedinou
          vetou — že súbor nezodpovedá stanovenej štruktúre formátu SEPA XML.
        </p>
      </>
    ),
  },
  {
    id: "co-nechodi",
    title: "Čo do Pohody zámerne nechodí",
    body: (
      <>
        <p>
          <strong>Banka.</strong> Účtovníčka si výpis načíta priamo z banky (a Faktero jej z neho
          vie vyrobiť súbor pre Pohodu — sekcia vyššie), takže náš export by v Pohode vyrobil druhý
          komplet bankových dokladov.
        </p>
        <p>
          <strong>Množstvá na skladovej karte.</strong> Karta ide bez stavu — ten v Pohode vzniká
          príjemkami a výdajkami, takže dosadené číslo by sa rozišlo s dokladmi. Ak chcete mať v
          Pohode aj stavy, zapnite <strong>skladové pohyby</strong>: Faktero pošle príjemky a
          výdajky a sklad si Pohoda dopočíta sama, tak ako má.
        </p>
        <p>
          <strong>Faktúry v cudzej mene.</strong> Pohoda chce rozpis po sadzbách vždy v domácej mene
          a kurz k faktúre neevidujeme — doláre by sa zaúčtovali ako eurá. Taký doklad sa preskočí,
          povieme to a je v súpiske na ručné zadanie.
        </p>
      </>
    ),
  },
  {
    id: "pohyby",
    title: "Aby v Pohode sedeli aj stavy skladu",
    body: (
      <>
        <p>
          Skladové karty samy o sebe idú do Pohody s nulovým stavom. Množstvá tam vznikajú
          príjemkami a výdajkami — a tie vieme posielať tiež, keď vo{" "}
          <Link to="/uctovnictvo/pohoda">Účtovníctvo → Prepojenie s Pohodou</Link> zapnete{" "}
          <strong>skladové pohyby</strong>.
        </p>
        <p>
          Pohyby z jedného dňa sa zlejú do jedného dokladu, takže z väčšieho príjmu nevznikne stovka
          príjemiek. Manko z inventúry odíde ako výdajka, prebytok ako príjemka.
        </p>
        <p>
          <strong>Príjemka sa nezaúčtuje</strong> — nesie príznak „neúčtovať". Náklad je totiž už na
          prijatom doklade a pri sklade vedenom spôsobom A by ho príjemka zaúčtovala druhýkrát.
          Výdajka taký príznak nemá a nepotrebuje ho: úbytok zásob proti výnosu na faktúre nič
          nezdvojí.
        </p>
        <p>
          Pohyb odíde až vtedy, keď je v Pohode jeho skladová karta. Ak ste karty práve zapli, prvá
          dávka ich pošle a pohyby prídu hneď za nimi.
        </p>
      </>
    ),
  },
  {
    id: "vazby",
    title: "Storno, dobropisy a zálohy",
    body: (
      <>
        <p>
          <strong>Zrušená faktúra.</strong> Keď faktúru zrušíte po tom, ako už odišla, Faktero
          požiada Pohodu o <strong>stornujúci doklad</strong>. Pôvodný v účtovníctve ostáva — tak to
          má byť, doklad z evidencie len tak nezmizne.
        </p>
        <p>
          <strong>Dobropis.</strong> Pri jeho vystavení sa dá vybrať, ktorú faktúru opravuje
          (tlačidlo „Ktorú faktúru opravuje" pri položkách). V Pohode potom vznikne ako opravný
          doklad naviazaný na pôvodnú faktúru, takže sa spárujú a sedí aj kontrolný výkaz. Bez
          výberu odíde ako samostatný doklad, ako doteraz.
        </p>
        <p>
          <strong>Zálohová faktúra.</strong> Keď si ju konečná faktúra odpočíta, odpočet ide do
          Pohody ako <strong>vlastný druh položky</strong> — nie ako záporná bežná položka. Vďaka
          tomu ho Pohoda spáruje so zálohovou faktúrou a nezaúčtuje ako ďalšie plnenie.
        </p>
        <p>
          Všetky tri sa odvolávajú na číslo, ktoré doklad dostal v Pohode. Kým sa jeho import
          nepotvrdí, väzba počká a doklad odíde bez nej — radšej doklad bez väzby než doklad, ktorý
          sa nenaimportuje vôbec.
        </p>
      </>
    ),
  },
  {
    id: "otazky",
    title: "Časté otázky",
    body: (
      <>
        <p>
          <strong>Môže sa doklad naimportovať dvakrát?</strong> Nie. Každý doklad má stály
          identifikátor a Pohoda má zapnutú kontrolu duplicity, takže druhý pokus odmietne — aj keby
          ten istý doklad prišiel raz konektorom a raz z mailu.
        </p>
        <p>
          <strong>Čo keď Pohoda doklad odmietne?</strong> Dôvod uvidíte v Účtovníctvo → Prepojenie s
          Pohodou a doklad sa vráti do fronty — príde znova, keď sa chyba opraví. Nezmizne.
        </p>
        <p>
          <strong>Zmenil som zákazke názov, prepíše sa?</strong> Nie. Pohoda vie zákazku založiť,
          ale nie prepísať, takže zmenu treba urobiť aj tam. Pri odberateľoch a skladových kartách
          sa zmena prepíše sama.
        </p>
        <p>
          <strong>Opravil som už odovzdanú faktúru.</strong> Oprava sa do Pohody neprenesie — doklad
          tam ostane v pôvodnej podobe. Ak treba, zrušte faktúru (vtedy pošleme storno) a vystavte
          novú, alebo rozdiel doriešte dobropisom.
        </p>
        <p>
          <strong>Funguje to s mojou radou Pohody?</strong> Áno, aj so základnou. Nepoužívame
          mServer, ktorý býva obmedzený.
        </p>
        <p>
          <strong>Používame mPohodu.</strong> Tá je iná aplikácia a doklady si do desktopovej Pohody
          sťahuje sama; naše XML čítať nepotrebuje. Import <em>z</em> mPohody do Faktera zvládame —
          nájdete ho v <Link to="/pomoc/exporty">exportoch a importoch</Link>.
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <HelpArticle
      category="Pomoc · Účtovníctvo"
      title="Prepojenie s Pohodou"
      intro={
        <p>
          Od stiahnutého súboru až po prepojenie, pri ktorom si Pohoda doklady vezme sama a povie
          späť, aké čísla im pridelila.
        </p>
      }
      sections={sections}
    />
  );
}
