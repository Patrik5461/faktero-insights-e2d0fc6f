import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { ossPrehladFn } from "@/lib/faktero/oss.functions";
import { PRAH_OSS } from "@/lib/faktero/sadzby-eu";
import { AlertTriangle, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/uctovnictvo/oss")({
  head: () => ({
    meta: [
      { title: "OSS — predaj do EÚ — Faktero" },
      {
        name: "description",
        content:
          "Podklady pre priznanie k jednému kontaktnému miestu: predaj spotrebiteľom v EÚ podľa štátov a sadzieb, vrátane sledovania hranice 10 000 €.",
      },
    ],
  }),
  component: OssPage,
});

type Data = Awaited<ReturnType<typeof ossPrehladFn>>;

function eur(n: number): string {
  return n.toLocaleString("sk-SK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function OssPage() {
  const nacitajPrehlad = useServerFn(ossPrehladFn);
  const dnes = new Date();
  const [rok, setRok] = useState(dnes.getFullYear());
  const [stvrtrok, setStvrtrok] = useState(Math.floor(dnes.getMonth() / 3) + 1);
  const [data, setData] = useState<Data | null>(null);
  const [nacitavam, setNacitavam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);

  const nacitaj = useCallback(async () => {
    const companyId = getActiveCompanyId();
    if (!companyId) return;
    setNacitavam(true);
    setChyba(null);
    try {
      setData(await nacitajPrehlad({ data: { company_id: companyId, rok, stvrtrok } }));
    } catch (e: any) {
      setChyba(e?.message ?? "Prehľad sa nepodarilo zostaviť.");
    } finally {
      setNacitavam(false);
    }
  }, [nacitajPrehlad, rok, stvrtrok]);

  useEffect(() => {
    nacitaj();
  }, [nacitaj]);

  return (
    <>
      <PageHeader
        title="OSS — predaj spotrebiteľom v EÚ"
        description="Podklady pre priznanie k jednému kontaktnému miestu za štvrťrok."
      />
      <PageBody>
        <div className="mb-4 grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Rok</span>
            <input
              type="number"
              value={rok}
              onChange={(e) => setRok(Number(e.target.value))}
              className="input mt-1"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Štvrťrok</span>
            <select
              value={stvrtrok}
              onChange={(e) => setStvrtrok(Number(e.target.value))}
              className="input mt-1"
            >
              {[1, 2, 3, 4].map((q) => (
                <option key={q} value={q}>
                  {q}. štvrťrok
                </option>
              ))}
            </select>
          </label>
        </div>

        {chyba && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {chyba}
          </div>
        )}
        {nacitavam && (
          <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Počítam…
          </div>
        )}

        {data && (
          <>
            <div className="mb-6 rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="font-medium">
                  Hranica {eur(PRAH_OSS)} € za rok {rok}
                </div>
                <div className="text-sm text-muted-foreground">
                  Predaj do EÚ zatiaľ {eur(data.zaRok)} €
                </div>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full ${data.prah.prekroceny ? "bg-destructive" : "bg-primary"}`}
                  style={{ width: `${Math.round(data.prah.podiel * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {data.prah.prekroceny
                  ? "Hranica je prekročená — predaj spotrebiteľom v EÚ sa zdaňuje sadzbou štátu zákazníka a daň sa odvádza cez OSS."
                  : `Do hranice zostáva ${eur(data.prah.zostava)} €. Dovtedy sa dá zdaňovať doma, ak sa nerozhodnete pre OSS dobrovoľne.`}
              </p>
            </div>

            {data.prehlad.vytky.length > 0 && (
              <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
                <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4" /> Pred podaním treba doplniť
                </div>
                <ul className="mt-2 space-y-1 text-sm text-amber-700 dark:text-amber-400">
                  {data.prehlad.vytky.map((v, i) => (
                    <li key={i}>
                      <span className="font-medium">{v.doklad}</span>: {v.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <div className="font-medium">
                  {data.obdobie.stvrtrok}. štvrťrok {data.obdobie.rok}
                </div>
                <div className="text-xs text-muted-foreground">
                  {data.pocet} faktúr v režime OSS ({data.obdobie.od} – {data.obdobie.do})
                </div>
              </div>
              {data.prehlad.riadky.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">
                  V tomto štvrťroku nie je žiadny predaj spotrebiteľom v EÚ. Faktúru doň zaradíte
                  zaškrtnutím „Predaj spotrebiteľovi v EÚ (OSS)" pri jej vystavení.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-medium">Štát spotreby</th>
                      <th className="px-4 py-2 text-right font-medium">Sadzba</th>
                      <th className="px-4 py-2 text-right font-medium">Základ dane</th>
                      <th className="px-4 py-2 text-right font-medium">Daň</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.prehlad.riadky.map((r) => (
                      <tr key={`${r.stat}-${r.sadzba}`} className="border-t border-border">
                        <td className="px-4 py-2">
                          {r.nazovStatu} <span className="text-muted-foreground">({r.stat})</span>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{r.sadzba} %</td>
                        <td className="px-4 py-2 text-right tabular-nums">{eur(r.zaklad)} €</td>
                        <td className="px-4 py-2 text-right tabular-nums font-medium">
                          {eur(r.dan)} €
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border font-medium">
                      <td className="px-4 py-2" colSpan={2}>
                        Spolu
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {eur(data.prehlad.zakladSpolu)} €
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {eur(data.prehlad.danSpolu)} €
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>

            <p className="mt-6 text-xs text-muted-foreground">
              Priznanie OSS sa podáva do konca mesiaca po skončení štvrťroka cez portál finančnej
              správy; údaje z tejto tabuľky sa doň prepíšu podľa štátov a sadzieb. Predaj v režime
              OSS nevstupuje do{" "}
              <Link to="/uctovnictvo/vykazy" className="underline">
                priznania k DPH ani do kontrolného výkazu
              </Link>
              .
            </p>
          </>
        )}
      </PageBody>
    </>
  );
}
