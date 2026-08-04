import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/faktero/MarketingShell";
import { CreditCard, FileText, Code2, FileCheck2, Wallet, Boxes } from "lucide-react";

export const Route = createFileRoute("/pomoc/")({
  head: () => ({
    meta: [
      { title: "Pomoc — Faktero" },
      {
        name: "description",
        content:
          "Centrum pomoci Faktero — návody pre online platby, faktúry, API, eFaktúru, predplatné a sklad.",
      },
      { property: "og:url", content: "https://faktero.sk/pomoc" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc" }],
  }),
  component: Page,
});

type Cat = { to: string; label: string; desc: string; icon: any; available: boolean };
const CATS: Cat[] = [
  {
    to: "/pomoc/online-platby/gopay",
    label: "Online platby",
    desc: "Pripojenie GoPay, prijímanie platieb, riešenie problémov.",
    icon: CreditCard,
    available: true,
  },
  {
    to: "/pomoc/faktury",
    label: "Faktúry",
    desc: "Vystavovanie, odosielanie, PDF, opakované faktúry.",
    icon: FileText,
    available: true,
  },
  {
    to: "/pomoc/api",
    label: "API",
    desc: "Vývojárske API a webhooky.",
    icon: Code2,
    available: true,
  },
  {
    to: "/pomoc/efaktura",
    label: "eFaktúra",
    desc: "Pripravenosť na elektronickú fakturáciu 2027.",
    icon: FileCheck2,
    available: true,
  },
  {
    to: "/pomoc/predplatne",
    label: "Predplatné",
    desc: "Plány, fakturácia, zrušenie predplatného.",
    icon: Wallet,
    available: true,
  },
  {
    to: "/pomoc/sklad",
    label: "Sklad",
    desc: "Pohyby, inventúra, prepojenie s faktúrami.",
    icon: Boxes,
    available: true,
  },
];

function Page() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-5xl px-4 py-16">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Pomoc</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Centrum pomoci</h1>
        <p className="mt-2 text-muted-foreground max-w-2xl">
          Vyberte si oblasť, s ktorou potrebujete poradiť. Ak hľadáte konkrétnu odpoveď, napíšte nám
          na{" "}
          <a href="mailto:info@faktero.sk" className="text-primary hover:underline">
            info@faktero.sk
          </a>
          .
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CATS.map((c) => {
            const Icon = c.icon;
            const body = (
              <div
                className={`h-full rounded-xl border p-5 transition ${c.available ? "border-border bg-card hover:border-emerald-500/50 hover:shadow-sm" : "border-dashed border-border bg-card/40 opacity-70"}`}
              >
                <div className="flex items-center gap-2">
                  <span className="grid h-9 w-9 place-items-center rounded-md bg-emerald-50 text-emerald-700">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="font-semibold">{c.label}</div>
                  {!c.available && (
                    <span className="ml-auto text-[10px] font-medium uppercase text-muted-foreground">
                      Pripravujeme
                    </span>
                  )}
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{c.desc}</p>
              </div>
            );
            return c.available ? (
              <Link key={c.label} to={c.to}>
                {body}
              </Link>
            ) : (
              <div key={c.label}>{body}</div>
            );
          })}
        </div>
        <div className="mt-10 rounded-xl border border-border bg-card p-6 text-sm">
          <h2 className="font-semibold">Právne dokumenty</h2>
          <p className="text-muted-foreground mt-1">
            Obchodné podmienky, GDPR, GoPay podmienky a ďalšie nájdete v sekcii{" "}
            <Link to="/pravne" className="text-primary hover:underline">
              Právne
            </Link>
            .
          </p>
        </div>
      </div>
    </MarketingShell>
  );
}
