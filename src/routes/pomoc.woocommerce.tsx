import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";

export const Route = createFileRoute("/pomoc/woocommerce")({
  head: () => ({
    meta: [
      { title: "Pomoc — WooCommerce — Faktero" },
      {
        name: "description",
        content:
          "Doplnok Faktero pre WooCommerce: faktúry z objednávok e-shopu vznikajú samy, aj s PDF pre zákazníka.",
      },
      { property: "og:title", content: "Pomoc — WooCommerce — Faktero" },
      {
        property: "og:description",
        content: "Ako napojiť e-shop na WooCommerce na Faktero, aby sa faktúry vystavovali samy.",
      },
      { property: "og:url", content: "https://faktero.sk/pomoc/woocommerce" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/woocommerce" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "co-robi",
    title: "Čo doplnok robí",
    body: (
      <>
        <p>
          Z každej objednávky vo WooCommerce vystaví faktúru vo Fakteri — bez prepisovania. Faktúra
          vznikne, keď objednávka prejde do zvoleného stavu (predvolene <em>Spracováva sa</em>, teda
          po zaplatení kartou alebo po potvrdení platby prevodom).
        </p>
        <ul>
          <li>Položky, kupóny, doprava aj poplatky so sadzbami DPH podľa obchodu.</li>
          <li>Sumy na faktúre sedia na cent s objednávkou.</li>
          <li>Zaplatená objednávka má faktúru hneď uhradenú.</li>
          <li>
            Zákazník nájde odkaz na PDF v e-maile o objednávke aj vo svojom účte; vy v detaile
            objednávky.
          </li>
          <li>Pokladňa dostane polia IČO, DIČ a IČ DPH pre nákup na firmu.</li>
        </ul>
      </>
    ),
  },
  {
    id: "instalacia",
    title: "Inštalácia za päť minút",
    body: (
      <>
        <ol>
          <li>
            <a href="/doplnky/faktero-woocommerce.zip" download>
              Stiahnite doplnok
            </a>{" "}
            (súbor ZIP — nerozbaľujte ho).
          </li>
          <li>
            Vo Fakteri otvorte <Link to="/api-kluce">API kľúče</Link> (menu pod avatarom) a vytvorte{" "}
            <strong>Live</strong> kľúč. Faktúry sa budú vystavovať vo firme, v ktorej kľúč
            vytvoríte.
          </li>
          <li>
            Vo WordPresse: <em>Doplnky → Pridať nový → Nahrať doplnok</em>, vyberte stiahnutý ZIP a
            doplnok aktivujte.
          </li>
          <li>
            <em>WooCommerce → Nastavenia → Faktero</em>: vložte kľúč a uložte. Faktero hneď overí
            pripojenie a povie, či kľúč prijalo.
          </li>
        </ol>
        <p>
          Hotovo — ďalšia objednávka už faktúru dostane. Staršie objednávky vystavíte v detaile
          objednávky cez akciu <em>Vystaviť faktúru vo Fakteri</em>.
        </p>
      </>
    ),
  },
  {
    id: "nastavenia",
    title: "Nastavenia",
    body: (
      <>
        <ul>
          <li>
            <strong>Pri stave objednávky</strong> — kedy faktúra vznikne. Kto chce faktúru až po
            odoslaní tovaru, zvolí <em>Vybavená</em>.
          </li>
          <li>
            <strong>Zaplatené objednávky</strong> — faktúra zaplatenej objednávky je hneď uhradená a
            splatná dňom vystavenia. Nezaplatená dostane nastavenú splatnosť.
          </li>
          <li>
            <strong>Zrušená objednávka</strong> — môže stornovať svoju faktúru, ak ešte nie je
            zaplatená. Zaplatenú treba opraviť dobropisom vo Fakteri.
          </li>
          <li>
            <strong>Odkaz v e-maile</strong> a <strong>E-mail z Faktera</strong> — zákazník dostane
            odkaz na PDF v e-maile z obchodu, prípadne aj samostatný e-mail s faktúrou z Faktera.
          </li>
          <li>
            <strong>Poznámka na faktúre</strong> — predvolene „Objednávka č. {"{cislo}"}". Číslo
            objednávky sa navyše ukladá do faktúry samostatne a ide aj do eFaktúry.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "platby",
    title: "Spôsob úhrady na faktúre",
    body: (
      <>
        <ul>
          <li>
            <strong>Bankový prevod</strong> (BACS) — faktúra má platobné údaje a QR kód na
            zaplatenie.
          </li>
          <li>
            <strong>Dobierka</strong> — na faktúre je hotovosť a veta „Úhrada na dobierku".
          </li>
          <li>
            <strong>Platobné brány</strong> (karta, GoPay, Besteron, PayPal…) — karta; faktúra je po
            zaplatení hneď uhradená.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "problemy",
    title: "Keď faktúra nevznikne",
    body: (
      <>
        <p>
          Doplnok zapisuje všetko do <strong>poznámok objednávky</strong> — tam uvidíte číslo
          vystavenej faktúry aj dôvod, prečo nevznikla.
        </p>
        <ul>
          <li>
            Keď je Faktero chvíľu nedostupné, doplnok to sám skúsi znova po 5, 10, 20 a 40 minútach.
            Dvakrát faktúru nevystaví ani pri opakovaní.
          </li>
          <li>
            Neplatný kľúč alebo neaktívne predplatné doplnok nahlási v poznámke; po náprave použite
            akciu <em>Vystaviť faktúru vo Fakteri</em>.
          </li>
          <li>
            Objednávka so <strong>zápornou položkou</strong> (zľava pridaná iným doplnkom ako
            poplatok) sa automaticky nevystaví — faktúru treba spraviť ručne. Kupóny WooCommerce
            fungujú normálne.
          </li>
          <li>
            Polia IČO/DIČ/IČ DPH sa pridávajú do <strong>klasickej pokladne</strong>. Pokladňa z
            blokov ich zatiaľ nezobrazí; IČO z iných slovenských doplnkov pokladne doplnok načíta
            sám.
          </li>
        </ul>
      </>
    ),
  },
];

function Page() {
  return (
    <HelpArticle
      category="Pomoc · WooCommerce"
      title="Faktúry z e-shopu na WooCommerce"
      intro={
        <p>
          Doplnok pre WordPress, s ktorým sa faktúry z objednávok vystavujú vo Fakteri samy.{" "}
          <a href="/doplnky/faktero-woocommerce.zip" download>
            Stiahnuť doplnok (ZIP)
          </a>
        </p>
      }
      sections={sections}
    />
  );
}
