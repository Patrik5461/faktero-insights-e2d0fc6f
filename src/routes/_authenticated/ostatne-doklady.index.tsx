import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  exportOstatnychZipFn,
  nastavStavOstatnychFn,
  odkazPrilohyOstatnehoFn,
  pocetNespracovanychOstatnychFn,
  zmazOstatnyFn,
  zoznamOstatnychFn,
} from "@/lib/faktero/ostatne-doklady.functions";
import {
  DRUHY_OSTATNYCH,
  nazovDruhu,
  stavLehoty,
  type DruhOstatneho,
} from "@/lib/faktero/ostatne-doklady";
import {
  STAV_DOKLADU_NAZOV,
  ZALOZKY_DOKLADOV,
  jeZalozkaDokladov,
  type ZalozkaDokladov,
} from "@/lib/faktero/doklad-stav";
import { CheckCircle2, Download, FolderOpen, Paperclip, Plus, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/ostatne-doklady/")({
  head: () => ({ meta: [{ title: "Ostatné doklady — Faktero" }] }),
  validateSearch: (s: Record<string, unknown>): { stav?: ZalozkaDokladov } =>
    jeZalozkaDokladov(s.stav) ? { stav: s.stav } : {},
  component: OstatneDokladyPage,
});

const STAV_STYLE: Record<string, string> = {
  new: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  processed: "bg-secondary text-foreground/70",
  exported: "bg-primary/10 text-primary",
};

