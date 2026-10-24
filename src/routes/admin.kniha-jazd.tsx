import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AdminPageHeader, AdminPageBody } from "@/components/faktero/AdminShell";
import { ResponsiveTable, MobileListCard } from "@/components/faktero/ResponsiveTable";
import { getAdminKnihaJazd } from "@/lib/faktero/admin.functions";

export const Route = createFileRoute("/admin/kniha-jazd")({
  head: () => ({ meta: [{ title: "Admin · Kniha jázd — Faktero" }] }),
  component: AdminKnihaJazdPage,
});

type Row = Awaited<ReturnType<typeof getAdminKnihaJazd>>["rows"][number];

const datum = (d: string | null) => (d ? new Date(d).toLocaleDateString("sk-SK") : "—");

/** Odkiaľ jazdy prichádzajú — Commander, appka (rozpoznané jazdy), ručne. */
function zdroje(r: Row) {
  return [
    r.z_commanderu ? `Commander ${r.z_commanderu}` : null,
    r.z_appky ? `appka ${r.z_appky}` : null,
    r.rucne ? `ručne ${r.rucne}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function AdminKnihaJazdPage() {
  const nacitaj = useServerFn(getAdminKnihaJazd);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let zive = true;
    nacitaj()
      .then((r) => zive && setRows(r.rows))
      .catch((e: any) => zive && setError(e?.message ?? "Chyba"))
      .finally(() => zive && setLoading(false));
    return () => {
      zive = false;
    };
  }, [nacitaj]);

  const spolu = rows.reduce(
    (s, r) => ({
      vozidiel: s.vozidiel + r.vozidiel,
      aktivne: s.aktivne + (r.jazd_30_dni > 0 ? 1 : 0),
    }),
    { vozidiel: 0, aktivne: 0 },
  );

  return (
    <>
      <AdminPageHeader
        title="Kniha jázd"
        description="Firmy s vozidlami alebo jazdami — koľko vozidiel majú a ako knihu jázd používajú."
      />
      <AdminPageBody>
        {error && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}
        {!loading && !error && (
          <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
            <span>
              Firiem: <strong className="text-foreground">{rows.length}</strong>
            </span>
            <span>
              Vozidiel spolu: <strong className="text-foreground">{spolu.vozidiel}</strong>
            </span>
            <span>
              Jazdili za 30 dní: <strong className="text-foreground">{spolu.aktivne}</strong>
            </span>
          </div>
        )}

        <ResponsiveTable
          items={rows}
          loading={loading}
          emptyText="Knihu jázd zatiaľ nepoužíva žiadna firma."
          desktop={
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Firma</th>
                    <th className="px-3 py-2 text-right">Vozidlá</th>
                    <th className="px-3 py-2">Ktoré</th>
                    <th className="px-3 py-2 text-right">Jazdy za 30 dní</th>
                    <th className="px-3 py-2 text-right">Km za 30 dní</th>
                    <th className="px-3 py-2 text-right">Jazdy spolu</th>
                    <th className="px-3 py-2">Posledná jazda</th>
                    <th className="px-3 py-2">Zdroj jázd</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                        Načítavam…
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr
                        key={r.company_id}
                        className="border-t border-border align-top hover:bg-muted/30"
                      >
                        <td className="px-3 py-2 font-medium">
                          <Link
                            to="/admin/companies/$id"
                            params={{ id: r.company_id }}
                            className="hover:underline"
                          >
                            {r.name}
                          </Link>
                          {r.ico && (
                            <div className="text-xs font-normal text-muted-foreground">
                              IČO {r.ico}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.vozidiel}
                          {r.aktivnych !== r.vozidiel && (
                            <div className="text-xs text-muted-foreground">
                              aktívne {r.aktivnych}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {r.vozidla.map((v) => (
                            <div
                              key={v.nazov}
                              className={v.aktivne ? "" : "text-muted-foreground line-through"}
                            >
                              {v.nazov}
                            </div>
                          ))}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.jazd_30_dni}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.km_30_dni.toLocaleString("sk-SK")}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.jazd}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{datum(r.posledna_jazda)}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {zdroje(r) || "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          }
          mobileCard={(r) => (
            <MobileListCard
              title={r.name}
              subtitle={r.vozidla.map((v) => v.nazov).join(", ") || "bez vozidla"}
              meta={`Za 30 dní ${r.jazd_30_dni} jázd · ${r.km_30_dni} km · posledná ${datum(r.posledna_jazda)} · ${zdroje(r)}`}
              amount={`${r.vozidiel} voz.`}
            />
          )}
        />
      </AdminPageBody>
    </>
  );
}
