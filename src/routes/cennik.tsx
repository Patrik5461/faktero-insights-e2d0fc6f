import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, ArrowRight, FileText, Car } from "lucide-react";
import { MarketingShell } from "@/components/faktero/MarketingShell";

const INVOICING_PLANS = [
  {
    name: "Starter",
    price: "9 €",
    period: "/ mesiac",
    tagline: "Pre živnostníkov a malé firmy — všetko podstatné bez limitu.",
    features: [
      "eFaktúra zadarmo (Peppol)",
      "Neobmedzené faktúry",
      "2 používatelia + 1 účtovník (čítanie/export)",
      "1 firma",
      "Opakované faktúry",
      "Bankové párovanie",
      "PDF s QR platbou",
      "Pohoda export",
      "E-mail podpora",
    ],
    featured: false,
  },
  {
    name: "Premium",
    price: "19 €",
    period: "/ mesiac",
    tagline: "Pre rastúce tímy bez stropov — API, webhooky a import.",
    features: [
      "eFaktúra zadarmo (Peppol)",
      "Všetko zo Starter",
      "Neobmedzení používatelia",
      "Neobmedzené firmy",
      "API + Webhooky",
      "Import zo SuperFaktúry",
      "Audit log",
      "Prioritná podpora",
    ],
    featured: true,
  },
  {
    name: "Enterprise",
    price: "Individuálne",
    period: "",
    tagline: "Pre väčšie firmy s vlastným onboardingom a SLA.",
    features: [
      "eFaktúra zadarmo (Peppol)",
      "Všetko z Premium",
      "SLA zmluva",
      "Dedikovaný account manager",
      "Vlastný onboarding",
    ],
    featured: false,
  },
];

const LOGBOOK_PLANS = [
  {
    name: "Kniha jázd Mini",
    price: "5 €",
    period: "/ mesiac",
    tagline: "Pre živnostníkov s jedným či dvoma vozidlami.",
    features: [
      "Do 2 vozidiel",
      "Manuálne aj GPS jazdy",
      "Mesačné prehľady a exporty",
      "PDF kniha jázd",
      "E-mail podpora",
    ],
    featured: false,
  },
  {
    name: "Kniha jázd Pro",
    price: "9 €",
    period: "/ mesiac",
    tagline: "Pre firmy s flotilou a GPS integráciami.",
    features: [
      "Neobmedzene vozidiel",
      "Commander GPS integrácia",
      "Tesla Fleet API",
      "Automatické importy jázd",
      "Pokročilé reporty",
      "Prioritná podpora",
    ],
    featured: true,
  },
];

const FAQ = [
  { q: "Koľko stojí odoslanie eFaktúry?", a: "Nič extra — eFaktúra cez Peppol je zahrnutá v cene každého plánu Faktero. Žiadne skryté poplatky za odoslanú faktúru." },
  { q: "Je naozaj 2 Mesiace zdarma bez karty?", a: "Áno. Začnete bez platobnej karty a po skúšobnej dobe sa rozhodnete, či si vyberiete platený plán." },
  { q: "Môžem kedykoľvek zmeniť plán?", a: "Áno, plán meníte v sekcii Predplatné. Rozdiel doúčtujeme alikvótne." },
  { q: "Môžem mať fakturáciu aj knihu jázd súčasne?", a: "Áno — sú to dva samostatné produkty, ale viete ich kombinovať v jednom účte." },
  { q: "Sú platby bezpečné?", a: "Áno, platby spracúva GoPay. Faktero nevidí údaje vašej karty." },
];

export const Route = createFileRoute("/cennik")({
  head: () => ({
    meta: [
      { title: "Cenník — Faktero" },
      { name: "description", content: "Fakturačný systém od 9 €/mes a Kniha jázd od 5 €/mes. 2 Mesiace zdarma bez karty." },
      { property: "og:title", content: "Cenník Faktero" },
      { property: "og:description", content: "Dva samostatné produkty: Fakturačný systém a Kniha jázd. Vyberte si jeden alebo oba." },
    ],
  }),
  component: CennikPage,
});

function PlanCard({ p }: { p: typeof INVOICING_PLANS[number] }) {
  return (
    <div
      className={`rounded-2xl border p-6 ${
        p.featured
          ? "border-primary bg-primary/5 shadow-lg ring-1 ring-primary/30"
          : "border-border bg-card"
      }`}
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-lg font-semibold">{p.name}</h3>
        {p.featured && (
          <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
            Najobľúbenejšie
          </span>
        )}
      </div>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-4xl font-bold tracking-tight">{p.price}</span>
        <span className="text-sm text-muted-foreground">{p.period}</span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{p.tagline}</p>
      <ul className="mt-5 space-y-2 text-sm">
        {p.features.map((f) => (
          <li key={f} className="flex gap-2">
            <Check className="h-4 w-4 text-primary mt-0.5" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Link
        to="/registracia"
        className={`mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold ${
          p.featured ? "bg-primary text-primary-foreground hover:opacity-90" : "border border-border bg-background hover:bg-secondary"
        }`}
      >
        Vyskúšať zdarma <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function CennikPage() {
  return (
    <MarketingShell>
      <section className="border-b border-border/60 bg-gradient-to-b from-primary/5 to-transparent">
        <div className="mx-auto max-w-6xl px-6 py-16 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Cenník</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight md:text-5xl">Dva produkty. Jeden účet.</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Vyberte si Fakturačný systém, Knihu jázd alebo oboje. 2 Mesiace zdarma bez platobnej karty.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-14">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
            <FileText className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-2xl font-bold">Fakturačný systém</h2>
            <p className="text-sm text-muted-foreground">Faktúry, eFaktúra, API, bankové párovanie, sklad.</p>
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {INVOICING_PLANS.map((p) => <PlanCard key={p.name} p={p} />)}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-14">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
            <Car className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-2xl font-bold">Kniha jázd</h2>
            <p className="text-sm text-muted-foreground">Jazdy, vozidlá, Commander GPS a Tesla Fleet API.</p>
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {LOGBOOK_PLANS.map((p) => <PlanCard key={p.name} p={p} />)}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-20">
        <h2 className="text-2xl font-bold">Časté otázky</h2>
        <dl className="mt-6 divide-y divide-border rounded-2xl border border-border bg-card">
          {FAQ.map((item) => (
            <div key={item.q} className="p-5">
              <dt className="font-semibold">{item.q}</dt>
              <dd className="mt-1.5 text-sm text-muted-foreground">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </MarketingShell>
  );
}
