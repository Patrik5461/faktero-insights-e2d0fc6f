import { createFileRoute, Link } from "@tanstack/react-router";
import { preloz } from "@/lib/i18n/jazyk";
import type { HelpSection } from "@/components/faktero/HelpArticle";
import { PrelozenyManual } from "@/lib/i18n/prelozStrom";

export const Route = createFileRoute("/pomoc/nemecko")({
  head: ({ match }) => ({
    meta: [
      { title: preloz(match.context.jazyk, "Pomoc — Firmy v Nemecku — Faktero") },
      {
        name: "description",
        content: preloz(
          match.context.jazyk,
          "Firma so sídlom v Nemecku: Regelbesteuerung a Kleinunternehmer, Soll a Ist, nemecká faktúra s GiroCode, ZUGFeRD a XRechnung, export do DATEV, prehľad UStVA s termínmi a upomienky podľa BGB.",
        ),
      },
      { property: "og:url", content: "https://faktero.sk/pomoc/nemecko" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/nemecko" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "zalozenie",
    title: "Založenie nemeckej firmy",
    body: (
      <>
        <p>
          Pri zakladaní firmy (pri prvom prihlásení alebo cez <strong>Pridať firmu</strong> v
          prepínači firiem) vyberte v poli <strong>Krajina registrácie</strong> možnosť{" "}
          <strong>Nemecko</strong>. Krajina rozhoduje o sadzbách DPH, o tom, ako sa volajú polia s
          identifikátormi, o jazyku dokladov aj o tom, ktoré výkazy a exporty Faktero ponúkne.
        </p>
        <ul>
          <li>
            Sadzby sú <strong>19 %, 7 % a 0 %</strong> (§ 12 UStG). Pre opravy plnení z druhého
            polroka 2020 Faktero pozná aj vtedajšie dočasné sadzby 16 % a 5 %.
          </li>
          <li>
            Namiesto DIČ a IČ DPH sa polia volajú <strong>Steuernummer</strong> a{" "}
            <strong>USt-IdNr.</strong> IČO je nepovinné a vyhľadanie firmy v registri sa pre nemeckú
            firmu neponúka.
          </li>
          <li>
            Domáca mena je euro, doklady sa predvolene vystavujú po nemecky a v Pomoci aj v
            aplikácii sa dá prepnúť nemecké rozhranie.
          </li>
        </ul>
        <p>
          Krajinu existujúcej firmy zmeníte v <Link to="/firma">Nastaveniach firmy</Link>.
        </p>
      </>
    ),
  },
  {
    id: "rezim-dph",
    title: "Režim DPH a Kleinunternehmer",
    body: (
      <>
        <p>Nemecká firma má na výber dve postavenia k DPH:</p>
        <ul>
          <li>
            <strong>Regelbesteuerung (platiteľ USt)</strong> — bežné zdaňovanie, faktúry s daňou 19
            % alebo 7 %.
          </li>
          <li>
            <strong>Kleinunternehmer (§ 19 UStG)</strong> — faktúry bez dane. Na každú faktúru sa
            sama vytlačí veta <em>Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.</em>{" "}
            Kleinunternehmer neuplatňuje oslobodené dodanie do EÚ ani prenesenie podľa § 13b — na
            doklade je len veta § 19.
          </li>
        </ul>
        <p>
          Od 1. 1. 2025 platia pre Kleinunternehmer dve hranice obratu: za{" "}
          <strong>minulý rok najviac 25 000 €</strong> a v{" "}
          <strong>bežnom roku najviac 100 000 €</strong>. Faktero obrat sleduje a na stránke{" "}
          <Link to="/dashboard">Prehľad</Link> aj v <Link to="/firma">Nastaveniach firmy</Link>{" "}
          upozorní:
        </p>
        <ul>
          <li>keď sa obrat bežného roka priblíži k 25 000 € alebo k 100 000 € (od 80 %),</li>
          <li>
            keď prekročí 25 000 € — tento rok ostávate Kleinunternehmer, od 1. januára budúceho roka
            už fakturujete s daňou,
          </li>
          <li>
            keď prekročí 100 000 € — už faktúra, ktorou ste hranicu prekročili, musí byť s daňou,
          </li>
          <li>keď obrat za minulý rok bol vyšší než 25 000 € — režim už neplatí.</li>
        </ul>
        <p>
          Obrat sa počíta z vystavených faktúr bez dane podľa dátumu dodania, dobropisy sa
          odpočítajú a zálohové faktúry sa nepočítajú. Je to{" "}
          <strong>upozornenie, nie výpočet pre Finanzamt</strong> — zákon počíta obrat
          (Gesamtumsatz) inak a niektoré oslobodené plnenia z neho vynecháva. Režim DPH Faktero samo
          neprepne; zmeníte ho v Nastaveniach firmy.
        </p>
      </>
    ),
  },
  {
    id: "udaje-firmy",
    title: "Údaje firmy: Steuernummer, USt-IdNr. a Handelsregister",
    body: (
      <>
        <p>
          V <Link to="/firma">Nastaveniach firmy</Link> má nemecká firma tieto polia:
        </p>
        <ul>
          <li>
            <strong>Steuernummer</strong> od miestneho Finanzamtu, napríklad 12/345/67890. Faktero
            kontroluje len to, či má 10 až 13 číslic — zápis sa v spolkových krajinách líši.
          </li>
          <li>
            <strong>USt-IdNr.</strong> — DE a 9 číslic, napríklad DE123456789. Potrebujete ju na
            dodania do EÚ, prenesenie daňovej povinnosti a vývoz.
          </li>
          <li>
            <strong>Registergericht</strong>, <strong>Handelsregister-Nr.</strong> (napríklad HRB
            123456) a <strong>Geschäftsführer</strong> — ak ich vyplníte, vytlačia sa do päty
            faktúry, napríklad „Amtsgericht München, HRB 123456 · Geschäftsführer: …“. Pre GmbH sú
            to povinné údaje na obchodných listoch.
          </li>
        </ul>
        <p>
          Na faktúre musí byť Steuernummer <strong>alebo</strong> USt-IdNr. (§ 14 Abs. 4 UStG). Kým
          nie je vyplnené ani jedno, alebo má niektoré zlý tvar, ukáže Faktero pod formulárom
          upozornenie.
        </p>
      </>
    ),
  },
  {
    id: "faktura",
    title: "Nemecká faktúra",
    body: (
      <>
        <p>
          Faktúra nemeckej firmy obsahuje údaje, ktoré vyžaduje § 14 Abs. 4 UStG: meno a adresu
          firmy aj odberateľa, Steuernummer alebo USt-IdNr., dátum vystavenia, jedinečné číslo,
          množstvo a druh plnenia, dátum dodania, základ dane podľa sadzieb, sadzbu a daň. Dátum
          dodania vyplňte pri každej faktúre — keď sa líši od dátumu vystavenia, musí byť na
          doklade.
        </p>
        <p>Podľa druhu plnenia sa na faktúru sama vytlačí zákonná veta:</p>
        <ul>
          <li>
            <strong>Kleinunternehmer</strong> —{" "}
            <em>Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.</em>
          </li>
          <li>
            <strong>Tuzemské prenesenie (§ 13b)</strong> —{" "}
            <em>Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG).</em>
          </li>
          <li>
            <strong>Dodanie tovaru do EÚ</strong> —{" "}
            <em>Steuerfreie innergemeinschaftliche Lieferung gemäß § 4 Nr. 1b UStG.</em> Odberateľ
            musí mať IČ DPH.
          </li>
          <li>
            <strong>Služba podnikateľovi v EÚ (§ 3a Abs. 2)</strong> —{" "}
            <em>
              Nicht im Inland steuerbare Leistung – Steuerschuldnerschaft des Leistungsempfängers.
            </em>
          </li>
          <li>
            <strong>Trojstranný obchod (§ 25b)</strong> —{" "}
            <em>
              Innergemeinschaftliches Dreiecksgeschäft gemäß § 25b UStG. Die Steuer schuldet der
              letzte Abnehmer.
            </em>
          </li>
          <li>
            <strong>Vývoz mimo EÚ</strong> —{" "}
            <em>Steuerfreie Ausfuhrlieferung gemäß § 4 Nr. 1a UStG.</em>
          </li>
        </ul>
        <p>
          Na faktúre v eurách s IBAN-om je platobný QR kód <strong>GiroCode</strong> (štandard EPC),
          ktorý načítajú nemecké aj ostatné európske bankové aplikácie. Faktúra v inej mene ostane
          bez QR kódu.
        </p>
        <p>
          <strong>Jazyk dokladu.</strong> Nemecká firma fakturuje predvolene po nemecky. Iný jazyk
          zvolíte pri faktúre v poli <strong>Jazyk dokladu</strong> alebo natrvalo pri odberateľovi
          v poli <strong>Jazyk dokladov</strong>. V anglickej faktúre sú zákonné vety po anglicky a
          nemecké znenie v zátvorke; v ostatných jazykoch ostávajú po nemecky. V jazyku dokladu je
          aj predvolený e-mail s faktúrou a stránka, ktorú odberateľ otvorí z odkazu v e-maile. Ak
          ste si v nastaveniach upravili vlastný predmet alebo text e-mailu, Faktero ho nemení.
        </p>
        <p>
          Faktúra v cudzej mene uvádza daň aj v eurách prepočítanú kurzom ECB a na nemeckom doklade
          je napísané, odkiaľ kurz je.
        </p>
      </>
    ),
  },
  {
    id: "rechnungskorrektur",
    title: "Opravná faktúra: Rechnungskorrektur, nie Gutschrift",
    body: (
      <>
        <p>
          Dobropis nemeckej firmy sa na doklade volá <strong>Rechnungskorrektur</strong>. Slovo{" "}
          <strong>Gutschrift</strong> má v Nemecku iný, zákonom daný význam — je to faktúra, ktorú
          za dodávateľa vyhotovil odberateľ (samofakturácia, § 14 Abs. 2 S. 2 UStG). Keby opravná
          faktúra niesla nadpis „Gutschrift“, odberateľ alebo jeho účtovník by ju mohli zameniť za
          samofaktúru — preto sa pri opravnej faktúre používa Rechnungskorrektur.
        </p>
        <ul>
          <li>
            Nadpis PDF, predvolený e-mail aj stránka faktúry pre odberateľa hovoria{" "}
            <em>Rechnungskorrektur</em>; v e-faktúre (XRechnung, ZUGFeRD) ostáva typ dokladu 381 s
            číslom pôvodnej faktúry.
          </li>
          <li>
            <strong>Samofaktúra</strong> ostáva označená ako <em>Gutschrift</em>, ako to žiada § 14
            Abs. 4 Nr. 10 UStG.
          </li>
          <li>
            Úplné storno faktúry Faktero samostatným dokladom nerieši — nevystavenú faktúru
            stornujete, vystavenú opravíte Rechnungskorrektur na celú sumu.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "osobitne-vety",
    title: "Differenzbesteuerung (§ 25a) a stavebné plnenia pre súkromné osoby",
    body: (
      <>
        <p>
          <strong>Differenzbesteuerung.</strong> Pri predaji použitého tovaru, umeleckých diel alebo
          zberateľských predmetov sa zdaňuje len rozdiel medzi predajnou a nákupnou cenou (§ 25a
          UStG). Na faktúre v poli <strong>Osobitná úprava</strong> vyberte druh tovaru a na doklad
          sa vytlačí veta podľa § 14a Abs. 6 UStG — <em>Gebrauchtgegenstände/Sonderregelung</em>,{" "}
          <em>Kunstgegenstände/Sonderregelung</em> alebo{" "}
          <em>Sammlungsstücke und Antiquitäten/Sonderregelung</em>; pri cestovných službách (§ 25
          UStG) <em>Sonderregelung für Reisebüros</em>. Daň sa na takej faktúre samostatne neuvádza
          — položky zadajte so sadzbou 0 % a daň z rozdielu (marže) doplňte do UStVA sami.
        </p>
        <p>
          <strong>Stavebné plnenie pre súkromnú osobu.</strong> Keď firma robí stavebné práce alebo
          iné plnenie v súvislosti s pozemkom (napríklad oprava strechy, záhradné práce, upratovanie
          domu) pre súkromnú osobu, musí na faktúre upozorniť, že odberateľ ju musí uchovať dva roky
          (§ 14 Abs. 4 Nr. 9 UStG). Na faktúre zaškrtnite{" "}
          <strong>Stavebné plnenie alebo plnenie v súvislosti s pozemkom pre súkromnú osobu</strong>{" "}
          a vytlačí sa veta{" "}
          <em>
            Sie sind gesetzlich verpflichtet, diese Rechnung zwei Jahre lang aufzubewahren (§ 14b
            Abs. 1 Satz 5 UStG).
          </em>{" "}
          Zaškrtnutie je pri faktúre, nie pri položke — povinnosť sa týka celého dokladu a Faktero z
          položiek nevie rozoznať, čo je stavebné plnenie.
        </p>
      </>
    ),
  },
  {
    id: "efaktura",
    title: "E-faktúra: ZUGFeRD a XRechnung",
    body: (
      <>
        <p>Nemecko zavádza e-faktúry medzi firmami postupne:</p>
        <ul>
          <li>
            <strong>od 1. 1. 2025</strong> musí každá firma vedieť e-faktúru <strong>prijať</strong>
            ,
          </li>
          <li>
            <strong>do konca roka 2026</strong> sa smie vystavovať aj papierová faktúra a PDF,
          </li>
          <li>
            <strong>do konca roka 2027</strong> ešte firmy s obratom za predchádzajúci rok do 800
            000 €,
          </li>
          <li>
            <strong>od 1. 1. 2028</strong> vystavujú e-faktúry medzi firmami všetci.
          </li>
        </ul>
        <p>
          Výnimky (napríklad faktúry do 250 € alebo faktúry Kleinunternehmer) a to, čo platí pre
          vašu firmu, si overte s daňovým poradcom.
        </p>
        <p>
          <strong>ZUGFeRD v každom PDF.</strong> Do PDF každej faktúry nemeckej firmy vkladá Faktero
          strojovo čitateľný súbor <code>factur-x.xml</code> (ZUGFeRD / Factur-X, profil EN 16931).
          Človek si prečíta PDF, účtovný program odberateľa si údaje vezme z XML. Nič sa nezapína.
          XML sa vloží len vtedy, keď faktúra prejde kontrolami e-faktúry — ak niečo chýba
          (napríklad PSČ odberateľa alebo IBAN), PDF sa vytvorí bez neho. Zálohová faktúra a opravný
          doklad k nevymožiteľnej pohľadávke ho nemajú.
        </p>
        <p>
          <strong>XRechnung</strong> je e-faktúra v čistom XML (XRechnung 3.0, UBL). Chcú ju najmä
          úrady a verejní odberatelia. Stiahnete ju v detaile faktúry v ponuke{" "}
          <strong>Ďalšie akcie → Stiahnuť XRechnung (XML)</strong>. Keď faktúre chýba niečo povinné,
          Faktero XML nevydá a vypíše, čo treba doplniť — napríklad telefón alebo e-mail firmy, PSČ
          a mesto odberateľa, e-mail odberateľa, USt-IdNr. pri dodaní do EÚ alebo IBAN. Toto
          hlásenie je zároveň najrýchlejší spôsob, ako zistiť, prečo v PDF chýba ZUGFeRD.
        </p>
        <p>
          <strong>Leitweg-ID.</strong> Úrady v e-faktúre vyžadujú svoje Leitweg-ID. Zadáte ho v
          karte odberateľa (<Link to="/odberatelia">Kontakty → Odberatelia</Link>) v poli{" "}
          <strong>Leitweg-ID (len pre úrady — do XRechnung)</strong>. Bez Leitweg-ID sa do e-faktúry
          dá číslo objednávky z faktúry, a keď nie je ani to, „n/a“.
        </p>
        <p>
          XRechnung Faktero zatiaľ nikam neodosiela (ani cez Peppol, ani na portály úradov) — súbor
          odošlete alebo nahráte sami.
        </p>
      </>
    ),
  },
  {
    id: "datev",
    title: "Export do DATEV",
    body: (
      <>
        <p>
          Zaúčtované doklady pre daňového poradcu sa vyvážajú vo formáte DATEV{" "}
          <strong>Buchungsstapel</strong>. V <Link to="/exporty">Účtovné exporty</Link> nájdete časť{" "}
          <strong>Zaúčtované doklady do vášho programu</strong>; ako účtovný program vyberte{" "}
          <strong>DATEV (Buchungsstapel)</strong> — nemecká firma, ktorá si program ešte nevybrala,
          ho má predvolený. Potom zvolíte vystavené faktúry, prijaté faktúry alebo bločky, obdobie a
          doklady.
        </p>
        <p>
          Pred prvým exportom otvorte <strong>Nastavenia pre DATEV</strong> a vyplňte:
        </p>
        <ul>
          <li>
            <strong>Beraternummer</strong> a <strong>Mandantennummer</strong> — dá vám ich daňový
            poradca,
          </li>
          <li>
            <strong>Účtová osnova</strong> — SKR03 alebo SKR04, podľa toho, v ktorej poradca vedie
            vaše účtovníctvo,
          </li>
          <li>
            <strong>Dĺžka Sachkonten</strong> (zvyčajne 4) a{" "}
            <strong>mesiac začiatku hospodárskeho roka</strong>,
          </li>
          <li>
            <strong>Debitori a kreditori</strong> — zberné účty 10000 / 70000, alebo osobné účty
            podľa partnera,
          </li>
          <li>
            prípadne Diktatkürzel, ďalšie automatické účty a BU-Schlüssel, ak ich poradca používa
            inak než predvolené.
          </li>
        </ul>
        <p>
          Daň si DATEV rozpočíta sám: výnosy a nákupy v prenesení idú na automatické účty, bežné
          náklady s BU-Schlüssel. Účet z predkontácie (
          <Link to="/uctovnictvo/predkontacie">Účtovníctvo → Predkontácie</Link>) má prednosť pred
          predvoleným účtom osnovy. V časti <strong>Prepis účtov</strong> môžete ktorýkoľvek
          predvolený účet nahradiť vlastným.
        </p>
        <p>
          Bežné účty (výnosy 19 % a 7 %, odberatelia, dodávatelia, nákupy) zodpovedajú osnove SKR03
          a SKR04. <strong>Menej bežné účty</strong> — výnosy Kleinunternehmer, OSS, zálohy so 7 %,
          oslobodené plnenia a niektoré plnenia podľa § 13b — si pred prvým ostrým importom{" "}
          <strong>overte s daňovým poradcom</strong> a prípadne ich prepíšte.
        </p>
        <p>
          Stiahnete súbor <code>EXTF_Buchungsstapel…</code> v kódovaní Windows-1252. DATEV
          Rechnungswesen ho načíta cez <em>Bestand → Importieren → ASCII-Daten / DATEV-Format</em>,
          prípadne ho pošlite poradcovi do DATEV Unternehmen online. Jeden súbor smie obsahovať len
          doklady z jedného hospodárskeho roka. Faktero nie je partnerom DATEV ani nemá certifikáciu
          DATEV — ide o súbor vo verejne opísanom formáte.
        </p>
      </>
    ),
  },
  {
    id: "ustva",
    title: "Prehľad UStVA",
    body: (
      <>
        <p>
          Nemecká firma má v <Link to="/uctovnictvo/vykazy">Účtovníctve → Výkazy k DPH</Link>{" "}
          namiesto slovenských výkazov prehľad <strong>Umsatzsteuer-Voranmeldung (UStVA)</strong>.
          Vyberte rok, zdaňovacie obdobie (mesiac alebo štvrťrok) a obdobie; Faktero zostaví
          Kennzahlen z vystavených faktúr, prijatých faktúr a bločkov:
        </p>
        <ul>
          <li>zdaniteľné plnenia 19 % a 7 % (KZ 81, 86) a plnenia s inou sadzbou (KZ 35/36),</li>
          <li>
            dodanie tovaru do EÚ (KZ 41), trojstranný obchod (KZ 42), vývoz (KZ 43), služby do EÚ
            (KZ 21), ostatné plnenia mimo tuzemska (KZ 45) a plnenia s daňou u odberateľa (KZ 60),
          </li>
          <li>
            nadobudnutie tovaru z EÚ (KZ 89, 93) a plnenia, pri ktorých daň platíte vy ako príjemca
            (KZ 46/47, 84/85),
          </li>
          <li>odpočet dane (KZ 66, 61, 62, 67) a výsledok (KZ 83).</li>
        </ul>
        <p>
          Základy dane sú v celých eurách, daň a odpočet na centy, tak ako ich chce formulár.
          Riadky, ktoré sa z dokladov vyčítať nedajú — KZ 48 (oslobodené plnenia bez nároku na
          odpočet), KZ 64 (oprava odpočtu podľa § 15a), KZ 69 (daň nesprávne uvedená na faktúre) a
          KZ 39 (Sondervorauszahlung) — doplníte ručne a stlačíte <strong>Prepočítať</strong>.
          Doklady, ktoré treba pred podaním skontrolovať, Faktero vymenuje nad tabuľkou. Prehľad
          stiahnete ako <strong>CSV</strong> alebo <strong>PDF</strong>.
        </p>
        <p>
          <strong>Podanie ide cez ELSTER mimo Faktera</strong> — údaje prepíšete do Mein ELSTER
          alebo ich dostane poradca. Termín je 10. deň po skončení obdobia, pri
          Dauerfristverlängerung o mesiac neskôr. Predaj cez OSS sa do UStVA nepočíta (podáva sa v
          samostatnom priznaní OSS), zálohové faktúry tiež nie.
        </p>
        <p>
          Kleinunternehmer UStVA nepodáva a prehľad to tak aj ukáže. Výnimkou je daň, ktorú dlhuje
          ako príjemca (§ 13b, napríklad služba od podnikateľa z EÚ) — tú prehľad pre
          Kleinunternehmer zatiaľ nepočíta.
        </p>
      </>
    ),
  },
  {
    id: "ist-soll",
    title: "Soll a Ist — kedy vzniká daň",
    body: (
      <>
        <p>
          V <Link to="/firma">Nastaveniach firmy</Link> nemecký platiteľ vyberie{" "}
          <strong>Spôsob zdaňovania</strong>:
        </p>
        <ul>
          <li>
            <strong>Versteuerung nach vereinbarten Entgelten (Soll)</strong> — predvolené. Daň z
            faktúry patrí do obdobia, v ktorom bolo plnenie dodané, bez ohľadu na to, kedy odberateľ
            zaplatí.
          </li>
          <li>
            <strong>Versteuerung nach vereinnahmten Entgelten (Ist)</strong> — len s povolením
            Finanzamtu (§ 20 UStG, napríklad pri obrate za minulý rok do 800 000 € alebo pri
            slobodnom povolaní). Daň z faktúry patrí do obdobia, v ktorom prišli peniaze.
          </li>
        </ul>
        <p>Pri Ist počíta prehľad UStVA takto:</p>
        <ul>
          <li>
            Daň z vystavených faktúr (KZ 81, 86, 35/36) sa berie podľa dátumu úhrady — z platieb
            spárovaných s bankou, zapísaných ručne alebo z platobnej brány. Faktúra označená ako
            uhradená bez zapísanej platby sa berie celá k dátumu úhrady.
          </li>
          <li>
            Pri <strong>čiastočnej úhrade</strong> ide do obdobia pomerná časť dane: zaplatená
            polovica faktúry znamená polovicu základu aj dane. Preplatok daň nezvýši.
          </li>
          <li>
            Plnenia bez dane — dodanie do EÚ, vývoz, prenesenie podľa § 13b — ostávajú v období
            dodania.
          </li>
          <li>
            <strong>Odpočet dane (KZ 66) ostáva podľa prijatých faktúr</strong>, nie podľa toho,
            kedy ste dodávateľovi zaplatili — nárok na odpočet vzniká dodaním a faktúrou (§ 15 Abs.
            1 Nr. 1 UStG) aj pri Ist.
          </li>
          <li>
            Rechnungskorrektur k faktúre, ktorá ešte nie je zaplatená, sa do prehľadu nedáva —
            zníženie sa prejaví samo na nižšej úhrade. Oprava už zaplatenej faktúry (vrátenie
            peňazí) ide do obdobia, v ktorom bola vystavená.
          </li>
        </ul>
        <p>
          <strong>Zálohy</strong> sa zdaňujú prijatím pri Soll aj pri Ist (Mindest-Ist-Versteuerung,
          § 13 Abs. 1 Nr. 1 Buchst. a S. 4 UStG). Daň zo zálohy nesie{" "}
          <strong>doklad k prijatej platbe</strong>, ktorý je datovaný dňom platby; ostrá faktúra si
          ho potom odpočíta. Keď na zálohovú faktúru prišli peniaze a doklad k prijatej platbe k nej
          nie je, prehľad UStVA na to upozorní.
        </p>
      </>
    ),
  },
  {
    id: "obdobie-ustva",
    title: "Obdobie UStVA, termín a Dauerfristverlängerung",
    body: (
      <>
        <p>
          V <Link to="/firma">Nastaveniach firmy</Link> v časti{" "}
          <strong>Umsatzsteuer-Voranmeldung</strong> nastavíte:
        </p>
        <ul>
          <li>
            <strong>Voranmeldungszeitraum</strong> — mesačne alebo štvrťročne, podľa toho, čo vám
            určil Finanzamt. Mesačne podáva firma, ktorej daň za minulý rok bola vyššia než 9 000 €;
            prehľad UStVA potom ponúkne mesiace alebo štvrťroky podľa tohto nastavenia.
          </li>
          <li>
            <strong>Dauerfristverlängerung</strong> — ak vám ju Finanzamt povolil, termín sa posúva
            o mesiac (§ 46 UStDV).
          </li>
        </ul>
        <p>
          Prehľad UStVA ukáže <strong>termín podania a zaplatenia</strong> za vybrané obdobie: 10.
          deň po skončení obdobia, s Dauerfristverlängerung 10. deň druhého mesiaca. Keď termín
          padne na víkend alebo celoštátny sviatok, posúva sa na najbližší pracovný deň (§ 108 Abs.
          3 AO); krajinské sviatky Faktero nepočíta.
        </p>
        <p>
          Pri <strong>mesačnom podávaní s Dauerfristverlängerung</strong> platí firma{" "}
          <strong>Sondervorauszahlung</strong> — jednu jedenástinu súčtu záloh za minulý rok.
          Prihlási ju a zaplatí do 10. februára (tlačivo USt 1 H) a v decembrovej UStVA ju odpočíta
          v KZ 39. Prehľad to pripomenie; sumu do KZ 39 zapíšete ručne. Pri štvrťročnom podávaní sa
          Sondervorauszahlung neplatí.
        </p>
      </>
    ),
  },
  {
    id: "upomienky",
    title: "Upomienky, úroky z omeškania a paušál 40 €",
    body: (
      <>
        <p>
          Nemecká firma posiela upomienky po nemecky: prvá je zdvorilá <em>Zahlungserinnerung</em>,
          druhá <em>Mahnung</em> a tretia <em>Letzte Mahnung</em>. Druhá a tretia vyčíslia podľa §
          288 BGB:
        </p>
        <ul>
          <li>
            <strong>úroky z omeškania</strong> — pri podnikateľovi základná sadzba Bundesbank + 9
            percentuálnych bodov, pri spotrebiteľovi + 5 bodov, počítané po dňoch,
          </li>
          <li>
            <strong>paušál 40 €</strong> (§ 288 Abs. 5 BGB) — len keď odberateľ nie je spotrebiteľ.
          </li>
        </ul>
        <p>
          Omeškanie (§ 286 BGB) sa počíta od dňa po odoslaní prvej upomienky; podnikateľ je v
          omeškaní najneskôr 30 dní po splatnosti aj bez upomienky. Za podnikateľa Faktero považuje
          odberateľa s IČO, Steuernummer alebo USt-IdNr. na faktúre. Základnú sadzbu (Basiszinssatz)
          vyhlasuje Bundesbank k 1. januáru a 1. júlu — Faktero ju má zapísanú, novú hodnotu
          dopĺňame po vyhlásení.
        </p>
        <p>
          Upomienku si pred odoslaním pozriete a môžete ju upraviť. Ak máte v nastaveniach vlastnú
          šablónu upomienky, Faktero ju použije tak, ako je, a úroky do nej nedopĺňa.
        </p>
      </>
    ),
  },
  {
    id: "nie-pre-de",
    title: "Čo pre firmy v Nemecku nie je",
    body: (
      <>
        <p>
          Niektoré agendy stoja na slovenských predpisoch a v Nemecku by firme skôr uškodili. Pre
          nemeckú firmu ich Faktero v menu neukazuje a na ich adrese vysvetlí prečo:
        </p>
        <ul>
          <li>
            <strong>Pokladňa.</strong> Elektronická pokladnica musí mať v Nemecku certifikovaný
            bezpečnostný modul TSE a byť nahlásená Finanzamtu (§ 146a AO, KassenSichV). Pokladňa vo
            Fakture je postavená na slovenskej eKase a TSE nemá.
          </li>
          <li>
            <strong>Kniha jázd.</strong> Nemecký Finanzamt uzná Fahrtenbuch len vedené priebežne a
            tak, aby sa zápisy nedali dodatočne nepozorovane meniť. Kniha jázd vo Fakture jazdy
            opraviť dovoľuje, preto by ju Finanzamt mohol odmietnuť.
          </li>
          <li>
            <strong>Zamestnanci.</strong> Agenda je stavaná na slovenské pracovné právo a mzdy;
            nemecké mzdy (Lohnsteuer, sociálne poistenie) nepozná.
          </li>
        </ul>
        <p>
          Bločky a prijaté doklady nemecká firma používa normálne — fotku bločku Faktero prečíta s
          nemeckými sadzbami 19 % a 7 %.
        </p>
      </>
    ),
  },
  {
    id: "co-nie-je",
    title: "Čo zatiaľ nie je",
    body: (
      <>
        <ul>
          <li>
            <strong>Mesačný kurz BMF.</strong> Daň z faktúry v cudzej mene Faktero prepočíta denným
            kurzom ECB. § 16 Abs. 6 UStG predpisuje mesačný priemerný kurz BMF; denný kurz smiete
            použiť len s povolením Finanzamtu.
          </li>
          <li>
            <strong>Podanie cez ELSTER.</strong> UStVA ani iné priznania Faktero do ELSTER
            neodosiela.
          </li>
          <li>
            <strong>Zusammenfassende Meldung (ZM).</strong> Súhrnný výkaz dodaní do EÚ pre BZSt
            Faktero pre nemeckú firmu nezostavuje.
          </li>
          <li>
            <strong>Vyhľadanie v Handelsregister.</strong> Údaje nemeckej firmy ani odberateľa sa
            podľa čísla nedoplnia — zadávajú sa ručne.
          </li>
          <li>
            <strong>Nemecké banky.</strong> Pripojenie nemeckých bánk na sťahovanie pohybov zatiaľ
            nie je; úhrady sa dajú párovať z účtov, ktoré Faktero pripojiť vie.
          </li>
          <li>
            <strong>Odosielanie e-faktúr.</strong> XRechnung a ZUGFeRD Faktero vyrobí, ale cez
            Peppol ani na portály úradov ich neodosiela.
          </li>
        </ul>
        <p>
          Faktero vám pripraví doklady a podklady; za správnosť priznania a účtovníctva zodpovedá
          firma, preto nastavenie DATEV a prvé priznania prejdite s daňovým poradcom.
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <PrelozenyManual
      category="Pomoc · Účtovníctvo"
      title="Firmy v Nemecku"
      intro={
        <p>
          Firma so sídlom v Nemecku: režim DPH a hranice Kleinunternehmer, nemecká faktúra,
          e-faktúra ZUGFeRD a XRechnung, export do DATEV a prehľad UStVA.
        </p>
      }
      sections={sections}
    />
  );
}
