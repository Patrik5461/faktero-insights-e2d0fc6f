import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AdminPageHeader, AdminPageBody } from "@/components/faktero/AdminShell";
import { ListPagination, useStoredPageSize } from "@/components/faktero/ListControls";
import { ResponsiveTable, MobileListCard } from "@/components/faktero/ResponsiveTable";
import { KlikatelnyRiadok } from "@/components/faktero/KlikatelnyRiadok";
import { adminPrehladBank } from "@/lib/faktero/admin-podpora.functions";
import {
  filtrujBanky,
  poctyStavov,
  type FilterBanky,
  type RiadokBanky,
  type StavBanky,
} from "@/lib/faktero/admin-banky";

/*
  Admin → Banky: všetky bankové pripojenia naprieč firmami, len na čítanie.
  Podpora tu vidí, komu vypršal súhlas banky alebo sa nesťahujú pohyby, skôr
  než sa ozve klient. Najstaršie pohyby sú hore.
*/
export const Route = createFileRoute("/admin/banky")({
  head: () => ({ meta: [{ title: "Admin · Banky — Faktero" }] }),
  component: AdminBankyPage,
});

function kedy(s: string | null | undefined) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("sk-SK");
  } catch {
    return "—";
  }
}

const STAV: Record<StavBanky, { text: string; trieda: string }> = {
  suhlas: { text: "Vypršaný súhlas", trieda: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  chyba: { text: "Chyba", trieda: "bg-destructive/10 text-destructive" },
  ok: { text: "OK", trieda: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  caka: { text: "Nedokončené", trieda: "bg-muted text-muted-foreground" },
  odpojene: { text: "Odpojené", trieda: "bg-muted text-muted-foreground" },
};

function Stav({ s }: { s: StavBanky }) {
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${STAV[s].trieda}`}>
      {STAV[s].text}
    </span>
  );
}

const FILTRE: Array<{ k: FilterBanky; text: string }> = [
  { k: "vsetky", text: "Všetky" },
  { k: "suhlas", text: "Vypršaný súhlas" },
  { k: "chyba", text: "Chyba" },
  { k: "ok", text: "OK" },
];

function AdminBankyPage() {
  const nacitajFn = useServerFn(adminPrehladBank);
  const [riadky, setRiadky] = useState<RiadokBanky[] | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterBanky>("vsetky");
  const [sTestovacimi, setSTestovacimi] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useStoredPageSize("admin-banky");

  useEffect(() => {
    let zrusene = false;
    nacitajFn()
      .then((r) => !zrusene && setRiadky(r.riadky as RiadokBanky[]))
      .catch((e: any) => !zrusene && setChyba(e?.message ?? "Chyba"));
    return () => {
      zrusene = true;
    };
  }, [nacitajFn]);

  const zaklad = useMemo(
    () => (riadky ?? []).filter((r) => sTestovacimi || !r.testovacia),
    [riadky, sTestovacimi],
  );
  const pocty = useMemo(() => poctyStavov(zaklad), [zaklad]);
  const vyber = useMemo(
    () => filtrujBanky(riadky ?? [], { filter, sTestovacimi }),
    [riadky, filter, sTestovacimi],
  );
  useEffect(() => setPage(1), [filter, sTestovacimi, pageSize]);
  const strana = vyber.slice((page - 1) * pageSize, page * pageSize);
  const ciel = (r: RiadokBanky) => ({ to: "/admin/companies/$id" as const, params: { id: r.companyId } });

  return (
    <>
      <AdminPageHeader
        title="Banky"
        description="Bankové pripojenia všetkých firiem — súhlas, chyby a posledné stiahnuté pohyby. Len na čítanie."
      />
      <AdminPageBody>
        {chyba && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {chyba}
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {FILTRE.map((f) => (
            <button
              key={f.k}
              onClick={() => setFilter(f.k)}
              aria-pressed={filter === f.k}
              className={`rounded-full border px-3 py-1 text-xs ${
                filter === f.k
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:bg-secondary"
              }`}
            >
              {f.text}
              {f.k !== "vsetky" && riadky ? ` (${pocty[f.k as StavBanky]})` : ""}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={sTestovacimi}
              onChange={(e) => setSTestovacimi(e.target.checked)}
            />
            Aj testovacie firmy
          </label>
        </div>

        <ResponsiveTable
          items={strana}
          loading={riadky === null && !chyba}
          emptyText="Žiadne bankové pripojenia."
          desktop={
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Firma</th>
                    <th className="px-3 py-2">Banka</th>
                    <th className="px-3 py-2">Stav</th>
                    <th className="px-3 py-2 text-right">Účtov</th>
                    <th className="px-3 py-2">Posledné pohyby</th>
                    <th className="px-3 py-2">Posledná synchronizácia</th>
                    <th className="px-3 py-2">Chyby</th>
                  </tr>
                </thead>
                <tbody>
                  {riadky === null ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                        Načítavam…
                      </td>
                    </tr>
                  ) : strana.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                        Nič také.
                      </td>
                    </tr>
                  ) : (
                    strana.map((r) => (
                      <KlikatelnyRiadok key={r.id} ciel={ciel(r)} className="border-t border-border align-top">
                        <td className="px-3 py-2">
                          <Link
                            to="/admin/companies/$id"
                            params={{ id: r.companyId }}
                            className="font-medium hover:underline"
                          >
                            {r.firma}
                          </Link>
                          <div className="text-xs text-muted-foreground">
                            {r.ico ? `IČO ${r.ico}` : ""}
                            {r.testovacia ? " · testovacia" : ""}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          {r.banka}
                          <div className="text-xs text-muted-foreground">{r.status}</div>
                        </td>
                        <td className="px-3 py-2">
                          <Stav s={r.stav} />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.uctov}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{kedy(r.poslednePohyby)}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                          {kedy(r.poslednaSync)}
                        </td>
                        <td className="max-w-xs px-3 py-2 text-xs text-muted-foreground">
                          {r.chyby.length ? r.chyby.join(" · ") : "—"}
                        </td>
                      </KlikatelnyRiadok>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          }
          mobileCard={(r: RiadokBanky) => (
            <MobileListCard
              ciel={ciel(r)}
              title={r.firma}
              subtitle={`${r.banka} · ${r.uctov} ${r.uctov === 1 ? "účet" : "účtov"}`}
              status={<Stav s={r.stav} />}
              meta={`Pohyby: ${kedy(r.poslednePohyby)}${r.chyby.length ? ` · ${r.chyby[0]}` : ""}`}
            />
          )}
        />

        {vyber.length > 0 && (
          <div className="mt-4">
            <ListPagination
              page={page}
              pageSize={pageSize}
              total={vyber.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </div>
        )}
      </AdminPageBody>
    </>
  );
}