function OstatneDokladyPage() {
  const navigate = useNavigate();
  const zoznamFn = useServerFn(zoznamOstatnychFn);
  const stavFn = useServerFn(nastavStavOstatnychFn);
  const pocetFn = useServerFn(pocetNespracovanychOstatnychFn);
  const odkazFn = useServerFn(odkazPrilohyOstatnehoFn);
  const zmazFn = useServerFn(zmazOstatnyFn);
  const exportFn = useServerFn(exportOstatnychZipFn);
  const cid = getActiveCompanyId();

  const { stav: zalozkaZAdresy } = Route.useSearch();
  const zalozka: ZalozkaDokladov = zalozkaZAdresy ?? "nespracovane";
  const stav = ZALOZKY_DOKLADOV.find((z) => z.kluc === zalozka)!.stav;
  /** Nespracované zo všetkých mesiacov — nič nesmie ostať schované. */
  const bezMesiaca = zalozka === "nespracovane";

  const [month, setMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [druh, setDruh] = useState<DruhOstatneho | "">("");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [nespracovanych, setNespracovanych] = useState<number | null>(null);
  const [pracujem, setPracujem] = useState(false);
  const dnes = new Date().toISOString().slice(0, 10);

  async function refresh() {
    if (!cid) return;
    setLoading(true);
    try {
      const data = await zoznamFn({
        data: {
          company_id: cid,
          stav,
          month: bezMesiaca ? null : month || null,
          kind: druh || null,
        },
      });
      setRows(data);
      setSelected(new Set());
      void pocetFn({ data: { company_id: cid } })
        .then((v) => setNespracovanych(v.pocet))
        .catch(() => {
          /* počet je len na záložke */
        });
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba pri načítaní");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh(); /* eslint-disable-next-line */
  }, [stav, month, druh]);

  function prepniZalozku(kluc: ZalozkaDokladov) {
    navigate({ to: "/ostatne-doklady", search: { stav: kluc }, replace: true });
  }

  async function zmenStav(ids: string[], novy: "new" | "processed") {
    if (!cid || !ids.length) return;
    setPracujem(true);
    try {
      const v = await stavFn({ data: { company_id: cid, ids, stav: novy } });
      if (v.zmenene)
        toast.success(
          novy === "processed"
            ? v.zmenene === 1
              ? "Doklad je spracovaný."
              : `Spracovaných ${v.zmenene} dokladov.`
            : "Vrátené medzi nespracované.",
        );
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Zmena stavu sa nepodarila.");
    } finally {
      setPracujem(false);
    }
  }

  async function otvorPrilohu(id: string) {
    try {
      const { url } = await odkazFn({ data: { id } });
      window.open(url, "_blank");
    } catch (e: any) {
      toast.error(e?.message ?? "Prílohu sa nepodarilo otvoriť.");
    }
  }

  async function zmaz(r: any) {
    if (!confirm(`Naozaj zmazať doklad „${r.subject || r.sender || nazovDruhu(r.kind)}“ aj s prílohami?`))
      return;
    try {
      await zmazFn({ data: { id: r.id } });
      toast.success("Doklad zmazaný.");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Zmazanie zlyhalo.");
    }
  }

  async function odovzdaj(oznacit: boolean) {
    if (!cid || !rows.length) return;
    const vyber = selected.size ? rows.filter((r) => selected.has(r.id)) : rows;
    const nesprac = vyber.filter((r) => r.status === "new").length;
    if (
      oznacit &&
      nesprac > 0 &&
      !confirm(
        `${nesprac === 1 ? "Jeden doklad je" : `${nesprac} dokladov je`} ešte nespracovaných. Odovzdať aj ${nesprac === 1 ? "ten" : "tie"}?`,
      )
    )
      return;
    setPracujem(true);
    try {
      const res = await exportFn({
        data: { company_id: cid, ids: vyber.map((r) => r.id), oznacit },
      });
      const bin = atob(res.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`V balíku je ${res.count} dokladov.`);
      if (oznacit) refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Export zlyhal.");
    } finally {
      setPracujem(false);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  return (
    <>
      <PageHeader
        title="Ostatné doklady"
        description="Listy, predpisy, exekúcie, zmluvy a ďalšie podklady pre účtovníka."
        action={
          <Link
            to="/ostatne-doklady/novy"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Pridať doklad
          </Link>
        }
      />
      <PageBody>
        <div
          role="tablist"
          aria-label="Stav dokladov"
          className="mb-4 flex flex-wrap gap-1 border-b border-border"
        >
          {ZALOZKY_DOKLADOV.map((z) => (
            <button
              key={z.kluc}
              role="tab"
              aria-selected={zalozka === z.kluc}
              onClick={() => prepniZalozku(z.kluc)}
              className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${
                zalozka === z.kluc
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {z.nazov}
              {z.kluc === "nespracovane" && nespracovanych ? (
                <span className="rounded-full bg-amber-500/15 px-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                  {nespracovanych}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {bezMesiaca && (
          <p className="mb-4 text-sm text-muted-foreground">
            Sem padne každý nový doklad. Účtovník ho pozrie a označí ako spracovaný; ukazujú sa tu
            nespracované zo všetkých mesiacov.
          </p>
        )}

        <div className="mb-4 flex flex-wrap items-end gap-3">
          {!bezMesiaca && (
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Mesiac doručenia</label>
              <div className="flex items-center gap-2">
                <input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setMonth("")}
                  disabled={!month}
                  className="rounded-md border border-border bg-card px-2 py-1.5 text-xs hover:bg-secondary disabled:opacity-40"
                >
                  Všetky
                </button>
              </div>
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Druh</label>
            <select
              value={druh}
              onChange={(e) => setDruh(e.target.value as DruhOstatneho | "")}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">Všetky druhy</option>
              {DRUHY_OSTATNYCH.map((d) => (
                <option key={d.kluc} value={d.kluc}>
                  {d.nazov}
                </option>
              ))}
            </select>
          </div>
          {selected.size > 0 && (zalozka === "nespracovane" || zalozka === "spracovane") && (
            <button
              onClick={() =>
                zmenStav(Array.from(selected), zalozka === "nespracovane" ? "processed" : "new")
              }
              disabled={pracujem}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-secondary disabled:opacity-50"
            >
              {zalozka === "nespracovane" ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Označiť ako spracované (
                  {selected.size})
                </>
              ) : (
                <>
                  <Undo2 className="h-4 w-4" /> Vrátiť medzi nespracované ({selected.size})
                </>
              )}
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => odovzdaj(false)}
              disabled={pracujem || !rows.length}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> ZIP {selected.size ? `(${selected.size})` : "všetko"}
            </button>
            <button
              onClick={() => odovzdaj(true)}
              disabled={pracujem || !rows.length || zalozka === "odovzdane"}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> Odovzdať účtovníkovi
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {loading ? (
            <div className="p-12 text-center text-sm text-muted-foreground">Načítavam…</div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              <FolderOpen className="mx-auto mb-2 h-8 w-8 opacity-40" />
              {bezMesiaca
                ? "Žiadny ostatný doklad nečaká na spracovanie."
                : "Vo výbere nie je žiadny doklad."}
              <div className="mt-4 flex justify-center gap-2">
                <Link
                  to="/ostatne-doklady/novy"
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                >
                  <Plus className="h-4 w-4" /> Pridať doklad
                </Link>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="w-8 px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label="Označiť všetky"
                        checked={rows.length > 0 && selected.size === rows.length}
                        onChange={() =>
                          setSelected((p) =>
                            p.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)),
                          )
                        }
                      />
                    </th>
                    <th className="px-3 py-2 text-left">Doručené</th>
                    <th className="px-3 py-2 text-left">Druh</th>
                    <th className="px-3 py-2 text-left">Odosielateľ a predmet</th>
                    <th className="px-3 py-2 text-right">Suma</th>
                    <th className="px-3 py-2 text-left">Lehota</th>
                    <th className="px-3 py-2 text-left">Stav</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const lehota = r.status === "exported" ? null : stavLehoty(r.due_date, dnes);
                    const prilohy = [...(r.other_document_files ?? [])].sort(
                      (a: any, b: any) => a.position - b.position,
                    );
                    return (
                      <tr key={r.id} className="border-t border-border align-top">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            aria-label="Označiť doklad"
                            checked={selected.has(r.id)}
                            onChange={() => toggle(r.id)}
                          />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.received_date}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{nazovDruhu(r.kind)}</td>
                        <td className="min-w-0 px-3 py-2">
                          <button
                            onClick={() =>
                              navigate({ to: "/ostatne-doklady/novy", search: { id: r.id } })
                            }
                            className="text-left hover:underline"
                          >
                            {r.sender || (
                              <span className="italic text-muted-foreground">bez odosielateľa</span>
                            )}
                          </button>
                          {r.subject && (
                            <div className="text-xs text-muted-foreground">{r.subject}</div>
                          )}
                          {(r.zamestnanec || r.zmluva) && (
                            <div className="text-xs text-primary">
                              {r.zamestnanec &&
                                `Zamestnanec: ${[r.zamestnanec.first_name, r.zamestnanec.last_name].filter(Boolean).join(" ")}`}
                              {r.zamestnanec && r.zmluva ? " · " : ""}
                              {r.zmluva &&
                                `Zmluva: ${r.zmluva.name || r.zmluva.provider_name || ""}${r.zmluva.contract_number ? ` č. ${r.zmluva.contract_number}` : ""}`}
                            </div>
                          )}
                          {prilohy.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {prilohy.map((p: any) => (
                                <button
                                  key={p.id}
                                  onClick={() => otvorPrilohu(p.id)}
                                  className="inline-flex max-w-[14rem] items-center gap-1 rounded border border-border px-1.5 py-0.5 text-xs hover:bg-secondary"
                                  title={p.name}
                                >
                                  <Paperclip className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{p.name}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                          {r.amount != null ? `${Number(r.amount).toFixed(2)} ${r.currency}` : "—"}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {r.due_date ? (
                            <span
                              className={
                                lehota === "po"
                                  ? "font-medium text-destructive"
                                  : lehota === "blizko"
                                    ? "font-medium text-amber-700 dark:text-amber-400"
                                    : ""
                              }
                            >
                              {r.due_date}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              title={
                                r.processed_at
                                  ? `Spracované ${new Date(r.processed_at).toLocaleDateString("sk-SK")}`
                                  : undefined
                              }
                              className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STAV_STYLE[r.status]}`}
                            >
                              {STAV_DOKLADU_NAZOV[r.status as keyof typeof STAV_DOKLADU_NAZOV] ??
                                r.status}
                            </span>
                            {r.status === "new" && (
                              <button
                                onClick={() => zmenStav([r.id], "processed")}
                                disabled={pracujem}
                                className="inline-flex items-center gap-1 rounded-md bg-emerald-600/10 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-600/20 disabled:opacity-50 dark:text-emerald-400"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" /> Spracovať
                              </button>
                            )}
                            {r.status === "processed" && (
                              <button
                                onClick={() => zmenStav([r.id], "new")}
                                disabled={pracujem}
                                title="Vrátiť medzi nespracované"
                                aria-label="Vrátiť medzi nespracované"
                                className="rounded-md p-0.5 text-muted-foreground hover:bg-secondary disabled:opacity-50"
                              >
                                <Undo2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => zmaz(r)}
                            title="Zmazať"
                            aria-label="Zmazať doklad"
                            className="rounded-md p-1.5 hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </PageBody>
    </>
  );
}
