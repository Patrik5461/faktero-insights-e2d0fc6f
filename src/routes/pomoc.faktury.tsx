import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";

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
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "vytvorenie",
    title: "Ako vytvoriť faktúru",
    body: (
      <>
        <ol>
          <li>
            V ľavom menu otvorte <strong>Faktúry → Nová faktúra</strong>.
          </li>
          <li>Vyberte odberateľa zo zoznamu alebo vytvorte nového.</li>
          <li>Pridajte položky — ručne alebo zo skladu/produktov.</li>
          <li>Skontrolujte DPH, dátum splatnosti a variabilný symbol.</li>
          <li>
            Uložte ako <em>Koncept</em> alebo rovno <em>Odoslať</em>.
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
          Na detaile faktúry kliknite na <strong>Stiahnuť PDF</strong>. Ak ešte neexistuje, Faktero
          ho vytvorí automaticky a uloží do priloženého úložiska.
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
            <strong>Manuálne:</strong> na detaile faktúry → <em>Pridať platbu</em> alebo{" "}
            <em>Označiť ako uhradenú</em>.
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
      </>
    ),
  },
  {
    id: "opakovane",
    title: "Ako fungujú opakované faktúry",
    body: (
      <>
        <p>
          V sekcii <strong>Faktúry → Opakované</strong> nastavíte šablónu, frekvenciu
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
