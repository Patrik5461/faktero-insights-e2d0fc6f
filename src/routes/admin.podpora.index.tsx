import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search } from "lucide-react";
import { AdminPageHeader, AdminPageBody } from "@/components/faktero/AdminShell";
import { PodporaStav } from "@/components/faktero/PodporaStav";
import { adminPoziadavkyFn } from "@/lib/faktero/podpora-admin.functions";
import {
  STAVY_PODPORA,
  cisloPoziadavky,
  nazovKategorie,
  neprecitanaPrePodporu,
  type StavPoziadavky,
} from "@/lib/faktero/podpora";

export const Route = createFileRoute("/admin/podpora/")({
  head: () => ({ meta: [{ title: "Admin · Podpora — Faktero" }] }),
  component: AdminPodporaPage,
});

type Filter = "aktivne" | "vsetky" | StavPoziadavky;

const FILTRE: { kod: Filter; nazov: string }[] = [
  { kod: "aktivne", nazov: "Nevybavené" },
  { kod: "nova", nazov: "Nové" },
  { kod: "otvorena", nazov: "Rieši sa" },
  { kod: "caka_na_zakaznika", nazov: "Čaká na zákazníka" },
  { kod: "vyriesena", nazov: "Vyriešené" },
  { kod: "vsetky", nazov: "Všetky" },
];

function AdminPodporaPage() {
  const nacitajFn = useServerFn(adminPoziadavkyFn);
  const [filter, setFilter] = useState<Filter>("aktivne");
  const [hladat, setHladat] = useState("");
  const [data, setData] = useState<Awaited<ReturnType<typeof adminPoziadavkyFn>> | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);

  useEffect(() => {
    let zruseny = false;
    const t = setTimeout(() => {
      setChyba(null);
      nacitajFn({ data: { filter, hladat: hladat.trim() || undefined } })
        .then((d) => !zruseny && setData(d))
        .catch((e) => !zruseny && setChyba(e?.message ?? "Chyba"));
    }, 250);
    return () => {
      zruseny = true;
      clearTimeout(t);
    };
  }, [filter, hladat, nacitajFn]);

  const pocet = (k: Filter) => {
    const p = data?.pocty ?? {};
    if (k === "vsetky") return Object.values(p).reduce((a, b) => a + b, 0);
    if (k === "aktivne") return (p.nova ?? 0) + (p.otvorena ?? 0) + (p.caka_na_zakaznika ?? 0);
    return p[k] ?? 0;
  };

  return (
    <>
      <AdminPageHeader
        title="Podpora"
        description="Požiadavky zákazníkov z aplikácie, z mobilnej appky aj z kontaktného formulára na webe."
      />
      <AdminPageBody>
        <div className="flex flex-wrap items-center gap-2">
          {FILTRE.map((f) => (
            <button
              key={f.kod}
              onClick={() => setFilter(f.kod)}
              className={`rounded-full border px-3 py-1 text-sm ${
                filter === f.kod
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-secondary"
              }`}
            >
              {f.nazov} <span className="opacity-70">{data ? pocet(f.kod) : ""}</span>
            </button>
          ))}
          <label className="relative ml-auto w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={hladat}
              onChange={(e) => setHladat(e.target.value)}
              placeholder="Predmet, e-mail alebo číslo"
              aria-label="Hľadať požiadavku"
              className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm"
            />
          </label>
        </div>

        {chyba && <p className="mt-4 text-sm text-destructive">{chyba}</p>}
        {!data ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Načítavam…
          </div>
        ) : data.rows.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nič tu nie je.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-3">Číslo</th>
                  <th className="p-3">Predmet</th>
                  <th className="p-3">Od</th>
                  <th className="p-3">Druh</th>
                  <th className="p-3">Stav</th>
                  <th className="p-3">Posledná správa</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r: any) => {
                  const nove = neprecitanaPrePodporu(r);
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-border last:border-0 hover:bg-secondary/40"
                    >
                      <td className="p-3 tabular-nums">
                        <Link
                          to="/admin/podpora/$id"
                          params={{ id: r.id }}
                          className="text-primary hover:underline"
                        >
                          {cisloPoziadavky(r.cislo)}
                        </Link>
                      </td>
                      <td className="max-w-[28rem] p-3">
                        <Link
                          to="/admin/podpora/$id"
                          params={{ id: r.id }}
                          className={`block truncate hover:underline ${nove ? "font-semibold" : ""}`}
                        >
                          {nove && (
                            <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-primary" />
                          )}
                          {r.predmet}
                        </Link>
                      </td>
                      <td className="p-3">
                        <div className="truncate">{r.meno || r.email}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {r.firma ?? (r.zdroj === "web" ? "web (bez účtu)" : r.email)}
                        </div>
                      </td>
                      <td className="p-3 text-muted-foreground">{nazovKategorie(r.kategoria)}</td>
                      <td className="p-3">
                        <PodporaStav
                          stav={r.stav}
                          nazov={STAVY_PODPORA[r.stav as StavPoziadavky]}
                        />
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {new Date(r.posledna_sprava_at).toLocaleString("sk-SK")}
                        <div>
                          {r.posledna_od === "podpora" ? "odpovedala podpora" : "napísal zákazník"}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminPageBody>
    </>
  );
}
