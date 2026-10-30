import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/faktero/MarketingShell";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";
import { kanonicka } from "@/lib/faktero/kanonicka";

export const Route = createFileRoute("/pravne/")({
  head: ({ match }) => ({
    links: kanonicka("/pravne"),
    meta: [
      { title: preloz(match.context.jazyk, "Právne dokumenty — Faktero") },
      {
        name: "description",
        content: preloz(
          match.context.jazyk,
          "Obchodné podmienky, GDPR, reklamačný poriadok, GoPay podmienky a cookies pre službu Faktero.",
        ),
      },
    ],
  }),
  component: Page,
});

const ITEMS = [
  {
    to: "/pravne/obchodne-podmienky",
    label: "Obchodné podmienky",
    desc: "Pravidlá používania služby Faktero.",
  },
  {
    to: "/pravne/gdpr",
    label: "GDPR — Ochrana osobných údajov",
    desc: "Aké údaje spracúvame a prečo.",
  },
  {
    to: "/pravne/spracovanie-udajov",
    label: "Zmluva o spracúvaní osobných údajov",
    desc: "Podmienky podľa čl. 28 GDPR a zoznam subdodávateľov.",
  },
  {
    to: "/pravne/reklamacny-poriadok",
    label: "Reklamačný poriadok",
    desc: "Ako podať reklamáciu a lehoty.",
  },
  {
    to: "/pravne/gopay-podmienky",
    label: "GoPay podmienky",
    desc: "Ako fungujú online platby cez GoPay.",
  },
  { to: "/pravne/cookies", label: "Cookies", desc: "Používanie cookies a lokálneho úložiska." },
  {
    to: "/pravne/tesla-podmienky",
    label: "Tesla Fleet API",
    desc: "Podmienky pripojenia Tesla vozidiel.",
  },
  {
    to: "/pravne/opakovane-platby",
    label: "Opakované platby",
    desc: "Podmienky opakovaných platieb za predplatné.",
  },
] as const;

function Page() {
  const { t } = useT();
  return (
    <MarketingShell>
      <div className="mx-auto max-w-4xl px-4 py-16">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
          {t("Právne")}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{t("Právne dokumenty")}</h1>
        <p className="mt-2 text-muted-foreground">
          {t("Všetky pravidlá, ktorými sa riadi používanie Faktera.")}
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {ITEMS.map((i) => (
            <Link
              key={i.to}
              to={i.to}
              className="rounded-xl border border-border bg-card p-5 hover:border-emerald-500/50 hover:shadow-sm transition"
            >
              <div className="font-semibold">{t(i.label)}</div>
              <div className="mt-1 text-sm text-muted-foreground">{t(i.desc)}</div>
            </Link>
          ))}
        </div>
      </div>
    </MarketingShell>
  );
}
