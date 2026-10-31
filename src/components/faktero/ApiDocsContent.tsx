import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Check,
  Copy,
  Download,
  KeyRound,
  PlayCircle,
  LifeBuoy,
  Printer,
  UserPlus,
} from "lucide-react";
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
        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-border/40 print:hidden bg-background/80 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur transition-opacity hover:text-foreground group-hover:opacity-100 sm:opacity-0"
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
    GET: "bg-primary/15 text-primary-hover",
    POST: "bg-emerald-500/15 text-emerald-500",
    PUT: "bg-amber-500/15 text-amber-800",
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

const SKUPINY: { nazov: string; polozky: { id: string; label: string }[] }[] = [
  {
    nazov: "Začíname",
    polozky: [
      { id: "uvod", label: "Úvod" },
      { id: "autentifikacia", label: "Autentifikácia" },
      { id: "test-live", label: "Testovací a ostrý režim" },
      { id: "chyby", label: "Chyby" },
      { id: "status-codes", label: "Stavové kódy" },
      { id: "rate-limits", label: "Limity požiadaviek" },
    ],
  },
  {
    nazov: "Endpointy",
    polozky: [
      { id: "customers", label: "Odberatelia" },
      { id: "invoices", label: "Faktúry" },
      { id: "quotes", label: "Cenové ponuky" },
      { id: "recurring", label: "Opakované faktúry" },
      { id: "expenses", label: "Prijaté doklady a banka" },
      { id: "products", label: "Cenník" },
      { id: "companies-api", label: "Firmy a používatelia" },
    ],
  },
  {
    nazov: "Integrácie",
    polozky: [
      { id: "webhooks", label: "Webhooky" },
      { id: "mcp", label: "AI asistenti (MCP)" },
    ],
  },
  {
    nazov: "Príklady a podpora",
    polozky: [
      { id: "examples", label: "Príklady kódu" },
      { id: "cta", label: "Pre vývojárov" },
    ],
  },
];
const SECTIONS = SKUPINY.flatMap((g) => g.polozky);

