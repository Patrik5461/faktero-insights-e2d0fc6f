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
    title: "Najprv predkontácie z Pohody (5 minút, oplatí sa)",
    body: (
      <>
        <p>
          V <Link to="/uctovnictvo/predkontacie">Účtovníctvo → Predkontácie a členenie DPH</Link>{" "}
          si načítajte <strong>číselník predkontácií</strong> (napr. <code>1Fp</code> — nákup
          materiálu, 501/321) a <strong>členení DPH</strong> (napr. <code>PD</code>) priamo z Pohody
          účtovníčky. Tri cesty:
        </p>
        <ul>
          <li>
            <strong>Konektorom</strong> — tlačidlo <em>Načítať pri ďalšom behu</em>; konektor sa
            Pohody opýta sám a odpoveď uloží.
          </li>
          <li>
            <strong>XML súborom</strong> — stiahnite žiadosť, v Pohode ju načítajte cez Súbor →
            Dátová komunikácia → XML import a súbor s odpoveďou nahrajte späť.
          </li>
          <li>
            <strong>Tabuľkou</strong> — CSV alebo Excel so stĺpcami Kód, Popis (prípadne Agenda, MD,
            D). Kódy sa dajú aj ručne pridať a upraviť.
          </li>
        </ul>
        <p>
          Na tej istej stránke nastavíte, čo sa použije <strong>predvolene podľa druhu dokladu</strong>{" "}
          — vydaná faktúra, zálohová, dobropis, prijatá faktúra, <strong>bloček</strong>, pokladňa a
          banka — a predkontácie pre bankové pohyby podľa označenia platby. Pri zaúčtovaní prijatej
          faktúry, v Dokladoch (tlačidlo <em>Predkontácia</em> pri vybraných bločkoch) aj v
          pravidlách sa kódy potom vyberajú zo zoznamu s popisom.
        </p>
        <p>
          Pri každom kóde v číselníku sa dá zaškrtnúť, <strong>pri ktorých dokladoch sa ponúka</strong>{" "}
          (napr. len bločky), a <strong>kategória nákladu</strong>, pre ktorú sa použije sám — bloček
          s kategóriou Palivo tak dostane PHM bez klikania. Poradie: kód na doklade, pravidlo
          účtovania, kategória, predvolený kód druhu dokladu. Doklad sa dá aj{" "}
          <strong>rozúčtovať na viac predkontácií a členení</strong>; v Pohode má potom hlavičku
          „Rozúčtovať“ a kódy nesú položky.
        </p>
        <p>
          <strong>Bločky do Pohody</strong> idú buď všetky ako prijaté faktúry, alebo{" "}
          <em>podľa spôsobu platby</em>: hotovosť ako výdavkový pokladničný doklad, karta ako interný
          doklad, prevod ako prijatá faktúra. Prepína sa to na stránke Predkontácie. Na doklade sa dá
          vybrať aj <strong>členenie kontrolného výkazu</strong> (B1, B2, B3, C2 alebo „nezahŕňať“);
          bloček označený B2 ide aj vo Fakteri do časti B.2 s číslom a IČ DPH dodávateľa.
        </p>
        <p>
          Z Pohody sa načítajú aj <strong>strediská, činnosti a číselné rady</strong> (záložky v
          číselníku). Predvolený číselný rad pre prijaté faktúry, bločky, pokladňu a interné doklady
          a predvolené stredisko nastavíte na tej istej stránke; doklad môže mať vlastné. Pri doklade
          sa dá zadať aj zákazka a interná poznámka pre účtovníčku; párovací symbol sa vyplní z
          variabilného symbolu a k bločkom aj prijatým faktúram ide odkaz na sken.
        </p>
        <p>
          Predkontácia môže mať <strong>účtovanie pomerom</strong> — napríklad 80/20 alebo auto s
          odpočtom DPH 50 % od roku 2026. Doklad s takou predkontáciou sa do Pohody rozúčtuje sám a
          výkazy k DPH odpočítajú len príslušnú časť dane. Pomer ide na{" "}
          <strong>celý doklad</strong> (predkontácia v hlavičke) aj na <strong>položku</strong>: pri
          bločku z čerpačky dáte predkontáciu s pomerom len k nafte a bageta ostane s predkontáciou
          dokladu — v tabuľke položiek je pri každej sadzba DPH a výber predkontácie. Predkontácia s agendou
          <em> Ostatné záväzky</em> pošle faktúru do tejto agendy.
        </p>
        <p>
          Účtovná kancelária nastaví jednu firmu a ostatným ju skopíruje: tlačidlo{" "}
          <strong>Kopírovať do iných firiem</strong> na stránke Predkontácie prenesie číselník
          (aj s účtami a pomermi) a predvolené kódy do vybraných firiem, najviac desiatich naraz.
        </p>
        <p>
          Doklad z <strong>uzamknutého obdobia</strong> dostane v Pohode dátum zaúčtovania prvý deň
          po uzávierke. Viac pokladní (záložka Pokladne) a voľbu posielať aj položky bločku nájdete
          tiež na stránke Predkontácie.
        </p>
        <p>
          Bez predkontácií Pohoda doklady naimportuje bez chyby, ale zaúčtovanie si ku každému
          doklikáva ručne — teda presne tú prácu, ktorú mal export ušetriť.
        </p>
        <p>
          <strong>E-mail účtovníčky</strong>, na ktorý chodia mesačné podklady, je v{" "}
          <Link to="/uctovnictvo/pohoda">Účtovníctvo → Prepojenie s Pohodou</Link>.
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
            V súbore <code>faktero-pohoda.cmd</code> vyplní tri riadky: cestu k Pohode a
            prihlasovacie meno a heslo do nej. V súbore <code>firmy.txt</code> skontroluje názov
            databázy účtovnej jednotky (nájde ho v Pohode v <em>Súbor → Účtovné jednotky</em>,
            stĺpec Databáza).
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
          <strong>Viac firiem v jednom priečinku.</strong> Účtovníčka s viacerými klientmi má jeden
          priečinok a jednu naplánovanú úlohu. Každá firma je jeden riadok v{" "}
          <code>firmy.txt</code> v tvare <code>KĽÚČ;DATABÁZA;NÁZOV</code> — ďalšieho klienta pridá
          tak, že z jeho balíčka skopíruje posledný riadok do svojho <code>firmy.txt</code>.
        </p>
        <p>
          <strong>Prelom rokov.</strong> Na začiatku roka sa ešte účtuje aj do databázy minulého
          roka. Do riadku firmy stačí pridať štvrté pole — názov databázy minulého roka:{" "}
          <code>KĽÚČ;DATABÁZA;NÁZOV;DATABÁZA_MINULÝ_ROK</code>. Doklady s dátumom z minulého roka
          potom pôjdu do nej, tohtoročné do bežnej databázy. Po uzavretí minulého roka štvrté pole
          zmažte. Balíčky stiahnuté pred 6. 10. 2026 to ešte nevedia — stiahnite si balíček znova
          (stačí vymeniť <code>faktero-pohoda.cmd</code>, <code>firmy.txt</code> ostáva).
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
            <strong>vydané faktúry</strong>, zálohové faktúry a dobropisy — s textom faktúry,
            položkami, zľavami a s predkontáciou, členením, strediskom a činnosťou, ak ste ich{" "}
            <Link to="/pomoc/faktury">zaúčtovali</Link>
          </li>
          <li>
            <strong>prijaté doklady</strong> — bločky a pokladničné doklady, s rozpisom DPH po sadzbách
          </li>
          <li>
            <strong>prijaté faktúry</strong> — konektor posiela tie, ktoré ste vo Fakteri{" "}
            <Link to="/pomoc/prijate-faktury">zaúčtovali</Link>, s predkontáciou, členením DPH,
            číslom faktúry dodávateľa a dátumom dodania. V mesačnom odovzdaní účtovníčke idú všetky
            prijaté faktúry za mesiac.
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
          <strong>Označenie platby</strong> hovorí, čím ten pohyb je — bankový poplatok, daň, mzda,
          úhrada faktúry, platba kartou… Výpis to sám nepovie a pritom práve podľa toho sa účtuje.
          Predvyplní sa odhadom (pri XML aj podľa kódu operácie od banky) a vy ho prepíšete. Do
          Pohody ide ako <em>poznámka dokladu</em>, do SEPA XML ako účel platby.
        </p>
        <p>
          A hlavne: ku každému označeniu si viete zadať <strong>vlastnú predkontáciu</strong> z
          Pohody. Poplatok, daň a úhrada faktúry sa účtujú každé inam, takže doklad potom príde
          rovno zaúčtovaný a účtovník ho nepredkontováva. Čo necháte prázdne, dostane spoločnú
          predkontáciu. Predkontácie patria firme — vyplní ich jeden človek a majú ich všetci;
          nastavujú sa aj tu na tejto stránke, v sekcii <em>Predkontácie podľa označenia platby</em>
          .
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
    id: "brany",
    title: "Výpis z platobnej brány (Stripe, PayPal, GoPay, Comgate, Barion)",
    body: (
      <>
        <p>
          Na tej istej stránke nahrajte namiesto bankového výpisu{" "}
          <strong>CSV export z brány</strong>. Faktero z neho spraví výpis, aký by poslala banka:
          každá platba zákazníka je príjem, poplatok brány je samostatný výdaj s označením{" "}
          <em>Bankový poplatok</em> a výber na váš bankový účet je výdaj s označením{" "}
          <em>Prevod medzi vlastnými účtami</em>. S predkontáciami podľa označenia tak príde do
          Pohody rovno zaúčtovaný.
        </p>
        <ul>
          <li>
            <strong>Stripe</strong> — Reports → Balance →{" "}
            <em>Itemized balance change from activity</em> (CSV). Export platieb z prehľadu Payments
            výbery na účet neobsahuje.
          </li>
          <li>
            <strong>PayPal</strong> — Activity → Download → CSV (všetky transakcie). Čakajúce a
            zablokované sumy sa vynechajú.
          </li>
          <li>
            <strong>GoPay</strong> — Obchodné účty → Výpisy → CSV (formát B a vyšší).
          </li>
          <li>
            <strong>Comgate</strong> — export platieb v CSV; výbery na účet sa poskladajú z dátumu a
            sumy prevodu.
          </li>
          <li>
            <strong>Barion</strong> — denný výpis v CSV.
          </li>
        </ul>
        <p>
          Variabilný symbol sa vezme z čísla objednávky (napr. <em>WC-1234</em> → 1234), takže
          Pohoda aj Faktero platbu spárujú s faktúrou. Výpis je vždy v jednej mene — pohyby v inej
          mene sa vynechajú a stránka to povie. V Pohode zvoľte banku, ktorú máte pre bránu
          založenú.
        </p>
        <p>
          Ten istý export sa dá nahrať aj do Faktera (<em>Bankové účty → Nahrať výpis</em>). Brána
          sa založí ako ďalší účet, platby sa spárujú s faktúrami a mesačne z nej vznikne aj vlastný
          výpis. Opakované nahranie toho istého exportu nič nezdvojí.
        </p>
      </>
    ),
  },
  {
    id: "pravidla",
    title: "Pravidlá účtovania prijatých dokladov",
    body: (
      <>
        <p>
          <Link to="/uctovnictvo/pravidla">Účtovníctvo → Pravidlá účtovania</Link>: napríklad „keď
          dodávateľ obsahuje <em>Slovnaft</em>, doplň kategóriu Palivo a predkontáciu PHM" alebo
          „platené kartou v reštaurácii → bez odpočtu DPH".
        </p>
        <ul>
          <li>
            Podmienky: časť názvu dodávateľa, IČO, spôsob úhrady, <strong>kto doklad nahral</strong>{" "}
            a <strong>predmet mailu</strong>, s ktorým doklad prišiel. Vyplnené musia platiť naraz;
            pravidlo podľa dodávateľa má prednosť pred pravidlom podľa používateľa či predmetu.
          </li>
          <li>
            Poznámka môže obsahovať premenné podľa dátumu dokladu: <code>#MM#</code>,{" "}
            <code>#YYYY#</code>, <code>#MM/YYYY#</code>, <code>#MMYYYY#</code> a{" "}
            <code>#MM-1/YYYY#</code> (predchádzajúci mesiac) — napr. „Telefón #MM-1/YYYY#".
          </li>
          <li>Platia pre bločky a doklady aj pre prijaté faktúry.</li>
          <li>
            Doplní: kategóriu, predkontáciu a členenie DPH pre Pohodu, odpočet DPH a poznámku.
          </li>
          <li>
            Zaberie pri každom novom doklade — zo skenu na webe aj v appke, z e-mailu, z importu —
            aj keď dodávateľa dopíše AI až chvíľu po nahratí.
          </li>
          <li>
            Dopĺňa len prázdne políčka; čo vyplníte sami, neprepíše. Keď sedí viac pravidiel, platí
            to s menším poradím.
          </li>
          <li>
            Predkontácia a členenie z pravidla idú do Pohody namiesto spoločných z nastavení
            prepojenia. Tlačidlo <em>Uplatniť na doklady, ktoré už sú</em> doplní aj doklady, ktoré
            ešte neodišli do účtovníctva.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "volby-exportu",
    title: "Voľby exportu a nastavenia prenosu",
    body: (
      <>
        <p>
          Pri exporte prijatých faktúr a bločkov sa otvorí okno s voľbami:
        </p>
        <ul>
          <li>
            <strong>Dátum zaúčtovania</strong> — pre doklady z už uzavretého obdobia. Prázdne = dátum
            dokladu.
          </li>
          <li>
            <strong>Exportovať aj už odovzdané</strong> — len keď ste ich v Pohode zmazali; inak sa
            odovzdané vynechajú, aby v Pohode neboli dvakrát.
          </li>
          <li>
            <strong>Prelom rokov</strong> — doklady z dvoch rokov idú do dvoch súborov, každý
            naimportujte do svojho roka.
          </li>
        </ul>
        <p>
          Na stránke <Link to="/uctovnictvo/predkontacie">Predkontácie</Link> v časti{" "}
          <em>Export a spracovanie dokladov</em> nastavíte:
        </p>
        <ul>
          <li>dobropis vždy s kladnými sumami,</li>
          <li>
            čo ide do <strong>párovacieho symbolu</strong> — VS, číslo dodacieho listu alebo číslo
            faktúry dodávateľa,
          </li>
          <li>
            <strong>predkontáciu pre zaokrúhlenie</strong> — rozdiel medzi položkami a sumou pôjde
            ako samostatná položka s touto predkontáciou,
          </li>
          <li>či bločky s QR kódom idú najprv do Nespracovaných dokladov,</li>
          <li>povinnú zákazku, stredisko alebo činnosť pri spracovaní dokladu.</li>
        </ul>
        <p>
          Prijatá faktúra nesie do Pohody aj konštantný a špecifický symbol a číslo objednávky.
          Prenesenie daňovej povinnosti na položkách ide s členením „Prijatá faktúra — prenesenie
          daňovej povinnosti" a kontrolným výkazom B.1. Daňový doklad k prijatej platbe ide medzi
          interné doklady. Z Pohody sa okrem predkontácií načítajú aj <strong>zákazky</strong>{" "}
          (založia sa aj vo Fakteri s rovnakým číslom) a <strong>bankové účty</strong>.
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
          <strong>Faktúry v cudzej mene bez kurzu.</strong> Faktúra v cudzej mene ide do Pohody so
          sumami v mene a s kurzom ECB — domáce sumy si Pohoda prepočíta. Keď kurz chýba, faktúra sa
          preskočí, povieme to a je v súpiske na ručné zadanie. Bločky v cudzej mene kurz nemajú,
          tie sa preskakujú vždy.
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
          <strong>Pohoda XML nenačíta alebo hlási chybu.</strong> Najčastejšie nesedí{" "}
          <strong>IČO</strong> — Pohoda prijme súbor len do účtovnej jednotky s rovnakým IČO, aké má
          firma vo Fakteri. Ďalej skontrolujte, či skratky v predkontáciách, číselných radoch,
          pokladni a bankovom účte (Účtovníctvo → Predkontácie a Prepojenie s Pohodou) naozaj v
          Pohode existujú; neznámu skratku Pohoda odmietne. Výsledok importu ukáže Pohoda v okne
          XML importu, pri konektore je aj v <code>protokol.txt</code>.
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
