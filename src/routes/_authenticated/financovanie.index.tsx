import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { zoznamZmluvFn } from "@/lib/faktero/financovanie.functions";
import { formatujSumu } from "@/lib/faktero/zostatky";
import { Banknote, Car, Plus, TriangleAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/financovanie/")({
  head: () => ({ meta: [{ title: "Leasingy a úvery — Faktero" }] }),
  component: Stranka,
});

type Zmluva = {
  id: string;
  kind: "leasing" | "uver";
  name: string;
  provider_name: string | null;
  currency: string;
  principal: number;
  status: string;
  splatok: number;
  zaplatenych: number;
  zaplatenaSuma: number;
  zostavaSuma: number;
  poSplatnosti: number;
  dalsiaSplatka: { due_date: string; amount: number } | null;
};

function datum(d: string): string {
  return new Date(`${d}T00:00:00`).toLocaleDateString("sk-SK");
}

function Stranka() {
  const nacitaj = useServerFn(zoznamZmluvFn);
  const [zmluvy, setZmluvy] = useState<Zmluva[] | null>(null);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    nacitaj({ data: { company_id: cid } })
      .then((r) => setZmluvy(r.zmluvy as unknown as Zmluva[]))
      .catch((e) => toast.error(e?.message ?? "Zmluvy sa nepodarilo načítať."));
  }, [nacitaj]);

  const aktivne = (zmluvy ?? []).filter((z) => z.status === "active");
  const zavrete = (zmluvy ?? []).filter((z) => z.status !== "active");
  const dlhSpolu = aktivne.reduce((s, z) => s + z.zostavaSuma, 0);
  const mena = aktivne[0]?.currency ?? "EUR";

  return (
    <>
      <PageHeader
        title="Leasingy a úvery"
        description="Splátkový kalendár s rozpadom na istinu, úrok a DPH. Odchádzajúce platby z banky sa k splátkam páruju samy."
        action={
          <Link
            to="/financovanie/nova"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> Nová zmluva
          </Link>
        }
      />
      <PageBody>
        {zmluvy === null ? (
          <p className="text-sm text-muted-foreground">Načítavam…</p>
        ) : zmluvy.length === 0 ? (
          <div className="rounded-xl border border-dashed p-10 text-center">
            <Banknote className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm font-medium">Zatiaľ tu nie je žiadny leasing ani úver</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Zapíšte zmluvu raz — Faktero z nej vyrobí splátkový kalendár a platby z banky si k
              splátkam bude párovať samo.
            </p>
            <Link
              to="/financovanie/nova"
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary"
            >
              <Plus className="h-4 w-4" /> Zapísať prvú zmluvu
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {aktivne.length > 0 && (
              <div className="rounded-xl border bg-card p-5">
                <div className="text-sm text-muted-foreground">Zostáva splatiť</div>
                <div className="mt-1 text-3xl font-semibold tabular-nums">
                  {formatujSumu(dlhSpolu, mena)}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {aktivne.length === 1 ? "1 aktívna zmluva" : `${aktivne.length} aktívnych zmlúv`}
                </div>
              </div>
            )}

            {[
              { nadpis: "Aktívne", polozky: aktivne },
              { nadpis: "Ukončené", polozky: zavrete },
            ]
              .filter((s) => s.polozky.length > 0)
              .map((s) => (
                <div key={s.nadpis}>
                  <h2 className="mb-2 px-1 text-sm font-medium text-muted-foreground">
                    {s.nadpis}
                  </h2>
                  <div className="divide-y rounded-xl border bg-card">
                    {s.polozky.map((z) => (
                      <Link
                        key={z.id}
                        to="/financovanie/$id"
                        params={{ id: z.id }}
                        className="flex items-center gap-4 p-4 hover:bg-muted/40"
                      >
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary">
                          {z.kind === "leasing" ? (
                            <Car className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <Banknote className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium">{z.name}</span>
                            {z.poSplatnosti > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                                <TriangleAlert className="h-3 w-3" />
                                {z.poSplatnosti} po splatnosti
                              </span>
                            )}
                          </div>
                          <div className="truncate text-sm text-muted-foreground">
                            {z.provider_name ? `${z.provider_name} · ` : ""}
                            splatené {z.zaplatenych} z {z.splatok}
                            {z.dalsiaSplatka ? ` · ďalšia ${datum(z.dalsiaSplatka.due_date)}` : ""}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="font-medium tabular-nums">
                            {formatujSumu(z.zostavaSuma, z.currency)}
                          </div>
                          <div className="text-xs text-muted-foreground">zostáva</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </PageBody>
    </>
  );
}
