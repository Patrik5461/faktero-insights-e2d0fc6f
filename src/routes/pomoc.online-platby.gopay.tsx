import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/faktero/MarketingShell";

export const Route = createFileRoute("/pomoc/online-platby/gopay")({
  head: () => ({
    meta: [
      { title: "Pomoc — Online platby cez GoPay — Faktero" },
      {
        name: "description",
        content:
          "Pomoc pre používateľov Faktera: ako pripojiť GoPay účet, ako prijať platbu, často kladené otázky.",
      },
    ],
  }),
  component: HelpGoPay,
});

function HelpGoPay() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-3xl px-4 py-12 space-y-6">
        <p className="text-sm font-medium text-emerald-700">Pomoc · Online platby</p>
        <h1 className="text-3xl font-bold tracking-tight">GoPay — najčastejšie otázky</h1>
        <p className="text-muted-foreground">
          Kompletný návod nájdete v{" "}
          <Link to="/docs/online-platby/gopay" className="text-primary underline">
            dokumentácii
          </Link>
          . Tu sú najdôležitejšie body:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-sm">
          <li>
            <strong>Peniaze nikdy nejdú cez Faktero.</strong> Idú priamo na váš GoPay účet.
          </li>
          <li>
            Každá firma musí mať <strong>vlastný GoPay účet</strong>.
          </li>
          <li>
            Faktero si <strong>neúčtuje províziu</strong> z platieb vašich zákazníkov.
          </li>
          <li>
            Po zaplatení faktúra <strong>automaticky</strong> prejde do stavu uhradená.
          </li>
          <li>
            Najprv testujte v <strong>Sandbox režime</strong>, až potom prepnite na produkciu.
          </li>
        </ul>
        <div className="rounded-xl border border-border bg-card p-6 text-sm space-y-3">
          <h2 className="font-semibold text-base">Potrebujem viac pomoci</h2>
          <p className="text-muted-foreground">
            Napíšte nám cez kontaktný formulár v aplikácii, radi vám poradíme s nastavením.
          </p>
          <Link
            to="/nastavenia/online-platby"
            className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Otvoriť nastavenia
          </Link>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 text-sm space-y-2">
          <h2 className="font-semibold text-base">Právne dokumenty</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <Link to="/pravne/gopay-podmienky" className="text-primary underline">
                GoPay podmienky
              </Link>
            </li>
            <li>
              <Link to="/pravne/obchodne-podmienky" className="text-primary underline">
                Obchodné podmienky Faktera
              </Link>
            </li>
            <li>
              <Link to="/pravne/gdpr" className="text-primary underline">
                GDPR — ochrana osobných údajov
              </Link>
            </li>
            <li>
              <Link to="/pravne/reklamacny-poriadok" className="text-primary underline">
                Reklamačný poriadok
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </MarketingShell>
  );
}
