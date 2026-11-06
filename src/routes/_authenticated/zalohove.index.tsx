import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { NahladDokladuOkno, TlacidloNahladu, useNahladOkna } from "@/components/faktero/NahladDokladuOkno";
import { getInvoicePdfSignedUrl } from "@/lib/faktero/pdf.functions";
import { preloz } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { TabulkaZoznamu } from "@/components/faktero/TabulkaZoznamu";
import { StatusBadge } from "./dashboard";
import { StavOdznak } from "@/components/faktero/web/Stav";
import { Plus, Trash2, RotateCcw, Hash, Download, Undo2, X } from "lucide-react";
import { vratVystavenuZPohodyFn } from "@/lib/faktero/zauctovanie.functions";
import { potvrd } from "@/lib/potvrdenie";
import { useServerFn } from "@tanstack/react-start";
import { exportInvoicesFn } from "@/lib/faktero/export.functions";
import { useExportDoProgramu } from "@/hooks/useExportDoProgramu";
import { toastNeodovzdane } from "@/components/faktero/NeodovzdaneDoklady";
import { toast } from "sonner";
import { usePagedList } from "@/hooks/usePagedList";
import { ListPagination, ConfirmDialog } from "@/components/faktero/ListControls";
import { ResponsiveTable, MobileListCard } from "@/components/faktero/ResponsiveTable";
import { KlikatelnyRiadok } from "@/components/faktero/KlikatelnyRiadok";
import { DocumentListToolbar, HlavickaViac } from "@/components/faktero/DocumentListToolbar";
import { useListFilters, zoznamSearch } from "@/hooks/useListFilters";
import { filtrujObdobie, type DatumObdobia } from "@/lib/faktero/obdobie-filter";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { formatujMenu } from "@/lib/faktero/mena";
import { SuctovaPatickaZoznamu } from "@/components/faktero/SuctyDokladov";
import { useSuhrnVystavenych } from "@/hooks/useSuhrnVystavenych";
import { useCiselnikyDokladov } from "@/hooks/useCiselnikyDokladov";
import { HromadnaAkciaDokladov } from "@/components/faktero/HromadnaAkciaDokladov";
import { PasVyberuFiltra, potvrdHromadneMazanie } from "@/components/faktero/HromadnyVyber";
import { rozdelNaMazanie } from "@/lib/faktero/hromadny-vyber";

export const Route = createFileRoute("/_authenticated/zalohove/")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Vydané zálohové faktúry — Faktero") }] }),
  validateSearch: (s: Record<string, unknown>) => ({ ...zoznamSearch(s) }),
  component: ProformaListPage,
});

