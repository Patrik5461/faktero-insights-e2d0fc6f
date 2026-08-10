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
          Každý export sa uloží do <strong>histórie</strong>, takže sa dá stiahnuť znova a je vidieť,
          čo a kedy bolo odovzdané.
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
          Import nájdete v <Link to="/importy">Účtovníctvo → Importy</Link>. Prenášajú sa odberatelia,
          produkty a faktúry — podľa toho, čo daný systém vie vyviezť.
        </p>
        <p>
          Po importe skontrolujte <strong>číslovanie faktúr</strong>, aby nové doklady nadviazali na
          staré a nezačali od jednotky.
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
