import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";

export const Route = createFileRoute("/pomoc/exporty")({
  head: () => ({
    meta: [
      { title: "Pomoc — Exporty a importy — Faktero" },
      {
        name: "description",
        content:
          "Účtovné exporty pre účtovníčku a prenos dát zo SuperFaktúry, Money S3, Omega, iDoklad a KROS do Fakera.",
      },
      { property: "og:url", content: "https://faktero.sk/pomoc/exporty" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/exporty" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "exporty",
    title: "Účtovné exporty",
    body: (
      <>
        <p>
          V <Link to="/exporty">Účtovníctvo → Účtovné exporty</Link> pripravíte podklady pre
          účtovníčku za zvolené obdobie — vydané faktúry, prijaté faktúry, doklady.
        </p>
        <p>
          Každý export sa uloží do <strong>histórie</strong>, takže sa dá stiahnuť znova a je
          vidieť, čo a kedy bolo odovzdané.
        </p>
        <p>
          Pred exportom skontrolujte <Link to="/pomoc/dph">prehľad DPH</Link> a obdobie potom{" "}
          <Link to="/pomoc/uzavierka">uzamknite</Link>.
        </p>
      </>
    ),
  },
  {
    id: "importy",
    title: "Prechod z iného systému",
    body: (
      <>
        <p>Faktero vie prevziať dáta zo SuperFaktúry, Money S3, Omega, iDokladu a KROSu.</p>
        <p>
          Import nájdete v <Link to="/importy">Účtovníctvo → Importy</Link>. Prenášajú sa
          odberatelia, produkty a faktúry — podľa toho, čo daný systém vie vyviezť.
        </p>
        <p>
          Po importe skontrolujte <strong>číslovanie faktúr</strong>, aby nové doklady nadviazali na
          staré a nezačali od jednotky.
        </p>
      </>
    ),
  },
  {
    id: "superfaktura",
    title: "Import zo SuperFaktúry krok za krokom",
    body: (
      <>
        <ol>
          <li>
            Vo SuperFaktúre otvorte <strong>Nástroje → Export agendy</strong>.
          </li>
          <li>Vyberte obdobie a stiahnite export.</li>
          <li>
            Dostanete <strong>ZIP</strong>, v ktorom je každá faktúra ako samostatný súbor{" "}
            <code>.isdoc</code>. Nahrajte ho do{" "}
            <Link to="/importy/superfaktura">Import zo SuperFaktúry</Link> celý — rozbaľovať ho
            netreba.
          </li>
          <li>
            Faktero stĺpce rozpozná samo a ukáže náhľad: koľko faktúr, odberateľov a položiek sa
            naimportuje a za akú sumu. Skontrolujte ho a potvrďte.
          </li>
        </ol>
        <p>
          Prijímame aj samotný <code>.isdoc</code>, Excel, CSV a XML. Ak by rozpoznanie niektorý
          stĺpec netrafilo, dá sa priradiť ručne — ale pri exporte zo SuperFaktúry by to nemalo byť
          treba.
        </p>
        <p>
          <strong>Čo sa prenesie:</strong> číslo faktúry a variabilný symbol, dátumy vystavenia,
          dodania a splatnosti, mena, sumy bez DPH aj s DPH, poznámka, odberateľ s IČO, DIČ, IČ DPH
          a adresou, a všetky položky s množstvom, mernou jednotkou, cenou a sadzbou DPH.
        </p>
      </>
    ),
  },
  {
    id: "ostatne-systemy",
    title: "Money S3, iDoklad, Omega a KROS",
    body: (
      <>
        <p>Každý systém vyváža inak, preto má vlastnú stránku aj vlastný návod:</p>
        <ul>
          <li>
            <strong>Money S3</strong> (Seyfor) — XML dátový balík <code>MoneyData</code> z{" "}
            <em>XML prenosov</em>. Prenesú sa faktúry vydané aj prijaté vrátane položiek, odberateľa
            s adresou a faktúr v cudzej mene.
          </li>
          <li>
            <strong>iDoklad</strong> — CSV alebo XLSX zo zoznamu faktúr. iDoklad vyváža tie stĺpce,
            ktoré máte práve zobrazené, takže si pred exportom zapnite aspoň číslo dokladu,
            odberateľa, dátumy a sumy.
          </li>
          <li>
            <strong>Omega a KROS</strong> — CSV alebo XML. Zvládneme kódovanie Windows-1250 aj
            UTF-8, dátumy v tvare <code>04.03.2025</code> aj <code>2025-03-04</code> a desatinnú
            čiarku.
          </li>
          <li>
            <strong>Pohoda</strong> — XML z <em>Súbor → Dátová komunikácia → XML import/export</em>,
            alebo export do ISDOC. Prečítame aj súbor, ktorý Pohoda vydá pri exporte (
            <code>responsePack</code>), nielen ten importný.
          </li>
          <li>
            <strong>mPohoda</strong> — nie je to ten istý formát ako Pohoda. mPohoda je cloudová
            aplikácia a dáta vydáva cez svoje rozhranie ako <strong>JSON</strong>. Nahrajte ho na tú
            istú stránku, formát rozpoznáme sami.
          </li>
        </ul>
        <p>
          Vo všetkých prípadoch Faktero stĺpce rozpozná samo a pred zápisom ukáže náhľad: koľko
          faktúr, odberateľov a položiek sa naimportuje a za akú sumu.
        </p>
        <p>
          <strong>Stav faktúry</strong> sa prekladá — „Uhradená", „Zaplacena" aj číselný stav zo
          SuperFaktúry skončia ako uhradená faktúra. Keď je stav nejasný, doklad ostane vystavený;
          označiť cudziu faktúru za zaplatenú omylom by bolo horšie.
        </p>
      </>
    ),
  },
  {
    id: "co-neprenesieme",
    title: "Čo import neprenesie",
    body: (
      <>
        <p>
          Prenášajú sa <strong>faktúry, ich položky a odberatelia</strong>. Neprenášajú sa úhrady a
          bankové pohyby, sklad a jeho stavy, cenníky ani prílohy a PDF pôvodných faktúr.
        </p>
        <p>
          Sklad si po prechode založte cez <Link to="/sklad/import">Sklad → Import</Link>, bankový
          účet cez <Link to="/pomoc/banka">pripojenie banky</Link>.
        </p>
      </>
    ),
  },
  {
    id: "co-vyvazame",
    title: "Čo vieme vyviezť my",
    body: (
      <>
        <p>
          Z Fakera sa faktúry vyvážajú do <strong>Pohody</strong> ako XML dátový balík — vrátane
          položiek, odberateľa, dobropisov a súčtov rozpísaných po sadzbách DPH.
        </p>
        <p>
          Ďalej vieme vyviezť do <strong>KROS Omegy</strong> (textový súbor R00/R01/R02 v kódovaní
          Windows-1250) — <strong>ten istý súbor číta aj ALFA plus</strong>, jej import sa volá
          „Import faktúr z Omegy". A do <strong>Money S3</strong> ako dátový balík{" "}
          <code>MoneyData</code>.
        </p>
        <p>
          Formát si vyberiete v <Link to="/exporty">Účtovných exportoch</Link> nad zoznamom faktúr.
          Každý export sa uloží do histórie, takže sa dá stiahnuť znova.
        </p>
      </>
    ),
  },
  {
    id: "sklad",
    title: "Import a export skladu",
    body: (
      <>
        <p>
          Skladové karty sa hromadne zakladajú cez <Link to="/sklad/import">Sklad → Import</Link> z
          CSV a vyvážajú tlačidlom <strong>Export skladu CSV</strong>. Podrobnosti sú v{" "}
          <Link to="/pomoc/sklad">manuáli k skladu</Link>.
        </p>
      </>
    ),
  },
  {
    id: "api",
    title: "Napojenie vlastného systému",
    body: (
      <>
        <p>
          Ak potrebujete prenášať dáta priebežne a nie súborom, použite{" "}
          <Link to="/pomoc/api">API a webhooky</Link>.
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <HelpArticle
      category="Pomoc · Účtovníctvo"
      title="Exporty a importy"
      intro={<p>Podklady pre účtovníčku a prenos dát z iného fakturačného systému.</p>}
      sections={sections}
    />
  );
}
