import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { dokladyMimoMesiacaFn } from "@/lib/faktero/expenses.functions";
import {
  navrhniParovanieDokladov,
  potvrdParovanieDokladu,
  uhradyDokladov,
  zrusParovanieDokladu,
} from "@/lib/faktero/doklad-parovanie.functions";
import {
  listExpensesFn,
  deleteExpenseFn,
  exportExpensesZipFn,
  getExpenseFileUrlFn,
  nastavStavDokladovFn,
  pocetNespracovanychDokladovFn,
} from "@/lib/faktero/expenses.functions";
import {
  STAV_DOKLADU_NAZOV,
  ZALOZKY_DOKLADOV,
  chybajuceUdaje,
  daSaSpracovat,
  jeZalozkaDokladov,
  type ZalozkaDokladov,
} from "@/lib/faktero/doklad-stav";
import {
  Camera,
  CheckCircle2,
  Undo2,
  Download,
  FileInput,
  FileText,
  Plus,
  Trash2,
  Upload as UploadIcon,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/doklady/")({
  head: () => ({ meta: [{ title: "Doklady — Faktero" }] }),
  /*
   * `mesiac` v adrese otvorí zoznam rovno na mesiaci dokladu. Bez neho sa
   * zoznam otvára na tomto mesiaci a doklad vystavený v minulom mesiaci sa hneď
   * po uložení stratí z dohľadu — vyzerá to, že sa neuložil.
   */
  /*
   * `stav` vyberá záložku. Bez neho sa zoznam otvára na nespracovaných —
   * tam leží to, čo treba skontrolovať.
   */
  validateSearch: (s: Record<string, unknown>): { mesiac?: string; stav?: ZalozkaDokladov } => {
    const m = typeof s.mesiac === "string" && /^\d{4}-\d{2}$/.test(s.mesiac) ? s.mesiac : undefined;
    const stav = jeZalozkaDokladov(s.stav) ? s.stav : undefined;
    return { ...(m ? { mesiac: m } : {}), ...(stav ? { stav } : {}) };
  },
  component: DokladyPage,
});

/** „2026-08" → „august 2026" — do vety, nie do tabuľky. */
function nazovMesiaca(m: string): string {
  const [r, me] = m.split("-").map(Number);
  if (!r || !me) return m;
  return new Date(r, me - 1, 1).toLocaleDateString("sk-SK", { month: "long", year: "numeric" });
}

const STATUS_LABEL: Record<string, string> = STAV_DOKLADU_NAZOV;
const ZDROJ_DOKLADU: Record<string, string> = {
  photo: "fotka",
  qr: "QR kód",
  upload: "nahratý",
  web: "web",
  import: "import",
};
const STATUS_STYLE: Record<string, string> = {
  new: "bg-amber-500/10 text-amber-700",
  processed: "bg-secondary text-foreground/70",
  exported: "bg-primary/10 text-primary",
};

