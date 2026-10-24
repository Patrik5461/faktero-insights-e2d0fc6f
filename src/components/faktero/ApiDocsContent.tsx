import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Copy, KeyRound, PlayCircle, LifeBuoy, UserPlus } from "lucide-react";
import { useT } from "@/lib/i18n/useT";

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="group relative min-w-0 max-w-full">
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
        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-border/40 bg-background/80 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur transition-opacity hover:text-foreground group-hover:opacity-100 sm:opacity-0"
      >
        {copied ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
        {copied ? t("Skopírované") : t("Kopírovať")}
      </button>
      {/* Na úzkom displeji sa riadky zalamujú — posuvník v <pre> mobil neukáže
          a ukážka vyzerala useknutá. */}
      <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-sidebar p-4 pt-8 text-xs leading-relaxed text-sidebar-foreground sm:whitespace-pre sm:break-normal">
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
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-mono font-bold ${cls[m]}`}
    >
      {m}
    </span>
  );
}

function Endpoint({
  method,
  path,
  desc,
}: {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  desc: string;
}) {
  const { t } = useT();
  return (
    <li className="flex flex-wrap items-baseline gap-3 py-1.5">
      <Method m={method} />
      <code className="break-all font-mono text-sm">{path}</code>
      <span className="text-sm text-muted-foreground">— {t(desc)}</span>
    </li>
  );
}

const SECTIONS = [
  { id: "uvod", label: "1. Úvod" },
  { id: "autentifikacia", label: "2. Autentifikácia" },
  { id: "test-live", label: "3. Testovací a ostrý režim" },
  { id: "chyby", label: "4. Chyby" },
  { id: "customers", label: "5. Odberatelia" },
  { id: "invoices", label: "6. Faktúry" },
  { id: "quotes", label: "7. Cenové ponuky" },
  { id: "recurring", label: "8. Opakované faktúry" },
  { id: "expenses", label: "9. Prijaté doklady a banka" },
  { id: "webhooks", label: "10. Webhooky" },
  { id: "examples", label: "11. Príklady kódu" },
  { id: "status-codes", label: "12. Stavové kódy" },
  { id: "rate-limits", label: "13. Limity požiadaviek" },
  { id: "cta", label: "14. Pre vývojárov" },
];

export function ApiDocsContent({ loggedIn = false }: { loggedIn?: boolean }) {
  const { t } = useT();
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
          {t("Obsah dokumentácie")}
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
            <option key={s.id} value={s.id}>
              {t(s.label)}
            </option>
          ))}
        </select>
      </div>
      {/* Desktop sidebar */}
      <aside className="hidden lg:sticky lg:top-6 lg:block lg:self-start">
        <div className="rounded-xl border border-border bg-card/40 p-3">
          <div className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("Obsah")}
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
                {t(s.label)}
              </a>
            ))}
          </nav>
        </div>
      </aside>

      {/* Main content */}
      <article className="min-w-0 space-y-14">
        <section id="uvod" className="scroll-mt-20">
          <h1 className="text-3xl font-bold tracking-tight">{t("Faktero API dokumentácia")}</h1>
          <h2 className="mt-6 text-2xl font-semibold">{t("1. Úvod")}</h2>
          <p className="mt-2 text-base text-muted-foreground">
            {t(
              "Faktero REST API umožňuje plne automatizovať fakturáciu — vytvárať odberateľov, vystavovať faktúry, sťahovať PDF, posielať e-maily a prijímať webhooky o udalostiach. Všetky odpovede sú v JSON formáte (UTF-8).",
            )}
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs uppercase text-muted-foreground">{t("Base URL")}</div>
              <code className="mt-1 block font-mono text-sm">https://faktero.sk/api/v1</code>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs uppercase text-muted-foreground">{t("API verzia")}</div>
              <code className="mt-1 block font-mono text-sm">v1</code>
            </div>
          </div>
        </section>

        <section id="autentifikacia" className="scroll-mt-20">
          <h2 className="text-2xl font-semibold">{t("2. Autentifikácia")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("Každú požiadavku autentifikujte hlavičkou")}{" "}
            <code className="font-mono">Authorization</code>{" "}
            {t("s Bearer API kľúčom. Kľúče sú viazané na konkrétnu firmu a oprávnenia.")}
          </p>
          <div className="mt-4">
            <CodeBlock
              lang="HTTP"
              code={`Authorization: Bearer fk_live_xxxxxxxxxxxxxxxxxxxxxxxx`}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {t(
              "Kľúč nikdy nezdieľajte ani neukladajte do verejných repozitárov. Stratený kľúč okamžite revokujte v sekcii API kľúče.",
            )}
          </p>
        </section>

        <section id="test-live" className="scroll-mt-20">
          <h2 className="text-2xl font-semibold">{t("3. Testovací a ostrý režim")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("Faktero rozlišuje dva typy kľúčov podľa prefixu:")}
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <code className="font-mono rounded bg-secondary px-1.5 py-0.5">fk_test_…</code> —{" "}
              {t(
                "testovací režim. Faktúry sa neodosielajú naostro, e-maily idú do testovacej schránky.",
              )}
            </li>
            <li>
              <code className="font-mono rounded bg-secondary px-1.5 py-0.5">fk_live_…</code> —{" "}
              {t(
                "produkčný režim. Akcie sú reálne a fakturačné údaje sa zapisujú do ostrých dokumentov.",
              )}
            </li>
          </ul>
        </section>

        <section id="chyby" className="scroll-mt-20">
          <h2 className="text-2xl font-semibold">{t("4. Chyby")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("Všetky chybové odpovede majú jednotný formát:")}
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
          <h2 className="text-2xl font-semibold">{t("5. Odberatelia")}</h2>
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card px-4">
            <Endpoint method="POST" path="/api/v1/customers" desc="Vytvorenie odberateľa" />
            <Endpoint method="GET" path="/api/v1/customers" desc="Zoznam odberateľov" />
            <Endpoint method="GET" path="/api/v1/customers/{id}" desc="Detail odberateľa" />
            <Endpoint method="PUT" path="/api/v1/customers/{id}" desc="Úprava odberateľa" />
          </ul>
        </section>

        <section id="invoices" className="scroll-mt-20">
          <h2 className="text-2xl font-semibold">{t("6. Faktúry")}</h2>
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card px-4">
            <Endpoint method="POST" path="/api/v1/invoices" desc="Vystavenie faktúry" />
            <Endpoint method="GET" path="/api/v1/invoices" desc="Zoznam faktúr" />
            <Endpoint method="GET" path="/api/v1/invoices/{id}" desc="Detail faktúry" />
            <Endpoint method="PUT" path="/api/v1/invoices/{id}" desc="Úprava (len koncepty)" />
            <Endpoint
              method="GET"
              path="/api/v1/invoices/{id}/pdf"
              desc="Dočasný podpísaný odkaz na PDF"
            />
            <Endpoint method="POST" path="/api/v1/invoices/{id}/send" desc="Odoslanie e-mailom" />
            <Endpoint
              method="POST"
              path="/api/v1/invoices/{id}/mark-paid"
              desc="Označenie ako uhradené"
            />
            <Endpoint method="POST" path="/api/v1/invoices/{id}/cancel" desc="Storno faktúry" />
          </ul>
        </section>

        <section id="quotes" className="scroll-mt-20">
          <h2 className="text-2xl font-semibold">{t("7. Cenové ponuky")}</h2>
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card px-4">
            <Endpoint method="POST" path="/api/v1/quotes" desc="Vytvorenie ponuky" />
            <Endpoint method="GET" path="/api/v1/quotes" desc="Zoznam ponúk" />
            <Endpoint method="GET" path="/api/v1/quotes/{id}" desc="Detail ponuky" />
            <Endpoint method="PUT" path="/api/v1/quotes/{id}" desc="Úprava ponuky" />
            <Endpoint
              method="POST"
              path="/api/v1/quotes/{id}/convert"
              desc="Konverzia na faktúru"
            />
          </ul>
        </section>

        <section id="recurring" className="scroll-mt-20">
          <h2 className="text-2xl font-semibold">{t("8. Opakované faktúry")}</h2>
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card px-4">
            <Endpoint method="POST" path="/api/v1/recurring-invoices" desc="Vytvorenie šablóny" />
            <Endpoint method="GET" path="/api/v1/recurring-invoices" desc="Zoznam šablón" />
            <Endpoint method="GET" path="/api/v1/recurring-invoices/{id}" desc="Detail šablóny" />
            <Endpoint method="PUT" path="/api/v1/recurring-invoices/{id}" desc="Úprava šablóny" />
          </ul>
        </section>

        <section id="expenses" className="scroll-mt-20">
          <h2 className="text-2xl font-semibold">{t("9. Prijaté doklady a banka")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(
              "Pre účtovný program alebo kanceláriu: prijaté faktúry a bločky so zaúčtovaním (predkontácia, členenie DPH, KV), zmeny od posledného stiahnutia a označenie odovzdaných — rovnako ako to robí konektor Pohody.",
            )}
          </p>
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card px-4">
            <Endpoint method="GET" path="/api/v1/purchase-invoices" desc="Prijaté faktúry" />
            <Endpoint
              method="GET"
              path="/api/v1/purchase-invoices/{id}"
              desc="Detail s položkami a odkazom na súbor (1 h)"
            />
            <Endpoint
              method="POST"
              path="/api/v1/purchase-invoices/{id}/exported"
              desc="Označiť ako odovzdanú"
            />
            <Endpoint method="GET" path="/api/v1/receipts" desc="Bločky" />
            <Endpoint
              method="GET"
              path="/api/v1/receipts/{id}"
              desc="Detail bločku s odkazom na súbor"
            />
            <Endpoint
              method="POST"
              path="/api/v1/receipts/{id}/exported"
              desc="Označiť ako odovzdaný"
            />
            <Endpoint
              method="POST"
              path="/api/v1/unprocessed-documents"
              desc="Nahrať doklad do Nespracovaných"
            />
            <Endpoint
              method="GET"
              path="/api/v1/unprocessed-documents"
              desc="Nespracované doklady a stav čítania"
            />
            <Endpoint
              method="GET"
              path="/api/v1/bank-accounts"
              desc="Bankové účty firmy (IBAN, banka, zostatok)"
            />
            <Endpoint
              method="GET"
              path="/api/v1/bank-transactions"
              desc="Pohyby na bankových účtoch"
            />
          </ul>
          <h3 className="mt-5 font-semibold">{t("Filtre zoznamu")}</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              <code className="font-mono">updated_since</code> —{" "}
              {t("len zmenené od (ISO 8601); zoznam je zoradený podľa")}{" "}
              <code className="font-mono">updated_at</code>
              {t(", takže sa dá pokračovať od posledného.")}
            </li>
            <li>
              <code className="font-mono">issued_from</code>,{" "}
              <code className="font-mono">issued_to</code> — {t("dátum vystavenia (RRRR-MM-DD).")}
            </li>
            <li>
              <code className="font-mono">exported=false</code> — {t("ešte neodovzdané;")}{" "}
              <code className="font-mono">booked=true</code> —{" "}
              {t("len zaúčtované (prijaté faktúry).")}
            </li>
            <li>
              <code className="font-mono">limit</code> {t("(najviac 200) a")}{" "}
              <code className="font-mono">offset</code>; {t("odpoveď má")}{" "}
              <code className="font-mono">has_more</code> {t("a")}{" "}
              <code className="font-mono">next_offset</code>.
            </li>
            <li>
              {t("Banka:")} <code className="font-mono">date_from</code>,{" "}
              <code className="font-mono">date_to</code>,{" "}
              <code className="font-mono">bank_account_id</code>;{" "}
              <code className="font-mono">page</code> + <code className="font-mono">per_page</code>{" "}
              {t("(alebo")} <code className="font-mono">offset</code> +{" "}
              <code className="font-mono">limit</code>), {t("najviac 500 na stranu. Odpoveď má")}{" "}
              <code className="font-mono">total</code>, <code className="font-mono">has_more</code>{" "}
              {t("a")} <code className="font-mono">next_offset</code>{" "}
              {t("— čítajte, kým je has_more true, inak vám riadky z rušného dňa chýbajú.")}
            </li>
          </ul>
          <h3 className="mt-5 font-semibold">{t("Bankové účty")}</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            <code className="font-mono">id</code> {t("účtu je presne to")}{" "}
            <code className="font-mono">bank_account_id</code>
            {t(
              ", ktoré nesú pohyby. Vracajú sa aj odpojené účty (active: false), aby sa dalo priradiť každé id zo starších pohybov. Zostatok a jeho čas sú null, kým sa účet s bankou nesynchronizoval. Každý pohyb nesie aj iban a bank_name svojho účtu.",
            )}
          </p>
          <CodeBlock
            lang="json"
            code={`GET /api/v1/bank-accounts
{
  "data": [
    {
      "id": "7c9a8242-5b05-4ab6-bc25-f543cf62079b",
      "name": "Tatra banka — predaj",
      "iban": "SK1211000000002612345678",
      "bank_name": "Tatra banka, a.s.",
      "currency": "EUR",
      "active": true,
      "balance": 1234.56,
      "balance_at": "2026-10-24T18:00:00Z"
    }
  ]
}`}
          />
          <p className="mt-2 text-sm text-muted-foreground">
            {t("Neznáma cesta pod /api/v1/ vráti 404 s telom")}{" "}
            <code className="font-mono">{`{"error":{"code":"not_found",…}}`}</code>.
          </p>
          <h3 className="mt-5 font-semibold">{t("Označenie odovzdaného")}</h3>
          <CodeBlock
            lang="bash"
            code={`curl -X POST https://faktero.sk/api/v1/purchase-invoices/{id}/exported \\
  -H "Authorization: Bearer fk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{ "exported": true, "accounting_number": "FP2026/0154" }'`}
          />
          <p className="mt-2 text-sm text-muted-foreground">
            <code className="font-mono">{`"exported": false`}</code>{" "}
            {t("označenie zruší (doklad sa dá znova upraviť).")}
          </p>
          <h3 className="mt-5 font-semibold">{t("Nahratie dokladu")}</h3>
          <CodeBlock
            lang="bash"
            code={`curl -X POST https://faktero.sk/api/v1/unprocessed-documents \\
  -H "Authorization: Bearer fk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{ "file_name": "faktura.pdf", "content_type": "application/pdf",
        "content_base64": "JVBERi0xLjQK...", "note": "zákazka Novák" }'`}
          />
          <p className="mt-2 text-sm text-muted-foreground">
            {t(
              "PDF, JPEG, PNG, WEBP, HEIC alebo XML do 14 MB. Doklad sa prečíta na pozadí (desiatky sekúnd) a čaká v Nespracovaných na kontrolu; stav (",
            )}
            <code className="font-mono">cita</code>, <code className="font-mono">vytazene</code>,{" "}
            <code className="font-mono">chyba</code>) {t("vráti GET.")}
          </p>
        </section>

        <section id="webhooks" className="scroll-mt-20">
          <h2 className="text-2xl font-semibold">{t("10. Webhooky")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(
              "Webhooky vás v reálnom čase informujú o udalostiach vo Faktero. Endpoint nastavíte v sekcii Webhooky vo vašom účte, kde získate aj signing secret.",
            )}
          </p>
          <h3 className="mt-5 font-semibold">{t("Udalosti")}</h3>
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
              <li
                key={e}
                className="rounded border border-border bg-card px-3 py-1.5 font-mono text-xs"
              >
                {e}
              </li>
            ))}
          </ul>

          <h3 className="mt-6 font-semibold">{t("Kedy príde invoice.paid")}</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(
              "Len keď faktúru niekto výslovne označí ako uhradenú: volaním POST /api/v1/invoices/…/mark-paid alebo zmenou stavu na „Uhradená“ v detaile faktúry vo Fakteri. Pri spárovaní bankového pohybu s faktúrou (automaticky ani ručne), pri hromadnom označení v zozname ani pri platbe cez platobnú bránu sa invoice.paid neposiela — úhradu z banky zistíte z /api/v1/bank-transactions (matched_invoice_id).",
            )}
          </p>

          <h3 className="mt-6 font-semibold">{t("Overovanie podpisu")}</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("Každá požiadavka má hlavičku")}{" "}
            <code className="font-mono">X-Faktero-Signature</code>{" "}
            {t("obsahujúcu HMAC SHA-256 podpis tela požiadavky vytvorený pomocou vášho")}{" "}
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

          <h3 className="mt-6 font-semibold">{t("Opakovanie pri zlyhaní")}</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(
              "Ak váš endpoint nevráti 2xx do 10 sekúnd, Faktero pokus zopakuje s exponenciálnym odstupom (1 min, 5 min, 30 min, 2 h, 12 h) — celkovo max. 5 pokusov. Všetky pokusy a ich stavy nájdete v sekcii Webhooky → Logy.",
            )}
          </p>
        </section>

        <section id="examples" className="scroll-mt-20">
          <h2 className="text-2xl font-semibold">{t("11. Príklady kódu")}</h2>

          <h3 className="mt-5 font-semibold">{t("Vytvorenie odberateľa")}</h3>
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

          <h3 className="mt-6 font-semibold">{t("Vystavenie faktúry")}</h3>
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

          <h3 className="mt-6 font-semibold">{t("Stiahnutie PDF")}</h3>
          <CodeBlock
            lang="JavaScript"
            code={`const res = await fetch(
  "https://faktero.sk/api/v1/invoices/inv_123/pdf",
  { headers: { Authorization: "Bearer fk_live_xxx" } }
);
const { signed_url } = await res.json();
// signed_url platí 5 minút — stiahnite alebo presmerujte používateľa`}
          />

          <h3 className="mt-6 font-semibold">{t("Odoslanie faktúry e-mailom")}</h3>
          <CodeBlock
            lang="cURL"
            code={`curl -X POST https://faktero.sk/api/v1/invoices/inv_123/send \\
  -H "Authorization: Bearer fk_live_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{ "recipient_email": "klient@example.com" }'`}
          />
          <p className="mt-3 text-sm text-muted-foreground">
            {t(
              'Pri prvom odoslaní musí byť dátum vystavenia dnešný. Faktúru so starším dátumom API odmietne odpoveďou 409 s kódom issue_date_in_past (v details je issue_date, today, new_due_date a can_update). Pošlite požiadavku znova s "update_issue_date": true — dátum vystavenia sa zmení na dnes, splatnosť sa posunie o rovnaký počet dní a dátum dodania ostáva. Keď sa dátum zmeniť nedá (can_update: false — uzamknuté obdobie alebo export do účtovníctva), faktúru odošle s pôvodným dátumom až "keep_issue_date": true. Upomienky a opätovné odoslanie sa nekontrolujú.',
            )}
          </p>
          <CodeBlock
            lang="JSON"
            code={`HTTP/1.1 409 Conflict
{
  "error": {
    "code": "issue_date_in_past",
    "message": "Dátum vystavenia nie je dnešný. …",
    "details": {
      "issue_date": "2026-10-20",
      "today": "2026-10-21",
      "new_due_date": "2026-11-04",
      "can_update": true
    }
  }
}

curl -X POST https://faktero.sk/api/v1/invoices/inv_123/send \\
  -H "Authorization: Bearer fk_live_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{ "recipient_email": "klient@example.com", "update_issue_date": true }'`}
          />

          <h3 className="mt-6 font-semibold">{t("Označiť faktúru ako uhradenú")}</h3>
          <CodeBlock
            lang="cURL"
            code={`curl -X POST https://faktero.sk/api/v1/invoices/inv_123/mark-paid \\
  -H "Authorization: Bearer fk_live_xxx"`}
          />

          <h3 className="mt-6 font-semibold">{t("Prijatie webhooku (PHP)")}</h3>
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
          <h2 className="text-2xl font-semibold">{t("12. Stavové kódy")}</h2>
          <div className="mt-3 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">{t("Kód")}</th>
                  <th className="p-3">{t("Význam")}</th>
                </tr>
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
                    <td className="p-3 text-muted-foreground">{t(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="rate-limits" className="scroll-mt-20">
          <h2 className="text-2xl font-semibold">{t("13. Limity požiadaviek")}</h2>
          <div className="mt-3 rounded-lg border border-dashed border-border bg-card/50 p-6 text-sm text-muted-foreground">
            {t(
              "Limity počtu požiadaviek doplníme pred verejným spustením API. Pre spoľahlivé použitie v produkcii odporúčame pri odpovedi 429 opakovať požiadavku s postupne predlžovaným odstupom (exponenciálny backoff).",
            )}
          </div>
        </section>

        <section id="cta" className="scroll-mt-20">
          <h2 className="text-2xl font-semibold">{t("14. Pre vývojárov")}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {loggedIn ? (
              <>
                <Link
                  to="/api-kluce"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  <KeyRound className="h-4 w-4" /> {t("Vytvoriť API kľúč")}
                </Link>
                <Link
                  to="/api-playground"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium hover:bg-secondary"
                >
                  <PlayCircle className="h-4 w-4" /> {t("Otvoriť skúšobné prostredie API")}
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/registracia"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  <UserPlus className="h-4 w-4" /> {t("Vytvoriť účet zdarma")}
                </Link>
                <Link
                  to="/vyvojari/$slug"
                  params={{ slug: "playground" }}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium hover:bg-secondary"
                >
                  <PlayCircle className="h-4 w-4" /> {t("Skúšobné prostredie API")}
                </Link>
              </>
            )}
            <a
              href="mailto:podpora@faktero.sk"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium hover:bg-secondary"
            >
              <LifeBuoy className="h-4 w-4" /> {t("Kontaktovať podporu")}
            </a>
          </div>
        </section>
      </article>
    </div>
  );
}
