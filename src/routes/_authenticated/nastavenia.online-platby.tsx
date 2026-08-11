import { createFileRoute, Link } from "@tanstack/react-router";
import { CreditCard, QrCode, Landmark } from "lucide-react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";

/**
 * Online platby kartou pre zákazníkov firmy — zatiaľ neponúkame.
 *
 * Aby si každá firma mohla pripojiť **vlastný** GoPay účet pod doménou
 * Faktera, nestačí bežný merchant účet — potrebný je platformový vzťah
 * s poskytovateľom. Kým to nie je vybavené, je poctivejšie funkciu
 * neponúkať než ju mať v nastaveniach a nechať ju zlyhať pri pripájaní.
 *
 * Stránka ostáva pre prípad uloženého odkazu a vysvetlí, čo namiesto toho.
 * Serverová časť ani platby za predplatné Faktera sa toho netýkajú — to je
 * samostatná vetva a funguje ďalej.
 */

export const Route = createFileRoute("/_authenticated/nastavenia/online-platby")({
  head: () => ({ meta: [{ title: "Online platby — Faktero" }] }),
  component: OnlinePlatbyPage,
});

function OnlinePlatbyPage() {
  return (
    <>
      <PageHeader
        title="Online platby"
        description="Ako od zákazníkov dostať peniaze rýchlejšie."
      />
      <PageBody>
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                <CreditCard className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold">Platby kartou zatiaľ neponúkame</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Aby ste mohli prijímať platby kartou pod vlastným účtom, potrebuje poskytovateľ
                  platobnej brány zmluvu, ktorá to na spoločnej doméne umožňuje. Kým ju nemáme,
                  funkciu radšej neponúkame, než aby vás sklamala v momente, keď na ňu spoľahnete.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Čo funguje už teraz
            </h3>
            <ul className="mt-4 space-y-4">
              <li className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <QrCode className="h-[18px] w-[18px]" />
                </span>
                <span className="text-sm">
                  <span className="block font-medium">QR platba na každej faktúre</span>
                  <span className="block text-muted-foreground">
                    Odberateľ naskenuje kód v mobilnej banke a má predvyplnenú sumu aj variabilný
                    symbol. Netreba nič nastavovať — je to na PDF automaticky.
                  </span>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Landmark className="h-[18px] w-[18px]" />
                </span>
                <span className="text-sm">
                  <span className="block font-medium">Párovanie úhrad z banky</span>
                  <span className="block text-muted-foreground">
                    Keď platba príde, Faktero ju samo priradí k faktúre a označí ju za uhradenú.
                  </span>
                </span>
              </li>
            </ul>
            <Link
              to="/bankove-ucty"
              className="mt-5 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Pripojiť bankový účet
            </Link>
          </div>
        </div>
      </PageBody>
    </>
  );
}
