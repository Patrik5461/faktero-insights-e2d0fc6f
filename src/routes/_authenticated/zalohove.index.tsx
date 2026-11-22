import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { NahladDokladuOkno, TlacidloNahladu, useNahladOkna } from "@/components/faktero/NahladDokladuOkno";
import { getInvoicePdfSignedUrl } from "@/lib/faktero/pdf.functions";
import { preloz } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { TabulkaZoznamu } from "@/components/faktero/TabulkaZoznamu";
import { StatusBadge } from "./dashboard";
import { StavOdznak } from "@/components/faktero/web/Stav";
import { Plus, Trash2, RotateCcw, Hash, Undo2, X, Mail, Bell, Loader2, FileCheck2 } from "lucide-react";
import { sendInvoiceEmailFn } from "@/lib/faktero/email.functions";
import { sendReminderFn } from "@/lib/faktero/reminders.functions";
import { generateInvoicePdf } from "@/lib/faktero/pdf.functions";
import {
  kontrolaDatumuVystaveniaFn,
  zmenDatumVystaveniaNaDnesFn,
} from "@/lib/faktero/datum-vystavenia.functions";
import { dalsiaUpomienka, jeFakturaPoSplatnosti } from "@/lib/faktero/akcie-faktury";
import { sFirmouAktivnej } from "@/lib/faktero/nazov-suboru-aktivnej-firmy";
import { TlacidloXmlPohody } from "@/components/faktero/TlacidloXmlPohody";
import { vratVystavenuZPohodyFn } from "@/lib/faktero/zauctovanie.functions";
import { potvrd } from "@/lib/potvrdenie";
import { useServerFn } from "@tanstack/react-start";
import { exportInvoicesFn } from "@/lib/faktero/export.functions";
import { useExportDoProgramu } from "@/hooks/useExportDoProgramu";
import { toastNeodovzdane } from "@/components/faktero/NeodovzdaneDoklady";
import { exportSPotvrdenim } from "@/lib/faktero/export-potvrdenie";
import { VolbyExportuOkno, type VolbyExportu } from "@/components/faktero/VolbyExportuOkno";
import { toast } from "sonner";
import { usePagedList } from "@/hooks/usePagedList";
import { ListPagination, ConfirmDialog } from "@/components/faktero/ListControls";
import { ResponsiveTable, MobileListCard } from "@/components/faktero/ResponsiveTable";
import { KlikatelnyRiadok } from "@/components/faktero/KlikatelnyRiadok";
import { DocumentListToolbar, HlavickaViac } from "@/components/faktero/DocumentListToolbar";
import { useListFilters, zoznamSearch } from "@/hooks/useListFilters";
import { orHladania } from "@/lib/faktero/hladanie-zoznamu";
import { rozoberDotaz } from "@/lib/faktero/globalne-hladanie";
import { filtrujObdobie, type DatumObdobia } from "@/lib/faktero/obdobie-filter";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { formatujMenu } from "@/lib/faktero/mena";
import { SuctovaPatickaZoznamu } from "@/components/faktero/SuctyDokladov";
import { useSuhrnVystavenych } from "@/hooks/useSuhrnVystavenych";
import { useCiselnikyDokladov } from "@/hooks/useCiselnikyDokladov";
import { HromadnaAkciaDokladov } from "@/components/faktero/HromadnaAkciaDokladov";
import { PasVyberuFiltra, potvrdHromadneMazanie } from "@/components/faktero/HromadnyVyber";
import { rozdelNaMazanie } from "@/lib/faktero/hromadny-vyber";
import { usePlatbyZaloh } from "@/hooks/usePlatbyZaloh";
import { IkonaPlatbyZalohy } from "@/components/faktero/PlatbaZalohy";
import {
  filterStavu,
  filterObdobia,
  filterExportu,
  filterPlatby,
  filterUhrady,
  filterVymazanych,
} from "@/lib/faktero/filtre-dokladov";

/** Stav zálohovej vo filtri „Stav“ (`?f[stav]=`). */
const STAVY_ZALOHOVYCH = [
  { value: "draft", label: "Koncept" },
  { value: "issued", label: "Vystavená" },
  { value: "sent", label: "Odoslaná" },
  { value: "paid", label: "Uhradená" },
  { value: "cancelled", label: "Stornovaná" },
];
const JE_STAV_ZALOHOVEJ = new Set(STAVY_ZALOHOVYCH.map((s) => s.value));

