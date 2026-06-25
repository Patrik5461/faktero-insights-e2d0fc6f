import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Copy, KeyRound, PlayCircle, LifeBuoy, UserPlus } from "lucide-react";

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group relative">
      {lang && (
        <span className="absolute left-3 top-2 rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
          {lang}
        </span>
      )}
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-border/40 bg-background/80 px-2 py-1 text-[11px] text-muted-foreground opacity-0 backdrop-blur transition-opacity hover:text-foreground group-hover:opacity-100"
      >
        {copied ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
        {copied ? "Skopírované" : "Kopírovať"}
      </button>
      <pre className="overflow-x-auto rounded-lg border border-border bg-sidebar p-4 pt-8 text-xs leading-relaxed text-sidebar-foreground">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function Method({ m }: { m: "GET" | "POST" | "PUT" | "DELETE" }) {
  const cls: Record<string, string> = {
    GET: "bg-primary/15 text-primary",
    POST: "bg-emerald-500/15 text-emerald-500",
    PUT: "bg-amber-500/15 text-amber-600",
    DELETE: "bg-destructive/15 text-destructive",
  };
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-mono font-bold ${cls[m]}`}>
      {m}
    </span>
  );
}

function Endpoint({ method, path, desc }: { method: "GET" | "POST" | "PUT" | "DELETE"; path: string; desc: string }) {
  return (
    <li className="flex flex-wrap items-baseline gap-3 py-1.5">
      <Method m={method} />
      <code className="font-mono text-sm">{path}</code>
      <span className="text-sm text-muted-foreground">— {desc}</span>
    </li>
  );
}

const SECTIONS = [
  { id: "uvod", label: "1. Úvod" },
  { id: "autentifikacia", label: "2. Autentifikácia" },
  { id: "test-live", label: "3. Test a live režim" },
  { id: "chyby", label: "4. Chyby" },
  { id: "customers", label: "5. Odberatelia" },
  { id: "invoices", label: "6. Faktúry" },
  { id: "quotes", label: "7. Cenové ponuky" },
  { id: "recurring", label: "8. Opakované faktúry" },
  { id: "expenses", label: "9. Náklady" },
  { id: "webhooks", label: "10. Webhooky" },
  { id: "examples", label: "11. Príklady kódu" },
  { id: "status-codes", label: "12. Stavové kódy" },
  { id: "rate-limits", label: "13. Rate limity" },
  { id: "cta", label: "14. Pre vývojárov" },
];

export function ApiDocsContent({ loggedIn = false }: { loggedIn?: boolean }) {
  const [active, setActive] = useState<string>(SECTIONS[0].id);
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-100px 0px -70% 0px" },
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 sm:py-10 lg:grid-cols-[240px_1fr] lg:gap-10">
      {/* Mobile: collapsible section picker */}
      <div className="lg:hidden">
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Obsah dokumentácie
        </label>
        <select
          value={active}
          onChange={(e) => {
            const id = e.target.value;
            setActive(id);
            document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {SECTIONS.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </div>
      {/* Desktop sidebar */}
      <aside className="hidden lg:sticky lg:top-6 lg:block lg:self-start">
        <div className="rounded-xl border border-border bg-card/40 p-3">
          <div className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Obsah
          </div>
          <nav className="flex flex-col">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active === s.id
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                {s.label}
              </a>
            ))}
          </nav>
        </div>
      </aside>

      {/* Main content */}
      <article className="min-w-0 space-y-14">
        <section id="uvod" className="scroll-mt-20">
          <h1 className="text-3xl font-bold tracking-tight">Faktero API dokumentácia</h1>
          <p className="mt-3 text-base text-muted-foreground">
            Faktero REST API umožňuje plne automatizovať fakturáciu — vytvárať odberateľov,
            vystavovať faktúry, sťahovať PDF, posielať e-maily a prijímať webhooky o
            udalostiach. Všetky odpovede sú v JSON formáte (UTF-8).
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs uppercase text-muted-foreground">Base URL</div>
              <code className="mt-1 block font-mono text-sm">https://faktero.sk/api/v1</code>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs uppercase text-muted-foreground">API verzia</div>
              <code className="mt-1 block font-mono text-sm">v1</code>
            </div>
          </div>
        </section>

        <section id="autentifikacia" className="scroll-mt-20">
          <h2 className="text-2xl font-semibold">2. Autentifikácia</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Každú požiadavku autentifikujte hlavičkou <code className="font-mono">Authorization</code> s
            Bearer API kľúčom. Kľúče sú viazané na konkrétnu firmu a oprávnenia.
          </p>
          <div className="mt-4">
            <CodeBlock
              lang="HTTP"
              code={`Authorization: Bearer fk_live_xxxxxxxxxxxxxxxxxxxxxxxx`}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Kľúč nikdy nezdieľajte ani neukladajte do verejných repozitárov. Stratený kľúč
            okamžite revokujte v sekcii API kľúče.
          </p>
        </section>

        <section id="test-live" className="scroll-mt-20">
          <h2 className="text-2xl font-semibold">3. Test a live režim</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Faktero rozlišuje dva typy kľúčov podľa prefixu:
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <code className="font-mono rounded bg-secondary px-1.5 py-0.5">fk_test_…</code>{" "}
              — testovací režim. Faktúry sa neodosielajú reálne, e-maily idú do sandboxu.
            </li>
            <li>
              <code className="font-mono rounded bg-secondary px-1.5 py-0.5">fk_live_…</code>{" "}
              — produkčný režim. Akcie sú reálne a fakturačné údaje sa zapisujú do ostrých
              dokumentov.
            </li>
          </ul>
        </section>

        <section id="chyby" className="scroll-mt-20">
          <h2 className="text-2xl font-semibold">4. Chyby</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Všetky chybové odpovede majú jednotný formát:
          </p>
          <div className="mt-3">
            <CodeBlock
              lang="JSON"
              code={`{
  "error": {
    "code": "validation_error",
    "message": "Human readable message",
    "details": {}
  }
}`}
            />
          </div>
        </section>

        <section id="customers" className="scroll-mt-20">
          <h2 className="text-2xl font-semibold">5. Odberatelia</h2>
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card px-4">
            <Endpoint method="POST" path="/api/v1/customers" desc="Vytvorenie odberateľa" />
            <Endpoint method="GET" path="/api/v1/customers" desc="Zoznam odberateľov" />
            <Endpoint method="GET" path="/api/v1/customers/{id}" desc="Detail odberateľa" />
            <Endpoint method="PUT" path="/api/v1/customers/{id}" desc="Úprava odberateľa" />
          </ul>
        </section>

        <section id="invoices" className="scroll-mt-20">
          <h2 className="text-2xl font-semibold">6. Faktúry</h2>
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card px-4">
            <Endpoint method="POST" path="/api/v1/invoices" desc="Vystavenie faktúry" />
            <Endpoint method="GET" path="/api/v1/invoices" desc="Zoznam faktúr" />
            <Endpoint method="GET" path="/api/v1/invoices/{id}" desc="Detail faktúry" />
            <Endpoint method="PUT" path="/api/v1/invoices/{id}" desc="Úprava (len drafty)" />
            <Endpoint method="GET" path="/api/v1/invoices/{id}/pdf" desc="Signed URL na PDF" />
            <Endpoint method="POST" path="/api/v1/invoices/{id}/send" desc="Odoslanie e-mailom" />
            <Endpoint method="POST" path="/api/v1/invoices/{id}/mark-paid" desc="Označenie ako uhradené" />
            <Endpoint method="POST" path="/api/v1/invoices/{id}/cancel" desc="Storno faktúry" />
          </ul>
        </section>

        <section id="quotes" className="scroll-mt-20">
          <h2 className="text-2xl font-semibold">7. Cenové ponuky</h2>
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card px-4">
            <Endpoint method="POST" path="/api/v1/quotes" desc="Vytvorenie ponuky" />
            <Endpoint method="GET" path="/api/v1/quotes" desc="Zoznam ponúk" />
            <Endpoint method="GET" path="/api/v1/quotes/{id}" desc="Detail ponuky" />
            <Endpoint method="PUT" path="/api/v1/quotes/{id}" desc="Úprava ponuky" />
            <Endpoint method="POST" path="/api/v1/quotes/{id}/convert" desc="Konverzia na faktúru" />
          </ul>
        </section>

        <section id="recurring" className="scroll-mt-20">
          <h2 className="text-2xl font-semibold">8. Opakované faktúry</h2>
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card px-4">
            <Endpoint method="POST" path="/api/v1/recurring-invoices" desc="Vytvorenie šablóny" />
            <Endpoint method="GET" path="/api/v1/recurring-invoices" desc="Zoznam šablón" />
            <Endpoint method="GET" path="/api/v1/recurring-invoices/{id}" desc="Detail šablóny" />
            <Endpoint method="PUT" path="/api/v1/recurring-invoices/{id}" desc="Úprava šablóny" />
          </ul>
        </section>

        <section id="expenses" className="scroll-mt-20">
          <h2 className="text-2xl font-semibold">9. Náklady</h2>
          <div className="mt-3 rounded-lg border border-dashed border-border bg-card/50 p-6 text-sm text-muted-foreground">
            Modul Náklady je v príprave. Endpointy{" "}
            <code className="font-mono">/api/v1/expenses</code> budú dostupné v ďalšej verzii API.
            <div className="mt-2 inline-block rounded-full bg-muted px-2 py-0.5 text-xs">Pripravujeme</div>
          </div>
        </section>

        <section id="webhooks" className="scroll-mt-20">
          <h2 className="text-2xl font-semibold">10. Webhooky</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Webhooky vás v reálnom čase informujú o udalostiach vo Faktero. Endpoint nastavíte
            v sekcii Webhooky vo vašom účte, kde získate aj signing secret.
          </p>
          <h3 className="mt-5 font-semibold">Udalosti</h3>
          <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {[
              "invoice.created",
              "invoice.sent",
              "invoice.paid",
              "invoice.cancelled",
              "customer.created",
              "quote.created",
              "quote.sent",
              "quote.converted",
            ].map((e) => (
              <li key={e} className="rounded border border-border bg-card px-3 py-1.5 font-mono text-xs">
                {e}
              </li>
            ))}
          </ul>

          <h3 className="mt-6 font-semibold">Overovanie podpisu</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Každá požiadavka má hlavičku <code className="font-mono">X-Faktero-Signature</code>{" "}
            obsahujúcu HMAC SHA-256 podpis tela požiadavky vytvorený pomocou vášho{" "}
            <em>signing secret</em>.
          </p>
          <div className="mt-3">
            <CodeBlock
              lang="Node.js"
              code={`import crypto from "crypto";

function verifyFaktero(rawBody, signatureHeader, secret) {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(signatureHeader),
    Buffer.from(expected),
  );
}`}
            />
          </div>

          <h3 className="mt-6 font-semibold">Opakovanie pri zlyhaní</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Ak váš endpoint nevráti 2xx do 10 sekúnd, Faktero pokus zopakuje s exponenciálnym
            odstupom (1 min, 5 min, 30 min, 2 h, 12 h) — celkovo max. 5 pokusov. Všetky pokusy a
            ich stavy nájdete v sekcii Webhooky → Logy.
          </p>
        </section>

        <section id="examples" className="scroll-mt-20">
          <h2 className="text-2xl font-semibold">11. Príklady kódu</h2>

          <h3 className="mt-5 font-semibold">Vytvorenie odberateľa</h3>
          <div className="mt-2 space-y-3">
            <CodeBlock
              lang="cURL"
              code={`curl -X POST https://faktero.sk/api/v1/customers \\
  -H "Authorization: Bearer fk_live_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Acme s.r.o.",
    "ico": "12345678",
    "ic_dph": "SK2020123456",
    "street": "Hlavná 1",
    "city": "Bratislava",
    "zip": "81101",
    "country": "SK",
    "email": "fakturacia@acme.sk"
  }'`}
            />
            <CodeBlock
              lang="JavaScript"
              code={`const res = await fetch("https://faktero.sk/api/v1/customers", {
  method: "POST",
  headers: {
    "Authorization": "Bearer fk_live_xxx",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    name: "Acme s.r.o.",
    ico: "12345678",
    email: "fakturacia@acme.sk",
  }),
});
const customer = await res.json();`}
            />
            <CodeBlock
              lang="PHP"
              code={`<?php
$ch = curl_init("https://faktero.sk/api/v1/customers");
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => [
    "Authorization: Bearer fk_live_xxx",
    "Content-Type: application/json",
  ],
  CURLOPT_POSTFIELDS => json_encode([
    "name" => "Acme s.r.o.",
    "ico" => "12345678",
    "email" => "fakturacia@acme.sk",
  ]),
]);
$customer = json_decode(curl_exec($ch), true);`}
            />
          </div>

          <h3 className="mt-6 font-semibold">Vystavenie faktúry</h3>
          <CodeBlock
            lang="cURL"
            code={`curl -X POST https://faktero.sk/api/v1/invoices \\
  -H "Authorization: Bearer fk_live_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "customer_id": "cus_123",
    "issue_date": "2026-06-12",
    "due_date": "2026-06-26",
    "currency": "EUR",
    "items": [
      { "name": "Konzultácia", "quantity": 4, "unit": "hod",
        "unit_price": 75, "vat_rate": 23 }
    ]
  }'`}
          />

          <h3 className="mt-6 font-semibold">Stiahnutie PDF</h3>
          <CodeBlock
            lang="JavaScript"
            code={`const res = await fetch(
  "https://faktero.sk/api/v1/invoices/inv_123/pdf",
  { headers: { Authorization: "Bearer fk_live_xxx" } }
);
const { signed_url } = await res.json();
// signed_url platí 5 minút — stiahnite alebo presmerujte používateľa`}
          />

          <h3 className="mt-6 font-semibold">Odoslanie faktúry e-mailom</h3>
          <CodeBlock
            lang="cURL"
            code={`curl -X POST https://faktero.sk/api/v1/invoices/inv_123/send \\
  -H "Authorization: Bearer fk_live_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{ "recipient_email": "klient@example.com" }'`}
          />

          <h3 className="mt-6 font-semibold">Označiť faktúru ako uhradenú</h3>
          <CodeBlock
            lang="cURL"
            code={`curl -X POST https://faktero.sk/api/v1/invoices/inv_123/mark-paid \\
  -H "Authorization: Bearer fk_live_xxx"`}
          />

          <h3 className="mt-6 font-semibold">Prijatie webhooku (PHP)</h3>
          <CodeBlock
            lang="PHP"
            code={`<?php
$secret = getenv("FAKTERO_WEBHOOK_SECRET");
$payload = file_get_contents("php://input");
$sig = $_SERVER["HTTP_X_FAKTERO_SIGNATURE"] ?? "";
$expected = hash_hmac("sha256", $payload, $secret);

if (!hash_equals($expected, $sig)) {
  http_response_code(401);
  exit;
}

$event = json_decode($payload, true);
// $event["type"] === "invoice.paid" …
http_response_code(200);`}
          />
        </section>

        <section id="status-codes" className="scroll-mt-20">
          <h2 className="text-2xl font-semibold">12. Stavové kódy</h2>
          <div className="mt-3 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr><th className="p-3">Kód</th><th className="p-3">Význam</th></tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {[
                  ["200", "OK — požiadavka úspešná"],
                  ["201", "Created — zdroj vytvorený"],
                  ["400", "Bad Request — chybný formát requestu"],
                  ["401", "Unauthorized — chýbajúci alebo neplatný API kľúč"],
                  ["403", "Forbidden — kľúč nemá oprávnenie"],
                  ["404", "Not Found — zdroj neexistuje"],
                  ["409", "Conflict — konflikt stavu (napr. duplicitné číslo)"],
                  ["422", "Unprocessable Entity — validačná chyba"],
                  ["500", "Internal Server Error — chyba na strane Faktero"],
                ].map(([k, v]) => (
                  <tr key={k}>
                    <td className="p-3 font-mono">{k}</td>
                    <td className="p-3 text-muted-foreground">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="rate-limits" className="scroll-mt-20">
          <h2 className="text-2xl font-semibold">13. Rate limity</h2>
          <div className="mt-3 rounded-lg border border-dashed border-border bg-card/50 p-6 text-sm text-muted-foreground">
            Rate limiting bude doplnený pred verejným spustením API. Pre stable použitie
            v produkcii odporúčame implementovať exponenciálny backoff pri 429 odpovediach.
          </div>
        </section>

        <section id="cta" className="scroll-mt-20">
          <h2 className="text-2xl font-semibold">14. Pre vývojárov</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {loggedIn ? (
              <>
                <Link
                  to="/api-kluce"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  <KeyRound className="h-4 w-4" /> Vytvoriť API kľúč
                </Link>
                <Link
                  to="/api-playground"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium hover:bg-secondary"
                >
                  <PlayCircle className="h-4 w-4" /> Otvoriť API Playground
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/registracia"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  <UserPlus className="h-4 w-4" /> Vytvoriť účet zdarma
                </Link>
                <Link
                  to="/vyvojari/playground"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium hover:bg-secondary"
                >
                  <PlayCircle className="h-4 w-4" /> API Playground
                </Link>
              </>
            )}
            <a
              href="mailto:podpora@faktero.sk"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium hover:bg-secondary"
            >
              <LifeBuoy className="h-4 w-4" /> Kontaktovať podporu
            </a>
          </div>
        </section>
      </article>
    </div>
  );
}