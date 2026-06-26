import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, ArrowRight } from "lucide-react";
import { MarketingShell } from "@/components/faktero/MarketingShell";

const PLANS = [
  {
    name: "Starter",
    price: "9 €",
    period: "/ mesiac",
    tagline: "Pre živnostníkov, ktorí vystavia pár faktúr mesačne.",
    features: ["1 firma", "Neobmedzene faktúr a ponúk", "PDF s QR platbou", "Pohoda export", "E-mailová podpora"],
    featured: false,
  },
  {
    name: "Business",
    price: "24 €",
    period: "/ mesiac",
    tagline: "Pre s.r.o. a tímy. API, webhooky a opakované faktúry.",
    features: ["5 firiem", "Opakované faktúry", "REST API + webhooky", "Test / live režim", "Prioritná podpora"],
    featured: true,
  },
  {
    name: "Enterprise",
    price: "Na mieru",
    period: "",
    tagline: "Pre firmy s vlastnou integráciou a vyšším objemom.",
    features: ["Neobmedzene firiem", "SLA a dedikovaná podpora", "SSO a audit logy", "Konzultácie pri integrácii", "Vlastné podmienky"],
    featured: false,
  },
];

const FAQ = [
  { q: "Je naozaj 2 Mesiace zdarma bez karty?", a: "Áno. Začnete bez platobnej karty a po skúšobnej dobe sa rozhodnete, či si vyberiete platený plán." },
  { q: "Môžem kedykoľvek zmeniť plán?", a: "Áno, plán meníte v sekcii Predplatné. Rozdiel doúčtujeme alikvótne." },
  { q: "Ako funguje fakturácia?", a: "Mesačne alebo ročne. Pri ročnej platbe získate zľavu 2 Mesiace zdarma." },
  { q: "Sú platby bezpečné?", a: "Áno, platby spracúva GoPay. Faktero nevidí údaje vašej karty." },
];

export const Route = createFileRoute("/cennik")({
  head: () => ({
    meta: [
      { title: "Cenník — Faktero" },
      { name: "description", content: "Jednoduchý cenník: Starter 9 € / mesiac, Business 24 € / mesiac, Enterprise na mieru. 2 Mesiace zdarma bez karty." },
      { property: "og:title", content: "Cenník Faktero" },
      { property: "og:description", content: "Starter, Business a Enterprise plány. 2 Mesiace zdarma." },
    ],
  }),
  component: CennikPage,
});

function CennikPage() {
  return (
    <MarketingShell>
      <section className="border-b border-border/60 bg-gradient-to-b from-primary/5 to-transparent">
        <div className="mx-auto max-w-6xl px-6 py-16 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Cenník</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight md:text-5xl">Jednoduché ceny. Bez prekvapení.</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            2 Mesiace zdarma bez platobnej karty. Bezpečné platby cez GoPay.
          </p>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-6 md:grid-cols-3">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={`rounded-2xl border p-6 ${
                p.featured
                  ? "border-primary bg-primary/5 shadow-lg ring-1 ring-primary/30"
                  : "border-border bg-card"
              }`}
            >
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-semibold">{p.name}</h2>
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
          ))}
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