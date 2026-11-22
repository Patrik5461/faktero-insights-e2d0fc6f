import { preloz } from "@/lib/i18n/jazyk";
import { obsadzujeZalohu } from "@/lib/faktero/prijaty-danovy-doklad";
import { useT } from "@/lib/i18n/useT";
import { zhodaHladania } from "@/lib/faktero/hladanie-zoznamu";
import { StavOdznak } from "@/components/faktero/web/Stav";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { NahladDokladuOkno, TlacidloNahladu, useNahladOkna } from "@/components/faktero/NahladDokladuOkno";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { TabulkaZoznamu } from "@/components/faktero/TabulkaZoznamu";
import { Landmark, Plus, RotateCcw, Trash2, Undo2, X } from "lucide-react";
import { HromadnyPrikaz } from "@/components/faktero/HromadnyPrikaz";
import { stiahniZipPrijatych } from "@/lib/faktero/zip-prijatych-lista";
import { useServerFn } from "@tanstack/react-start";
import { useExportDoProgramu } from "@/hooks/useExportDoProgramu";
import { exportSPotvrdenim } from "@/lib/faktero/export-potvrdenie";
import { exportPrijatychPohodaFn, vratZPohodyFn } from "@/lib/faktero/vratenie.functions";
import { potvrd } from "@/lib/potvrdenie";
import { toastNeodovzdane } from "@/components/faktero/NeodovzdaneDoklady";
import { VolbyExportuOkno, type VolbyExportu } from "@/components/faktero/VolbyExportuOkno";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/faktero/ListControls";
import { ResponsiveTable, MobileListCard } from "@/components/faktero/ResponsiveTable";
import { KlikatelnyRiadok } from "@/components/faktero/KlikatelnyRiadok";
import { formatujMenu } from "@/lib/faktero/mena";
import { SuctyPoMenach, useFormatMenyFirmy } from "@/components/faktero/SuctyPoMenach";
import { suctyPrijatychZaloh } from "@/lib/faktero/sucty-zoznamov";
import { vsetkyRiadky } from "@/lib/faktero/strankovanie";
import { textChybyZapisu, zapisOverene } from "@/lib/faktero/over-zapis";
import { NahratDoklad } from "@/components/faktero/NahratDoklad";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { DocumentListToolbar } from "@/components/faktero/DocumentListToolbar";
import { useListFilters, zoznamSearch } from "@/hooks/useListFilters";
import { useStrankovanie } from "@/hooks/useStrankovanie";
import { useCiselnikyDokladov } from "@/hooks/useCiselnikyDokladov";
import { HromadnaAkciaDokladov } from "@/components/faktero/HromadnaAkciaDokladov";
import { TlacidloXmlPohody } from "@/components/faktero/TlacidloXmlPohody";
import { potvrdHromadneMazanie } from "@/components/faktero/HromadnyVyber";
import { rozdelNaMazanie } from "@/lib/faktero/hromadny-vyber";
import { usePlatbyZaloh } from "@/hooks/usePlatbyZaloh";
import { IkonaPlatbyZalohy, stavRiadkuZalohy } from "@/components/faktero/PlatbaZalohy";
import {
  filterExportu,
  filterObdobia,
  filterPlatby,
  filterStavu,
  filterUhrady,
  filterVymazanych,
} from "@/lib/faktero/filtre-dokladov";
import { pouziFiltrePrijatych } from "@/lib/faktero/prijate-filtre-zoznamu";
import {
  jeFilterPlatby,
  sediFiltruPlatby,
  zalohaUhradena,
} from "@/lib/faktero/zalohove-platby";

export const Route = createFileRoute("/_authenticated/prijate-zalohove/")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Prijaté zálohové faktúry — Faktero") }] }),
  validateSearch: (s: Record<string, unknown>) => ({ ...zoznamSearch(s) }),
  component: PrijateZalohovePage,
});

type Riadok = {
  id: string;
  invoice_number: string;
  supplier_name: string;
  issue_date: string;
  due_date: string;
  amount_total: number;
  currency: string;
  payment_date: string | null;
  payment_method: string | null;
  status: string;
  deleted_at: string | null;
  exported_at: string | null;
  locked_at?: string | null;
  file_path: string | null;
  supplier_ico?: string | null;
  supplier_dic?: string | null;
  supplier_ic_dph?: string | null;
  supplier_iban: string | null;
  variable_symbol?: string | null;
  specific_symbol?: string | null;
  constant_symbol?: string | null;
  note?: string | null;
  delivery_date?: string | null;
};

