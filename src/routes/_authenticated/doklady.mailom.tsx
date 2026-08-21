import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { PrijemMailom } from "@/components/faktero/PrijemMailom";
import { Forward, ScanLine, FileCheck2 } from "lucide-react";

/**
 * Doklady e-mailom.
 *
 * Adresa a denník žili len ako zabalený panel na Prijatých faktúrach, ktorý
 * bol predvolene zavretý — kto o funkcii nevedel, nemal ju ako nájsť. Preto
 * vlastná stránka a položka v menu; panel na Prijatých faktúrach ostáva, aby
 * bola adresa poruke aj pri práci s dokladmi.
 */
export const Route = createFileRoute("/_authenticated/doklady/mailom")({
  head: () => ({ meta: [{ title: "Doklady e-mailom — Faktero" }] }),
  component: Stranka,
});

const KROKY = [
  {
    icon: Forward,
    nadpis: "Prepošlete mail",
    text: "Faktúru od dodávateľa prepošlete na svoju adresu nižšie. Nemusíte nič sťahovať ani prihlasovať sa.",
  },
  {
    icon: ScanLine,
    nadpis: "Doklad sa prečíta",
    text: "Z PDF v prílohe sa vytiahne dodávateľ, IČO, IČ DPH, IBAN, číslo faktúry, variabilný symbol, dátumy a sumy.",
  },
  {
    icon: FileCheck2,
    nadpis: "Vy ho potvrdíte",
    text: "Doklad čaká medzi prijatými faktúrami ako rozpracovaný. Nič sa neschváli samo — prezriete si ho a uložíte.",
  },
];

function Stranka() {
  return (
    <>
      <PageHeader
        title="Doklady e-mailom"
        description="Vlastná adresa, na ktorú prepošlete faktúru od dodávateľa — a ona sa sama zaeviduje."
      />
      <PageBody>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          {KROKY.map((k, i) => {
            const Icon = k.icon;
            return (
              <div key={k.nadpis} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-emerald-50 text-emerald-700">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="text-sm font-medium">
                    {i + 1}. {k.nadpis}
                  </div>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{k.text}</p>
              </div>
            );
          })}
        </div>

        <PrijemMailom predvoleneOtvorene />

        <div className="rounded-xl border border-border bg-card p-5 text-sm">
          <h2 className="font-medium">Dobré vedieť</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              Adresa je <strong>pre každú firmu iná</strong>. Keď máte firiem viac, prepnite sa hore
              v lište a vezmite si tú správnu.
            </li>
            <li>
              Berie sa <strong>PDF alebo fotka</strong> v prílohe. Mail bez prílohy sa v denníku
              označí ako „bez prílohy“ a nič sa nezaloží.
            </li>
            <li>
              Viac príloh v jednom maile znamená <strong>viac dokladov</strong> — každá sa spracuje
              zvlášť.
            </li>
            <li>
              Doklady sú vždy <strong>rozpracované</strong>. Nájdete ich v{" "}
              <Link to="/prijate-faktury" className="text-primary underline">
                Prijatých faktúrach
              </Link>
              .
            </li>
            <li>
              Keď by sa adresa dostala tam, kam nemá, dá sa nižšie <strong>vypnúť</strong> alebo{" "}
              <strong>vymeniť za novú</strong> — stará prestane prijímať.
            </li>
            <li>
              Nechce sa vám prepošielať každý mail ručne? <strong>Gmail to vie robiť sám</strong> —
              potvrdenie, ktoré Google pošle na túto adresu, zachytíme a ukážeme vám ho tu ako žltý
              pruh. Postup je v{" "}
              <Link to="/pomoc/doklady" hash="gmail" className="text-primary underline">
                manuáli
              </Link>
              .
            </li>
          </ul>
          <p className="mt-3 text-muted-foreground">
            Podrobne v{" "}
            <Link to="/pomoc/doklady" className="text-primary underline">
              manuáli k dokladom
            </Link>
            .
          </p>
        </div>
      </PageBody>
    </>
  );
}