/** Filter „Úhrada“ → kódy `payment_method` (aj staršie zápisy); prázdny spôsob = prevod. */
const KODY_UHRADY: Record<string, string[]> = {
  hotovost: ["cash", "hotovost"],
  karta: ["card", "karta", "credit_card"],
  prevod: ["bank_transfer", "transfer", "prevod"],
};

/*
  Filter „Platba“ (`?f[platba]=`) má voľby ako všade (spárovaná / nájdená /
  nenájdená). Staré hodnoty z uložených filtrov a odkazov platia ďalej:
  `uhradene` = spárovaná, `bez` = nenájdená.
*/
type PlatbaZalohovej = "sparovana" | "navrh" | "nenajdena" | "";
function platbaZalohovej(v: string): PlatbaZalohovej {
  if (v === "sparovana" || v === "uhradene") return "sparovana";
  if (v === "navrh") return "navrh";
  if (v === "nenajdena" || v === "bez") return "nenajdena";
  return "";
}

/** Žiadny doklad — `in` s prázdnym zoznamom PostgREST neprijme. */
const ZIADNE_ID = "00000000-0000-0000-0000-000000000000";

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
  /*
    Platby z banky: väzby k riadkom strany a návrhy z párovania vydaných
    faktúr (prichádzajúca platba podľa VS a sumy). Zoznam sa stránkuje na
    serveri, preto filter „Platba“ ide do dotazu — návrhy dodajú zoznam id.
  */
  const platbaFilter = platbaZalohovej(lf.filter("platba"));
  // Stará hodnota v adrese (`uhradene`, `bez`) sa prepíše na novú, nech ju lišta ukáže.
  const platbaVAdrese = lf.filter("platba");
  const setFilter = lf.setFilter;
  useEffect(() => {
    if (platbaVAdrese && platbaVAdrese !== platbaFilter) setFilter("platba", platbaFilter);
  }, [platbaVAdrese, platbaFilter, setFilter]);
  const stavZalohovej = JE_STAV_ZALOHOVEJ.has(lf.filter("stav")) ? lf.filter("stav") : "";
  const exportovane = lf.filter("export") as "" | "ano" | "nie";
  const uhrada = KODY_UHRADY[lf.filter("uhrada")] ? lf.filter("uhrada") : "";
  const [idsStrany, setIdsStrany] = useState<string[]>([]);
  const obnovZoznam = useRef<() => void>(() => {});
  const platby = usePlatbyZaloh("vydana", getActiveCompanyId(), idsStrany, () => obnovZoznam.current());
  const navrhIds = useMemo(() => [...platby.podlaDokladu.keys()].sort(), [platby.podlaDokladu]);
  const upravDotaz = useCallback(
    (dotaz: any) => {
      let q = filtrujObdobie(dotaz, podla, obdobieOd || null, obdobieDo || null);
      if (stavZalohovej) q = q.eq("status", stavZalohovej);
      // Koncept ani stornovaná sa do účtovníctva neexportujú.
      if (exportovane === "ano") q = q.not("exported_at", "is", null);
      if (exportovane === "nie") q = q.is("exported_at", null).not("status", "in", "(draft,cancelled)");
      if (uhrada === "prevod")
        q = q.or(`payment_method.is.null,payment_method.in.(${KODY_UHRADY.prevod.join(",")})`);
      else if (uhrada) q = q.in("payment_method", KODY_UHRADY[uhrada]);
      // Samostatné `.or()` — PostgREST ho spojí s „Prevodom“ cez AND.
      const hladanie = orHladania("vystavene", lf.q);
      if (hladanie) q = q.or(hladanie);
      if (platbaFilter === "sparovana") q = q.eq("status", "paid");
      else if (platbaFilter === "navrh")
        q = q.in("id", navrhIds.length ? navrhIds : [ZIADNE_ID]).not("status", "in", "(paid,draft,cancelled)");
      else if (platbaFilter === "nenajdena") {
        // Hotovosť a karta sa na účte nehľadajú (rovnako ako ikonka v riadku).
        q = q.not("status", "in", "(paid,draft,cancelled)").not("payment_method", "in", "(cash,card)");
        if (navrhIds.length) q = q.not("id", "in", `(${navrhIds.join(",")})`);
      }
      return q;
    },
    [podla, obdobieOd, obdobieDo, stavZalohovej, exportovane, uhrada, platbaFilter, navrhIds, lf.q],
  );
  const list = usePagedList({
    resource: "invoices",
    // Hľadanie ide cez `upravDotaz` (orHladania) — číslo/VS, odberateľ bez
    // diakritiky, IČO/DIČ, IČ DPH aj suma s desatinnou čiarkou.
    searchColumns: [],
    equals: { type: "proforma" },
    pageSizeKey: "invoices-proforma",
    orderBy: { column: "issue_date", ascending: false },
    upravDotaz,
    riadenie: lf,
    filterKey: `${podla}|${obdobieOd}|${obdobieDo}|${stavZalohovej}|${exportovane}|${uhrada}|${platbaFilter}|${platbaFilter ? navrhIds.join(",") : ""}`,
  });
  obnovZoznam.current = () => list.reload();
  useEffect(() => {
    setIdsStrany(list.rows.map((r: any) => r.id));
  }, [list.rows]);
  // Súčet za celý filter (P-1007) — v tejto záložke sa zálohové počítajú.
  const sucetFiltra = useSuhrnVystavenych(
    {
      companyId: getActiveCompanyId(),
      typy: ["proforma"],
      status: stavZalohovej || null,
      hladanie: list.search,
      podla,
      od: obdobieOd || null,
      do: obdobieDo || null,
      export: exportovane || null,
    },
    // Platbu a úhradu súčet v databáze nepozná — radšej žiadny súčet než nesprávny.
    {
      vypnute:
        list.showDeleted ||
        !!platbaFilter ||
        !!uhrada ||
        // Súčet v databáze hľadá len text v čísle, mene a IČO — sumu nepozná.
        rozoberDotaz(list.search).suma != null,
      nonce: list.rows,
    },
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
  // Voľby exportu (dátum zaúčtovania, radenie, označiť) — rovnaké okno ako pri prijatých faktúrach.
  const [volbyExportu, setVolbyExportu] = useState(false);
  const exportovatelne = list.rows.filter(
    (r: any) => !r.deleted_at && r.status !== "draft" && r.status !== "cancelled",
  );
  // Označené (aj celý filter naprieč stránkami) — bez konceptov a stornovaných.
  const vybraneIds = list.selectedRows
    .filter((r: any) => !r.deleted_at && r.status !== "draft" && r.status !== "cancelled")
    .map((r: any) => r.id);
  const naExport = vybraneIds.length ? vybraneIds : exportovatelne.map((r: any) => r.id);
  async function exportujDoPohody(v: VolbyExportu) {
    const cid = getActiveCompanyId();
    if (!cid || !naExport.length) return;
    /*
      Bez „Exportovať aj už odovzdané“ idú len neodovzdané. Pri označení ich
      server vynechá sám (druhýkrát odovzdať nemožno); pri samotnom stiahnutí
      ich treba vynechať tu.
    */
    const odovzdane = new Set(
      exportovatelne.filter((r: any) => r.exported_at).map((r: any) => r.id as string),
    );
    const ids = v.ajOdovzdane || v.oznacit ? naExport : naExport.filter((id: string) => !odovzdane.has(id));
    if (!ids.length) {
      toast.error(t("Vybrané zálohové faktúry sú už odovzdané do Pohody."));
      return;
    }
    setExportujem(true);
    try {
      // Závažné chyby export nezastavia — okno sa spýta „Exportovať aj tak“.
      const r = await exportSPotvrdenim(
        (potvrdene) =>
          exportFn({
            data: {
              companyId: cid,
              invoiceIds: ids,
              format: "pohoda_xml",
              oznacit: v.oznacit,
              datumZauctovania: v.datumZauctovania,
              radenie: v.radenie,
              potvrdene_varovania: potvrdene,
            },
          }),
        t,
      );
      if (!r) return;
      const url = URL.createObjectURL(new Blob([r.content], { type: "application/xml;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = r.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(
        t("XML pre Pohodu: {n} zálohových faktúr", { n: r.invoiceCount }) +
          (r.oznacene ? t(", označené ako odovzdané") : ""),
      );
      toastNeodovzdane(t, r.preskocene);
      list.clearSelection();
      list.reload();
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

  /*
    Odoslanie e-mailom, upomienka a PDF ZIP — tie isté serverové funkcie a
    pravidlá ako hromadné akcie vystavených faktúr (faktury.index.tsx).
  */
  const emailFn = useServerFn(sendInvoiceEmailFn);
  const kontrolaDatumuFn = useServerFn(kontrolaDatumuVystaveniaFn);
  const zmenDatumFn = useServerFn(zmenDatumVystaveniaNaDnesFn);
  const reminderFn = useServerFn(sendReminderFn);
  const pdfFn = useServerFn(generateInvoicePdf);
  const [odosielam, setOdosielam] = useState(false);
  const [priebeh, setPriebeh] = useState<{ current: number; total: number } | null>(null);
  const zaneprazdnene = odosielam || exportujem;
  const dnes = new Date().toISOString().slice(0, 10);
  const zive = list.selectedRows.filter((r: any) => !r.deleted_at);
  const naEmail = zive.filter((r: any) => (r.status === "issued" || r.status === "sent") && r.customer_email);
  const naUpomienku = zive.filter((r: any) => jeFakturaPoSplatnosti(r, dnes) && r.customer_email);

  async function emailVybranym() {
    const targets = naEmail;
    const prazdne = t("Žiadne odosielateľné faktúry (chýba email alebo nesprávny stav).");
    if (!targets.length) {
      toast.error(prazdne);
      return;
    }
    if (
      !(await potvrd(t("Odoslať e-mailom {n} faktúr?", { n: targets.length }), {
        potvrdit: t("Odoslať"),
        nebezpecne: false,
      }))
    )
      return;
    // Prvé odoslanie s dnešným dátumom vystavenia — ako pri faktúrach.
    let kontroly: Record<string, any> = {};
    try {
      kontroly = await kontrolaDatumuFn({ data: { invoiceIds: targets.map((r: any) => r.id) } });
    } catch {
      /* rozhodne server pri odoslaní */
    }
    const naZmenu = targets.filter((r: any) => kontroly[r.id]?.treba && kontroly[r.id]?.mozno);
    const nemenitelne = targets.filter((r: any) => kontroly[r.id]?.treba && !kontroly[r.id]?.mozno);
    if (naZmenu.length || nemenitelne.length) {
      const riadky = [
        t("Faktúry so starším dátumom vystavenia: {n}. Faktúra sa odosiela dnes — dátum vystavenia by mal byť aktuálny.", {
          n: naZmenu.length + nemenitelne.length,
        }),
        naZmenu.length
          ? t("Dátum vystavenia sa zmení na dnes pri {n} z nich, splatnosť sa posunie o rovnaký počet dní a dátum dodania ostáva.", { n: naZmenu.length })
          : "",
        nemenitelne.length
          ? t("Faktúry, ktorým sa dátum zmeniť nedá (uzamknuté obdobie alebo export do účtovníctva): {n}. Hromadne sa neodošlú — pošlite ich jednotlivo z detailu faktúry.", { n: nemenitelne.length })
          : "",
      ].filter(Boolean);
      const ano = await potvrd(riadky.join("\n"), {
        potvrdit: naZmenu.length ? t("Zmeniť dátum vystavenia na dnes a odoslať") : t("Odoslať ostatné"),
        nebezpecne: false,
      });
      if (!ano) return;
    }
    const preskocit = new Set(nemenitelne.map((r: any) => r.id));
    const menit = new Set<string>(naZmenu.map((r: any) => r.id));
    const naOdoslanie = targets.filter((r: any) => !preskocit.has(r.id));
    if (!naOdoslanie.length) {
      toast.error(prazdne);
      return;
    }
    setOdosielam(true);
    setPriebeh({ current: 0, total: naOdoslanie.length });
    let ok = 0,
      fail = 0;
    for (let i = 0; i < naOdoslanie.length; i++) {
      const inv = naOdoslanie[i];
      try {
        if (menit.has(inv.id)) await zmenDatumFn({ data: { invoiceId: inv.id } });
        await emailFn({ data: { invoiceId: inv.id, recipient_email: inv.customer_email } });
        ok++;
      } catch (e) {
        console.error("bulk email failed", inv.id, e);
        fail++;
      }
      setPriebeh({ current: i + 1, total: naOdoslanie.length });
    }
    setPriebeh(null);
    setOdosielam(false);
    if (fail === 0) toast.success(t("Odoslané e-maily: {n}", { n: ok }));
    else toast.error(t("Odoslaných {ok}, zlyhalo {fail}", { ok, fail }));
    list.clearSelection();
    list.reload();
  }

  async function upomienkaVybranym() {
    const targets = naUpomienku;
    if (!targets.length) {
      toast.error(t("Žiadne po splatnosti faktúry s emailom."));
      return;
    }
    if (
      !(await potvrd(
        t("Odoslať upomienky pre {n} faktúr?", { n: targets.length }) +
          "\n" +
          t("Odosielajú sa iba po splatnosti faktúry s emailom odberateľa. Číslo upomienky sa určí automaticky."),
        { potvrdit: t("Odoslať upomienky"), nebezpecne: false },
      ))
    )
      return;
    setOdosielam(true);
    setPriebeh({ current: 0, total: targets.length });
    // Poradie upomienky podľa už odoslaných — ako v detaile faktúry.
    const { data: odoslane } = await supabase
      .from("invoice_reminders")
      .select("invoice_id, reminder_number")
      .in("invoice_id", targets.map((r: any) => r.id))
      .eq("status", "sent");
    const podlaFaktury = new Map<string, number[]>();
    for (const r of (odoslane ?? []) as any[]) {
      podlaFaktury.set(r.invoice_id, [...(podlaFaktury.get(r.invoice_id) ?? []), Number(r.reminder_number)]);
    }
    let ok = 0,
      fail = 0;
    for (let i = 0; i < targets.length; i++) {
      const inv = targets[i];
      const dalsia = dalsiaUpomienka(podlaFaktury.get(inv.id) ?? []) ?? 3;
      try {
        await reminderFn({
          data: { invoiceId: inv.id, reminderNumber: dalsia, recipient_email: inv.customer_email },
        });
        ok++;
      } catch (e) {
        console.error("bulk reminder failed", inv.id, e);
        fail++;
      }
      setPriebeh({ current: i + 1, total: targets.length });
    }
    setPriebeh(null);
    setOdosielam(false);
    if (fail === 0) toast.success(t("Odoslané upomienky: {n}", { n: ok }));
    else toast.error(t("Odoslaných {ok}, zlyhalo {fail}", { ok, fail }));
    list.clearSelection();
    list.reload();
  }

  async function pdfZipVybranych() {
    const ids = list.selectedIds;
    if (!ids.length) return;
    setOdosielam(true);
    setPriebeh({ current: 0, total: ids.length });
    let ok = 0,
      fail = 0;
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      for (let i = 0; i < ids.length; i++) {
        try {
          const r = await pdfFn({ data: { invoiceId: ids[i] } });
          const resp = await fetch(r.signedUrl);
          if (!resp.ok) throw new Error("PDF fetch failed");
          zip.file(r.fileName, new Uint8Array(await resp.arrayBuffer()));
          ok++;
        } catch (e) {
          console.error("bulk pdf failed", ids[i], e);
          fail++;
        }
        setPriebeh({ current: i + 1, total: ids.length });
      }
      if (ok > 0) {
        const blob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = await sFirmouAktivnej(`zalohove-faktury-${dnes}.zip`);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } finally {
      setPriebeh(null);
      setOdosielam(false);
    }
    if (fail === 0) toast.success(t("ZIP stiahnutý — faktúr: {n}", { n: ok }));
    else toast.error(t("Do ZIPu pridaných {ok}, zlyhalo {fail}", { ok, fail }));
    list.clearSelection();
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
      {volbyExportu ? (
        <VolbyExportuOkno
          pocet={naExport.length}
          nazov={t("Vydané zálohové faktúry do Pohody (XML)")}
          onClose={() => setVolbyExportu(false)}
          onExport={exportujDoPohody}
        />
      ) : null}
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
            {/* Bez označenia: XML pre Pohodu za všetko vo filtri. Po označení je to
                isté tlačidlo prvé v lište hromadných akcií. */}
            {!list.showDeleted && !program.inyProgram && !list.selectedIds.length && naExport.length ? (
              <TlacidloXmlPohody
                pocet={0}
                busy={exportujem}
                onClick={() => setVolbyExportu(true)}
                title={t(
                  "Vybrané (alebo bez výberu všetky zobrazené) zálohové faktúry do Pohody (Vydané zálohové faktúry) — bez DPH a bez zaúčtovania, kvôli úhrade a odpočtu zálohy",
                )}
              />
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
          searchPlaceholder="Číslo, odberateľ, IČO, suma…"
          filters={[
            filterStavu(STAVY_ZALOHOVYCH),
            filterObdobia(["vystavenie", "dodanie", "splatnost"]),
            filterExportu(),
            filterPlatby("platba"),
            filterUhrady(),
            filterVymazanych(),
          ]}
        />
        {list.selectedIds.length > 0 && !list.showDeleted && getActiveCompanyId() ? (
          <div
            role="region"
            aria-label={t("Hromadné akcie")}
            className="sticky top-16 z-20 mt-2 flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-card/95 px-3 py-2 text-sm shadow-sm backdrop-blur"
          >
            {/*
              Jednotná lišta po označení: XML pre Pohodu → Hromadná akcia (aj PDF ZIP a
              mazanie) → e-mail a upomienka → Vrátiť z Pohody → Zrušiť výber.
              eFaktúra tu nie je — zálohová nie je daňový doklad (druhZFaktury ju odmietne).
            */}
            <span className="mr-1 font-semibold">
              {t("Vybrané: {n}", { n: list.selectedIds.length })}
            </span>
            <HromadnaAkciaDokladov
              companyId={getActiveCompanyId()!}
              agenda="vystavena"
              ids={list.selectedIds}
              onHotovo={() => list.reload()}
              xmlPohoda={
                !program.inyProgram && vybraneIds.length && !exportujem
                  ? () => setVolbyExportu(true)
                  : undefined
              }
              pdfZip={zaneprazdnene ? undefined : () => void pdfZipVybranych()}
              zmazat={() => void zmazatOznacene()}
            />
            <button
              type="button"
              disabled={zaneprazdnene || naEmail.length === 0}
              onClick={() => void emailVybranym()}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-secondary disabled:opacity-50"
            >
              <Mail className="h-3.5 w-3.5" /> {t("Odoslať e-mailom")}{" "}
              {naEmail.length > 0 ? `(${naEmail.length})` : ""}
            </button>
            <button
              type="button"
              disabled={zaneprazdnene || naUpomienku.length === 0}
              onClick={() => void upomienkaVybranym()}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-secondary disabled:opacity-50"
            >
              <Bell className="h-3.5 w-3.5" /> {t("Poslať upomienku")}{" "}
              {naUpomienku.length > 0 ? `(${naUpomienku.length})` : ""}
            </button>
            {vybraneOdovzdane.length ? (
              <button
                type="button"
                disabled={zaneprazdnene}
                onClick={() => void vratitVybrane()}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-secondary disabled:opacity-50"
              >
                <Undo2 className="h-3.5 w-3.5" /> {t("Vrátiť z Pohody ({n})", { n: vybraneOdovzdane.length })}
              </button>
            ) : null}
            {priebeh && (
              <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs text-primary-hover">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("Spracováva sa {a}/{b}…", { a: priebeh.current, b: priebeh.total })}
              </span>
            )}
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
                status={
                  <span className="inline-flex flex-wrap items-center gap-1">
                    <ProformaStatus value={s} settled={settledMap[i.id]} />
                    <IkonaPlatbyZalohy platby={platby} druh="vydana" riadok={i} mena={i.currency} />
                  </span>
                }
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
                      {i.status !== "draft" && i.status !== "cancelled" && (
                        <Link
                          to="/faktury/nova"
                          search={{ zo_zalohy: i.id } as any}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-primary hover:bg-primary/10"
                        >
                          <FileCheck2 className="h-3.5 w-3.5" /> {t("Faktúra")}
                        </Link>
                      )}
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
                          <span className="inline-flex items-center gap-1 whitespace-nowrap">
                            <ProformaStatus value={s} settled={link} />
                            <IkonaPlatbyZalohy platby={platby} druh="vydana" riadok={i} mena={i.currency} />
                          </span>
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
                              {/* Faktúra zo zálohovej — predvyplnená (pri uhradenej aj s odpočtom zálohy). */}
                              {i.status !== "draft" && i.status !== "cancelled" && (
                                <Link
                                  to="/faktury/nova"
                                  search={{ zo_zalohy: i.id } as any}
                                  title={t("Vystaviť faktúru zo zálohovej")}
                                  aria-label={t("Vystaviť faktúru zo zálohovej")}
                                  className="rounded p-1.5 text-primary hover:bg-primary/10"
                                >
                                  <FileCheck2 className="h-4 w-4" />
                                </Link>
                              )}
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
