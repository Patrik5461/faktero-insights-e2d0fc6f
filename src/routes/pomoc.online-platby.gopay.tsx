import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/faktero/MarketingShell";

/**
 * Stránka ostáva kvôli uloženým odkazom, ale hovorí to, čo dnes platí:
 * platby kartou pre zákazníkov firmy neponúkame. Pôvodný návod na pripojenie
 * vlastného GoPay účtu by posielal ľudí do funkcie, ktorá v aplikácii nie je.
 */
export const Route = createFileRoute("/pomoc/online-platby/gopay")({
  head: () => ({
    meta: [
      { title: "Pomoc — Ako od zákazníkov dostať peniaze — Faktero" },
      {
        name: "description",
        content:
          "QR platba na faktúre a párovanie úhrad z banky. Platby kartou pre zákazníkov firmy Faktero neponúka.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HelpPlatby,
});

function HelpPlatby() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-12">
        <p className="text-sm font-medium text-primary">Pomoc · Úhrady faktúr</p>
        <h1 className="text-3xl font-bold tracking-tight">Ako od zákazníkov dostať peniaze</h1>

        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Platby kartou zatiaľ neponúkame</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Aby firma mohla prijímať platby kartou pod vlastným účtom, potrebuje poskytovateľ
            platobnej brány zmluvu, ktorá to na spoločnej doméne umožňuje. Kým ju nemáme, funkciu
            neponúkame — je to poctivejšie, než sľúbiť ju a nechať vás zlyhať pri prvom pokuse.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Netýka sa to platenia predplatného za Faktero. To cez platobnú bránu funguje bežne.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Čo použiť namiesto toho</h2>
          <ul className="mt-3 space-y-3 text-sm">
            <li>
              <strong>QR platba priamo na faktúre.</strong> Na každom PDF je kód PAY by square —
              odberateľ ho naskenuje v mobilnej banke a má predvyplnenú sumu, IBAN aj variabilný
              symbol. Netreba nič nastavovať.
            </li>
            <li>
              <strong>Párovanie úhrad z banky.</strong> Keď platba príde na účet, Faktero ju priradí
              k faktúre a označí ju za uhradenú. Isté zhody spáruje samo, sporné predloží na
              rozhodnutie.
            </li>
            <li>
              <strong>Upomienky po splatnosti.</strong> Tri úrovne s vlastnými textami — odosielajú
              sa len tým, ktorí naozaj nezaplatili.
            </li>
          </ul>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              to="/pomoc/banka"
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Návod na bankové účty
            </Link>
            <Link
              to="/pomoc"
              className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-secondary"
            >
              Späť do centra pomoci
            </Link>
          </div>
        </div>
      </div>
    </MarketingShell>
  );
}
