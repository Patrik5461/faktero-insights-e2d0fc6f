import { createFileRoute, Link } from "@tanstack/react-router";
import { HelpArticle, HelpSection } from "@/components/faktero/HelpArticle";

export const Route = createFileRoute("/pomoc/api")({
  head: () => ({
    meta: [
      { title: "Pomoc — API — Faktero" },
      { name: "description", content: "Ako používať Faktero API: kľúče, test/live režim, vytvorenie faktúry, webhooky." },
      { property: "og:title", content: "Pomoc — API — Faktero" },
      { property: "og:description", content: "Návod pre vývojárov na prácu s Faktero API." },
      { property: "og:url", content: "https://faktero.sk/pomoc/api" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc/api" }],
  }),
  component: Page,
});

const sections: HelpSection[] = [
  {
    id: "co-je",
    title: "Čo je Faktero API",
    body: (
      <>
        <p>Faktero API je REST rozhranie, ktoré umožňuje vašej aplikácii vytvárať faktúry, spravovať odberateľov a počúvať na udalosti cez webhooky.</p>
        <p>Všetky endpointy bežia pod <code>https://www.faktero.sk/api/v1</code> a používajú JSON.</p>
      </>
    ),
  },
  {
    id: "kluc",
    title: "Kde nájdem API kľúč",
    body: (
      <>
        <ol>
          <li>Otvorte <Link to="/nastavenia">Nastavenia</Link> → <strong>API kľúče</strong>.</li>
          <li>Kliknite na <strong>Vytvoriť nový kľúč</strong> a pomenujte ho (napr. „Eshop produkcia").</li>
          <li>Kľúč sa zobrazí <em>iba raz</em> — uložte ho na bezpečnom mieste.</li>
        </ol>
        <p>Kľúč posielajte v hlavičke <code>Authorization: Bearer fkt_…</code>.</p>
      </>
    ),
  },
  {
    id: "test-live",
    title: "Test a live režim",
    body: (
      <>
        <p>Pri vytváraní kľúča vyberáte režim:</p>
        <ul>
          <li><strong>Test (sandbox)</strong> — faktúry sa nezarátavajú do limitu a nemajú právne účinky.</li>
          <li><strong>Live (produkcia)</strong> — reálne faktúry, ktoré sa rátajú do mesačného limitu plánu.</li>
        </ul>
        <p>Test kľúče majú prefix <code>fkt_test_</code>, live kľúče <code>fkt_live_</code>.</p>
      </>
    ),
  },
  {
    id: "vytvorenie",
    title: "Vytvorenie faktúry cez API",
    body: (
      <>
        <p>Príklad cURL volania:</p>
        <pre className="rounded-md border border-border bg-muted p-3 text-xs overflow-x-auto">
{`curl -X POST https://www.faktero.sk/api/v1/invoices \\
  -H "Authorization: Bearer fkt_live_…" \\
  -H "Content-Type: application/json" \\
  -d '{
    "customer": { "name": "ACME s.r.o.", "ico": "12345678" },
    "items": [
      { "name": "Konzultácia", "quantity": 2, "unit_price": 50, "vat_rate": 23 }
    ],
    "due_date": "2026-07-01"
  }'`}
        </pre>
        <p>Odpoveď obsahuje <code>id</code>, <code>invoice_number</code> a URL na PDF.</p>
      </>
    ),
  },
  {
    id: "webhooky",
    title: "Webhooky",
    body: (
      <>
        <p>Webhooky pošlú HTTP POST na vašu URL, keď nastane udalosť:</p>
        <ul>
          <li><code>invoice.created</code></li>
          <li><code>invoice.sent</code></li>
          <li><code>invoice.paid</code></li>
          <li><code>invoice.cancelled</code></li>
        </ul>
        <p>Každý webhook je podpísaný hlavičkou <code>X-Faktero-Signature</code> (HMAC SHA-256 z tela správy a tajného kľúča webhooku). Vždy podpis overte pred spracovaním.</p>
      </>
    ),
  },
  {
    id: "dokumentacia",
    title: "Kompletná dokumentácia",
    body: (
      <p>
        Úplný zoznam endpointov, parametrov a chybových kódov nájdete v{" "}
        <Link to="/docs/api">API dokumentácii</Link>.
      </p>
    ),
  },
];

function Page() {
  return (
    <HelpArticle
      category="Pomoc · API"
      title="Faktero API pre vývojárov"
      intro={<p>REST API na automatizáciu vystavovania faktúr a integráciu s vašou aplikáciou.</p>}
      sections={sections}
    />
  );
}