function DokladyPage() {
  const navigate = useNavigate();
  const listFn = useServerFn(listExpensesFn);
  const mimoFn = useServerFn(dokladyMimoMesiacaFn);
  const deleteFn = useServerFn(deleteExpenseFn);
  const exportFn = useServerFn(exportExpensesZipFn);
  const urlFn = useServerFn(getExpenseFileUrlFn);
  const navrhyFn = useServerFn(navrhniParovanieDokladov);
  const sparujFn = useServerFn(potvrdParovanieDokladu);
  const rozparujFn = useServerFn(zrusParovanieDokladu);
  const uhradyFn = useServerFn(uhradyDokladov);
  const stavFn = useServerFn(nastavStavDokladovFn);
  const pocetFn = useServerFn(pocetNespracovanychDokladovFn);
  /** Počet nespracovaných pre záložku — platí za všetky mesiace. */
  const [nespracovanych, setNespracovanych] = useState<number | null>(null);
  const [menimStav, setMenimStav] = useState(false);
  /** Ktorý doklad je uhradený z účtu, kedy a ktorým pohybom. */
  const [uhrady, setUhrady] = useState<Record<string, { datum: string; transactionId: string }>>(
    {},
  );
  const [navrhy, setNavrhy] = useState<any[]>([]);
  const [parujem, setParujem] = useState<string | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  /** Doklad, ktorý sa práve presúva medzi prijaté faktúry. */
  const [presuvam, setPresuvam] = useState<string | null>(null);
  const { mesiac: mesiacZAdresy, stav: zalozkaZAdresy } = Route.useSearch();
  const zalozka: ZalozkaDokladov = zalozkaZAdresy ?? "nespracovane";
  const status = ZALOZKY_DOKLADOV.find((z) => z.kluc === zalozka)!.stav;
  /** Nespracované sa ukazujú zo všetkých mesiacov — nič nesmie ostať schované. */
  const bezMesiaca = zalozka === "nespracovane";
  const [month, setMonth] = useState<string>(mesiacZAdresy ?? new Date().toISOString().slice(0, 7));
  /** Koľko dokladov je mimo vybraného mesiaca a kam sa dá skočiť. */
  const [mimo, setMimo] = useState<{ pocet: number; mesiac: string | null }>({
    pocet: 0,
    mesiac: null,
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const cid = getActiveCompanyId();

  async function sparuj(z: any) {
    setParujem(z.transactionId);
    try {
      await sparujFn({ data: { transaction_id: z.transactionId, expense_id: z.expenseId } });
      setUhrady((u) => ({
        ...u,
        [z.expenseId]: { datum: z.pohyb?.booking_date, transactionId: z.transactionId },
      }));
      setNavrhy((n) => n.filter((i) => i.transactionId !== z.transactionId));
      toast.success("Doklad označený za uhradený z účtu.");
    } catch (e: any) {
      toast.error(e?.message ?? "Spárovať sa to nepodarilo.");
    } finally {
      setParujem(null);
    }
  }

  async function rozparuj(expenseId: string, transactionId: string) {
    try {
      await rozparujFn({ data: { transaction_id: transactionId } });
      setUhrady((u) => {
        const kopia = { ...u };
        delete kopia[expenseId];
        return kopia;
      });
      toast.success("Párovanie zrušené.");
    } catch (e: any) {
      toast.error(e?.message ?? "Zrušiť sa to nepodarilo.");
    }
  }

  async function refresh() {
    if (!cid) return;
    setLoading(true);
    try {
      const data = await listFn({
        data: { company_id: cid, status, month: bezMesiaca ? null : month || null },
      });
      setRows(data ?? []);
      setSelected(new Set());
      void pocetFn({ data: { company_id: cid } })
        .then((v) => setNespracovanych(v.pocet))
        .catch(() => {
          /* počet je len na záložke — zoznam funguje aj bez neho */
        });
      /*
        Párovanie s bankou je nadstavba nad zoznamom — keď zlyhá, doklady sa aj
        tak ukážu. Preto zvlášť a ticho.
      */
      void (async () => {
        try {
          if (month && !bezMesiaca) setMimo(await mimoFn({ data: { company_id: cid, month } }));
          else setMimo({ pocet: 0, mesiac: null });
        } catch {
          /* upozornenie je nadstavba — zoznam funguje aj bez neho */
        }
      })();
      void (async () => {
        try {
          const ids = (data ?? []).map((r: any) => r.id).slice(0, 200);
          const u: any = await uhradyFn({ data: { company_id: cid, ids } });
          setUhrady(u?.uhrady ?? {});
          const n: any = await navrhyFn({ data: { company_id: cid } });
          setNavrhy(n?.zhody ?? []);
        } catch {
          /* bez párovania zoznam funguje ďalej */
        }
      })();
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba pri načítaní");
    } finally {
      setLoading(false);
    }
  }
  async function doPrijatych(r: any) {
    const cid = getActiveCompanyId();
    if (!cid) return;
    const popis = r.supplier_name ?? "doklad";
    if (
      !confirm(
        `Presunúť ${popis} medzi prijaté faktúry? Z Dokladov zmizne, aby sa ten istý náklad nepočítal dvakrát.`,
      )
    )
      return;
    setPresuvam(r.id);
    try {
      const { presunDokladDoPrijatychFn } = await import("@/lib/faktero/doklad-presun.functions");
      const v: any = await presunDokladDoPrijatychFn({ data: { company_id: cid, id: r.id } });
      toast.success("Doklad je medzi prijatými faktúrami.");
      navigate({ to: "/prijate-faktury/$id", params: { id: v.id } });
    } catch (e: any) {
      const { friendlyError } = await import("@/lib/faktero/plan-error");
      toast.error(friendlyError(e, "Presun sa nepodaril"));
    } finally {
      setPresuvam(null);
    }
  }

  useEffect(() => {
    refresh(); /* eslint-disable-next-line */
  }, [status, month]);

  function prepniZalozku(kluc: ZalozkaDokladov) {
    navigate({
      to: "/doklady",
      search: { ...(mesiacZAdresy ? { mesiac: mesiacZAdresy } : {}), stav: kluc },
      replace: true,
    });
  }

  async function zmenStav(ids: string[], stav: "new" | "processed") {
    if (!cid || !ids.length) return;
    setMenimStav(true);
    try {
      const v = await stavFn({ data: { company_id: cid, ids, stav } });
      if (stav === "processed") {
        if (v.zmenene) toast.success(v.zmenene === 1 ? "Doklad je spracovaný." : `Spracovaných ${v.zmenene} dokladov.`);
        if (v.preskocene.length)
          toast.warning(
            `${v.preskocene.length === 1 ? "Jeden doklad nemá" : `${v.preskocene.length} dokladov nemá`} sumu alebo dátum — otvorte ho a doplňte.`,
          );
      } else if (v.zmenene) {
        toast.success("Vrátené medzi nespracované.");
      }
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Zmena stavu sa nepodarila.");
    } finally {
      setMenimStav(false);
    }
  }

  const totals = useMemo(() => {
    let net = 0,
      vat = 0,
      total = 0;
    for (const r of rows) {
      net += Number(r.net_amount ?? 0);
      vat += Number(r.vat_amount ?? 0);
      total += Number(r.total_amount ?? 0);
    }
    return { net, vat, total };
  }, [rows]);

  function toggle(id: string) {
    setSelected((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }
  function toggleAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  }

  async function handleExport(markExported: boolean) {
    if (!cid) return;
    const vyber = selected.size ? rows.filter((r) => selected.has(r.id)) : rows;
    const nesprac = vyber.filter((r) => r.status === "new").length;
    if (
      markExported &&
      nesprac > 0 &&
      !confirm(
        `${nesprac === 1 ? "Jeden doklad je" : `${nesprac} dokladov je`} ešte nespracovaných. Odovzdať aj ${nesprac === 1 ? "ten" : "tie"}?`,
      )
    )
      return;
    setExporting(true);
    try {
      const ids = selected.size ? Array.from(selected) : undefined;
      const res = await exportFn({
        // Balí sa presne to, čo je na obrazovke — označené, inak celá záložka
        // vo vybranom mesiaci. Nie celý mesiac bez ohľadu na záložku.
        data: {
          company_id: cid,
          ids: ids ?? rows.map((r) => r.id),
          month: null,
          mark_exported: markExported,
        },
      });
      const bin = atob(res.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exportovaných ${res.count} dokladov`);
      if (markExported) refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Export zlyhal");
    } finally {
      setExporting(false);
    }
  }

  async function openFile(path: string) {
    try {
      const { url } = await urlFn({ data: { file_path: path } });
      window.open(url, "_blank");
    } catch (e: any) {
      toast.error(e?.message ?? "Nedá sa otvoriť súbor");
    }
  }

  async function del(id: string) {
    if (!confirm("Naozaj zmazať doklad?")) return;
    try {
      await deleteFn({ data: { id } });
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Zmazanie zlyhalo");
    }
  }

  return (
    <>
      <PageHeader
        title="Doklady"
        description="Naskenované a nahraté výdavkové doklady pre účtovníka."
        action={
          <div className="flex gap-2">
            <Link
              to="/importy/doklady"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-secondary"
            >
              <UploadIcon className="h-4 w-4" /> Import z Doklado
            </Link>
            <Link
              to="/doklady/novy"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Nový doklad
            </Link>
          </div>
        }
      />
      <PageBody>
        <div role="tablist" aria-label="Stav dokladov" className="mb-4 flex flex-wrap gap-1 border-b border-border">
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
            Sem padne každý nový doklad — z appky, z webu aj naskenovaný. Skontrolujte ho a
            označte ako spracovaný; ukazujú sa tu nespracované zo všetkých mesiacov.
          </p>
        )}

        <div className="mb-4 flex flex-wrap items-end gap-3">
          {!bezMesiaca && (
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Mesiac</label>
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
          {selected.size > 0 && (zalozka === "nespracovane" || zalozka === "spracovane") && (
            <button
              onClick={() =>
                zmenStav(Array.from(selected), zalozka === "nespracovane" ? "processed" : "new")
              }
              disabled={menimStav}
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
              onClick={() => handleExport(false)}
              disabled={exporting || !rows.length}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> ZIP {selected.size ? `(${selected.size})` : "všetko"}
            </button>
            <button
              onClick={() => handleExport(true)}
              disabled={exporting || !rows.length || (!month && !bezMesiaca && !selected.size)}
              title={
                !month && !bezMesiaca && !selected.size
                  ? "Vyberte mesiac alebo označte doklady — inak by sa za odovzdané označili všetky."
                  : undefined
              }
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> Odovzdať účtovníkovi
            </button>
          </div>
        </div>

        {month && !bezMesiaca && mimo.pocet > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
            <span>
              {rows.length === 0
                ? `V tomto mesiaci nie je žiadny doklad.`
                : `Mimo tohto mesiaca ${mimo.pocet === 1 ? "je ešte 1 doklad" : `je ešte ${mimo.pocet} dokladov`}.`}{" "}
              Doklady sa radia podľa dátumu vystavenia, nie podľa dňa nahratia.
            </span>
            {mimo.mesiac && (
              <button
                type="button"
                onClick={() => setMonth(mimo.mesiac!)}
                className="rounded-md border border-border bg-card px-2 py-1 text-xs font-medium hover:bg-secondary"
              >
                Zobraziť {nazovMesiaca(mimo.mesiac)}
              </button>
            )}
            <button
              type="button"
              onClick={() => setMonth("")}
              className="rounded-md border border-border bg-card px-2 py-1 text-xs hover:bg-secondary"
            >
              Zobraziť všetky
            </button>
          </div>
        )}

        <p className="mb-4 text-xs text-muted-foreground">
          V balíku je <strong>pohoda.xml</strong> na priamy import do Pohody, súpiska v CSV a
          naskenované doklady. Predkontáciu prijatých dokladov nastavíte v Účtovníctvo → Prepojenie
          s Pohodou.
        </p>

        {/*
          Návrhy na spárovanie s platbami na účte. Hotovosť sa sem nedostane —
          v banke sa neobjaví. Nič sa nepáruje potichu, aj istá dvojica čaká na
          potvrdenie: zle priradený náklad sa v účtovníctve hľadá ťažko.
        */}
        {navrhy.length > 0 && (
          <div className="mb-4 overflow-hidden rounded-xl border border-primary/40 bg-primary/5">
            <div className="px-4 py-3 text-sm font-medium">
              Našli sme platby k dokladom ({navrhy.length})
            </div>
            {navrhy.map((z) => (
              <div
                key={z.transactionId}
                className="flex flex-wrap items-center gap-3 border-t border-primary/20 px-4 py-3 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {z.doklad?.supplier_name ?? "Doklad"}{" "}
                    <span className="tabular-nums">
                      {z.doklad?.total_amount != null
                        ? `${Number(z.doklad.total_amount).toFixed(2)} ${z.doklad.currency ?? "EUR"}`
                        : ""}
                    </span>
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {z.pohyb?.booking_date} · {z.dovody.join(" · ")}
                  </span>
                </span>
                <button
                  disabled={parujem === z.transactionId}
                  onClick={() => sparuj(z)}
                  className="rounded-md bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary disabled:opacity-60"
                >
                  {z.istota === "auto" ? "Spárovať" : "Áno, patrí k sebe"}
                </button>
                <button
                  onClick={() =>
                    setNavrhy((n) => n.filter((i) => i.transactionId !== z.transactionId))
                  }
                  className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground"
                >
                  Nie
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mb-4 grid grid-cols-3 gap-3">
          <SummaryCard label="Základ" value={totals.net} />
          <SummaryCard label="DPH" value={totals.vat} />
          <SummaryCard label="Celkom" value={totals.total} highlight />
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {loading ? (
            <div className="p-12 text-center text-sm text-muted-foreground">Načítavam…</div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              <FileText className="mx-auto mb-2 h-8 w-8 opacity-40" />
              {bezMesiaca
                ? "Všetko je spracované — žiadny doklad nečaká na kontrolu."
                : mimo.pocet > 0
                ? `Vo výbere nie je žiadny doklad — ${mimo.pocet === 1 ? "jeden je" : `${mimo.pocet} ich je`} v inom mesiaci.`
                : "Zatiaľ tu nemáte žiadne doklady. Odfoťte blok alebo nahrajte fotku/PDF."}
              <div className="mt-4 flex justify-center gap-2">
                {bezMesiaca ? (
                  <button
                    type="button"
                    onClick={() => prepniZalozku("vsetky")}
                    className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-secondary"
                  >
                    Zobraziť všetky doklady
                  </button>
                ) : mimo.pocet > 0 ? (
                  <button
                    type="button"
                    onClick={() => setMonth("")}
                    className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-secondary"
                  >
                    Zobraziť všetky doklady
                  </button>
                ) : (
                  <Link
                    to="/doklady/novy"
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                  >
                    <Camera className="h-4 w-4" /> Skenovať doklad
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs text-muted-foreground">
                <tr>
                  <th className="w-8 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={rows.length > 0 && selected.size === rows.length}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="px-3 py-2 text-left">Dátum</th>
                  <th className="px-3 py-2 text-left">Dodávateľ</th>
                  <th className="px-3 py-2 text-left">Číslo</th>
                  <th className="px-3 py-2 text-right">Celkom</th>
                  <th className="px-3 py-2 text-left">Stav</th>
                  <th className="px-3 py-2 text-left">Zdroj</th>
                  <th className="px-3 py-2 text-left">Úhrada z účtu</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggle(r.id)}
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.issue_date ?? "—"}</td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() =>
                          navigate({ to: "/doklady/novy", search: { id: r.id } as any })
                        }
                        className="text-left hover:underline"
                      >
                        {r.supplier_name ?? (
                          <span className="text-muted-foreground italic">bez názvu</span>
                        )}
                      </button>
                      {r.supplier_ico ? (
                        <div className="text-xs text-muted-foreground">IČO {r.supplier_ico}</div>
                      ) : null}
                      {r.status === "new" && chybajuceUdaje(r).length > 0 && (
                        <div className="text-xs text-amber-700 dark:text-amber-400">
                          Chýba: {chybajuceUdaje(r).join(", ")}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">{r.document_number ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.total_amount != null
                        ? `${Number(r.total_amount).toFixed(2)} ${r.currency}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          title={
                            r.processed_at
                              ? `Spracované ${new Date(r.processed_at).toLocaleDateString("sk-SK")}`
                              : undefined
                          }
                          className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_STYLE[r.status]}`}
                        >
                          {STATUS_LABEL[r.status] ?? r.status}
                        </span>
                        {r.status === "new" &&
                          (daSaSpracovat(r) ? (
                            <button
                              onClick={() => zmenStav([r.id], "processed")}
                              disabled={menimStav}
                              className="inline-flex items-center gap-1 rounded-md bg-emerald-600/10 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-600/20 disabled:opacity-50 dark:text-emerald-400"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" /> Spracovať
                            </button>
                          ) : (
                            <button
                              onClick={() =>
                                navigate({ to: "/doklady/novy", search: { id: r.id } as any })
                              }
                              className="rounded-md border border-border px-2 py-0.5 text-xs hover:bg-secondary"
                            >
                              Doplniť
                            </button>
                          ))}
                        {r.status === "processed" && (
                          <button
                            onClick={() => zmenStav([r.id], "new")}
                            disabled={menimStav}
                            title="Vrátiť medzi nespracované"
                            className="rounded-md p-0.5 text-muted-foreground hover:bg-secondary disabled:opacity-50"
                          >
                            <Undo2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {ZDROJ_DOKLADU[r.source] ?? r.source}
                    </td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {uhrady[r.id] ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-emerald-700 dark:text-emerald-400">
                            {uhrady[r.id].datum}
                          </span>
                          <button
                            onClick={() => rozparuj(r.id, uhrady[r.id].transactionId)}
                            title="Zrušiť párovanie s platbou"
                            className="text-muted-foreground hover:underline"
                          >
                            zrušiť
                          </button>
                        </span>
                      ) : r.payment_method === "hotovost" ? (
                        // Hotovosť v banke nikdy nebude — pomlčka by tu vyzerala ako chýbajúci údaj.
                        <span className="text-muted-foreground">hotovosť</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.file_path && (
                        <button
                          onClick={() => openFile(r.file_path)}
                          title="Otvoriť súbor"
                          className="rounded-md p-1.5 hover:bg-secondary"
                        >
                          <FileText className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => doPrijatych(r)}
                        disabled={presuvam === r.id}
                        title="Presunúť medzi prijaté faktúry"
                        className="rounded-md p-1.5 hover:bg-secondary disabled:opacity-50"
                      >
                        <FileInput className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => del(r.id)}
                        title="Zmazať"
                        className="rounded-md p-1.5 hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </PageBody>
    </>
  );
}

function SummaryCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-border p-4 ${highlight ? "bg-primary/5" : "bg-card"}`}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value.toFixed(2)} €</div>
    </div>
  );
}
