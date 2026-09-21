import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Download } from "lucide-react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { exportDochadzky } from "@/lib/faktero/zamestnanci.functions";
import { DRUH_NEPRITOMNOSTI, type DruhNepritomnosti, type SuhrnZamestnanca } from "@/lib/faktero/zamestnanci";
import { base64NaBlob, ChybaModulu, pole, popis, stiahni, tlacidlo, tlacidloObrys } from "@/components/faktero/zamestnanci/ui";

export const Route = createFileRoute("/_authenticated/zamestnanci/export")({
  head: () => ({ meta: [{ title: "Export dochádzky — Faktero" }] }),
  component: ExportPage,
});

function minulyMesiac(): string {
  const dnes = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Bratislava" }).format(new Date());
  const [r, m] = dnes.split("-").map(Number);
  return m === 1 ? `${r - 1}-12` : `${r}-${String(m - 1).padStart(2, "0")}`;
}

function ExportPage() {
  const vyrob = useServerFn(exportDochadzky);
  const [mesiac, setMesiac] = useState(minulyMesiac);
  const [vysledok, setVysledok] = useState<{ csv: string; pdfBase64: string; suhrn: SuhrnZamestnanca[] } | null>(null);
  const [pracuje, setPracuje] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);

  async function pripravit() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    setPracuje(true);
    try {
      setVysledok(await vyrob({ data: { company_id: cid, mesiac } }));
    } catch (err: any) {
      if (/nie je pre túto firmu zapnutý/.test(err?.message ?? "")) setChyba(err.message);
      else toast.error(err?.message ?? "Export sa nepodarilo pripraviť.");
    } finally {
      setPracuje(false);
    }
  }

  const druhy = (Object.keys(DRUH_NEPRITOMNOSTI) as DruhNepritomnosti[]).filter((k) =>
    vysledok?.suhrn.some((s) => s.nepritomnosti[k] > 0),
  );

  return (
    <>
      <PageHeader
        title="Export dochádzky"
        description="Mesačný súhrn odpracovaných dní, hodín a neprítomností pre mzdovú účtovníčku."
        action={
          <Link to="/zamestnanci" className={tlacidloObrys}>
            <ArrowLeft className="h-4 w-4" /> Zamestnanci
          </Link>
        }
      />
      <PageBody>
        {chyba ? (
          <ChybaModulu sprava={chyba} />
        ) : (
          <div className="max-w-4xl space-y-4">
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className={popis} htmlFor="e-mesiac">Mesiac</label>
                <input
                  id="e-mesiac"
                  type="month"
                  className={pole}
                  value={mesiac}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    setMesiac(e.target.value);
                    setVysledok(null);
                  }}
                />
              </div>
              <button type="button" className={tlacidlo} onClick={pripravit} disabled={pracuje}>
                {pracuje ? "Pripravujem…" : "Pripraviť súhrn"}
              </button>
            </div>

            {vysledok && (
              <>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={tlacidloObrys}
                    onClick={() => stiahni(`dochadzka-${mesiac}.csv`, new Blob([vysledok.csv], { type: "text/csv;charset=utf-8" }))}
                  >
                    <Download className="h-4 w-4" /> Stiahnuť CSV
                  </button>
                  <button
                    type="button"
                    className={tlacidloObrys}
                    onClick={() => stiahni(`dochadzka-${mesiac}.pdf`, base64NaBlob(vysledok.pdfBase64, "application/pdf"))}
                  >
                    <Download className="h-4 w-4" /> Stiahnuť PDF
                  </button>
                </div>
                {vysledok.suhrn.length === 0 ? (
                  <p className="text-sm text-muted-foreground">V tomto mesiaci nie je zapísaná dochádzka ani neprítomnosť.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-border bg-card">
                    <table className="w-full min-w-[520px] text-sm">
                      <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="p-3">Zamestnanec</th>
                          <th className="p-3 text-right">Dni</th>
                          <th className="p-3 text-right">Hodiny</th>
                          {druhy.map((k) => <th key={k} className="p-3 text-right">{DRUH_NEPRITOMNOSTI[k]}</th>)}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {vysledok.suhrn.map((s) => (
                          <tr key={s.employee_id}>
                            <td className="p-3 font-medium">{s.meno}</td>
                            <td className="p-3 text-right">{s.odpracovaneDni}</td>
                            <td className="p-3 text-right">{String(s.hodiny).replace(".", ",")}</td>
                            {druhy.map((k) => <td key={k} className="p-3 text-right">{String(s.nepritomnosti[k]).replace(".", ",")}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </PageBody>
    </>
  );
}