export function ApiDocsContent({ loggedIn = false }: { loggedIn?: boolean }) {
  const { t, jazyk } = useT();
  /** PDF je vygenerované v slovenčine, češtine a nemčine (`npm run docs:pdf`). */
  const jazykPdf = jazyk === "cs" || jazyk === "de" ? jazyk : "sk";
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
    <div className="api-dokumentacia mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 sm:py-10 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10 print:block print:max-w-none print:p-0">
      {/* Mobil: výber sekcie prilepený hore (v aplikácii pod jej hlavičkou). */}
      <div
        className={`sticky z-30 -mx-4 bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:hidden print:hidden ${loggedIn ? "top-14" : "top-0"}`}
      >
        {/* Vnútorný obal: pravidlo kompaktného rozloženia dáva rodičovi popisu
            a výberu `display: block`, čo by prebilo `lg:hidden` vyššie. */}
        <div>
          <label
            htmlFor="api-docs-obsah"
            className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {t("Obsah dokumentácie")}
          </label>
          <select
            id="api-docs-obsah"
            value={active}
            onChange={(e) => {
              const id = e.target.value;
              setActive(id);
              document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {SKUPINY.map((g) => (
              <optgroup key={g.nazov} label={t(g.nazov)}>
                {g.polozky.map((s) => (
                  <option key={s.id} value={s.id}>
                    {t(s.label)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>
      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:sticky lg:block lg:self-start lg:overflow-y-auto print:hidden ${
          loggedIn
            ? "lg:top-20 lg:max-h-[calc(100vh-6.5rem)]"
            : "lg:top-6 lg:max-h-[calc(100vh-3rem)]"
        }`}
      >
        <div className="rounded-xl border border-border bg-card/40 p-3">
          <div className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("Obsah")}
          </div>
          <nav className="flex flex-col gap-3">
            {SKUPINY.map((g) => (
              <div key={g.nazov}>
                <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                  {t(g.nazov)}
                </div>
                {g.polozky.map((s) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className={`block rounded-md border-l-2 px-3 py-1.5 text-sm transition-colors ${
                      active === s.id
                        ? "border-primary bg-primary/10 font-medium text-primary-hover"
                        : "border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                  >
                    {t(s.label)}
                  </a>
                ))}
              </div>
            ))}
          </nav>
        </div>
      </aside>

      {/* Main content */}
      <article className="min-w-0 space-y-10 [&_p]:max-w-[760px]">
        {/* Hlavička: čo API je, základné údaje a stiahnutie celej dokumentácie. */}
        <header className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-8 print:border-0 print:bg-none print:p-0">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 basis-[28rem] grow">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                REST API · v1
              </div>
              <h1 className="mt-1 text-[clamp(2rem,4vw,3.5rem)] font-bold leading-tight tracking-tight [overflow-wrap:anywhere] [text-wrap:balance]">
                {t("Faktero API dokumentácia")}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
                {t(
                  "Odberatelia, faktúry, ponuky, prijaté doklady, banka, webhooky a napojenie AI asistentov — všetko cez jeden kľúč.",
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 print:hidden">
              <a
                href={`/docs/faktero-api-${jazykPdf}.pdf`}
                download
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <Download className="h-4 w-4" /> {t("Stiahnuť PDF")}
              </a>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-secondary"
              >
                <Printer className="h-4 w-4" /> {t("Tlačiť")}
              </button>
              <a
                href={`/docs/faktero-prepojenia-${jazykPdf}.pdf`}
                download
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-secondary"
              >
                <Download className="h-4 w-4" /> {t("API a prepojenia (PDF)")}
              </a>
            </div>
          </div>
          <dl className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] gap-3">
            {[
              { k: "Base URL", v: "https://faktero.sk/api/v1" },
              { k: "Autentifikácia", v: "Bearer fk_live_…" },
              { k: "Formát", v: "JSON (UTF-8)" },
              { k: "Testovací režim", v: "fk_test_…" },
            ].map((x) => (
              <div
                key={x.k}
                className="min-w-0 rounded-xl border border-border bg-background/70 px-4 py-3"
              >
                <dt className="min-w-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground [overflow-wrap:anywhere]">
                  {t(x.k)}
                </dt>
                <dd className="mt-1 min-w-0 font-mono text-[13px] leading-snug [overflow-wrap:anywhere]">
                  {x.v}
                </dd>
              </div>
            ))}
          </dl>
        </header>

        <div className="space-y-5">
          <div className="flex items-center gap-3 pt-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              {t("Začíname")}
            </span>
            <span className="h-px flex-1 bg-border" aria-hidden />
          </div>
          <section
            id="uvod"
            className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 sm:p-7 print:break-inside-auto print:rounded-none print:border-0 print:p-0"
          >
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("Úvod")}</h2>
            <p className="mt-2 text-base text-muted-foreground">
              {t(
                "Faktero REST API umožňuje plne automatizovať fakturáciu — vytvárať odberateľov, vystavovať faktúry, sťahovať PDF, posielať e-maily a prijímať webhooky o udalostiach. Všetky odpovede sú v JSON formáte (UTF-8).",
              )}
            </p>
          </section>
          <section
            id="autentifikacia"
            className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 sm:p-7 print:break-inside-auto print:rounded-none print:border-0 print:p-0"
          >
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {t("Autentifikácia")}
            </h2>
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
            <h3 className="mt-6 font-semibold">{t("Kľúč pre viac firiem")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                "Účtovná kancelária či integrátor nepotrebuje kľúč za každú firmu. Kľúč pre viac firiem (API kľúče → Kľúč pre viac firiem) platí pre všetky firmy, kde ste vlastník alebo admin, alebo len pre vybrané. Firmu vyberiete v každej požiadavke hlavičkou",
              )}{" "}
              <code className="font-mono">X-Company</code>{" "}
              {t("(id firmy alebo IČO) alebo parametrom")}{" "}
              <code className="font-mono">?company=</code>.{" "}
              {t(
                "Bez nej vráti API chybu company_required so zoznamom firiem — okrem kľúča, ktorý smie len k jednej firme.",
              )}
            </p>
            <div className="mt-3">
              <CodeBlock
                lang="cURL"
                code={`# Firmy, ku ktorým kľúč smie
curl https://faktero.sk/api/v1/companies \\
  -H "Authorization: Bearer fk_live_..."

# Faktúry konkrétnej firmy (podľa IČO)
curl https://faktero.sk/api/v1/invoices \\
  -H "Authorization: Bearer fk_live_..." \\
  -H "X-Company: 12345678"`}
              />
            </div>
            <ul className="mt-3 space-y-1 text-sm">
              <Endpoint
                method="GET"
                path="/api/v1/companies"
                desc="Firmy, ku ktorým kľúč smie (id, názov, IČO)"
              />
            </ul>
          </section>
          <section
            id="test-live"
            className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 sm:p-7 print:break-inside-auto print:rounded-none print:border-0 print:p-0"
          >
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {t("Testovací a ostrý režim")}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("Faktero rozlišuje dva typy kľúčov podľa prefixu:")}
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <code className="font-mono rounded bg-secondary px-1.5 py-0.5">fk_test_…</code> —{" "}
                {t(
                  "testovací režim — kľúč smie len čítať (GET). Zápis, odoslanie či úhrada vráti 403 s kódom test_key_read_only, takže skúšanie integrácie nič nezmení.",
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
          <section
            id="chyby"
            className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 sm:p-7 print:break-inside-auto print:rounded-none print:border-0 print:p-0"
          >
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("Chyby")}</h2>
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
          <section
            id="status-codes"
            className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 sm:p-7 print:break-inside-auto print:rounded-none print:border-0 print:p-0"
          >
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {t("Stavové kódy")}
            </h2>
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
                    ["402", "Payment Required — predplatné firmy nie je aktívne (plan_inactive)"],
                    [
                      "403",
                      "Forbidden — kľúč nemá oprávnenie (test_key_read_only, company_forbidden, account_key_required)",
                    ],
                    ["404", "Not Found — zdroj neexistuje (aj neplatné id v adrese)"],
                    ["405", "Method Not Allowed — koncový bod túto metódu neprijíma"],
                    [
                      "409",
                      "Conflict — konflikt stavu: duplicate, invalid_state, locked, issue_date_in_past, approval_pending, buyer_mismatch, already_matched, bank_payment",
                    ],
                    ["422", "Unprocessable Entity — validačná chyba"],
                    [
                      "429",
                      "Too Many Requests — odosielanie e-mailov je dočasne zastavené (sending_blocked)",
                    ],
                    ["500", "Internal Server Error — chyba na strane Faktero"],
                    ["502", "Bad Gateway — e-mail sa nepodarilo odoslať (send_failed)"],
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
          <section
            id="rate-limits"
            className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 sm:p-7 print:break-inside-auto print:rounded-none print:border-0 print:p-0"
          >
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {t("Limity požiadaviek")}
            </h2>
            <div className="mt-3 rounded-lg border border-dashed border-border bg-card/50 p-6 text-sm text-muted-foreground">
              {t(
                "Počet požiadaviek nie je obmedzený — aj veľký prenos (tisíce dokladov) môžete poslať naraz. Posielajte ich však za sebou, nie stovky súbežne, a pri dočasnej chybe servera (5xx) požiadavku zopakujte s postupne predlžovaným odstupom. S external_id je opakovanie bezpečné.",
              )}
            </div>
          </section>
        </div>
        <div className="space-y-5">
          <div className="flex items-center gap-3 pt-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              {t("Endpointy")}
            </span>
            <span className="h-px flex-1 bg-border" aria-hidden />
          </div>
          <section
            id="customers"
            className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 sm:p-7 print:break-inside-auto print:rounded-none print:border-0 print:p-0"
          >
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("Odberatelia")}</h2>
            <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card px-4">
              <Endpoint method="POST" path="/api/v1/customers" desc="Vytvorenie odberateľa" />
              <Endpoint method="GET" path="/api/v1/customers" desc="Zoznam odberateľov" />
              <Endpoint method="GET" path="/api/v1/customers/{id}" desc="Detail odberateľa" />
              <Endpoint method="PUT" path="/api/v1/customers/{id}" desc="Úprava odberateľa" />
              <Endpoint
                method="POST"
                path="/api/v1/customers/import"
                desc="Hromadný prenos adresára (do 1000)"
              />
            </ul>
            <h3 className="mt-5 font-semibold">{t("Hromadný prenos adresára")}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t(
                "Prenesie odberateľov aj dodávateľov z iného programu naraz. Páruje podľa external_id, potom IČO, bez IČO podľa mena. Existujúci kontakt sa len doplní o prázdne polia; s update_existing: true sa prepíše. Odpoveď povie, čo sa založilo, doplnilo alebo ostalo bez zmeny, a chyby po riadkoch.",
              )}
            </p>
            <div className="mt-3">
              <CodeBlock
                lang="json"
                code={`POST /api/v1/customers/import
{
  "update_existing": false,
  "contacts": [
    { "name": "Odberateľ s.r.o.", "ico": "12345678", "email": "fakturacia@odberatel.sk" },
    { "name": "Dodávateľ a.s.", "ico": "87654321", "supplier": true, "customer": false,
      "iban": "SK31 1200 0000 1987 4263 7541" }
  ]
}`}
              />
            </div>
          </section>
          <section
            id="invoices"
            className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 sm:p-7 print:break-inside-auto print:rounded-none print:border-0 print:p-0"
          >
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("Faktúry")}</h2>
            <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card px-4">
              <Endpoint method="POST" path="/api/v1/invoices" desc="Vystavenie faktúry" />
              <Endpoint method="GET" path="/api/v1/invoices" desc="Zoznam faktúr" />
              <Endpoint method="GET" path="/api/v1/invoices/{id}" desc="Detail faktúry" />
              <Endpoint
                method="PUT"
                path="/api/v1/invoices/{id}"
                desc="Úprava: poznámka, splatnosť, VS, úhrada, dodací list, pečiatka, zaúčtovanie, stav a štítky"
              />
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
            <h3 className="mt-5 font-semibold">{t("Vystavenie faktúry")}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t(
                "Odberateľa pošlite ako customer_id z adresára alebo ako objekt customer (name, ico, dic, ic_dph, street, city, zip, country, email). Položka má name, quantity, unit, unit_price (bez DPH), vat_rate a voliteľne discount_percent (zľava riadku v %) a prenesenie (prenesenie daňovej povinnosti len pri tejto položke). Bez vat_rate platí základná sadzba krajiny firmy (neplatiteľ DPH 0 %), bez currency mena firmy. S external_id sa tá istá faktúra druhýkrát nevystaví — opakovaná požiadavka vráti existujúcu (200).",
              )}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>
                <code className="font-mono">discount_type</code> (percent, amount) {t("a")}{" "}
                <code className="font-mono">discount_value</code> —{" "}
                {t(
                  "zľava na celý doklad; rozpočíta sa pomerne medzi sadzby DPH a v odpovedi je discount_total.",
                )}
              </li>
              <li>
                <code className="font-mono">reverse_charge: true</code> {t("a")}{" "}
                <code className="font-mono">reverse_charge_type</code> (domestic_69, eu_b2b, export)
                —{" "}
                {t(
                  "prenesenie daňovej povinnosti; DPH faktúry je nula a PDF uvedie zákonnú vetu. Pri eu_b2b musí mať odberateľ IČ DPH z iného členského štátu (eu_plnenie: tovar, sluzba, trojstranny).",
                )}
              </li>
              <li>
                <code className="font-mono">currency</code> —{" "}
                {t(
                  "v cudzej mene Faktero doplní kurz (slovenská firma ECB zo dňa pred dodaním, česká ČNB) a sumy v domácej mene: exchange_rate, exchange_rate_date, vat_total_eur.",
                )}
              </li>
              <li>
                <code className="font-mono">subtotal</code>,{" "}
                <code className="font-mono">vat_amount</code>{" "}
                {t(
                  "pri položke — presné sumy z e-shopu (pri všetkých položkách alebo pri žiadnej). Musia sedieť s cenou a sadzbou, inak 400; so zľavou sa nekombinujú.",
                )}
              </li>
              <li>
                <code className="font-mono">order_number</code>,{" "}
                <code className="font-mono">variable_symbol</code>,{" "}
                <code className="font-mono">delivery_date</code>,{" "}
                <code className="font-mono">due_date</code> ({t("predvolene o 14 dní")}),{" "}
                <code className="font-mono">payment_method</code>,{" "}
                <code className="font-mono">notes</code>.
              </li>
            </ul>
            <div className="mt-3">
              <CodeBlock
                lang="json"
                code={`POST /api/v1/invoices
{
  "external_id": "eshop-10042",
  "customer": { "name": "Stavby s.r.o.", "ico": "12345678", "ic_dph": "SK2020123456" },
  "reverse_charge": true,
  "reverse_charge_type": "domestic_69",
  "discount_type": "percent",
  "discount_value": 5,
  "items": [
    { "name": "Montáž", "quantity": 10, "unit": "hod", "unit_price": 40, "vat_rate": 23,
      "discount_percent": 10 }
  ]
}`}
              />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {t(
                "GET /invoices vráti najviac 200 faktúr (limit, offset, status) a has_more s next_offset. GET /invoices/{id}/pdf vráti url (podpísaný odkaz na PDF) a expires_in v sekundách — odkaz platí hodinu.",
              )}
            </p>
            <h3 className="mt-5 font-semibold">{t("Dodací list, pečiatka a zaúčtovanie")}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t(
                "Pri vystavení (POST) aj úprave (PUT) môžete poslať dodaci_list: true (faktúra slúži zároveň ako dodací list — iný nadpis a podpisy odovzdania a prevzatia v PDF), zobrazit_peciatku (true alebo false; bez neho podľa nastavenia firmy) a accounting { predkontacia, clenenie_dph, kv_clenenie, stredisko, cinnost, booked }. V odpovedi sú ako pohoda_predkontacia, pohoda_clenenie_dph a kv_clenenie. Faktúra prijíma aj stav, štítky, komentár a účtovnú poznámku (pozri Prijaté doklady a banka). Na faktúre odovzdanej do účtovníctva sa účtovné údaje, sumy ani dátumy nezmenia — API vráti 409 s kódom locked a v details sú dotknuté polia.",
              )}
            </p>
            <div className="mt-3">
              <CodeBlock
                lang="json"
                code={`PUT /api/v1/invoices/{id}
{
  "dodaci_list": true,
  "zobrazit_peciatku": false,
  "accounting": { "predkontacia": "1Fv", "clenenie_dph": "UD", "kv_clenenie": "A1" },
  "stav": "Skontrolovať",
  "stitky_pridat": "Zákazka Novák",
  "komentar": "Overiť dodanie s Petrom"
}`}
              />
            </div>
          </section>
          <section
            id="quotes"
            className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 sm:p-7 print:break-inside-auto print:rounded-none print:border-0 print:p-0"
          >
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {t("Cenové ponuky")}
            </h2>
            <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card px-4">
              <Endpoint method="POST" path="/api/v1/quotes" desc="Vytvorenie ponuky" />
              <Endpoint method="GET" path="/api/v1/quotes" desc="Zoznam ponúk" />
              <Endpoint method="GET" path="/api/v1/quotes/{id}" desc="Detail ponuky" />
              <Endpoint
                method="POST"
                path="/api/v1/quotes/{id}/convert"
                desc="Konverzia na faktúru"
              />
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">
              {t(
                "Ponuka prijíma rovnakého odberateľa a položky ako faktúra (bez vat_rate platí sadzba firmy, bez currency mena firmy). Konverzia vystaví faktúru s dnešným dátumom; opakovaná konverzia vráti tú istú faktúru.",
              )}
            </p>
          </section>
          <section
            id="recurring"
            className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 sm:p-7 print:break-inside-auto print:rounded-none print:border-0 print:p-0"
          >
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {t("Opakované faktúry")}
            </h2>
            <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card px-4">
              <Endpoint method="POST" path="/api/v1/recurring-invoices" desc="Vytvorenie šablóny" />
              <Endpoint method="GET" path="/api/v1/recurring-invoices" desc="Zoznam šablón" />
              <Endpoint method="GET" path="/api/v1/recurring-invoices/{id}" desc="Detail šablóny" />
              <Endpoint method="PUT" path="/api/v1/recurring-invoices/{id}" desc="Úprava šablóny" />
            </ul>
          </section>
          <section
            id="expenses"
            className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 sm:p-7 print:break-inside-auto print:rounded-none print:border-0 print:p-0"
          >
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {t("Prijaté doklady a banka")}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t(
                "Pre účtovný program alebo kanceláriu: prijaté faktúry a bločky so zaúčtovaním (predkontácia, členenie DPH, KV), zmeny od posledného stiahnutia a označenie odovzdaných — rovnako ako to robí konektor Pohody.",
              )}
            </p>
            <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card px-4">
              <Endpoint method="GET" path="/api/v1/purchase-invoices" desc="Prijaté faktúry" />
              <Endpoint
                method="POST"
                path="/api/v1/purchase-invoices"
                desc="Zapísať prijatú faktúru (aj so súborom)"
              />
              <Endpoint
                method="PUT"
                path="/api/v1/purchase-invoices/{id}"
                desc="Úprava, úhrada (payment_date), zaúčtovanie"
              />
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
              <Endpoint
                method="GET"
                path="/api/v1/purchase-invoices/{id}/payments"
                desc="Úhrady prijatej faktúry a koľko zostáva uhradiť"
              />
              <Endpoint
                method="POST"
                path="/api/v1/purchase-invoices/{id}/payments"
                desc="Pridať úhradu (aj čiastočnú)"
              />
              <Endpoint
                method="DELETE"
                path="/api/v1/purchase-invoices/{id}/payments/{paymentId}"
                desc="Zmazať ručne pridanú úhradu"
              />
              <Endpoint method="GET" path="/api/v1/receipts" desc="Bločky" />
              <Endpoint method="POST" path="/api/v1/receipts" desc="Zapísať bloček" />
              <Endpoint method="PUT" path="/api/v1/receipts/{id}" desc="Úprava bločku" />
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
              <Endpoint
                method="POST"
                path="/api/v1/bank-transactions/{id}/resolution"
                desc="Vybaviť pohyb bez dokladu (aj transakčná daň)"
              />
              <Endpoint method="GET" path="/api/v1/document-states" desc="Vlastné stavy dokladov" />
              <Endpoint method="GET" path="/api/v1/tags" desc="Číselník štítkov" />
              <Endpoint
                method="GET"
                path="/api/v1/accounting-codes"
                desc="Predkontácie, členenia DPH, strediská, činnosti a číselné rady"
              />
              <Endpoint
                method="GET"
                path="/api/v1/accounting-templates"
                desc="Predlohy zaúčtovania"
              />
              <Endpoint
                method="POST"
                path="/api/v1/bank-accounts"
                desc="Pridať účet bez napojenia na banku"
              />
              <Endpoint
                method="POST"
                path="/api/v1/bank-accounts/{id}/transactions"
                desc="Preniesť pohyby na taký účet (do 2000)"
              />
            </ul>
            <h3 className="mt-5 font-semibold">{t("Zápis prijatej faktúry")}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t(
                "Sumy pošlite buď ako položky (ceny bez DPH, sadzba v %), alebo ako amount_total (+ amount_without_vat a vat_amount). Dodávateľ sa založí v adresári, ak tam nie je. S external_id je opakované volanie bezpečné; bez neho sa tá istá faktúra (IČO + číslo + suma) druhýkrát nezaloží (409). Súbor (PDF, JPG, PNG) ide ako base64 do 14 MB. Bez accounting.booked príde faktúra nezaúčtovaná.",
              )}
            </p>
            <div className="mt-3">
              <CodeBlock
                lang="json"
                code={`POST /api/v1/purchase-invoices
{
  "external_id": "erp-2026-0042",
  "invoice_number": "FV2026118",
  "supplier": { "name": "Dodávateľ s.r.o.", "ico": "12345678",
                "ic_dph": "SK2020123456", "iban": "SK3112000000198742637541" },
  "issue_date": "2026-10-20",
  "delivery_date": "2026-10-20",
  "due_date": "2026-11-03",
  "variable_symbol": "2026118",
  "payment_method": "prevod",
  "items": [{ "name": "Servis", "quantity": 2, "unit_price": 50, "vat_rate": 23 }],
  "accounting": { "predkontacia": "1Fp", "clenenie_dph": "PD", "booked": false },
  "file": { "file_name": "FV2026118.pdf", "content_type": "application/pdf",
            "content_base64": "JVBERi0xLjQK..." }
}`}
              />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {t(
                "Voliteľné pole buyer { name, ico, dic, ic_dph } je odberateľ uvedený na doklade. Keď nesedí s firmou kľúča (iné IČO, IČ DPH alebo názov), faktúra sa zapíše s príznakom odberatel_nesedi a nezaúčtuje sa ani s accounting.booked. Kým vo Fakteri nepotvrdíte, že patrí tejto firme, zaúčtovanie cez PUT vráti 409 s kódom buyer_mismatch.",
              )}
            </p>
            <CodeBlock
              lang="json"
              code={`PUT /api/v1/purchase-invoices/{id}
{ "accounting": { "booked": true } }

409 Conflict
{ "error": { "code": "buyer_mismatch",
             "message": "Faktúra nepatrí firme …, odberateľ je … Kým vo Fakteri nepotvrdíte, že faktúra patrí tejto firme, nedá sa zaúčtovať." } }`}
            />
            <p className="mt-3 text-sm text-muted-foreground">
              {t(
                "Úhradu zapíšete cez PUT s payment_date. Bloček: issue_date, total_amount (s DPH), vat_breakdown [{ rate, base, vat }] a payment_method (hotovost, karta, prevod) — hotovosť sa započíta do pokladne, ak nepošlete cash_register: false.",
              )}
            </p>
            <h3 className="mt-5 font-semibold">{t("Úhrady prijatých faktúr")}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t(
                "Prijatá faktúra môže mať viac úhrad, aj čiastočných. POST …/payments prijme amount (v mene faktúry), paid_at (RRRR-MM-DD, predvolene dnes), method (prevod, hotovost, karta) a note; s external_id je opakovanie bezpečné. Keď súčet úhrad dosiahne sumu na úhradu (celková suma mínus zaplatená zálohová faktúra), faktúra je uhradená — stav a payment_date prepočíta Faktero samo. GET vráti úhrady a súhrn amount_due, amount_paid, amount_remaining a payment_status (paid, partially_paid, unpaid). Úhradu zo spárovaného bankového pohybu (source: bank) cez API zmazať nejde (409 bank_payment). Úhrady nezamyká odovzdanie do účtovníctva ani uzávierka.",
              )}
            </p>
            <div className="mt-3">
              <CodeBlock
                lang="json"
                code={`POST /api/v1/purchase-invoices/{id}/payments
{ "amount": 50.00, "paid_at": "2026-10-28", "method": "prevod",
  "external_id": "erp-uhrada-881" }

201 Created
{
  "objekt": "purchase_invoice_payment",
  "id": "2f0c…", "amount": 50, "currency": "EUR", "paid_at": "2026-10-28",
  "source": "manual", "deletable": true,
  "invoice": { "amount_due": 123, "amount_paid": 50, "amount_remaining": 73,
               "payment_status": "partially_paid" }
}`}
              />
            </div>
            <h3 className="mt-5 font-semibold">{t("Stav, štítky, komentár a účtovná poznámka")}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t(
                "Prijaté faktúry, bločky aj vystavené faktúry prijímajú pri zápise (POST) aj úprave (PUT): stav_id alebo stav (názov z GET /document-states; null stav zruší), stitky (nahradia celý zoznam, najviac 5) alebo stitky_pridat a stitky_odobrat (jeden štítok), komentar (pre ľudí vo firme, do účtovníctva nejde nikdy) a int_poznamka (účtovná poznámka, ide s dokladom do účtovníctva). Nový štítok sa zapíše aj do číselníka firmy (GET /tags). Stav, štítky a komentár sa menia aj na doklade odovzdanom do účtovníctva; účtovné údaje vrátane účtovnej poznámky nie — API vráti 409 locked, kým doklad nevrátite (exported: false).",
              )}
            </p>
            <div className="mt-3">
              <CodeBlock
                lang="json"
                code={`PUT /api/v1/receipts/{id}
{ "stav": "Čaká na doklad od klienta", "stitky": ["Auto", "Služobná cesta"],
  "komentar": "Chýba druhá strana bločku" }

409 Conflict
{ "error": { "code": "locked", "message": "Doklad je odovzdaný do účtovníctva — …",
             "details": { "reason": "odovzdany", "fields": ["pohoda_predkontacia"] } } }`}
              />
            </div>
            <h3 className="mt-5 font-semibold">{t("Číselníky zaúčtovania")}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t(
                "GET /accounting-codes vráti číselník firmy (napr. prenesený z Pohody): druh, kod, popis, ucet_md, ucet_d, typ_dokladu a typ_platby. Filter kind (predkontacia, clenenie_dph, stredisko, cinnost, ciselny_rad); document_type (faktura, blocek) a payment_type (hotovost, karta, prevod) vrátia kódy pre daný typ aj tie, ktoré typ neurčujú; active=all vráti aj vypnuté. GET /accounting-templates vráti predlohy zaúčtovania (document_kind: blocek, prijata, vystavena). Kód z číselníka pošlite v accounting.predkontacia.",
              )}
            </p>
            <h3 className="mt-5 font-semibold">{t("Pohyby bez dokladu")}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t(
                "Nie každý pohyb má doklad — poplatok banky, mzda, odvod či transakčná daň. Každý pohyb nesie stav (sparovany, bez_dokladu, transakcna_dan, nesparovany) a vybavenie, vybavenie_poznamka a vybavene_at; filter state=nesparovany vráti len to, čo treba ešte vyriešiť. POST /bank-transactions/{id}/resolution s resolution bez_dokladu alebo transakcna_dan (a note do 200 znakov) pohyb vybaví, resolution: null označenie zruší. Spárovaný pohyb sa označiť nedá (409 already_matched). Transakčnú daň Faktero väčšinou spozná samo podľa popisu banky.",
              )}
            </p>
            <div className="mt-3">
              <CodeBlock
                lang="json"
                code={`POST /api/v1/bank-transactions/{id}/resolution
{ "resolution": "bez_dokladu", "note": "Poplatok za vedenie účtu" }`}
              />
            </div>
            <h3 className="mt-5 font-semibold">{t("Prenos bankového účtu")}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t(
                "Pre banku, ku ktorej sa Faktero nepripojí, alebo pri prechode z iného programu: POST /bank-accounts založí účet (IBAN, mena, zostatok) a pohyby naň pošlete dávkou. Každý pohyb má mať reference (jedinečné id z banky); bez neho ho Faktero odvodí z dátumu, sumy a symbolov, takže opakované odoslanie nič nezdvojí. Na účet napojený priamo na banku pohyby cez API poslať nejde — vedie ich banka.",
              )}
            </p>
            <div className="mt-3">
              <CodeBlock
                lang="json"
                code={`POST /api/v1/bank-accounts/{id}/transactions
{
  "transactions": [
    { "booking_date": "2026-10-22", "amount": 123.00, "variable_symbol": "2026001",
      "counterparty": "Odberateľ s.r.o.", "reference": "TX-88123" },
    { "booking_date": "2026-10-22", "amount": -12.30, "description": "Kancelárske potreby",
      "reference": "TX-88124" }
  ],
  "balance": 1098.40
}`}
              />
            </div>
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
                <code className="font-mono">stav_id</code> {t("(id stavu alebo none) a")}{" "}
                <code className="font-mono">tag</code> —{" "}
                {t("len doklady s daným stavom alebo štítkom.")}
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
                <code className="font-mono">bank_account_id</code>,{" "}
                <code className="font-mono">state</code>; <code className="font-mono">page</code> +{" "}
                <code className="font-mono">per_page</code> {t("(alebo")}{" "}
                <code className="font-mono">offset</code> + <code className="font-mono">limit</code>
                ), {t("najviac 500 na stranu. Odpoveď má")} <code className="font-mono">total</code>
                , <code className="font-mono">has_more</code> {t("a")}{" "}
                <code className="font-mono">next_offset</code>{" "}
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
          <section
            id="products"
            className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 sm:p-7 print:break-inside-auto print:rounded-none print:border-0 print:p-0"
          >
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("Cenník")}</h2>
            <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card px-4">
              <Endpoint
                method="GET"
                path="/api/v1/products"
                desc="Produkty a služby (q = hľadanie)"
              />
              <Endpoint method="POST" path="/api/v1/products" desc="Pridať do cenníka" />
              <Endpoint method="GET" path="/api/v1/products/{id}" desc="Detail produktu" />
              <Endpoint method="PUT" path="/api/v1/products/{id}" desc="Úprava produktu" />
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">
              {t(
                "Cena je bez DPH. S external_id sa ten istý produkt druhýkrát nezaloží — vhodné na synchronizáciu z e-shopu či skladového programu.",
              )}
            </p>
          </section>
          <section
            id="companies-api"
            className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 sm:p-7 print:break-inside-auto print:rounded-none print:border-0 print:p-0"
          >
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {t("Firmy a používatelia")}
            </h2>
            <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card px-4">
              <Endpoint method="GET" path="/api/v1/companies" desc="Firmy, ku ktorým kľúč smie" />
              <Endpoint method="POST" path="/api/v1/companies" desc="Založiť firmu (kľúč účtu)" />
              <Endpoint method="GET" path="/api/v1/companies/{id}" desc="Detail firmy" />
              <Endpoint method="PUT" path="/api/v1/companies/{id}" desc="Úprava údajov firmy" />
              <Endpoint
                method="GET"
                path="/api/v1/companies/{id}/members"
                desc="Používatelia a čakajúce pozvánky"
              />
              <Endpoint
                method="POST"
                path="/api/v1/companies/{id}/invitations"
                desc="Pozvať používateľa (kľúč účtu)"
              />
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">
              {t(
                "Pre účtovné kancelárie a integrátorov: kľúčom pre viac firiem založíte firmu nového klienta (stanete sa jej vlastníkom a kľúč k nej hneď smie) a pozvete do nej používateľov — účtovníka (accountant), admina alebo zamestnanca. Pozvánka príde e-mailom a platí 14 dní; v odpovedi je aj odkaz na prijatie. Firmu zakladať a pozývať smie len kľúč pre viac firiem, ktorého majiteľ je vo firme vlastník alebo admin — obyčajný firemný kľúč nie.",
              )}
            </p>
            <div className="mt-3">
              <CodeBlock
                lang="bash"
                code={`# Nová firma klienta
curl -X POST https://faktero.sk/api/v1/companies \\
  -H "Authorization: Bearer fk_live_..." -H "Content-Type: application/json" \\
  -d '{"name":"Klient s.r.o.","ico":"12345678","country":"SK","vat_payer":true}'

# Pozvánka pre účtovníčku
curl -X POST https://faktero.sk/api/v1/companies/{id}/invitations \\
  -H "Authorization: Bearer fk_live_..." -H "Content-Type: application/json" \\
  -d '{"email":"uctovnicka@kancelaria.sk","role":"accountant"}'`}
              />
            </div>
          </section>
        </div>
        <div className="space-y-5">
          <div className="flex items-center gap-3 pt-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              {t("Integrácie")}
            </span>
            <span className="h-px flex-1 bg-border" aria-hidden />
          </div>
          <section
            id="webhooks"
            className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 sm:p-7 print:break-inside-auto print:rounded-none print:border-0 print:p-0"
          >
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("Webhooky")}</h2>
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
                "bank_transaction.created",
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
                "Pri každej zmene faktúry na uhradenú — po spárovaní s bankovým pohybom (automaticky aj ručne), po hromadnom označení v zozname, cez POST /api/v1/invoices/…/mark-paid aj zmenou stavu v detaile faktúry. Pri mark-paid príde hneď, inak do minúty. Ak úhradu priniesla banka, payload má bank_transaction_id spárovaného pohybu.",
              )}
            </p>
            <CodeBlock
              lang="json"
              code={`{
  "event": "invoice.paid",
  "created_at": "2026-10-24T18:01:12Z",
  "data": {
    "invoice_id": "8958a73f-…",
    "invoice_number": "20260042",
    "status": "paid",
    "total": 370.04,
    "currency": "EUR",
    "external_id": "eshop-10042",
    "customer_id": "40f865bf-…",
    "customer_name": "Odberateľ s.r.o.",
    "customer_email": "fakturacia@odberatel.sk",
    "paid_at": "2026-10-24T18:00:58Z",
    "bank_transaction_id": null
  }
}`}
            />
            <p className="mt-2 text-sm text-muted-foreground">
              {t(
                "Ostatné udalosti faktúry (invoice.created, invoice.sent, invoice.cancelled) majú rovnaké data bez paid_at a bank_transaction_id; customer.created nesie customer_id, name, email, ico a external_id.",
              )}
            </p>
            <h3 className="mt-6 font-semibold">bank_transaction.created</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t(
                "Príde do minúty po tom, čo sa pohyb objaví vo Fakteri (synchronizácia s bankou, import výpisu, bankové notifikácie). Data majú rovnaký tvar ako položka z GET /api/v1/bank-transactions vrátane iban a bank_name, takže pohyby netreba dopytovať. Pri prvom pripojení banky príde udalosť za každý natiahnutý pohyb.",
              )}
            </p>
            <CodeBlock
              lang="json"
              code={`{
  "event": "bank_transaction.created",
  "created_at": "2026-10-24T18:01:12Z",
  "data": {
    "id": "0b6f…",
    "bank_account_id": "7c9a8242-5b05-4ab6-bc25-f543cf62079b",
    "iban": "SK1211000000002612345678",
    "bank_name": "Tatra banka, a.s.",
    "booking_date": "2026-10-24",
    "amount": 1230.00,
    "currency": "EUR",
    "variable_symbol": "20260042",
    "counterparty": "Odberateľ s.r.o.",
    "matched_invoice_id": null
  }
}`}
            />

            <h3 className="mt-6 font-semibold">{t("Overovanie podpisu")}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("Každá požiadavka má hlavičku")}{" "}
              <code className="font-mono">X-Faktero-Signature</code>{" "}
              {t("obsahujúcu HMAC SHA-256 podpis tela požiadavky vytvorený pomocou vášho")}{" "}
              <em>signing secret</em>. {t("Názov udalosti nesie aj hlavička")}{" "}
              <code className="font-mono">X-Faktero-Event</code>.
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
                "Ak váš endpoint nevráti 2xx do 10 sekúnd, Faktero doručenie hneď zopakuje — celkovo 3 pokusy počas niekoľkých sekúnd. Neskôr sa už neposiela, preto pri výpadku dočítajte zmeny cez API (napr. updated_since alebo GET /bank-transactions). Všetky pokusy a ich stavy nájdete v sekcii Webhooky → Logy. Adresa musí byť https na verejnom serveri (port 443).",
              )}
            </p>
          </section>
          <section
            id="mcp"
            className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 sm:p-7 print:break-inside-auto print:rounded-none print:border-0 print:p-0"
          >
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {t("AI asistenti (MCP)")}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t(
                "Faktero má MCP server — cez Model Context Protocol sa naň napojí Claude, ChatGPT, Cursor či iný AI asistent a pracuje s údajmi vašej firmy: povie, kto vám dlhuje, nájde faktúru, vystaví novú alebo pozrie pohyby na účte. Claude.ai a ChatGPT sa prihlásia cez Faktero, ostatní klienti API kľúčom.",
              )}
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>
                {t("Adresa:")} <code className="font-mono">https://www.faktero.sk/api/mcp</code>{" "}
                {t("(Streamable HTTP)")}
              </li>
              <li>
                {t("Hlavička:")} <code className="font-mono">Authorization: Bearer fk_live_…</code>{" "}
                {t("— na skúšanie použite testovací kľúč.")}
              </li>
              <li>
                {t(
                  "Nástroje: faktúry a ich detail, faktúry po splatnosti, vystavenie faktúry, označenie úhrady, odberatelia aj ich hromadný prenos, cenové ponuky, cenník, prijaté faktúry a bločky (aj ich zápis, úhrady po častiach, stav, štítky a zaúčtovanie), predkontácie a predlohy zaúčtovania, bankové účty a pohyby (aj prenos na účet bez napojenia a vybavenie pohybu bez dokladu), založenie firmy, používatelia a pozvánky.",
                )}
              </li>
              <li>
                {t(
                  "Asistent zmaže nanajvýš ručne pridanú úhradu prijatej faktúry (nástroj je označený ako deštruktívny) a nič neposiela odberateľom — faktúru vystaví, ale odoslanie e-mailom či ako eFaktúru je na vás. Jediný e-mail, ktorý odíde, je pozvánka používateľa, keď o ňu výslovne požiadate. Zapisujúce nástroje sú označené, aby si ich klient dal potvrdiť.",
                )}
              </li>
            </ul>
            <h3 className="mt-5 font-semibold">{t("Claude.ai a ChatGPT")}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t(
                "Pridajte vlastný konektor (v Claude: Nastavenia → Konektory, v ChatGPT: Nastavenia → Aplikácie a konektory) a zadajte len adresu servera. Kľúč netreba — otvorí sa Faktero, prihlásite sa, vyberiete firmu a potvrdíte prístup. Prístup sa objaví medzi API kľúčmi ako „AI asistent (MCP)“ a zrušíte ho tam jedným klikom. Pri povolení môžete vybrať aj „Všetky moje firmy“ — asistent sa potom pri otázke spýta, o ktorú firmu ide.",
              )}
            </p>
            <CodeBlock lang="text" code={`https://www.faktero.sk/api/mcp`} />
            <h3 className="mt-5 font-semibold">Claude Code</h3>
            <CodeBlock
              lang="bash"
              code={`claude mcp add --transport http faktero https://www.faktero.sk/api/mcp \\
  --header "Authorization: Bearer fk_live_..."`}
            />
            <h3 className="mt-5 font-semibold">{t("Ostatní klienti (konfigurácia JSON)")}</h3>
            <CodeBlock
              lang="json"
              code={`{
  "mcpServers": {
    "faktero": {
      "type": "http",
      "url": "https://www.faktero.sk/api/mcp",
      "headers": { "Authorization": "Bearer fk_live_..." }
    }
  }
}`}
            />
          </section>
        </div>
        <div className="space-y-5">
          <div className="flex items-center gap-3 pt-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              {t("Príklady a podpora")}
            </span>
            <span className="h-px flex-1 bg-border" aria-hidden />
          </div>
          <section
            id="examples"
            className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 sm:p-7 print:break-inside-auto print:rounded-none print:border-0 print:p-0"
          >
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {t("Príklady kódu")}
            </h2>

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

            <p className="mt-3 text-sm text-muted-foreground">
              {t(
                'Daňový režim: bez poľa reverse_charge ho Faktero určí podľa odberateľa. Firma s IČ DPH iného štátu EÚ dostane faktúru bez DPH ako dodanie do EÚ (reverse_charge_type "eu_b2b"), odberateľ mimo EÚ ako vývoz ("export"); tovar alebo službu povie eu_plnenie ("tovar", "sluzba"; predvolene tovar). Ak niektorá položka nesie nenulovú sadzbu DPH, režim sa nemení — počíta sa s tým, že DPH ste účtovali zámerne. Režim nastavíte aj sami: "reverse_charge": true s reverse_charge_type ("domestic_69", "eu_b2b", "export"), alebo "reverse_charge": false pre tuzemskú DPH.',
              )}
            </p>

            <h3 className="mt-6 font-semibold">{t("Stiahnutie PDF")}</h3>
            <CodeBlock
              lang="JavaScript"
              code={`const res = await fetch(
  "https://faktero.sk/api/v1/invoices/inv_123/pdf",
  { headers: { Authorization: "Bearer fk_live_xxx" } }
);
const { url, expires_in } = await res.json();
// url platí hodinu (expires_in = 3600 s) — stiahnite alebo presmerujte používateľa`}
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
            <p className="mt-3 text-sm text-muted-foreground">
              {t(
                "Keď má firma zapnuté schvaľovanie a voľbu odoslať faktúru až po schválení, neschválenú faktúru API neodošle — vráti 409 s kódom approval_pending. Odošlite ju znova po schválení.",
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
// $event["event"] === "invoice.paid" …
http_response_code(200);`}
            />
          </section>
          <section
            id="cta"
            className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 sm:p-7 print:break-inside-auto print:rounded-none print:border-0 print:p-0"
          >
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {t("Pre vývojárov")}
            </h2>
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
        </div>
      </article>
    </div>
  );
}
