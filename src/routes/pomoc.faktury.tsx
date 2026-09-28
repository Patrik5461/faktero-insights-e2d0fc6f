import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";
import { VideoNavodPlayer } from "@/components/faktero/VideoNavodPlayer";
import { videoJsonLd, videoNavod } from "@/lib/faktero/video-navody";

const VIDEO_PRVA_FAKTURA = videoNavod("vytvorenie-prvej-faktury");
const VIDEO_UHRADENA = videoNavod("oznacenie-uhradenej-faktury");

export const Route = createFileRoute("/pomoc/faktury")({
  head: () => ({
    meta: [
      { title: "Pomoc — Faktúry — Faktero" },
      {
        name: "description",
        content: "Ako vytvoriť, vygenerovať PDF, odoslať a označiť faktúru za uhradenú vo Faktere.",
      },
      { property: "og:title", content: "Pomoc — Faktúry — Faktero" },
      { property: "og:description", content: "Návod na vystavovanie a správu faktúr vo Faktere." },
      { property: "og:url", content: "https://faktero.sk/pomoc/faktury" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/faktury" }],
    scripts: [VIDEO_PRVA_FAKTURA, VIDEO_UHRADENA]
      .filter((v) => v !== undefined)
      .map((v) => ({ type: "application/ld+json", children: JSON.stringify(videoJsonLd(v)) })),
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "vytvorenie",
    title: "Ako vytvoriť faktúru",
    body: (
      <>
        {VIDEO_PRVA_FAKTURA && (
          <VideoNavodPlayer video={VIDEO_PRVA_FAKTURA} className="not-prose mb-5" />
        )}
        <ol>
          <li>
            V ľavom menu otvorte <strong>Fakturácia → Nová faktúra</strong> (alebo hore vpravo{" "}
            <strong>Vytvoriť → Nová faktúra</strong>).
          </li>
          <li>
            V poli <strong>Odberateľ</strong> začnite písať názov alebo IČO a vyberte firmu zo
            zoznamu. Nového odberateľa pridáte tlačidlom <strong>Vytvoriť nového odberateľa</strong>
            .
          </li>
          <li>
            Dátum vystavenia a dodania sa vyplní sám. Splatnosť nastavíte jedným klikom na{" "}
            <strong>7d</strong>, <strong>14d</strong> alebo <strong>30d</strong>.
          </li>
          <li>
            Vyplňte <strong>Text nad položkami</strong> — je povinný a hovorí, čo sa fakturuje
            (napríklad „Nájomné za september 2026 podľa zmluvy č. 4/2021“). Vytlačí sa nad
            tabuľkou položiek.
          </li>
          <li>
            Pridajte položky — ručne (názov, množstvo, cena, sadzba DPH) alebo cez{" "}
            <strong>Z katalógu</strong>. Sumu bez DPH, DPH aj sumu na úhradu Faktero prepočíta
            hneď. <strong>Položky povinné nie sú</strong>: doklad môže znieť len na text nad nimi.
            Riadok, ktorý má sumu, ale nemá názov, faktúru nepustí — aby sa suma ticho nestratila.
          </li>
          <li>
            Kliknite na <strong>Vystaviť faktúru</strong>. Otvorí sa detail faktúry, odkiaľ ju
            odošlete e-mailom alebo vygenerujete PDF.
          </li>
        </ol>
        <p>Číslovanie sa generuje automaticky podľa nastavenej rady vo firme.</p>
      </>
    ),
  },
  {
    id: "pdf",
    title: "Ako vygenerovať PDF",
    body: (
      <>
        <p>
          Na detaile faktúry kliknite na <strong>Vygenerovať PDF</strong>. Ak ešte neexistuje,
          Faktero ho vytvorí automaticky a uloží do priloženého úložiska.
        </p>
        <p>
          PDF obsahuje vaše logo, IBAN, variabilný symbol a{" "}
          <strong>QR kód na platbu prevodom</strong>. Zákazník ho naskenuje v mobilnom bankovníctve
          a nemusí prepisovať čísla.
        </p>
      </>
    ),
  },
  {
    id: "email",
    title: "Ako odoslať faktúru emailom",
    body: (
      <>
        <ol>
          <li>
            Na detaile faktúry kliknite na <strong>Odoslať emailom</strong>.
          </li>
          <li>Upravte predmet a sprievodnú správu (môžete použiť šablónu z nastavení firmy).</li>
          <li>Faktero priloží PDF a odošle správu cez Resend.</li>
        </ol>
        <p>
          V PDF je aj <strong>QR kód na platbu</strong>, takže zákazník nemusí prepisovať IBAN ani
          variabilný symbol — naskenuje ho v mobilnom bankovníctve.
        </p>
      </>
    ),
  },
  {
    id: "uhradena",
    title: "Ako označiť faktúru ako uhradenú",
    body: (
      <>
        {VIDEO_UHRADENA && <VideoNavodPlayer video={VIDEO_UHRADENA} className="not-prose mb-5" />}
        <p>Existujú tri spôsoby:</p>
        <ul>
          <li>
            <strong>Sama z banky:</strong> keď je banka pripojená, platba sa spáruje podľa
            variabilného symbolu a sumy a faktúra sa označí za uhradenú (
            <Link to="/pomoc/banka">párovanie úhrad</Link>).
          </li>
          <li>
            <strong>Z bankového výpisu:</strong> nahratý výpis sa spáruje rovnako ako živé
            transakcie.
          </li>
          <li>
            <strong>Manuálne:</strong> na detaile faktúry otvorte menu <em>…</em> vpravo hore a
            vyberte <em>Označiť ako uhradenú</em>.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "uhrada-od-zakaznika",
    title: "Ako od zákazníka dostať peniaze",
    body: (
      <>
        <p>
          Faktúra ide zákazníkovi s{" "}
          <strong>IBAN-om, variabilným symbolom a QR kódom na platbu</strong>, takže si ju v
          mobilnom bankovníctve naskenuje a neprepisuje čísla ručne.
        </p>
        <p>
          Keď peniaze prídu, <Link to="/bankove-ucty/transakcie">párovanie úhrad z banky</Link>{" "}
          faktúru označí za uhradenú samo — netreba to preklikávať. Ak platba dorazila inak
          (hotovosť, iný účet), označíte ju ručne na detaile faktúry.
        </p>
        <p>
          <strong>Platby kartou pre vašich zákazníkov Faktero neponúka.</strong> Aby firma mohla
          prijímať karty pod vlastným účtom, potrebuje poskytovateľ platobnej brány zmluvu, ktorá to
          na spoločnej doméne umožňuje — kým ju nemáme, funkciu nesľubujeme. Netýka sa to platenia{" "}
          <Link to="/pomoc/predplatne">predplatného za Faktero</Link>, to cez bránu funguje bežne.
        </p>
      </>
    ),
  },
  {
    id: "zalohove",
    title: "Zálohové faktúry (proforma)",
    body: (
      <>
        <p>
          Zálohová faktúra je <strong>výzva na zaplatenie preddavku</strong>, nie daňový doklad.
          Vystavíte ju v <Link to="/zalohove">Zálohové faktúry → Nová zálohová faktúra</Link>.
        </p>
        <p>
          Má <strong>vlastnú číselnú radu</strong> (<code>ZF…</code>), aby v rade riadnych faktúr
          nevznikali diery. Do <strong>obratu ani do DPH</strong> sa nepočíta — plnenie nastáva až
          riadnou faktúrou.
        </p>
        <p>
          Keď zákazník zálohu zaplatí, vystavíte <strong>riadnu faktúru</strong> a v nej zálohu
          odpočítate: v novej faktúre je na to voľba <em>Pridať zálohovú faktúru</em>. Zaplatená
          časť sa odráta, takže zákazník doplatí len rozdiel a tá istá suma nie je vo výnosoch
          dvakrát. V zozname zálohových faktúr potom vidno, ktoré sú už zúčtované.
        </p>
        <p>
          <strong>Nemusíte si pamätať, že záloha existuje.</strong> Keď na faktúre vyberiete
          odberateľa, ktorý má zaplatenú a ešte nezúčtovanú zálohu, Faktero to napíše nad položkami
          a jedným tlačidlom ju odpočíta. Bez odpočtu by zákazník to isté plnenie zaplatil druhýkrát.
        </p>
        <p>
          Na jednej faktúre môže byť <strong>aj viac záloh</strong> — pri etapovej dodávke sa
          pripoja postupne a doklad ukáže každú zvlášť aj ich súčet. Každá záloha sa dá minúť len
          raz; keď z nej odpočítate len časť, zvyšok sa ponúkne pri ďalšej faktúre.
        </p>
      </>
    ),
  },
  {
    id: "doklad-k-platbe",
    title: "Daňový doklad k prijatej platbe",
    body: (
      <>
        <p>
          Ak ste <strong>platiteľ DPH</strong>, prijatím zálohy vám vzniká daňová povinnosť — ešte
          pred dodaním. Do 15 dní od pripísania peňazí musíte vystaviť <strong>daňový doklad k
          prijatej platbe</strong>; samotná zálohová faktúra na to nestačí, tá daňový doklad nie je.
        </p>
        <p>
          Otvorte zaplatenú zálohovú faktúru a kliknite na <strong>Vystaviť daňový doklad</strong>.
          Doklad prevezme jej položky a sadzby, dátumom dodania je <strong>deň prijatia platby</strong>{" "}
          a dostane vlastnú radu čísel (<code>DDP…</code>). Kým záloha nie je uhradená, tlačidlo sa
          neponúka — nie je z čoho daň priznať.
        </p>
        <p>
          Daň sa tak prizná v období, keď peniaze prišli. Na <strong>vyúčtovacej faktúre</strong> sa
          už tá istá daň druhýkrát nepočíta: Faktero si zdanenú zálohu odpočíta po sadzbách, takže v{" "}
          <Link to="/uctovnictvo/vykazy">priznaní a kontrolnom výkaze</Link> ostane len rozdiel. Do
          obratu doklad k platbe nevstupuje — výnosom je až dodanie.
        </p>
        <p>
          Pri <strong>čiastočnej platbe</strong> zadáte prijatú sumu a položky sa rozpočítajú
          rovnakým pomerom, aby sedel rozpis po sadzbách. Ku každej zálohe patrí jeden doklad.
        </p>
      </>
    ),
  },
  {
    id: "jazyk",
    title: "Faktúra v cudzom jazyku",
    body: (
      <>
        <p>
          Doklad sa dá vystaviť v <strong>slovenčine, češtine, angličtine, nemčine alebo
          maďarčine</strong>. Jazyk vyberiete na faktúre v časti <em>Rozšírené nastavenia</em>, a
          keď ho nastavíte odberateľovi v jeho karte, predvolí sa na všetkých jeho ďalších
          faktúrach.
        </p>
        <p>
          Prekladajú sa <strong>popisky</strong> — nadpis dokladu, hlavičky stĺpcov, dátumy, spôsob
          úhrady, súčty a platobné údaje. <strong>Názvy položiek, poznámky a adresy ostávajú tak,
          ako ste ich napísali</strong>; tie Faktero neprekladá, lebo by menilo obsah dokladu.
        </p>
        <p>
          Sumy sa píšu podľa zvyklostí jazyka — Nemec číta <em>1.234,56</em>, Angličan{" "}
          <em>1,234.56</em>. Vety o prenose daňovej povinnosti sú preložené, ale odkaz na slovenský
          paragraf v nich ostáva: ten robí doklad platným.
        </p>
        <p>
          Jazyk sa uloží k faktúre, takže aj o rok sa PDF vygeneruje rovnako. Mena je nezávislá —
          faktúru v eurách môžete poslať po nemecky a naopak.
        </p>
      </>
    ),
  },
  {
    id: "opakovane",
    title: "Ako fungujú opakované faktúry",
    body: (
      <>
        <p>
          V sekcii <strong>Fakturácia → Opakované faktúry</strong> nastavíte šablónu, frekvenciu
          (mesačne/štvrťročne/ročne) a dátum spustenia.
        </p>
        <ul>
          <li>Faktero každý deň ráno generuje faktúry, ktoré majú spadnúť na daný deň.</li>
          <li>
            Vygenerovaná faktúra môže byť automaticky odoslaná emailom, ak je zapnuté{" "}
            <em>Auto-send</em>.
          </li>
          <li>
            História generovania je v záložke <em>Logy</em> pri danom opakovaní.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "bez-signalu",
    title: "Fakturovanie v mobile bez signálu",
    body: (
      <>
        <p>
          V mobilnej aplikácii sa faktúra dá vystaviť aj bez internetu. Sú na to dve cesty a líšia
          sa v tom, čo zákazník dostane priamo na mieste.
        </p>
        <p>
          <strong>Odložená faktúra</strong> je predvolená a netreba nič nastavovať. Faktúru vypíšete
          bez signálu, uloží sa do telefónu a odošle sa sama, len čo je pripojenie — pri otvorení
          aplikácie alebo obrazovky <em>Vystavené faktúry</em>. Číslo jej pridelí Faktero až vtedy,
          takže sa zákazníkovi na mieste nedá nadiktovať.
        </p>
        <p>
          <strong>Vydávanie s číslom</strong> zapnete v aplikácii v <strong>Účte</strong>. Telefón
          si v signáli vypýta päť čísel dopredu a bez signálu z nich vydáva — faktúra má číslo hneď
          a dá sa odovzdať alebo nadiktovať. Hodí sa remeselníkovi po oprave alebo predaju z auta.
        </p>
        <p>
          Rezervované číslo je vaše a nikomu inému sa nepridelí. Ak ho nepoužijete, po dvoch
          týždňoch prepadne a vráti sa do radu — Faktero prideľuje najnižšie voľné číslo, takže
          dieru samo zaplní. Trvalé diery v číselnom rade tým nevznikajú.
        </p>
        <p>
          <strong>Pozor:</strong> PDF vytvára server, takže aj pri vydávaní s číslom príde až so
          signálom. Na mieste odovzdáte číslo a sumu, nie hotový doklad.
        </p>
        <p>
          Aby to fungovalo, musí mať telefón uložených odberateľov — aplikácia si ich ukladá pri
          každom spustení s internetom. Po inštalácii ju teda raz otvorte v dosahu signálu.
        </p>
      </>
    ),
  },
  {
    id: "oprava-v-mobile",
    title: "Oprava a zmazanie faktúry v mobile",
    body: (
      <>
        <p>
          Preklep sa nájde aj vtedy, keď je počítač ďaleko. V aplikácii otvorte{" "}
          <strong>Vystavené faktúry</strong>, ťuknite na faktúru a dole sú{" "}
          <strong>Upraviť faktúru</strong> a <strong>Zmazať faktúru</strong>. Opraviť sa dajú
          položky, dátumy, spôsob úhrady aj poznámka; <strong>odberateľ sa nemení</strong> — na to
          je web, rovnako ako pri oprave na počítači.
        </p>
        <p>
          <strong>Zmazanie je mäkké.</strong> Faktúra zmizne zo zoznamu, ale ostáva v histórii a jej
          číslo je ďalej obsadené, takže v číselnom rade nevznikne diera.
        </p>
        <p>Dve veci aplikácia neurobí a povie to:</p>
        <ul>
          <li>
            <strong>Stornovanú faktúru</strong> už neopraví — tá sa len archivuje.
          </li>
          <li>
            <strong>Faktúru s položkami zo skladu</strong> pošle na počítač. Pri nich totiž treba
            dopočítať rozdiel v zásobách a to sa na malej obrazovke robiť nemá.
          </li>
        </ul>
        <p>
          Oprava potrebuje pripojenie — na rozdiel od vystavenia sa <strong>neodkladá</strong> do
          telefónu. Menili by sme doklad, ktorý už na serveri žije, a prepísali by sme aj to, čo
          medzitým zmenil kolega.
        </p>
      </>
    ),
  },
  {
    id: "ucet-na-fakture",
    title: "Na ktorý účet majú prísť peniaze",
    body: (
      <>
        <p>
          Firma môže mať viac bankových účtov — spravujú sa v{" "}
          <Link to="/firma">Nastaveniach firmy</Link>. Pri vystavovaní sa účet dá prehodiť a faktúra
          si ho zapamätá, takže na PDF, v QR kóde aj v upomienke je ten, ktorý ste vybrali, aj keď
          neskôr zmeníte predvolený účet.
        </p>
      </>
    ),
  },
  {
    id: "hotovost",
    title: "Platba v hotovosti",
    body: (
      <>
        <p>
          Keď ako spôsob platby vyberiete hotovosť, suma sa zaokrúhli na <strong>päť centov</strong>{" "}
          — jedno- a dvojcentové mince sa od 1. 7. 2022 nevydávajú a zákon o cenách to pri hotovosti
          ukladá.
        </p>
        <p>
          Nad <strong>5 000 €</strong> sa objaví upozornenie: taká platba v hotovosti je medzi
          podnikateľmi zakázaná (zákon č. 394/2012 Z. z.). Medzi fyzickými osobami mimo podnikania
          je strop 15 000 €.
        </p>
      </>
    ),
  },
  {
    id: "do-zahranicia",
    title: "Faktúra do zahraničia",
    body: (
      <>
        <p>Tri rôzne situácie, tri rôzne nastavenia:</p>
        <ul>
          <li>
            <strong>Firme v EÚ s IČ DPH</strong> — prenesenie daňovej povinnosti, dodanie bez dane.
            Vyberie sa aj druh plnenia (tovar, služba, trojstranný obchod) kvôli súhrnnému výkazu a
            odberateľovo IČ DPH sa dá overiť vo VIES priamo z faktúry.
          </li>
          <li>
            <strong>Spotrebiteľovi v EÚ</strong> — zaškrtne sa „Predaj spotrebiteľovi v EÚ (OSS)" a
            vyberie štát; sadzby položiek sa prepnú na sadzby jeho štátu. Viac v{" "}
            <Link to="/pomoc/oss">manuáli k OSS</Link>.
          </li>
          <li>
            <strong>Mimo EÚ</strong> — vývoz oslobodený podľa § 47.
          </li>
        </ul>
      </>
    ),
  },
];

function Page() {
  return (
    <HelpArticle
      category="Pomoc · Faktúry"
      title="Faktúry vo Faktere"
      intro={<p>Všetko, čo potrebujete vedieť o vystavovaní, odosielaní a evidencii faktúr.</p>}
      sections={sections}
    />
  );
}
