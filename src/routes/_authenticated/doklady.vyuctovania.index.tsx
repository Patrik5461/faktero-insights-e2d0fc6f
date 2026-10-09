import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { zoznamVyuctovaniFn } from "@/lib/faktero/vyuctovanie-vydavkov.functions";
import { nazovTypu } from "@/lib/faktero/vyuctovanie-vydavkov";

/**
 * Súhrnné vyúčtovanie výdavkov zamestnancov (ako modul Vyúčtovanie výdavkov
 * v Doklado). Nové vznikne tu alebo z označených bločkov a prijatých faktúr.
 */
export const Route = createFileRoute("/_authenticated/doklady/vyuctovania/")({
  head: () => ({ meta: [{ title: "Vyúčtovanie výdavkov — Faktero" }] }),
  component: Zoznam,
});

const datum = (d?: string | null) => (d ? new Date(d).toLocaleDateString("sk-SK") : "");

function Zoznam() {
  const cid = useMemo(() => getActiveCompanyId(), []);
  const nacitaj = useServerFn(zoznamVyuctovaniFn);
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => {
    if (!cid) return;
    nacitaj({ data: { company_id: cid } })
      .then(setRows)
      .catch((e) => {
        toast.error(e?.message ?? "Vyúčtovania sa nepodarilo načítať");
        setRows([]);
      });
  }, [cid, nacitaj]);

  return (
    <>
      <PageHeader
        title="Vyúčtovanie výdavkov"
        description="Bločky a faktúry, ktoré zamestnanec zaplatil zo zálohy, z vlastných peňazí alebo firemnou kartou — súhrn, doplatok a PDF na podpis."
        action={
          <Link
            to="/doklady/vyuctovania/$id"
            params={{ id: "novy" }}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Nové vyúčtovanie
          </Link>
        }
      />
      <PageBody>
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Vyúčtovanie založíte aj priamo zo zoznamu{" "}
          <Link to="/doklady" className="text-primary hover:underline">
            Bločkov
          </Link>{" "}
          alebo{" "}
          <Link to="/prijate-faktury" className="text-primary hover:underline">
            Prijatých faktúr
          </Link>{" "}
          — označte doklady a kliknite na <em>Vyúčtovanie</em>. Doklad vo vyúčtovaní ide do Pohody
          ako interný doklad (nie z firemnej pokladne) a prijatá faktúra sa už neponúkne v hromadnom
          príkaze na úhradu.
        </div>
        {rows === null ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Načítavam…
          </div>
        ) : rows.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Zatiaľ žiadne vyúčtovanie.
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-3">Vyúčtovanie</th>
                  <th className="p-3">Zamestnanec</th>
                  <th className="p-3">Typ</th>
                  <th className="p-3 text-right">Doklady</th>
                  <th className="p-3 text-right">Spolu</th>
                  <th className="p-3">Výsledok</th>
                  <th className="p-3">Stav</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border last:border-0 hover:bg-secondary/40"
                  >
                    <td className="p-3">
                      <Link
                        to="/doklady/vyuctovania/$id"
                        params={{ id: r.id }}
                        className="font-medium text-primary hover:underline"
                      >
                        {r.nazov}
                      </Link>
                      <div className="text-xs text-muted-foreground">{datum(r.created_at)}</div>
                    </td>
                    <td className="p-3">{r.zamestnanec_meno ?? "—"}</td>
                    <td className="p-3 text-xs">{nazovTypu(r.typ).replace("Vyúčtovanie ", "")}</td>
                    <td className="p-3 text-right tabular-nums">{r.suhrn.pocet}</td>
                    <td className="p-3 text-right tabular-nums">
                      {r.suhrn.spolu.toFixed(2)} {r.mena}
                    </td>
                    <td className="p-3 text-xs">{r.suhrn.vysledok}</td>
                    <td className="p-3 text-xs">
                      {r.stav === "uzavrete" ? (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">
                          uzavreté
                        </span>
                      ) : (
                        <span className="rounded-full bg-secondary px-2 py-0.5">otvorené</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageBody>
    </>
  );
}