function ProformaListPage() {
  const { t } = useT();
  // Hľadanie, filtre, strana a počet na stranu sú v adrese.
  const lf = useListFilters({
    pageSizeKey: "invoices-proforma",
    defaultSort: { column: "issue_date", ascending: false },
  });
  const podla = (lf.filter("podla") || "vystavenie") as DatumObdobia;
  const { od: obdobieOd, do: obdobieDo } = lf.rozsah("obdobie");
  const upravDotaz = useCallback(
    (dotaz: any) => filtrujObdobie(dotaz, podla, obdobieOd || null, obdobieDo || null),
    [podla, obdobieOd, obdobieDo],
  );
  const list = usePagedList({
    resource: "invoices",
    searchColumns: ["invoice_number", "customer_name", "customer_ico"],
    equals: { type: "proforma" },
    pageSizeKey: "invoices-proforma",
    orderBy: { column: "issue_date", ascending: false },
    upravDotaz,
    riadenie: lf,
    filterKey: `${podla}|${obdobieOd}|${obdobieDo}`,
  });
  // Súčet za celý filter (P-1007) — v tejto záložke sa zálohové počítajú.
  const sucetFiltra = useSuhrnVystavenych(
    {
      companyId: getActiveCompanyId(),
      typy: ["proforma"],
      hladanie: list.search,
      podla,
      od: obdobieOd || null,
      do: obdobieDo || null,
    },
    { vypnute: list.showDeleted, nonce: list.rows },
  );
  // „Zobraziť vymazané“ je filter v adrese, kôš však prepína zoznam.
  const ajVymazane = lf.zapnute("vymazane");
  const setShowDeleted = list.setShowDeleted;
  useEffect(() => setShowDeleted(ajVymazane), [ajVymazane, setShowDeleted]);

  const [settledMap, setSettledMap] = useState<
    Record<string, { id: string; invoice_number: string }>
  >({});
  const [rowDelete, setRowDelete] = useState<any | null>(null);
  // Náhľad PDF v okne so šípkami (C1-3).
  const okno = useNahladOkna();
  const navigate = useNavigate();
  const pdfUrlFn = useServerFn(getInvoicePdfSignedUrl);

  /*
    Ktoré zálohy sú už zúčtované. Väzba je v `invoice_advances` — faktúra si
    môže odpočítať viac záloh naraz, takže starý stĺpec na faktúre by tie
    ďalšie zamlčal.
  */
  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid || !list.rows.length) {
      setSettledMap({});
      return;
    }
    const ids = list.rows.map((r) => r.id);
    let cancelled = false;
    (async () => {
      const { data: odpocty } = await supabase
        .from("invoice_advances")
        .select("invoice_id, advance_invoice_id")
        .eq("company_id", cid)
        .in("advance_invoice_id", ids);
      const fakturyIds = [...new Set((odpocty ?? []).map((o: any) => o.invoice_id))];
      const { data: faktury } = fakturyIds.length
        ? await supabase.from("invoices").select("id, invoice_number").in("id", fakturyIds)
        : { data: [] as any[] };
      const cisla = new Map((faktury ?? []).map((f: any) => [f.id, f.invoice_number]));
      const data = (odpocty ?? []).map((o: any) => ({
        id: o.invoice_id,
        invoice_number: cisla.get(o.invoice_id) ?? "",
        advance_invoice_id: o.advance_invoice_id,
      }));
      if (cancelled) return;
      const m: Record<string, { id: string; invoice_number: string }> = {};
      for (const row of data ?? []) {
        if (row.advance_invoice_id && !m[row.advance_invoice_id]) {
          m[row.advance_invoice_id] = { id: row.id, invoice_number: row.invoice_number };
        }
      }
      setSettledMap(m);
    })();
    return () => {
      cancelled = true;
    };
  }, [list.rows]);

  function statusFor(row: any) {
    if (settledMap[row.id]) return "settled" as const;
    return row.status as string;
  }

  async function confirmRowDelete() {
    if (!rowDelete) return;
    try {
      await list.softDelete([rowDelete.id]);
      toast.success(t("Zálohová faktúra vymazaná"));
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba"));
    } finally {
      setRowDelete(null);
    }
  }

  /*
    Zálohové faktúry do Pohody (Vydané zálohové faktúry, issuedAdvanceInvoice)
    — kvôli úhrade a odpočtu zálohy na ostrej faktúre. Idú vybrané, bez
    výberu všetky zobrazené na stránke (okrem konceptov a stornovaných).
  */
  const exportFn = useServerFn(exportInvoicesFn);
  const program = useExportDoProgramu();
  const [exportujem, setExportujem] = useState(false);
  const exportovatelne = list.rows.filter(
    (r: any) => !r.deleted_at && r.status !== "draft" && r.status !== "cancelled",
  );
  // Označené (aj celý filter naprieč stránkami) — bez konceptov a stornovaných.
  const vybraneIds = list.selectedRows
    .filter((r: any) => !r.deleted_at && r.status !== "draft" && r.status !== "cancelled")
    .map((r: any) => r.id);
  const naExport = vybraneIds.length ? vybraneIds : exportovatelne.map((r: any) => r.id);
  async function exportujDoPohody() {
    const cid = getActiveCompanyId();
    if (!cid || !naExport.length) return;
    setExportujem(true);
    try {
      const r = await exportFn({ data: { companyId: cid, invoiceIds: naExport, format: "pohoda_xml" } });
      const url = URL.createObjectURL(new Blob([r.content], { type: "application/xml;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = r.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(t("XML pre Pohodu: {n} zálohových faktúr", { n: r.invoiceCount }));
      toastNeodovzdane(t, r.preskocene);
      list.clearSelection();
    } catch (e: any) {
      toast.error(e?.message ?? t("Export zlyhal"));
    } finally {
      setExportujem(false);
    }
  }

  /*
    Vrátenie z Pohody — odovzdané vybrané zálohové sa odomknú a pri ďalšom
    exporte pôjdu znova. V Pohode ich treba zmazať ručne.
  */
  const vratFn = useServerFn(vratVystavenuZPohodyFn);
  const vybraneOdovzdane = list.selectedRows.filter((r: any) => r.exported_at);
  async function vratitVybrane() {
    const cid = getActiveCompanyId();
    if (!cid || !vybraneOdovzdane.length) return;
    if (
      !(await potvrd(
        t(
          "Vrátiť {n} zálohových faktúr z Pohody? Odomknú sa na opravu a pri ďalšom exporte pôjdu znova. V Pohode ich treba zmazať ručne, inak tam budú dvakrát.",
          { n: vybraneOdovzdane.length },
        ),
      ))
    )
      return;
    setExportujem(true);
    let ok = 0;
    try {
      for (const r of vybraneOdovzdane) {
        await vratFn({ data: { company_id: cid, id: r.id } });
        ok++;
      }
      toast.success(t("Vrátené z Pohody: {n}", { n: ok }));
    } catch (e: any) {
      toast.error((ok ? t("Vrátené z Pohody: {n}", { n: ok }) + " — " : "") + (e?.message ?? t("Nepodarilo sa")));
    } finally {
      setExportujem(false);
      list.clearSelection();
      list.reload();
    }
  }

  /* Hromadné akcie — tá istá lišta ako pri faktúrach (predkontácia, členenie, KV, stav, štítky, mazanie). */
  const cis = useCiselnikyDokladov(getActiveCompanyId(), "vystavena", false);
  async function zmazatOznacene() {
    const m = rozdelNaMazanie(list.selectedRows, cis.zamknuteDo);
    if (!(await potvrdHromadneMazanie(t, m, t("Presunúť {n} zálohových faktúr do koša?", { n: m.ids.length })))) return;
    try {
      await list.softDelete(m.ids);
      toast.success(t("Vymazané zálohové faktúry: {n}", { n: m.ids.length }));
      list.clearSelection();
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba"));
    }
  }

  return (
    <>
      <NahladDokladuOkno
        okno={okno}
        idcka={list.rows.map((r: any) => r.id)}
        nacitaj={async (id) => {
          const r = await pdfUrlFn({ data: { invoiceId: id } });
          return r?.signedUrl ? { url: r.signedUrl } : null;
        }}
        nazov={(id) => (list.rows as any[]).find((r) => r.id === id)?.invoice_number}
        poznamka={(id) => (list.rows as any[]).find((r) => r.id === id)?.customer_name}
        onOtvorit={(id) => navigate({ to: "/faktury/$id", params: { id } })}
      />
      <PageHeader
        title={t("Vydané zálohové faktúry")}
        description={t("Proforma / zálohové faktúry. Po prijatí platby ich zúčtujete vo finálnej faktúre.")}
        action={
          <div className="flex flex-wrap gap-2">
            {!list.showDeleted && !program.inyProgram && naExport.length ? (
              <button
                type="button"
                disabled={exportujem}
                onClick={() => void exportujDoPohody()}
                title={t(
                  "Vybrané (alebo bez výberu všetky zobrazené) zálohové faktúry do Pohody (Vydané zálohové faktúry) — kvôli úhrade a odpočtu zálohy",
                )}
                className="inline-flex items-center gap-2 rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-50"
              >
                <Download className="h-4 w-4" />{" "}
                {vybraneIds.length
                  ? t("XML pre Pohodu – vybrané ({n})", { n: vybraneIds.length })
                  : t("XML pre Pohodu")}
              </button>
            ) : null}
            {vybraneOdovzdane.length ? (
              <button
                type="button"
                disabled={exportujem}
                onClick={() => void vratitVybrane()}
                className="inline-flex items-center gap-2 rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-50"
              >
                <Undo2 className="h-4 w-4" />{" "}
                {t("Vrátiť z Pohody ({n})", { n: vybraneOdovzdane.length })}
              </button>
            ) : null}
            <HlavickaViac akcie={[{ label: "Číselné rady", icon: Hash, to: "/ciselne-rady" }]} />
            <Link
              to="/faktury/nova"
              search={{ type: "proforma" } as any}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> {t("Nová zálohová faktúra")}
            </Link>
          </div>
        }
      />
      <PageBody>
        <DocumentListToolbar
          lf={lf}
          searchPlaceholder="Hľadať číslo, odberateľa, IČO…"
          filters={[
            {
              key: "obdobie",
              label: "Obdobie",
              type: "dateRange",
              dateFieldOptions: [
                { value: "vystavenie", label: "dátumu vystavenia" },
                { value: "dodanie", label: "dátumu dodania" },
                { value: "splatnost", label: "dátumu splatnosti" },
              ],
            },
            { key: "vymazane", label: "Zobraziť vymazané", type: "checkbox" },
          ]}
        />
        {list.selectedIds.length > 0 && !list.showDeleted && getActiveCompanyId() ? (
          <div
            role="region"
            aria-label={t("Hromadné akcie")}
            className="sticky top-16 z-20 mt-2 flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-card/95 px-3 py-2 text-sm shadow-sm backdrop-blur"
          >
            <span className="mr-1 font-semibold">
              {t("Označené:")} <span className="tabular-nums">{list.selectedIds.length}</span>
            </span>
            <HromadnaAkciaDokladov
              companyId={getActiveCompanyId()!}
              agenda="vystavena"
              ids={list.selectedIds}
              onHotovo={() => list.reload()}
              zmazat={() => void zmazatOznacene()}
            />
            <button
              type="button"
              onClick={list.clearSelection}
              className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" /> {t("Zrušiť výber")}
            </button>
          </div>
        ) : null}
        {!list.showDeleted ? (
          <PasVyberuFiltra
            naStrane={list.rows.length}
            celkom={list.total}
            vsetky={list.allMatchingSelected}
            stranaOznacena={list.allOnPageSelected}
            nacitava={list.loadingAllMatching}
            onVsetky={() => void list.selectAllMatching().catch((e: any) => toast.error(e?.message ?? t("Chyba")))}
            onZrusit={list.clearSelection}
          />
        ) : null}
        <ResponsiveTable
          className="mt-3"
          items={list.rows}
          loading={list.loading}
          emptyText={
            list.showDeleted
              ? t("Žiadne vymazané zálohové faktúry.")
              : t("Žiadne zálohové faktúry. Vytvorte prvú tlačidlom „Nová zálohová faktúra\".")
          }
          mobileCard={(i: any) => {
            const s = statusFor(i);
            return (
              <MobileListCard
                ciel={{ to: "/faktury/$id", params: { id: i.id } }}
                {...(!list.showDeleted
                  ? {
                      vybrane: !!list.selected[i.id],
                      onVyber: (v: boolean) => list.toggleSelect(i.id, v),
                      vyberPopis: t("Vybrať riadok"),
                    }
                  : {})}
                title={i.invoice_number}
                subtitle={i.customer_name ?? "—"}
                status={<ProformaStatus value={s} settled={settledMap[i.id]} />}
                meta={`${datumNaDoklade(i.issue_date)} · ${t("splat.")} ${datumNaDoklade(i.due_date)}`}
                amount={formatujMenu(i.total, i.currency)}
                actions={
                  list.showDeleted ? (
                    <button
                      aria-label={t("Obnoviť")}
                      title={t("Obnoviť")}
                      onClick={async () => {
                        try {
                          await list.restore([i.id]);
                          toast.success(t("Obnovené"));
                        } catch (e: any) {
                          toast.error(e?.message ?? t("Chyba"));
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-primary-hover hover:bg-primary/10"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> {t("Obnoviť")}
                    </button>
                  ) : (
                    <div className="flex gap-1">
                      <TlacidloNahladu popis={i.invoice_number} onClick={() => okno.otvor(i.id)} />
                      <button
                        onClick={() => setRowDelete(i)}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> {t("Vymazať")}
                      </button>
                    </div>
                  )
                }
              />
            );
          }}
          desktop={
            <TabulkaZoznamu>
              <table className="w-full text-sm">
                <thead className="whitespace-nowrap bg-muted/40 text-left text-xs font-semibold text-muted-foreground">
                  <tr>
                    {!list.showDeleted ? (
                      <th className="w-8 p-3">
                        <input
                          type="checkbox"
                          aria-label={t("Vybrať všetky")}
                          checked={list.allOnPageSelected}
                          onChange={(e) => list.toggleAllOnPage(e.target.checked)}
                          className="h-4 w-4 accent-primary"
                        />
                      </th>
                    ) : null}
                    <th className="p-3">{t("Číslo")}</th>
                    <th className="p-3">{t("Odberateľ")}</th>
                    <th className="p-3">{t("Vystavená")}</th>
                    <th className="p-3">{t("Splatnosť")}</th>
                    <th className="p-3 text-right">{t("Suma")}</th>
                    <th className="p-3">{t("Stav")}</th>
                    <th className="p-3">{t("Zúčtovaná v")}</th>
                    <th className="p-3"><span className="sr-only">{t("Akcie")}</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {list.loading && (
                    <tr>
                      <td colSpan={list.showDeleted ? 8 : 9} className="p-8 text-center text-muted-foreground">
                        {t("Načítavam…")}
                      </td>
                    </tr>
                  )}
                  {!list.loading && list.rows.length === 0 && (
                    <tr>
                      <td colSpan={list.showDeleted ? 8 : 9} className="p-8 text-center text-muted-foreground">
                        {list.showDeleted
                          ? t("Žiadne vymazané zálohové faktúry.")
                          : t("Žiadne zálohové faktúry.")}
                      </td>
                    </tr>
                  )}
                  {list.rows.map((i) => {
                    const s = statusFor(i);
                    const link = settledMap[i.id];
                    return (
                      /*
                        Detail otvárali jednotlivé bunky a celým znovunačítaním
                        stránky. Stav ani odkaz na zúčtovanú faktúru na ťuknutie
                        nereagovali. Klikateľný je po novom celý riadok cez
                        router; bunka s odkazom a akciami si kliknutie ponechá.
                      */
                      <KlikatelnyRiadok key={i.id} ciel={{ to: "/faktury/$id", params: { id: i.id } }}>
                        {!list.showDeleted ? (
                          <td className="w-8 p-3">
                            <input
                              type="checkbox"
                              aria-label={t("Vybrať riadok")}
                              checked={!!list.selected[i.id]}
                              onChange={(e) => list.toggleSelect(i.id, e.target.checked)}
                              className="h-4 w-4 accent-primary"
                            />
                          </td>
                        ) : null}
                        <td className="whitespace-nowrap p-3 font-medium">
                          <Link
                            to="/faktury/$id"
                            params={{ id: i.id }}
                            className="cislo-dokladu text-inherit no-underline"
                          >
                            {i.invoice_number}
                          </Link>
                          {i.exported_at ? (
                            <StavOdznak ton="uspech" maly className="ml-2 align-middle">
                              {t("V Pohode")}
                            </StavOdznak>
                          ) : null}
                        </td>
                        <td className="p-3">
                          <span
                            className="block max-w-[14rem] truncate 2xl:max-w-[22rem]"
                            title={i.customer_name ?? undefined}
                          >
                            {i.customer_name ?? "—"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap p-3">{datumNaDoklade(i.issue_date)}</td>
                        <td className="whitespace-nowrap p-3">{datumNaDoklade(i.due_date)}</td>
                        <td className="whitespace-nowrap p-3 text-right">
                          <span className="suma">{formatujMenu(i.total, i.currency)}</span>
                        </td>
                        <td className="p-3">
                          <ProformaStatus value={s} settled={link} />
                        </td>
                        <td className="p-3" onClick={(e) => e.stopPropagation()}>
                          {link ? (
                            <Link
                              to="/faktury/$id"
                              params={{ id: link.id }}
                              className="cislo-dokladu whitespace-nowrap text-primary hover:underline"
                            >
                              {link.invoice_number}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                          {list.showDeleted ? (
                            <button
                              title={t("Obnoviť")}
                              onClick={async () => {
                                try {
                                  await list.restore([i.id]);
                                  toast.success(t("Obnovené"));
                                } catch (e: any) {
                                  toast.error(e?.message ?? t("Chyba"));
                                }
                              }}
                              className="rounded p-1.5 text-primary hover:bg-primary/10"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </button>
                          ) : (
                            <div className="flex justify-end gap-1">
                              <TlacidloNahladu popis={i.invoice_number} onClick={() => okno.otvor(i.id)} />
                              <button
                                title={t("Vymazať")}
                                onClick={() => setRowDelete(i)}
                                className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      </KlikatelnyRiadok>
                    );
                  })}
                </tbody>
              </table>
            </TabulkaZoznamu>
          }
        />
        {!list.showDeleted && list.total > 0 ? (
          <SuctovaPatickaZoznamu suhrn={sucetFiltra.suhrn} nacitava={sucetFiltra.nacitava} />
        ) : null}
        <ListPagination
          page={list.page}
          pageSize={list.pageSize}
          total={list.total}
          onPageChange={list.setPage}
          onPageSizeChange={list.setPageSize}
        />
      </PageBody>

      <ConfirmDialog
        open={!!rowDelete}
        title={t("Naozaj chcete vymazať túto zálohovú faktúru?")}
        message={
          rowDelete
            ? t("Zálohová faktúra {cislo} bude skrytá z rozhrania. Môžete ju neskôr obnoviť.", { cislo: rowDelete.invoice_number })
            : ""
        }
        onCancel={() => setRowDelete(null)}
        onConfirm={confirmRowDelete}
      />
    </>
  );
}

function ProformaStatus({
  value,
  settled,
}: {
  value: string;
  settled?: { id: string; invoice_number: string };
}) {
  const { t } = useT();
  if (settled || value === "settled") {
    return (
      <StavOdznak ton="uspech">{t("Zúčtovaná")}</StavOdznak>
    );
  }
  return <StatusBadge status={value} />;
}
