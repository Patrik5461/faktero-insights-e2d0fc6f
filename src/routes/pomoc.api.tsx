import { createFileRoute, Link } from "@tanstack/react-router";
import { preloz } from "@/lib/i18n/jazyk";
import type { HelpSection } from "@/components/faktero/HelpArticle";
import { PrelozenyManual } from "@/lib/i18n/prelozStrom";

export const Route = createFileRoute("/pomoc/api")({
  head: ({ match }) => ({
    meta: [
      { title: preloz(match.context.jazyk, "Pomoc — API — Faktero") },
      {
        name: "description",
        content: preloz(
          match.context.jazyk,
          "Ako používať Faktero API: kľúče, testovací a ostrý režim, vytvorenie faktúry, webhooky.",
        ),
      },
      { property: "og:title", content: preloz(match.context.jazyk, "Pomoc — API — Faktero") },
      {
        property: "og:description",
        content: preloz(match.context.jazyk, "Návod pre vývojárov na prácu s Faktero API."),
      },
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
        <p>
          Faktero API je REST rozhranie, ktoré umožňuje vašej aplikácii vytvárať faktúry, spravovať
          odberateľov a počúvať na udalosti cez webhooky.
        </p>
        <p>
          Všetky endpointy bežia pod <code>https://www.faktero.sk/api/v1</code> a používajú JSON.
        </p>
      </>
    ),
  },
  {
    id: "kluc",
    title: "Kde nájdem API kľúč",
    body: (
      <>
        <ol>
          <li>
            Otvorte <Link to="/nastavenia">Nastavenia</Link> → <strong>API kľúče</strong>.
          </li>
          <li>
            Kliknite na <strong>Vytvoriť nový kľúč</strong> a pomenujte ho (napr. „Eshop
            produkcia“).
          </li>
          <li>
            Kľúč sa zobrazí <em>iba raz</em> — uložte ho na bezpečnom mieste.
          </li>
        </ol>
        <p>
          Kľúč posielajte v hlavičke <code>Authorization: Bearer fk_live_…</code>.
        </p>
        <p>
          <strong>Viac firiem jedným kľúčom:</strong> v API kľúčoch zvoľte{" "}
          <em>Kľúč pre viac firiem</em>. Platí pre všetky firmy, kde ste vlastník alebo admin (alebo
          len pre vybrané) — firmu potom uvádzate v každej požiadavke hlavičkou{" "}
          <code>X-Company</code> (id alebo IČO). Zoznam firiem vráti{" "}
          <code>GET /api/v1/companies</code>.
        </p>
      </>
    ),
  },
  {
    id: "test-live",
    title: "Testovací a ostrý režim",
    body: (
      <>
        <p>Pri vytváraní kľúča vyberáte režim:</p>
        <ul>
          <li>
            <strong>Test</strong> — kľúč smie len čítať (zoznamy, detaily, PDF). Na skúšanie
            integrácie bez rizika, že niečo vystaví alebo odošle zákazníkovi. Pokus o zápis vráti
            chybu <code>403 test_key_read_only</code>.
          </li>
          <li>
            <strong>Live (produkcia)</strong> — číta aj zapisuje: reálne faktúry, ktoré sa rátajú do
            mesačného limitu plánu.
          </li>
        </ul>
        <p>
          Test kľúče majú prefix <code>fk_test_</code>, live kľúče <code>fk_live_</code>.
          Zneplatnený kľúč ostáva v zozname so zneplatnením, aby bolo v denníku volaní vidno, čím čo
          prišlo.
        </p>
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
  -H "Authorization: Bearer fk_live_…" \\
  -H "Content-Type: application/json" \\
  -d '{
    "customer": { "name": "ACME s.r.o.", "ico": "12345678" },
    "items": [
      { "name": "Konzultácia", "quantity": 2, "unit_price": 50, "vat_rate": 23 }
    ],
    "due_date": "2026-07-01"
  }'`}
        </pre>
        <p>
          Odpoveď obsahuje <code>id</code>, <code>invoice_number</code> a URL na PDF.
        </p>
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
          <li>
            <code>invoice.created</code>
          </li>
          <li>
            <code>invoice.sent</code>
          </li>
          <li>
            <code>invoice.paid</code>
          </li>
          <li>
            <code>invoice.cancelled</code>
          </li>
          <li>
            <code>bank_transaction.created</code>
          </li>
        </ul>
        <p>
          <code>invoice.paid</code> príde pri každej zmene faktúry na uhradenú — aj po spárovaní s
          bankovým pohybom. Udalosť <code>bank_transaction.created</code> oznámi každý nový pohyb na
          účte, takže pohyby netreba dopytovať.
        </p>
        <p>
          Každý webhook je podpísaný hlavičkou <code>X-Faktero-Signature</code> (HMAC SHA-256 z tela
          správy a tajného kľúča webhooku). Vždy podpis overte pred spracovaním.
        </p>
      </>
    ),
  },
  {
    id: "woocommerce",
    title: "E-shop na WooCommerce",
    body: (
      <p>
        Na WooCommerce netreba nič programovať — hotový doplnok vystavuje faktúry z objednávok sám.
        Návod a stiahnutie: <Link to="/pomoc/woocommerce">Faktúry z e-shopu na WooCommerce</Link>.
      </p>
    ),
  },
  {
    id: "prenos-dat",
    title: "Prenos dát a zápis dokladov cez API",
    body: (
      <>
        <p>
          API nielen číta, ale aj zapisuje — hodí sa pri prechode z iného programu aj pri trvalom
          napojení e-shopu, skladu či účtovnej kancelárie:
        </p>
        <ul>
          <li>
            <strong>Prijaté faktúry a bločky</strong> — zapíšete ich aj so súborom (PDF, fotka),
            dodávateľ sa sám založí v adresári. Úhrady (aj po častiach), zaúčtovanie, stav, štítky a
            komentár doplníte neskôr.
          </li>
          <li>
            <strong>Adresár</strong> — naraz prenesiete až 1000 odberateľov a dodávateľov.
            Existujúci kontakt sa nezdvojí, len sa doplní.
          </li>
          <li>
            <strong>Cenník</strong> — produkty a služby, ktoré sa dajú synchronizovať napríklad z
            e-shopu.
          </li>
          <li>
            <strong>Bankové účty</strong> — účet banky, ku ktorej sa Faktero nepripojí, založíte cez
            API a pohyby naň posielate dávkami. Duplicity sa preskočia. Poplatok, mzdu či transakčnú
            daň označíte ako vybavené bez dokladu.
          </li>
          <li>
            <strong>Firmy a používatelia</strong> — kľúčom pre viac firiem založíte firmu nového
            klienta a pozvete do nej účtovníka či kolegu (pozvánka príde e-mailom).
          </li>
        </ul>
        <p>
          Pri každom zápise môžete poslať vlastné <code>external_id</code> — opakované odoslanie
          potom nič nezdvojí. Cez API sa maže len ručne pridaná úhrada prijatej faktúry; faktúra sa
          dá len stornovať. Presný tvar údajov je v <Link to="/docs/api">API dokumentácii</Link>.
        </p>
      </>
    ),
  },
  {
    id: "ai-asistenti",
    title: "AI asistenti — Claude, ChatGPT (MCP)",
    body: (
      <>
        <p>
          Faktero sa dá napojiť na AI asistenta cez <strong>MCP</strong> (Model Context Protocol).
          Asistent potom odpovie, kto vám dlhuje, nájde faktúru, vystaví novú, zapíše prijatú
          faktúru či bloček, založí odberateľa, produkt alebo firmu, prenesie kontakty a bankové
          pohyby, označí úhradu (aj čiastočnú), nastaví stav, štítky či zaúčtovanie dokladu, vybaví
          bankový pohyb bez dokladu, pozve kolegu alebo pozrie pohyby na účte. Zmaže nanajvýš ručne
          pridanú úhradu prijatej faktúry a nič neposiela odberateľom.
        </p>
        <ol>
          <li>
            V <strong>claude.ai</strong> otvorte Nastavenia → Konektory, v <strong>ChatGPT</strong>{" "}
            Nastavenia → Aplikácie a konektory a pridajte vlastný konektor.
          </li>
          <li>
            Ako adresu zadajte <code>https://www.faktero.sk/api/mcp</code>. Kľúč netreba.
          </li>
          <li>
            Otvorí sa Faktero — prihláste sa, vyberte firmu (alebo{" "}
            <strong>Všetky moje firmy</strong>) a kliknite na <strong>Povoliť prístup</strong>.
            Povoliť ho môže majiteľ alebo admin firmy.
          </li>
        </ol>
        <p>
          Pri voľbe Všetky moje firmy sa asistent pri otázke spýta, o ktorú firmu ide. Prístup
          uvidíte v API kľúčoch ako „AI asistent (MCP)“ a zrušíte ho tam jedným klikom. Pri neznámej
          aplikácii Faktero pred povolením upozorní — povoľte len to, čo ste pridávali vy.
        </p>
        <p>
          Claude Code, Cursor či iní klienti sa pripoja s API kľúčom v hlavičke{" "}
          <code>Authorization: Bearer fk_live_…</code> — návod je v{" "}
          <Link to="/docs/api" hash="mcp">
            dokumentácii API
          </Link>
          .
        </p>
      </>
    ),
  },
  {
    id: "dokumentacia",
    title: "Kompletná dokumentácia a skúšanie",
    body: (
      <>
        <p>
          Úplný zoznam endpointov, parametrov a chybových kódov nájdete v{" "}
          <Link to="/docs/api">API dokumentácii</Link>. Tlačidlom <strong>Stiahnuť PDF</strong> si
          ju stiahnete celú (v slovenčine, češtine alebo nemčine podľa jazyka webu), tlačidlom{" "}
          <strong>Tlačiť</strong> ju vytlačíte.
        </p>
        <p>
          Volania si viete vyskúšať bez písania kódu v{" "}
          <Link to="/api-playground">API playgrounde</Link> — vyberiete endpoint, doplníte parametre
          a hneď vidíte odpoveď servera aj hotový príkaz pre <code>curl</code>. Playground volá{" "}
          <strong>ostré dáta vašej firmy</strong>, takže zápisové volania naozaj vytvárajú doklady.
        </p>
      </>
    ),
  },
];

function Page() {
  return (
    <PrelozenyManual
      category="Pomoc · API"
      title="Faktero API pre vývojárov"
      intro={<p>REST API na automatizáciu vystavovania faktúr a integráciu s vašou aplikáciou.</p>}
      sections={sections}
    />
  );
}
