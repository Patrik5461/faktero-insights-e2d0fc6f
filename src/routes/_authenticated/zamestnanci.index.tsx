import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, IdCard, Plus } from "lucide-react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { listZamestnancov } from "@/lib/faktero/zamestnanci.functions";
import { celeMeno, datumSk, DRUH_ZMLUVY, type DruhZmluvy, type Pripomienka } from "@/lib/faktero/zamestnanci";
import { ChybaModulu, tlacidlo } from "@/components/faktero/zamestnanci/ui";

export const Route = createFileRoute("/_authenticated/zamestnanci/")({
  head: () => ({ meta: [{ title: "Zamestnanci — Faktero" }] }),
  component: ZamestnanciPage,
});

const FARBA: Record<Pripomienka["zavaznost"], string> = {
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  info: "border-border bg-muted/40 text-foreground",
};

function ZamestnanciPage() {
  const nacitajZoznam = useServerFn(listZamestnancov);
  const [stav, setStav] = useState<"active" | "ended" | "vsetci">("active");
  const [data, setData] = useState<{ zamestnanci: any[]; zmluvy: any[]; pripomienky: Pripomienka[] } | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [nacitava, setNacitava] = useState(true);

  const nacitaj = useCallback(() => {
    const cid = getActiveCompanyId();
    if (!cid) return setNacitava(false);
    setNacitava(true);
    setChyba(null);
    nacitajZoznam({ data: { company_id: cid, stav } })
      .then((d: any) => setData(d))
      .catch((e: any) => setChyba(e?.message ?? "Zoznam sa nepodarilo načítať."))
      .finally(() => setNacitava(false));
  }, [nacitajZoznam, stav]);
  useEffect(nacitaj, [nacitaj]);

  const zmluvaZamestnanca = (id: string) => data?.zmluvy.find((k) => k.employee_id === id);

  return (
    <>
      <PageHeader
        title="Zamestnanci"
        description="Karty zamestnancov, zmluvy, dokumenty, neprítomnosti a dochádzka. Mzdy sa tu nepočítajú."
        action={
          <Link to="/zamestnanci/novy" className={tlacidlo}>
            <Plus className="h-4 w-4" /> Nový zamestnanec
          </Link>
        }
      />
      <PageBody>
        {chyba ? (
          <ChybaModulu sprava={chyba} />
        ) : (
          <>
            {data && data.pripomienky.length > 0 && (
              <section className="mb-4 space-y-2" aria-label="Pripomienky">
                {data.pripomienky.map((p) => (
                  <Link
                    key={p.kluc}
                    to="/zamestnanci/$id"
                    params={{ id: p.employee_id }}
                    className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm hover:opacity-90 ${FARBA[p.zavaznost]}`}
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="min-w-0">
                      <strong>{p.nadpis}</strong> — {p.text}
                    </span>
                  </Link>
                ))}
              </section>
            )}

            <div className="mb-3 inline-flex rounded-md border border-border bg-card p-0.5 text-sm">
              {(
                [
                  ["active", "Aktívni"],
                  ["ended", "Ukončení"],
                  ["vsetci", "Všetci"],
                ] as const
              ).map(([k, nazov]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setStav(k)}
                  aria-pressed={stav === k}
                  className={`rounded px-3 py-1.5 ${stav === k ? "bg-secondary font-medium" : "text-muted-foreground"}`}
                >
                  {nazov}
                </button>
              ))}
            </div>

            {nacitava ? (
              <div className="text-sm text-muted-foreground">Načítavam…</div>
            ) : !data || data.zamestnanci.length === 0 ? (
              <div className="rounded-xl border border-border bg-card p-8 text-center">
                <IdCard className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                <div className="text-sm font-medium">
                  {stav === "active" ? "Zatiaľ tu nie je žiadny aktívny zamestnanec." : "Žiadny zamestnanec v tomto zozname."}
                </div>
                <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground">
                  Na karte zamestnanca vediete zmluvy, dokumenty, dovolenky a dochádzku. Faktero vám pripomenie
                  prihlášku do poisťovní, koniec skúšobnej doby aj lekárske prehliadky.
                </p>
                <Link to="/zamestnanci/novy" className={`${tlacidlo} mt-4`}>
                  <Plus className="h-4 w-4" /> Pridať prvého zamestnanca
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border bg-card">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="p-3">Meno</th>
                      <th className="p-3">Pozícia</th>
                      <th className="p-3">Zmluva</th>
                      <th className="p-3">Nástup</th>
                      <th className="p-3">Stav</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.zamestnanci.map((z) => {
                      const k = zmluvaZamestnanca(z.id);
                      return (
                        <tr key={z.id} className="hover:bg-muted/30">
                          <td className="p-3 font-medium">
                            <Link to="/zamestnanci/$id" params={{ id: z.id }} className="hover:underline">
                              {celeMeno(z)}
                            </Link>
                          </td>
                          <td className="p-3 text-muted-foreground">{z.position || "—"}</td>
                          <td className="p-3 text-muted-foreground">{k ? DRUH_ZMLUVY[k.kind as DruhZmluvy] : "—"}</td>
                          <td className="p-3 text-muted-foreground">{datumSk(z.start_date)}</td>
                          <td className="p-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs ${
                                z.status === "active" ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {z.status === "active" ? "Aktívny" : "Ukončený"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </PageBody>
    </>
  );
}