/**
 * Zálohové faktúry od dodávateľov.
 *
 * Nie sú daňové doklady: platia sa, ale daň prinesie až ostrá faktúra —
 * preto majú vlastný zoznam a do výkazov k DPH nevstupujú. Keď ostrá faktúra
 * zálohu zúčtuje, ukáže sa to tu ako „zúčtovaná“, aby sa tá istá dodávka
 * nezaplatila dvakrát.
 */
function PrijateZalohovePage() {
  const { t } = useT();
  const [rows, setRows] = useState<Riadok[]>([]);
  const [zuctovane, setZuctovane] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [mazane, setMazane] = useState<Riadok | null>(null);
  // Hľadanie a filtre sú v adrese; zoznam sa načíta celý a filtruje sa tu.
  const lf = useListFilters({ pageSizeKey: "prijate-zalohove" });
  // Vymazané zálohy (deleted_at) — len na požiadanie, s tlačidlom Obnoviť.
  const ajVymazane = lf.zapnute("vymazane");
  // Obdobie, export a úhrada idú do dotazu (strop 1 000 riadkov na požiadavku);
  // stav a platba sa počítajú zo zúčtovania a banky, preto v pamäti.
  const podla = lf.filter("podla") === "splatnost" ? "due_date" : "issue_date";
  const { od: obdobieOd, do: obdobieDo } = lf.rozsah("obdobie");
  const exportFiltra = lf.filter("export");
  const uhradaFiltra = lf.filter("uhrada");
  const { domaca } = useFormatMenyFirmy();

  async function load() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    setLoading(true);
    // Celý zoznam po stránkach — predtým tichý strop 500 riadkov.
    let zoznam: Riadok[];
    try {
      zoznam = await vsetkyRiadky<Riadok>((od, po) => {
        let q = supabase
          .from("purchase_invoices")
          .select(
            // IBAN a symboly kvôli hromadnému príkazu na úhradu, IČO a DUZP do súhrnu v ZIP.
            "id, invoice_number, supplier_name, supplier_ico, supplier_dic, supplier_ic_dph, supplier_iban, variable_symbol, specific_symbol, constant_symbol, note, delivery_date, issue_date, due_date, amount_total, currency, payment_date, payment_method, status, deleted_at, exported_at, locked_at, file_path",
          )
          .eq("company_id", cid)
          .eq("type", "proforma");
        q = ajVymazane ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
        if (obdobieOd) q = q.gte(podla, obdobieOd);
        if (obdobieDo) q = q.lte(podla, obdobieDo);
        if (exportFiltra === "ano") q = q.not("exported_at", "is", null);
        if (exportFiltra === "nie") q = q.is("exported_at", null);
        q = pouziFiltrePrijatych(q, { uhrada: uhradaFiltra });
        return q
          .order("issue_date", { ascending: false })
          .order("id")
          .range(od, po) as any;
      });
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa načítať zálohy."));
      zoznam = [];
    }
    setRows(zoznam);
    setLoading(false);

    const ids = zoznam.map((r) => r.id);
    if (!ids.length) {
      setZuctovane({});
      return;
    }
    const { data: faktury } = await supabase
      .from("purchase_invoices")
      .select("invoice_number, advance_invoice_id, type")
      .eq("company_id", cid)
      .is("deleted_at", null)
      .in("advance_invoice_id", ids);
    const mapa: Record<string, string> = {};
    for (const f of (faktury ?? []) as any[]) {
      // Daňový doklad k platbe zálohu nezúčtováva — zúčtuje ju až vyúčtovacia faktúra.
      if (f.advance_invoice_id && obsadzujeZalohu(f)) mapa[f.advance_invoice_id] = f.invoice_number;
    }
    setZuctovane(mapa);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ajVymazane, podla, obdobieOd, obdobieDo, exportFiltra, uhradaFiltra]);

  /*
    Platby z banky: odchádzajúca platba podľa VS / účtu dodávateľa a sumy —
    návrhy z párovania prijatých faktúr (len zálohové), potvrdenie jedným
    klikom ako pri prijatých faktúrach.
  */
  const idsRiadkov = useMemo(() => rows.map((r) => r.id), [rows]);
  const platby = usePlatbyZaloh("prijata", getActiveCompanyId(), idsRiadkov, () => load());
  // Jednotné voľby (sparovana/navrh/nenajdena); staré odkazy majú uhradene/bez.
  const lfPlatbaRaw = lf.filter("platba");
  const lfPlatba =
    lfPlatbaRaw === "sparovana" ? "uhradene" : lfPlatbaRaw === "nenajdena" ? "bez" : lfPlatbaRaw;
  const platbaFilter = jeFilterPlatby(lfPlatba) ? lfPlatba : "";

  const hladane = lf.q.trim();
  const stav = lf.filter("stav");
  const zobrazene = useMemo(
    () =>
      rows.filter((r) => {
        if (
          hladane &&
          // Číslo/VS, dodávateľ bez diakritiky, IČO/DIČ/IČ DPH, IBAN aj suma (Patrik 22. 11.).
          !zhodaHladania(hladane, {
            nazvy: [r.supplier_name],
            cisla: [r.invoice_number, r.variable_symbol],
            identifikatory: [r.supplier_ico, r.supplier_dic, r.supplier_ic_dph, r.supplier_iban],
            sumy: [r.amount_total],
          })
        )
          return false;
        // Stav rovnako ako odznak StavZalohy: zúčtovaná > zaplatená > čaká.
        const s = zuctovane[r.id] ? "zuctovana" : r.payment_date ? "zaplatena" : "caka";
        if (stav && s !== stav) return false;
        if (
          platbaFilter &&
          !sediFiltruPlatby(platbaFilter, zalohaUhradena(r, "prijata"), stavRiadkuZalohy(platby, "prijata", r))
        )
          return false;
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, zuctovane, hladane, stav, platbaFilter, platby.uhrady, platby.podlaDokladu],
  );

  // Kreslí sa len jedna strana; súčty, výber a export pracujú so všetkými zobrazenými.
  const strankovanie = useStrankovanie(zobrazene, lf);

  // Po menách — CZK ani USD sa k eurám nepripočítajú (AB-09); storno a
  // zúčtované zálohy nie sú dlh (AB-10).
  const sucty = useMemo(
    () => suctyPrijatychZaloh(zobrazene, zuctovane, domaca),
    [zobrazene, zuctovane, domaca],
  );

  /*
    Zálohové faktúry do Pohody (agenda Prijaté zálohové faktúry): neúčtujú
    sa, ale Pohoda ich potrebuje kvôli úhrade a odpočtu zálohy na ostrej
    faktúre. Ide to, čo je práve zobrazené (filtre, obdobie).
  */
  const exportujXml = useServerFn(exportPrijatychPohodaFn);
  const [volbyExportu, setVolbyExportu] = useState(false);
  // Len pre Pohodu — iné programy zálohové faktúry neevidujú (Omega/Money si ich zadajú ručne).
  const program = useExportDoProgramu();
  const exportovatelne = zobrazene.filter((r) => !r.deleted_at && r.status !== "draft" && r.status !== "cancelled");
  /*
    Výber riadkov: keď je niečo začiarknuté, do Pohody idú len vybrané
    zálohové faktúry; bez výberu všetky zobrazené (filtre, obdobie).
  */
  const [vybrane, setVybrane] = useState<Set<string>>(new Set());
  const prepniVyber = (id: string, zapnut: boolean) =>
    setVybrane((pred) => {
      const n = new Set(pred);
      if (zapnut) n.add(id);
      else n.delete(id);
      return n;
    });
  const vybraneExport = exportovatelne.filter((r) => vybrane.has(r.id));
  const naExport = vybraneExport.length ? vybraneExport : exportovatelne;
  // „Označiť všetko" = všetky zobrazené podľa filtra (zoznam je načítaný celý, bez stránkovania).
  const vybraneRiadky = zobrazene.filter((r) => vybrane.has(r.id));
  const vsetkyVybrane = zobrazene.length > 0 && zobrazene.every((r) => vybrane.has(r.id));
  async function exportujSVolbami(v: VolbyExportu) {
    const cid = getActiveCompanyId();
    if (!cid || !naExport.length) return;
    try {
      const r = await exportSPotvrdenim(
        (potvrdene) =>
          exportujXml({
            data: {
              company_id: cid,
              ids: naExport.map((x) => x.id),
              oznacit: v.oznacit,
              datum_zauctovania: v.datumZauctovania,
              aj_odovzdane: v.ajOdovzdane,
              radenie: v.radenie,
              potvrdene_varovania: potvrdene,
            },
          }),
        t,
      );
      if (!r) return;
      for (const f of r.subory) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([f.xml], { type: "text/xml;charset=utf-8" }));
        a.download = f.fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }
      toastNeodovzdane(t, r.preskocene);
      setVybrane(new Set());
      if (!r.preskocene.length)
        toast.success(
          t("XML pre Pohodu: {n} zálohových faktúr", { n: r.pocet }) +
            (v.oznacit ? t(", označené ako odovzdané") : ""),
        );
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa"));
    }
  }

  /*
    Vrátenie z Pohody: odovzdaná zálohová faktúra je zamknutá; po vrátení sa
    dá opraviť a poslať znova. V Pohode ostane, kým ju tam niekto nezmaže.
  */
  const vratZPohody = useServerFn(vratZPohodyFn);
  const vybraneOdovzdane = zobrazene.filter((r) => vybrane.has(r.id) && r.exported_at);
  const titulXmlZaloh = t(
    "Vybrané (alebo bez výberu všetky zobrazené) zálohové faktúry do Pohody (Prijaté zálohové faktúry) — bez DPH a bez zaúčtovania, kvôli úhrade a odpočtu zálohy",
  );
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
    try {
      const r = await vratZPohody({
        data: { company_id: cid, druh: "prijata", ids: vybraneOdovzdane.map((x) => x.id) },
      });
      toast.success(t("Vrátené z Pohody: {n}", { n: r.vratenych }));
      setVybrane(new Set());
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa"));
    }
  }

  /* Hromadné akcie — tá istá lišta ako pri prijatých faktúrach. */
  const [prikaz, setPrikaz] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);
  async function stiahniZip() {
    if (!vybraneRiadky.length || zipBusy) return;
    setZipBusy(true);
    try {
      const { ok, fail } = await stiahniZipPrijatych(vybraneRiadky, t, "prijate-zalohove");
      if (fail === 0) toast.success(t("ZIP stiahnutý — faktúr: {n}", { n: ok }));
      else
        toast.warning(t("ZIP: {ok} v poriadku, {chyba} bez prílohy alebo chyba", { ok, chyba: fail }));
      setVybrane(new Set());
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa"));
    } finally {
      setZipBusy(false);
    }
  }
  const cis = useCiselnikyDokladov(getActiveCompanyId(), "prijata", false);
  async function zmazatOznacene() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    const m = rozdelNaMazanie(vybraneRiadky, cis.zamknuteDo);
    if (!(await potvrdHromadneMazanie(t, m, t("Presunúť {n} zálohových faktúr do koša?", { n: m.ids.length })))) return;
    const { error } = await supabase
      .from("purchase_invoices")
      .update({ deleted_at: new Date().toISOString() })
      .eq("company_id", cid)
      .in("id", m.ids);
    if (error) return toast.error(error.message);
    toast.success(t("Vymazané zálohové faktúry: {n}", { n: m.ids.length }));
    setVybrane(new Set());
    await load();
  }

  async function zmaz() {
    if (!mazane) return;
    try {
      await zapisOverene(
        supabase
          .from("purchase_invoices")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", mazane.id)
          .select("id"),
      );
    } catch (e) {
      return toast.error(textChybyZapisu(e, t));
    }
    toast.success(t("Zálohová faktúra vymazaná. Nájdete ju cez filter „Zobraziť vymazané“."));
    setMazane(null);
    await load();
  }

  async function obnov(r: Riadok) {
    try {
      await zapisOverene(
        supabase.from("purchase_invoices").update({ deleted_at: null }).eq("id", r.id).select("id"),
      );
    } catch (e) {
      return toast.error(textChybyZapisu(e, t));
    }
    toast.success(t("Obnovené"));
    await load();
  }

  // Náhľad v okne so šípkami (C1-3).
  const okno = useNahladOkna();
  const navigate = useNavigate();
  const akciaRiadku = (r: Riadok, mobil: boolean) =>
    ajVymazane ? (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void obnov(r);
        }}
        className={
          mobil
            ? "inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-primary hover:bg-primary/10"
            : "rounded p-1.5 text-primary hover:bg-primary/10"
        }
        title={t("Obnoviť")}
        aria-label={t("Obnoviť")}
      >
        <RotateCcw className={mobil ? "h-3.5 w-3.5" : "h-4 w-4"} />
        {mobil ? t("Obnoviť") : null}
      </button>
    ) : (
      <span className="inline-flex items-center gap-1">
      {r.file_path && <TlacidloNahladu popis={r.invoice_number} onClick={() => okno.otvor(r.id)} />}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setMazane(r);
        }}
        className={
          mobil
            ? "inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
            : "rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        }
        title={t("Vymazať")}
        aria-label={t("Vymazať")}
      >
        <Trash2 className={mobil ? "h-3.5 w-3.5" : "h-4 w-4"} />
        {mobil ? t("Vymazať") : null}
      </button>
      </span>
    );

  return (
    <>
      <NahladDokladuOkno
        okno={okno}
        idcka={zobrazene.filter((r) => r.file_path).map((r) => r.id)}
        nacitaj={async (id) => {
          const r = rows.find((x) => x.id === id);
          if (!r?.file_path) return null;
          const { data } = await supabase.storage.from("purchase-invoices").createSignedUrl(r.file_path, 600);
          if (!data?.signedUrl) return null;
          return { url: data.signedUrl, obrazok: /\.(jpe?g|png|webp|gif|heic)$/i.test(r.file_path) };
        }}
        nazov={(id) => rows.find((r) => r.id === id)?.invoice_number}
        poznamka={(id) => rows.find((r) => r.id === id)?.supplier_name}
        onOtvorit={(id) => navigate({ to: "/prijate-faktury/$id", params: { id } })}
      />
      {volbyExportu ? (
        <VolbyExportuOkno
          pocet={naExport.length}
          nazov={t("Prijaté zálohové faktúry do Pohody (XML)")}
          onClose={() => setVolbyExportu(false)}
          onExport={exportujSVolbami}
        />
      ) : null}
      <PageHeader
        title={t("Prijaté zálohové faktúry")}
        description={t("Zálohy, ktoré vám vystavili dodávatelia. Platia sa, daň prinesie až ostrá faktúra.")}
        action={
          <div className="flex flex-wrap gap-2">
            {/* Bez označenia celý filter; po označení je XML prvé v lište nižšie. */}
            {!ajVymazane && !program.inyProgram && !vybraneRiadky.length && naExport.length ? (
              <TlacidloXmlPohody pocet={0} onClick={() => setVolbyExportu(true)} title={titulXmlZaloh} />
            ) : null}
            <NahratDoklad druh="proforma" label={t("Nahrať zálohovú faktúru")} />
            <Link
              to="/prijate-faktury/nova"
              search={{ typ: "proforma" } as never}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> {t("Nová prijatá zálohová faktúra")}
            </Link>
          </div>
        }
      />
      <PageBody>
        <div className="grid gap-4 sm:grid-cols-3">
          <Statistika label={t("Počet záloh")} hodnota={String(zobrazene.length)} />
          <Statistika label={t("Celková suma")} hodnota={<SuctyPoMenach sucty={sucty.spolu} />} />
          <Statistika label={t("Nezaplatené")} hodnota={<SuctyPoMenach sucty={sucty.nezaplatene} />} />
        </div>

        <div className="mt-6">
          <DocumentListToolbar
            lf={lf}
            searchPlaceholder={t("Číslo, dodávateľ, IČO, suma…")}
            filters={[
              filterStavu([
                { value: "caka", label: "Čaká na úhradu" },
                { value: "zaplatena", label: "Zaplatená" },
                { value: "zuctovana", label: "Zúčtovaná" },
              ]),
              filterObdobia(["vystavenie", "splatnost"]),
              // Zálohy sa neúčtujú (Pohoda ich eviduje len kvôli úhrade) — bez Zaúčtovania.
              filterExportu(),
              filterPlatby("platba"),
              filterUhrady(),
              filterVymazanych(),
            ]}
          />
          {vybraneRiadky.length > 0 && !ajVymazane && getActiveCompanyId() ? (
            <div
              role="region"
              aria-label={t("Hromadné akcie")}
              className="sticky top-16 z-20 mb-2 flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-card/95 px-3 py-2 text-sm shadow-sm backdrop-blur"
            >
              <span className="mr-1 font-semibold">
                {t("Vybrané: {n}", { n: vybraneRiadky.length })}
              </span>
              <HromadnaAkciaDokladov
                companyId={getActiveCompanyId()!}
                agenda="prijata"
                ids={vybraneRiadky.map((r) => r.id)}
                onHotovo={() => void load()}
                pdfZip={() => void stiahniZip()}
                pdfZipNazov={t("Stiahnuť ZIP (PDF + CSV)")}
                xmlPohoda={!program.inyProgram && vybraneExport.length ? () => setVolbyExportu(true) : undefined}
                zmazat={() => void zmazatOznacene()}
              />
              {/*
                Akcie zálohových: len príkaz na úhradu. Zaúčtovať ani Navrhnúť AI
                tu nie sú — záloha nie je daňový doklad a do Pohody ide bez
                zaúčtovania (účtuje sa až ostrá faktúra).
              */}
              <button
                type="button"
                onClick={() => setPrikaz(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary"
              >
                <Landmark className="h-3.5 w-3.5" /> {t("Hromadný príkaz na úhradu")}
              </button>
              {vybraneOdovzdane.length ? (
                <button
                  type="button"
                  onClick={() => void vratitVybrane()}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary"
                >
                  <Undo2 className="h-3.5 w-3.5" />{" "}
                  {t("Vrátiť z Pohody ({n})", { n: vybraneOdovzdane.length })}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setVybrane(new Set())}
                className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" /> {t("Zrušiť výber")}
              </button>
            </div>
          ) : null}
          {loading ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              {t("Načítavam…")}
            </div>
          ) : rows.length === 0 && ajVymazane ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              {t("Žiadna vymazaná zálohová faktúra.")}
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-10 text-center">
              <div className="font-medium">{t("Zatiaľ žiadna prijatá záloha")}</div>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("Zálohovú faktúru od dodávateľa zaevidujete rovnako ako bežnú — pri druhu dokladu vyberiete „Prijatá zálohová faktúra“.")}
              </p>
            </div>
          ) : zobrazene.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              {t("Nič sa nenašlo.")}
            </div>
          ) : (
            <ResponsiveTable
              items={strankovanie.viditelne}
              loading={loading}
              emptyText={t("Zatiaľ žiadna prijatá záloha.")}
              desktop={
                <TabulkaZoznamu>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="whitespace-nowrap border-b border-border text-left text-xs font-semibold text-muted-foreground">
                        {!ajVymazane ? (
                          <th className="w-8 p-3">
                            <input
                              type="checkbox"
                              aria-label={t("Vybrať všetky")}
                              checked={vsetkyVybrane}
                              onChange={(e) =>
                                setVybrane(e.target.checked ? new Set(zobrazene.map((r) => r.id)) : new Set())
                              }
                              className="h-4 w-4 accent-primary"
                            />
                          </th>
                        ) : null}
                        <th className="p-3">{t("Číslo")}</th>
                        <th className="p-3">{t("Dodávateľ")}</th>
                        <th className="p-3">{t("Vystavená")}</th>
                        <th className="p-3">{t("Splatnosť")}</th>
                        <th className="p-3 text-right">{t("Suma")}</th>
                        <th className="p-3">{t("Stav")}</th>
                        <th className="p-3"><span className="sr-only">{t("Akcie")}</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {strankovanie.viditelne.map((r) => (
                        <KlikatelnyRiadok
                          key={r.id}
                          ciel={{ to: "/prijate-faktury/$id", params: { id: r.id } }}
                          className="border-b border-border/60"
                        >
                          {!ajVymazane ? (
                            <td className="w-8 p-3">
                              <input
                                type="checkbox"
                                aria-label={t("Vybrať riadok")}
                                checked={vybrane.has(r.id)}
                                onChange={(e) => prepniVyber(r.id, e.target.checked)}
                                className="h-4 w-4 accent-primary"
                              />
                            </td>
                          ) : null}
                          <td className="cislo-dokladu whitespace-nowrap p-3 font-medium">
                            <Link
                              to="/prijate-faktury/$id"
                              params={{ id: r.id }}
                              className="text-inherit no-underline"
                            >
                              {r.invoice_number}
                            </Link>
                            {r.exported_at ? (
                              <StavOdznak ton="uspech" maly className="ml-2 align-middle">
                                {t("V Pohode")}
                              </StavOdznak>
                            ) : null}
                          </td>
                          <td className="p-3">
                            <span
                              className="block max-w-[14rem] truncate 2xl:max-w-[22rem]"
                              title={r.supplier_name ?? undefined}
                            >
                              {r.supplier_name}
                            </span>
                          </td>
                          <td className="whitespace-nowrap p-3">{datumNaDoklade(r.issue_date)}</td>
                          <td className="whitespace-nowrap p-3">{datumNaDoklade(r.due_date)}</td>
                          <td className="whitespace-nowrap p-3 text-right">
                            <span className="suma">{formatujMenu(r.amount_total, r.currency)}</span>
                          </td>
                          <td className="p-3">
                            <span className="inline-flex items-center gap-1 whitespace-nowrap">
                              <StavZalohy riadok={r} zuctovanaNa={zuctovane[r.id]} />
                              <IkonaPlatbyZalohy platby={platby} druh="prijata" riadok={r} mena={r.currency} />
                            </span>
                          </td>
                          <td className="p-3 text-right">{akciaRiadku(r, false)}</td>
                        </KlikatelnyRiadok>
                      ))}
                    </tbody>
                  </table>
                </TabulkaZoznamu>
              }
              mobileCard={(r: Riadok) => (
                <MobileListCard
                  key={r.id}
                  ciel={{ to: "/prijate-faktury/$id", params: { id: r.id } }}
                  {...(!ajVymazane
                    ? {
                        vybrane: vybrane.has(r.id),
                        onVyber: (z: boolean) => prepniVyber(r.id, z),
                        vyberPopis: t("Vybrať riadok"),
                      }
                    : {})}
                  title={r.invoice_number}
                  subtitle={r.supplier_name}
                  amount={formatujMenu(r.amount_total, r.currency)}
                  status={
                    <span className="inline-flex flex-wrap items-center gap-1">
                      <StavZalohy riadok={r} zuctovanaNa={zuctovane[r.id]} />
                      <IkonaPlatbyZalohy platby={platby} druh="prijata" riadok={r} mena={r.currency} />
                    </span>
                  }
                  meta={t("splatná {datum}", { datum: datumNaDoklade(r.due_date) })}
                  actions={akciaRiadku(r, true)}
                />
              )}
            />
          )}
          {!loading && zobrazene.length > 0 ? strankovanie.stranky() : null}
        </div>

        {prikaz && getActiveCompanyId() ? (
          <HromadnyPrikaz
            companyId={getActiveCompanyId()!}
            faktury={vybraneRiadky}
            onClose={() => setPrikaz(false)}
          />
        ) : null}
        <ConfirmDialog
          open={!!mazane}
          title={t("Vymazať zálohovú faktúru?")}
          message={
            mazane
              ? t("{cislo} od {dodavatel} sa skryje zo zoznamu.", {
                  cislo: mazane.invoice_number,
                  dodavatel: mazane.supplier_name,
                })
              : ""
          }
          confirmLabel={t("Vymazať")}
          onConfirm={zmaz}
          onCancel={() => setMazane(null)}
        />
      </PageBody>
    </>
  );
}

function StavZalohy({ riadok, zuctovanaNa }: { riadok: Riadok; zuctovanaNa?: string }) {
  const { t } = useT();
  if (zuctovanaNa) {
    return (
      <StavOdznak ton="uspech">{t("Zúčtovaná — {cislo}", { cislo: zuctovanaNa })}</StavOdznak>
    );
  }
  if (riadok.payment_date) {
    return (
      <StavOdznak ton="informacia">{t("Zaplatená")}</StavOdznak>
    );
  }
  return (
    <StavOdznak ton="pozor">{t("Čaká na úhradu")}</StavOdznak>
  );
}

function Statistika({ label, hodnota }: { label: string; hodnota: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div className="suma mt-1 text-xl font-semibold">{hodnota}</div>
    </div>
  );
}
