import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";

export const Route = createFileRoute("/pomoc/faktury")({
  head: () => ({
    meta: [
      { title: "Pomoc — Faktúry — Faktero" },
      { name: "description", content: "Ako vytvoriť, vygenerovať PDF, odoslať a označiť faktúru za uhradenú vo Faktere." },
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
          <li>V ľavom menu otvorte <strong>Faktúry → Nová faktúra</strong>.</li>
          <li>Vyberte odberateľa zo zoznamu alebo vytvorte nového.</li>
          <li>Pridajte položky — ručne alebo zo skladu/produktov.</li>
          <li>Skontrolujte DPH, dátum splatnosti a variabilný symbol.</li>
          <li>Uložte ako <em>Koncept</em> alebo rovno <em>Odoslať</em>.</li>
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
        <p>Na detaile faktúry kliknite na <strong>Stiahnuť PDF</strong>. Ak ešte neexistuje, Faktero ho vytvorí automaticky a uloží do priloženého úložiska.</p>
        <p>PDF obsahuje vaše logo, IBAN, QR kód pre bankový prevod a — ak ste vytvorili platobný odkaz — aj blok <em>Zaplatiť online</em> cez GoPay.</p>
        <p><strong>Tip:</strong> Po vytvorení platobného odkazu sa cached PDF zruší a pri ďalšom stiahnutí sa vygeneruje s aktuálnym odkazom.</p>
      </>
    ),
  },
  {
    id: "email",
    title: "Ako odoslať faktúru emailom",
    body: (
      <>
        <ol>
          <li>Na detaile faktúry kliknite na <strong>Odoslať emailom</strong>.</li>
          <li>Upravte predmet a sprievodnú správu (môžete použiť šablónu z nastavení firmy).</li>
          <li>Faktero priloží PDF a odošle správu cez Resend.</li>
        </ol>
        <p>Ak je pre faktúru aktívny platobný odkaz, do tela emailu sa automaticky doplní tlačidlo <em>Zaplatiť online</em>.</p>
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
          <li><strong>Automaticky:</strong> ak zákazník zaplatí cez GoPay, faktúra sa označí ako uhradená v okamihu prijatia notifikácie.</li>
          <li><strong>Cez bankovú integráciu:</strong> spárovaním platby s variabilným symbolom.</li>
          <li><strong>Manuálne:</strong> na detaile faktúry → <em>Pridať platbu</em> alebo <em>Označiť ako uhradenú</em>.</li>
        </ul>
      </>
    ),
  },
  {
    id: "gopay-link",
    title: "Ako funguje GoPay platobný odkaz",
    body: (
      <>
        <p>Po pripojení GoPay účtu (<Link to="/nastavenia/online-platby">Nastavenia → Online platby</Link>) sa na detaile faktúry objaví tlačidlo <strong>Vytvoriť platobný odkaz</strong>.</p>
        <ul>
          <li>Odkaz má tvar <code>https://www.faktero.sk/pay/{`{token}`}</code>.</li>
          <li>Skopírujte ho zákazníkovi, vložte do emailu alebo nechajte automaticky priložiť v PDF.</li>
          <li>Peniaze idú priamo na váš GoPay účet, Faktero si neúčtuje províziu.</li>
        </ul>
        <p>Viac v <Link to="/pomoc/online-platby/gopay">návode pre GoPay</Link>.</p>
      </>
    ),
  },
  {
    id: "opakovane",
    title: "Ako fungujú opakované faktúry",
    body: (
      <>
        <p>V sekcii <strong>Faktúry → Opakované</strong> nastavíte šablónu, frekvenciu (mesačne/štvrťročne/ročne) a dátum spustenia.</p>
        <ul>
          <li>Faktero každý deň ráno generuje faktúry, ktoré majú spadnúť na daný deň.</li>
          <li>Vygenerovaná faktúra môže byť automaticky odoslaná emailom, ak je zapnuté <em>Auto-send</em>.</li>
          <li>História generovania je v záložke <em>Logy</em> pri danom opakovaní.</li>
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