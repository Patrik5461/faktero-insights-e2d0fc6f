import { preloz } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { OdovzdaneIkona } from "@/components/faktero/OdovzdaneIkona";
import { VyuctovanieZVyberu } from "@/components/faktero/VyuctovanieZVyberu";
import { UpozornenieNespracovane } from "@/components/faktero/UpozornenieNespracovane";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { PrijemMailom } from "@/components/faktero/PrijemMailom";
import { NastaveniaZoznamu } from "@/components/faktero/NastaveniaZoznamu";
import { useNastaveniaZoznamu } from "@/hooks/useNastaveniaZoznamu";
import { usePostupneZobrazenie } from "@/hooks/usePostupneZobrazenie";
import { useRadenie } from "@/hooks/useRadenie";
import { stiahniExcel, tabulka } from "@/lib/faktero/excel-zoznamu";
import { useExportDoProgramu } from "@/hooks/useExportDoProgramu";
import type { StlpecZoznamu } from "@/lib/faktero/nastavenia-zoznamov";
import {
  Plus,
  FileText,
  Archive,
  Loader2,
  Check,
  Trash2,
  Mail,
  ScanLine,
  FileCode,
  User,
  Landmark,
  Lock,
  X,
  Upload,
  BookCheck,
  Download,
  Sparkles,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { menaClenovFirmy } from "@/lib/faktero/invitations.functions";
import { usePoslednyOtvoreny } from "@/hooks/usePoslednyOtvoreny";
import { spracovanieDokladu, menoSpracovatela } from "@/lib/faktero/spracoval";
import { lokalJazyka } from "@/lib/i18n/jazyk";
import {
  navrhniParovaniePrijatych,
  potvrdParovaniePrijatej,
  uhradyPrijatych,
  zrusParovaniePrijatej,
} from "@/lib/faktero/prijata-parovanie.functions";
import { ConfirmDialog } from "@/components/faktero/ListControls";
import { toast } from "sonner";
import { formatovacMeny, formatujMenu } from "@/lib/faktero/mena";
import { NahratDoklad } from "@/components/faktero/NahratDoklad";
import { HromadnyPrikaz } from "@/components/faktero/HromadnyPrikaz";
import { SuctovaListaVyberu } from "@/components/faktero/SuctovaListaVyberu";
import { polozkaPrijatej } from "@/lib/faktero/suhrn-vyberu";
import { ZAPLATENE_NA_MIESTE } from "@/lib/faktero/hromadny-prikaz";
import { NavrhyAiOkno } from "@/components/faktero/NavrhyAiOkno";
import { jeCiastocneUhradena, sumyUhradPodlaFaktury } from "@/lib/faktero/uhrady-prijatej";
import { riadkyPreIds, vsetkyRiadky } from "@/lib/faktero/strankovanie";
import { duplicityVZozname } from "@/lib/faktero/prijate-duplicity";
import { PoliaZauctovania, type Navrhy } from "@/components/faktero/ZauctovaniePanel";
import { navrhyKodovFn, zauctujPrijateFn } from "@/lib/faktero/zauctovanie.functions";
import { exportPrijatychPohodaFn } from "@/lib/faktero/vratenie.functions";
import { toastNeodovzdane } from "@/components/faktero/NeodovzdaneDoklady";
import { VolbyExportuOkno, type VolbyExportu } from "@/components/faktero/VolbyExportuOkno";
import { useStavSchvalovania, farbaOdznaku } from "@/hooks/useStavSchvalovania";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { NAZVY_STAVOV, stavSamofaktury, zapocitatelna } from "@/lib/faktero/samofakturacia";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { SNahladom, useBocnyNahlad, useSipkyNahladu } from "@/components/faktero/BocnyNahlad";
import { filtrujObdobie, datumDodania, type DatumObdobia } from "@/lib/faktero/obdobie-filter";
import { DocumentListToolbar, HlavickaViac } from "@/components/faktero/DocumentListToolbar";
import { useListFilters, zoznamSearch } from "@/hooks/useListFilters";
import { HromadnaAkciaDokladov } from "@/components/faktero/HromadnaAkciaDokladov";
import { VyberVRiadku, moznostiKodov } from "@/components/faktero/VyberVRiadku";
import { StavDokladuOdznak, VyberStavuDokladu } from "@/components/faktero/StavDokladu";
import { useCiselnikyDokladov, filtreStavuAStitkov } from "@/hooks/useCiselnikyDokladov";
import { dovodZamku, NAZOV_ZAMKU, platbaPreZoradenie } from "@/lib/faktero/doklady-hromadne";
import { zoradPodlaDokladu } from "@/lib/faktero/predkontacie";

export const Route = createFileRoute("/_authenticated/prijate-faktury/")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Prijaté faktúry — Faktero") }] }),
  validateSearch: (s: Record<string, unknown>) => ({ ...zoznamSearch(s) }),
  component: PurchaseInvoicesPage,
});

const STATUS_LABEL: Record<string, string> = {
  draft: "Koncept",
  received: "Prijaté",
  booked: "Zaúčtované",
  paid: "Zaplatené",
  cancelled: "Stornované",
};
/** Filter navyše — nie je to hodnota `status`, počíta sa z `purchase_invoice_payments`. */
const CIASTOCNE = "ciastocne";

function StatusBadge({ status }: { status: string }) {
  const { t } = useT();
  const map: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    received: "bg-amber-100 text-amber-800",
    booked: "bg-sky-100 text-sky-800",
    paid: "bg-emerald-100 text-emerald-800",
    cancelled: "bg-rose-100 text-rose-800",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${map[status] ?? map.draft}`}
    >
      {t(STATUS_LABEL[status] ?? status)}
    </span>
  );
}

function fmtMoney(n: number, c = "EUR") {
  return formatovacMeny(c, "sk-SK")(n);
}

/** Prvý a posledný deň mesiaca `RRRR-MM` — uložené filtre z čias výberu mesiaca. */
function hraniceMesiaca(mesiac: string): { od: string; do: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(mesiac);
  if (!m) return null;
  const y = Number(m[1]);
  const mm = Number(m[2]);
  const posledny = new Date(y, mm, 0).getDate();
  return { od: `${m[1]}-${m[2]}-01`, do: `${m[1]}-${m[2]}-${String(posledny).padStart(2, "0")}` };
}

/** Súčet súm s DPH po menách — meny sa nesčítavajú. */
function sumyPodlaMeny(riadky: any[]): string {
  const po = new Map<string, number>();
  for (const r of riadky) {
    const m = String(r.currency ?? "EUR");
    po.set(m, (po.get(m) ?? 0) + Number(r.amount_total ?? 0));
  }
  return [...po.entries()].map(([m, v]) => fmtMoney(Math.round(v * 100) / 100, m)).join(" + ");
}

/** Stĺpce zoznamu na výber. */
const STLPCE_PRIJATYCH: StlpecZoznamu[] = [
  { kluc: "cislo", nazov: "Číslo", povinny: true },
  { kluc: "dodavatel", nazov: "Dodávateľ", povinny: true },
  { kluc: "ico", nazov: "IČO dodávateľa", predvoleny: false },
  { kluc: "vs", nazov: "VS" },
  { kluc: "vystavena", nazov: "Vystavená" },
  { kluc: "duzp", nazov: "Dátum dodania (DUZP)" },
  { kluc: "splatnost", nazov: "Splatnosť" },
  { kluc: "zaklad", nazov: "Základ", predvoleny: false },
  { kluc: "dph", nazov: "DPH", predvoleny: false },
  { kluc: "suma", nazov: "Suma" },
  { kluc: "predkontacia", nazov: "Účtovná položka" },
  { kluc: "stavDokladu", nazov: "Stav dokladu" },
  { kluc: "zapisal", nazov: "Zapísal" },
  { kluc: "spracoval", nazov: "Spracoval" },
  { kluc: "stav", nazov: "Stav" },
];

function PurchaseInvoicesPage() {
  const { t, jazyk } = useT();
  const navigate = useNavigate();
  // Naposledy otvorená faktúra — zvýraznený riadok po návrate z detailu.
  const posledny = usePoslednyOtvoreny("prijate-faktury");
  const [rows, setRows] = useState<any[]>([]);
  // Súčet úhrad (aj čiastočných) po faktúrach — pre stav „Čiastočne uhradená“.
  const [uhradene, setUhradene] = useState<Record<string, number>>({});
  // Tá istá faktúra v zozname dvakrát (prišla mailom znova) — označí sa pri čísle.
  const duplicity = useMemo(() => duplicityVZozname(rows), [rows]);
  const sch = useStavSchvalovania(
    getActiveCompanyId(),
    "prijata",
    rows.map((r: any) => r.id),
  );
  const [loading, setLoading] = useState(true);
  // Filtre sú v adrese; hľadanie toolbaru je hľadanie podľa dodávateľa.
  const lf = useListFilters({ pageSizeKey: "prijate-faktury" });
  const status = lf.filter("stav");
  const supplier = lf.q;
  // Obdobie podľa dátumu prijatia, vystavenia, dodania alebo splatnosti — faktúra
  // vystavená 1. 10. s dodaním 30. 9. patrí do DPH za september.
  const podla = (lf.filter("podla") || "prijatie") as DatumObdobia;
  const { od: obdobieOd, do: obdobieDo } = lf.rozsah("obdobie");
  const exportovane = lf.filter("export") as "" | "ano" | "nie";
  const stavFiltra = lf.filter("stavDokladu");
  const stitokFiltra = lf.filter("stitok");
  const zobrazenie = useNastaveniaZoznamu("prijate-faktury", STLPCE_PRIJATYCH);
  const je = zobrazenie.je;
  // Číselník predkontácií raz (keď je stĺpec zapnutý), stavy, štítky a uzávierka vždy.
  const cis = useCiselnikyDokladov(getActiveCompanyId(), "prijata", je("predkontacia"));
  const stavPodlaId = useMemo(() => new Map(cis.stavy.map((s) => [s.id, s])), [cis.stavy]);
  /* Prázdne stĺpce zaberali šírku a stĺpec Stav na konci tabuľky sa už
     nezmestil — „Stav dokladu“ len keď má firma stavy, „Spracoval“ len keď
     ho má aspoň jedna faktúra v zozname. */
  const stlpecStavDokladu = je("stavDokladu") && cis.stavy.length > 0;
  const stlpecSpracoval = je("spracoval") && rows.some((r: any) => spracovanieDokladu(r, "prijata"));
  /* Zoznam predkontácií pre výber v riadku — zoradenie celého číselníka pre
     každý z päťsto riadkov pri každom prekreslení bolo zbytočné, líši sa len
     podľa spôsobu platby. */
  const moznostiPredkontacie = useMemo(() => {
    const pamat = new Map<string, ReturnType<typeof moznostiKodov>>();
    return (platba: ReturnType<typeof platbaPreZoradenie>) => {
      const k = String(platba);
      let m = pamat.get(k);
      if (!m) {
        m = moznostiKodov(
          zoradPodlaDokladu(cis.navrhy?.predkontacie ?? [], { typ: "faktura", platba }),
        );
        pamat.set(k, m);
      }
      return m;
    };
  }, [cis.navrhy]);
  const pocetStlpcov = zobrazenie.viditelne.length + 1;
  const rad = useRadenie(rows, {
    cislo: (r: any) => r.invoice_number,
    dodavatel: (r: any) => r.supplier_name,
    ico: (r: any) => r.supplier_ico,
    vs: (r: any) => r.variable_symbol,
    vystavena: (r: any) => r.issue_date,
    duzp: (r: any) => r.delivery_date,
    splatnost: (r: any) => r.due_date,
    zaklad: (r: any) => Number(r.amount_without_vat ?? 0),
    dph: (r: any) => Number(r.vat_amount ?? 0),
    suma: (r: any) => Number(r.amount_total ?? 0),
    predkontacia: (r: any) => r.pohoda_predkontacia,
    stav: (r: any) => r.status,
  });
  // Stovky riadkov naraz zablokovali prehliadač — kreslí sa po dávkach.
  const postupne = usePostupneZobrazenie(rad.zoradene, {
    reset: [status, obdobieOd, obdobieDo, supplier, podla, exportovane, stavFiltra, stitokFiltra],
    potrebneId: posledny.id,
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Náhľad vedľa zoznamu — pri účtovaní netreba otvárať každú faktúru zvlášť.
  const bocny = useBocnyNahlad("prijate-faktury");
  useSipkyNahladu(
    bocny.zapnuty,
    rad.zoradene.map((r: any) => r.id),
    bocny.vybrany,
    bocny.setVybrany,
  );
  // Súčty do pätičky zoznamu — vybrané a tie, čo čakajú na odovzdanie.
  const vybrane = rad.zoradene.filter((r: any) => selected.has(r.id));
  const naExport = rad.zoradene.filter(
    (r: any) => !r.exported_at && r.status !== "cancelled" && r.status !== "draft",
  );
  // Lišta výberu: súčty po menách, zálohová mimo súčtu, dobropis záporne.
  const vybraneSuhrn = vybrane.map((r: any) =>
    polozkaPrijatej(r, { zapocitatelna: zapocitatelna(r), zaplateneNaMieste: ZAPLATENE_NA_MIESTE }),
  );
  const naUhraduPocet = vybraneSuhrn.filter((p) => p.naUhradu).length;
  const [zipBusy, setZipBusy] = useState(false);
  const [hromadneBusy, setHromadneBusy] = useState(false);
  const [mazanie, setMazanie] = useState(false);
  const [prikaz, setPrikaz] = useState(false);
  const [navrhyAi, setNavrhyAi] = useState(false);
  /** Meno k `created_by`; profily číta server, RLS pustí každého len k sebe. */
  const [mena, setMena] = useState<Record<string, string>>({});
  const nacitajMena = useServerFn(menaClenovFirmy);

  /* Väzba na banku: ktorý pohyb faktúru uhradil a čo sa ešte ponúka spárovať. */
  type Uhrada = { datum: string; transactionId: string; suma: number; protistrana: string | null };
  const [uhrady, setUhrady] = useState<Record<string, Uhrada>>({});
  const [navrhy, setNavrhy] = useState<any[]>([]);
  const [parujem, setParujem] = useState<string | null>(null);
  const navrhyFn = useServerFn(navrhniParovaniePrijatych);
  const sparujFn = useServerFn(potvrdParovaniePrijatej);
  const rozparujFn = useServerFn(zrusParovaniePrijatej);
  const uhradyFn = useServerFn(uhradyPrijatych);

  async function nacitajNavrhy() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    try {
      const r: any = await navrhyFn({ data: { company_id: cid } });
      setNavrhy(r?.zhody ?? []);
    } catch {
      // Návrhy sú pomoc navyše — keď sa nenačítajú, zoznam funguje ďalej.
      setNavrhy([]);
    }
  }

  async function sparuj(z: any) {
    setParujem(z.transactionId);
    try {
      await sparujFn({
        data: { transaction_id: z.transactionId, purchase_invoice_id: z.purchaseInvoiceId },
      });
      toast.success(t("Spárované, faktúra je zaplatená."));
      setNavrhy((n) => n.filter((i) => i.transactionId !== z.transactionId));
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? t("Spárovať sa to nepodarilo."));
    } finally {
      setParujem(null);
    }
  }

  async function rozparuj(transactionId: string) {
    try {
      await rozparujFn({ data: { transaction_id: transactionId } });
      toast.success(t("Väzba zrušená."));
      await load();
      await nacitajNavrhy();
    } catch (e: any) {
      toast.error(e?.message ?? t("Zrušiť sa to nepodarilo."));
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  }

  async function csvSummary(items: any[]) {
    const header = [
      t("Číslo"),
      t("Dodávateľ"),
      t("IČO"),
      t("Vystavená"),
      t("Dodanie (DUZP)"),
      t("Splatnosť"),
      t("Suma"),
      t("Mena"),
      t("Stav"),
      t("VS"),
    ];
    const rowsCsv = items.map((r) =>
      [
        r.invoice_number,
        r.supplier_name,
        r.supplier_ico ?? "",
        r.issue_date,
        r.delivery_date || r.issue_date,
        r.due_date,
        Number(r.amount_total ?? 0).toFixed(2),
        r.currency ?? "EUR",
        r.status,
        r.variable_symbol ?? "",
      ]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(";"),
    );
    return "\uFEFF" + [header.join(";"), ...rowsCsv].join("\n");
  }

  async function runBulkZip() {
    const items = rows.filter((r) => selected.has(r.id));
    if (!items.length) return;
    setZipBusy(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      let ok = 0,
        fail = 0;
      for (const r of items) {
        if (!r.file_path) {
          fail++;
          continue;
        }
        try {
          const { data } = await supabase.storage
            .from("purchase-invoices")
            .createSignedUrl(r.file_path, 300);
          if (!data?.signedUrl) {
            fail++;
            continue;
          }
          const resp = await fetch(data.signedUrl);
          if (!resp.ok) {
            fail++;
            continue;
          }
          const bytes = new Uint8Array(await resp.arrayBuffer());
          const ext = r.file_path.split(".").pop() || "pdf";
          const safe = String(r.invoice_number ?? r.id).replace(/[^\w.-]+/g, "_");
          zip.file(`${safe}.${ext}`, bytes);
          ok++;
        } catch {
          fail++;
        }
      }
      zip.file("_suhrn.csv", await csvSummary(items));
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `prijate-faktury-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (fail === 0) toast.success(t("ZIP stiahnutý — faktúr: {n}", { n: ok }));
      else
        toast.warning(t("ZIP: {ok} v poriadku, {chyba} bez prílohy alebo chyba", { ok, chyba: fail }));
      setSelected(new Set());
    } finally {
      setZipBusy(false);
    }
  }

  /* Hromadné zaúčtovanie — ako v Doklado: vybrať faktúry, dať predkontáciu. */
  const [zauctovanie, setZauctovanie] = useState(false);
  const [kodyNavrhy, setKodyNavrhy] = useState<Navrhy | null>(null);
  const [kody, setKody] = useState({ predkontacia: "", clenenie: "", kategoria: "" });
  const nacitajKody = useServerFn(navrhyKodovFn);
  const zauctuj = useServerFn(zauctujPrijateFn);
  useZatvorNaEscape(zauctovanie ? () => setZauctovanie(false) : null);

  // Predkontácie do stĺpca v riadku sa načítajú, keď je stĺpec zapnutý.
  const stlpecPredkontacie = zobrazenie.viditelne.includes("predkontacia");
  useEffect(() => {
    // Načíta ich useCiselnikyDokladov (raz za firmu) — okno Zaúčtovať ich použije tiež.
    if (stlpecPredkontacie && cis.navrhy && !kodyNavrhy) setKodyNavrhy(cis.navrhy as Navrhy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stlpecPredkontacie, cis.navrhy]);
  async function zmenPredkontaciuRiadku(id: string, kodPk: string) {
    const cid = getActiveCompanyId();
    if (!cid) return;
    try {
      await zauctuj({ data: { company_id: cid, ids: [id], predkontacia: kodPk || null, lenUlozit: true } as any });
      setRows((rs) => rs.map((x) => (x.id === id ? { ...x, pohoda_predkontacia: kodPk || null } : x)));
    } catch (e: any) {
      toast.error(e?.message ?? t("Predkontáciu sa nepodarilo uložiť"));
    }
  }

  async function otvorZauctovanie() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    setKody({ predkontacia: "", clenenie: "", kategoria: "" });
    setZauctovanie(true);
    if (!kodyNavrhy)
      nacitajKody({ data: { company_id: cid } })
        .then(setKodyNavrhy)
        .catch(() => {});
  }

  const exportujXml = useServerFn(exportPrijatychPohodaFn);
  const program = useExportDoProgramu();
  const [volbyExportu, setVolbyExportu] = useState(false);
  async function hromadneXml() {
    const cid = getActiveCompanyId();
    if (!cid || !selected.size) return;
    if (program.inyProgram) {
      if (await program.spusti("prijata", [...selected])) await load();
      return;
    }
    setVolbyExportu(true);
  }
  async function exportujSVolbami(v: VolbyExportu) {
    const cid = getActiveCompanyId();
    if (!cid || !selected.size) return;
    setHromadneBusy(true);
    try {
      const r = await exportujXml({
        data: {
          company_id: cid,
          ids: [...selected],
          oznacit: v.oznacit,
          datum_zauctovania: v.datumZauctovania,
          aj_odovzdane: v.ajOdovzdane,
          radenie: v.radenie,
        },
      });
      for (const f of r.subory) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([f.xml], { type: "text/xml;charset=utf-8" }));
        a.download = f.fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }
      toastNeodovzdane(t, r.preskocene);
      if (!r.preskocene.length)
        toast.success(
          t("XML pre Pohodu: {n} faktúr", { n: r.pocet }) +
            (r.subory.length > 1
              ? " " + t("v {n} súboroch podľa roka", { n: r.subory.length })
              : "") +
            (v.oznacit ? t(", označené ako odovzdané") : ""),
        );
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa"));
    } finally {
      setHromadneBusy(false);
    }
  }

  async function hromadneZauctovat() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    setHromadneBusy(true);
    try {
      const r = await zauctuj({
        data: {
          company_id: cid,
          ids: [...selected],
          predkontacia: kody.predkontacia || undefined,
          clenenie: kody.clenenie || undefined,
          kategoria: kody.kategoria || undefined,
        },
      });
      if (r.zauctovanych) {
        const n = r.zauctovanych;
        toast.success(
          n === 1
            ? t("Zaúčtovaná 1 faktúra")
            : n < 5
              ? t("Zaúčtované {n} faktúry", { n })
              : t("Zaúčtovaných {n} faktúr", { n }),
        );
      }
      if (r.preskocene.length)
        toast.error(t("Vynechané: {zoznam}", { zoznam: r.preskocene.join(" · ") }));
      setZauctovanie(false);
      setSelected(new Set());
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa"));
    } finally {
      setHromadneBusy(false);
    }
  }

  /** Označí vybrané za prijaté. Stornované a už prijaté sa nechávajú tak. */
  async function hromadnePrijat() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    const ciel = rows.filter(
      (r) => selected.has(r.id) && r.status !== "cancelled" && r.status !== "received",
    );
    if (!ciel.length) {
      toast.info(t("Vybrané faktúry už prijaté sú (alebo sú stornované)."));
      return;
    }
    setHromadneBusy(true);
    try {
      const { error } = await supabase
        .from("purchase_invoices")
        .update({ status: "received" })
        .eq("company_id", cid)
        .in(
          "id",
          ciel.map((r) => r.id),
        );
      if (error) throw new Error(error.message);
      toast.success(
        ciel.length === 1 ? t("Faktúra prijatá") : t("Prijaté faktúry: {n}", { n: ciel.length }),
      );
      setSelected(new Set());
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa"));
    } finally {
      setHromadneBusy(false);
    }
  }

  /** Mäkké mazanie — doklad ostáva v databáze kvôli exportom a auditu. */
  async function hromadneVymazat() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    const ids = rows.filter((r) => selected.has(r.id)).map((r) => r.id);
    if (!ids.length) return;
    setHromadneBusy(true);
    try {
      const { error } = await supabase
        .from("purchase_invoices")
        .update({ deleted_at: new Date().toISOString() })
        .eq("company_id", cid)
        .in("id", ids);
      if (error) throw new Error(error.message);
      toast.success(
        ids.length === 1 ? t("Faktúra vymazaná") : t("Vymazané faktúry: {n}", { n: ids.length }),
      );
      setSelected(new Set());
      setMazanie(false);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa"));
    } finally {
      setHromadneBusy(false);
    }
  }

  /* Poradie dotazov — pomalšia staršia odpoveď (iný filter) nesmie prepísať novšiu. */
  const poslednyDotaz = useRef(0);
  async function load() {
    const cid = getActiveCompanyId();
    if (!cid) {
      setLoading(false);
      return;
    }
    const cislo = ++poslednyDotaz.current;
    setLoading(true);
    /*
      Celý zoznam po stránkach — strop 500 skrýval staršie faktúry aj zo súčtov
      (PALIERA ich má cez 1 100). Kreslí sa po dávkach (usePostupneZobrazenie).
    */
    const dotaz = (od: number, po: number) => {
      let q = supabase
        .from("purchase_invoices")
        .select("*")
        .eq("company_id", cid)
        // Prijaté zálohy majú vlastný zoznam — tu by len nafukovali sumy.
        .eq("type", "regular")
        .is("deleted_at", null)
        .order("issue_date", { ascending: false })
        .order("id")
        .range(od, po);
      if (status === CIASTOCNE) q = q.not("status", "in", "(paid,cancelled,draft)");
      else if (status) q = q.eq("status", status);
      if (obdobieOd || obdobieDo) q = filtrujObdobie(q, podla, obdobieOd || null, obdobieDo || null);
      if (exportovane === "ano") q = q.not("exported_at", "is", null);
      if (exportovane === "nie") q = q.is("exported_at", null).neq("status", "cancelled");
      if (supplier.trim()) q = q.ilike("supplier_name", `%${supplier.trim()}%`);
      if (stavFiltra === "_bez") q = q.is("stav_id", null);
      else if (stavFiltra) q = q.eq("stav_id", stavFiltra);
      if (stitokFiltra) q = q.contains("stitky", [stitokFiltra]);
      return q;
    };
    let nacitane: any[] | null = null;
    let error: { message: string } | null = null;
    try {
      nacitane = await vsetkyRiadky<any>(dotaz);
    } catch (e: any) {
      error = { message: e?.message ?? String(e) };
    }
    if (cislo !== poslednyDotaz.current) return;
    if (error) toast.error(error.message);
    // Zoznam sa ukáže hneď; úhrady po častiach (odznak „čiastočne uhradená“)
    // sa doplnia potom. Len filter „čiastočne uhradené“ na ne musí počkať.
    if (status !== CIASTOCNE) {
      setRows(nacitane ?? []);
      setLoading(false);
    }
    // Úhrady len pre neuhradené faktúry — zaplatené ani storno čiastočné byť nemôžu.
    const naUhrady = (nacitane ?? [])
      .filter((r: any) => !["paid", "cancelled", "draft"].includes(r.status))
      .map((r: any) => r.id);
    let sumy: Record<string, number> = {};
    try {
      if (naUhrady.length)
        sumy = sumyUhradPodlaFaktury(
          await riadkyPreIds<any>(naUhrady, (kus, od, po) =>
            supabase
              .from("purchase_invoice_payments")
              .select("id, purchase_invoice_id, amount")
              .eq("company_id", cid)
              .in("purchase_invoice_id", kus)
              .order("id")
              .range(od, po),
          ),
        );
    } catch {
      sumy = {};
    }
    if (cislo !== poslednyDotaz.current) return;
    const data =
      status === CIASTOCNE
        ? (nacitane ?? []).filter((r: any) => jeCiastocneUhradena(r, sumy[r.id]))
        : nacitane;
    setUhradene(sumy);
    setRows(data ?? []);
    setLoading(false);

    // Väzba na banku po 300 (strop serverovej funkcie), dávky súčasne.
    const ids = (data ?? []).map((r: any) => r.id);
    if (ids.length) {
      try {
        const kusy: string[][] = [];
        for (let i = 0; i < ids.length; i += 300) kusy.push(ids.slice(i, i + 300));
        const vysledky: any[] = await Promise.all(
          kusy.map((kus) => uhradyFn({ data: { company_id: cid, ids: kus } })),
        );
        if (cislo !== poslednyDotaz.current) return;
        setUhrady(Object.assign({}, ...vysledky.map((u) => u?.uhrady ?? {})));
      } catch {
        setUhrady({});
      }
    } else {
      setUhrady({});
    }
  }
  useEffect(() => {
    load();
  }, [status, obdobieOd, obdobieDo, supplier, podla, exportovane, stavFiltra, stitokFiltra]);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    nacitajMena({ data: { company_id: cid } })
      .then((m) => setMena(m as Record<string, string>))
      .catch(() => setMena({}));
    nacitajNavrhy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = useMemo(() => {
    let total = 0,
      unpaid = 0,
      overdueCount = 0;
    const today = new Date().toISOString().slice(0, 10);
    rows.forEach((r) => {
      total += Number(r.amount_total ?? 0);
      if (r.status !== "paid" && r.status !== "cancelled") {
        unpaid += Number(r.amount_total ?? 0);
        if (r.due_date < today) overdueCount++;
      }
    });
    return { total, unpaid, overdueCount, count: rows.length };
  }, [rows]);

  /** Excel s práve vyfiltrovanými a zoradenými faktúrami (aj s položkami). */
  function stiahniExcelPrijatych() {
                    const r = rad.zoradene as any[];
                    void stiahniExcel(`prijate-faktury-${new Date().toISOString().slice(0, 10)}.xlsx`, [
                      {
                        nazov: t("Prijaté faktúry"),
                        data: tabulka(r, [
                          { nazov: t("Číslo"), hodnota: (x: any) => x.invoice_number },
                          { nazov: t("Dodávateľ"), hodnota: (x: any) => x.supplier_name },
                          { nazov: t("IČO"), hodnota: (x: any) => x.supplier_ico },
                          { nazov: t("IČ DPH"), hodnota: (x: any) => x.supplier_ic_dph },
                          { nazov: t("VS"), hodnota: (x: any) => x.variable_symbol },
                          { nazov: t("Vystavená"), hodnota: (x: any) => x.issue_date },
                          { nazov: t("DUZP"), hodnota: (x: any) => x.delivery_date },
                          { nazov: t("Splatnosť"), hodnota: (x: any) => x.due_date },
                          { nazov: t("Základ"), hodnota: (x: any) => Number(x.amount_without_vat ?? 0) },
                          { nazov: t("DPH"), hodnota: (x: any) => Number(x.vat_amount ?? 0) },
                          { nazov: t("Spolu"), hodnota: (x: any) => Number(x.amount_total ?? 0) },
                          { nazov: t("Mena"), hodnota: (x: any) => x.currency },
                          { nazov: t("Stav"), hodnota: (x: any) => t(STATUS_LABEL[x.status] ?? x.status) },
                          { nazov: t("Predkontácia"), hodnota: (x: any) => x.pohoda_predkontacia },
                          { nazov: t("Členenie DPH"), hodnota: (x: any) => x.pohoda_clenenie_dph },
                          { nazov: t("Odovzdaná"), hodnota: (x: any) => (x.exported_at ? t("áno") : "") },
                        ]),
                      },
                      {
                        nazov: t("Položky"),
                        data: tabulka(
                          r.flatMap((x: any) =>
                            (Array.isArray(x.items) ? x.items : []).map((p: any) => ({
                              doklad: x.invoice_number,
                              dodavatel: x.supplier_name,
                              p,
                            })),
                          ),
                          [
                          { nazov: t("Doklad"), hodnota: (x: any) => x.doklad },
                          { nazov: t("Dodávateľ"), hodnota: (x: any) => x.dodavatel },
                          { nazov: t("Položka"), hodnota: (x: any) => x.p?.name },
                          { nazov: t("Množstvo"), hodnota: (x: any) => Number(x.p?.quantity ?? 0) },
                          { nazov: t("MJ"), hodnota: (x: any) => x.p?.unit },
                          { nazov: t("Jedn. cena"), hodnota: (x: any) => (x.p?.unit_price == null ? null : Number(x.p.unit_price)) },
                          { nazov: t("Sadzba DPH"), hodnota: (x: any) => (x.p?.vat_rate == null ? null : Number(x.p.vat_rate)) },
                          { nazov: t("Spolu"), hodnota: (x: any) => (x.p?.total == null ? null : Number(x.p.total)) },
                        ],
                        ),
                      },
                    ]);
  }

  return (
    <>
      {volbyExportu ? (
        <VolbyExportuOkno
          pocet={selected.size}
          nazov={t("Prijaté faktúry do Pohody (XML)")}
          onClose={() => setVolbyExportu(false)}
          onExport={exportujSVolbami}
        />
      ) : null}
      <PageHeader
        title={t("Prijaté faktúry")}
        description={t("Evidencia nákupných faktúr od dodávateľov.")}
        action={
          <div className="flex flex-wrap gap-2">
            <NahratDoklad label={t("Nahrať faktúru")} />
            <Link
              to="/prijate-faktury/samofaktura"
              title={t("Faktúru za dodávateľa vyhotovíte vy, on ju odsúhlasí (§ 72 ods. 4 zákona o DPH)")}
              className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary"
            >
              <Plus className="h-4 w-4" /> {t("Samofaktúra")}
            </Link>
            <HlavickaViac akcie={[{ label: "Excel", icon: Download, onClick: stiahniExcelPrijatych }]} />
            <Link
              to="/prijate-faktury/nova"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> {t("Nová prijatá faktúra")}
            </Link>
          </div>
        }
      />
      <PageBody>
        <UpozornenieNespracovane />
        <PrijemMailom />
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard label={t("Počet faktúr")} value={String(totals.count)} />
          <StatCard label={t("Celková suma")} value={fmtMoney(totals.total)} />
          <StatCard label={t("Nezaplatené")} value={fmtMoney(totals.unpaid)} tone="amber" />
          <StatCard
            label={t("Po splatnosti")}
            value={String(totals.overdueCount)}
            tone={totals.overdueCount > 0 ? "rose" : undefined}
          />
        </div>

        {/* Hľadá sa len podľa mena dodávateľa (ilike v dotaze), preto taký popis. */}
        <div className="mt-6">
          <DocumentListToolbar
            lf={lf}
            searchPlaceholder="Dodávateľ…"
            filters={[
              {
                key: "stav",
                label: "Stav",
                type: "select",
                options: [
                  ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
                  { value: CIASTOCNE, label: "Čiastočne uhradená" },
                ],
              },
              {
                key: "obdobie",
                label: "Obdobie",
                type: "dateRange",
                dateFieldOptions: [
                  { value: "prijatie", label: "dátumu prijatia" },
                  { value: "vystavenie", label: "dátumu vystavenia" },
                  { value: "dodanie", label: "dátumu dodania" },
                  { value: "splatnost", label: "dátumu splatnosti" },
                ],
              },
              {
                key: "export",
                label: "Export do účtovníctva",
                type: "select",
                options: [
                  { value: "ano", label: "Exportované" },
                  { value: "nie", label: "Neexportované" },
                ],
              },
              ...filtreStavuAStitkov(cis.stavy, cis.stitky),
            ]}
            previewToggle={bocny}
            extra={
              <div className="flex flex-wrap items-center gap-2">
                <NastaveniaZoznamu
                  nastavenia={zobrazenie}
                  stlpce={STLPCE_PRIJATYCH}
                  aktualne={{
                    stav: status,
                    dodavatel: supplier,
                    podla: lf.filter("podla"),
                    obdobie_od: obdobieOd,
                    obdobie_do: obdobieDo,
                    export: exportovane,
                  }}
                  pouzi={(h) => {
                    // Staršie uložené filtre majú mesiac — vtedy sa vyberalo podľa vystavenia.
                    const mesiac = h.mesiac ? hraniceMesiaca(h.mesiac) : null;
                    const f: Record<string, string> = {};
                    const nastav = (k: string, v: string | undefined) => {
                      if (v) f[k] = v;
                    };
                    nastav("stav", h.stav);
                    nastav("podla", h.podla ?? (mesiac ? "vystavenie" : undefined));
                    nastav("obdobie_od", h.obdobie_od ?? mesiac?.od);
                    nastav("obdobie_do", h.obdobie_do ?? mesiac?.do);
                    nastav("export", h.export);
                    // Hľadanie aj filtre jedným zápisom do adresy — dva za sebou by sa prepísali.
                    void navigate({
                      to: ".",
                      replace: true,
                      search: (prev: Record<string, unknown>) => ({
                        ...prev,
                        q: h.dodavatel || undefined,
                        f: Object.keys(f).length ? f : undefined,
                        page: undefined,
                      }),
                    } as any);
                  }}
                />
              </div>
            }
          />
        </div>

        {selected.size > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
            <span className="font-medium">{t("Vybrané: {n}", { n: selected.size })}</span>
            <button
              onClick={runBulkZip}
              disabled={zipBusy}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {zipBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Archive className="h-3.5 w-3.5" />
              )}
              {t("Stiahnuť ZIP (PDF + CSV)")}
            </button>
            {getActiveCompanyId() ? (
              <HromadnaAkciaDokladov
                companyId={getActiveCompanyId()!}
                agenda="prijata"
                ids={Array.from(selected)}
                onHotovo={() => void load()}
                pdfZip={() => void runBulkZip()}
                zmazat={() => setMazanie(true)}
              />
            ) : null}
            {getActiveCompanyId() ? (
              <VyuctovanieZVyberu
                companyId={getActiveCompanyId()!}
                druh="prijata"
                ids={Array.from(selected)}
                onHotovo={() => void load()}
              />
            ) : null}
            <button
              onClick={() => setPrikaz(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary"
            >
              <Landmark className="h-3.5 w-3.5" /> {t("Hromadný príkaz na úhradu")}
            </button>
            <button
              onClick={hromadnePrijat}
              disabled={hromadneBusy}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" /> {t("Označiť ako prijaté")}
            </button>
            <button
              onClick={otvorZauctovanie}
              disabled={hromadneBusy}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50"
            >
              <BookCheck className="h-3.5 w-3.5" /> {t("Zaúčtovať")}
            </button>
            <button
              onClick={() => setNavrhyAi(true)}
              disabled={hromadneBusy}
              title={t("AI navrhne predkontáciu a členenie z vášho číselníka — zaúčtujete až po kontrole.")}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" /> {t("Navrhnúť AI pre vybrané")}
            </button>
            <button
              onClick={hromadneXml}
              disabled={hromadneBusy}
              title={t("Zaúčtované faktúry pre {program}; označia sa ako odovzdané", {
                program: program.inyProgram ? program.nazov : "Pohodu",
              })}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />{" "}
              {program.inyProgram
                ? t("Export pre {program}", { program: program.nazov })
                : t("XML pre Pohodu")}
            </button>
            <button
              onClick={() => setMazanie(true)}
              disabled={hromadneBusy}
              className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> {t("Vymazať")}
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {t("Zrušiť výber")}
            </button>
          </div>
        )}

        {/*
          Návrhy na spárovanie s platbami z účtu. Nič sa nepáruje potichu — aj
          istá dvojica čaká na potvrdenie, lebo potvrdením sa faktúra označí za
          zaplatenú a to je zápis do účtovníctva.
        */}
        {navrhy.length > 0 && (
          <div className="mb-4 overflow-hidden rounded-xl border border-primary/40 bg-primary/5">
            <div className="px-4 py-3 text-sm font-medium">
              {t("Našli sme platby k faktúram")} ({navrhy.length})
            </div>
            {navrhy.map((z) => (
              <div
                key={z.transactionId}
                className="flex flex-wrap items-center gap-3 border-t border-primary/20 px-4 py-3 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {z.faktura?.supplier_name ?? t("Faktúra")}{" "}
                    <span className="text-muted-foreground">{z.faktura?.invoice_number}</span>{" "}
                    <span className="tabular-nums">
                      {z.faktura?.amount_total != null
                        ? formatujMenu(z.faktura.amount_total, z.faktura.currency ?? "EUR")
                        : ""}
                    </span>
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {z.pohyb?.booking_date ? datumNaDoklade(z.pohyb.booking_date) : ""} ·{" "}
                    {z.dovody.map((x: string) => t(x)).join(" · ")}
                  </span>
                </span>
                {/* Pred potvrdením si treba faktúru pozrieť — v bočnom náhľade, ak je zapnutý, inak v novej karte, aby zoznam návrhov ostal. */}
                {z.purchaseInvoiceId && (
                  <button
                    onClick={() => {
                      const id = z.purchaseInvoiceId as string;
                      if (bocny.aktivny() && rows.some((x: any) => x.id === id)) bocny.setVybrany(id);
                      else window.open(`/prijate-faktury/${id}`, "_blank", "noopener");
                    }}
                    className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {t("Náhľad faktúry")}
                  </button>
                )}
                <button
                  disabled={parujem === z.transactionId}
                  onClick={() => sparuj(z)}
                  className="rounded-md bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary disabled:opacity-60"
                >
                  {z.istota === "auto" ? t("Spárovať") : t("Áno, patrí k sebe")}
                </button>
                <button
                  onClick={() =>
                    setNavrhy((n) => n.filter((i) => i.transactionId !== z.transactionId))
                  }
                  className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground"
                >
                  {t("Nie")}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4">
        <SNahladom
          zapnuty={bocny.zapnuty}
          vybrany={bocny.vybrany}
          nazov={(() => {
            const r: any = rows.find((x: any) => x.id === bocny.vybrany);
            return r ? `${r.invoice_number ?? ""} · ${r.supplier_name ?? ""}` : null;
          })()}
          nacitaj={async (id) => {
            const r: any = rows.find((x: any) => x.id === id);
            if (!r?.file_path) return null;
            const { data } = await supabase.storage.from("purchase-invoices").createSignedUrl(r.file_path, 600);
            if (!data?.signedUrl) return null;
            return { url: data.signedUrl, obrazok: /\.(jpe?g|png|webp|gif|heic)$/i.test(r.file_path) };
          }}
          onOtvorit={(id) => navigate({ to: "/prijate-faktury/$id", params: { id } })}
          onZavriet={() => bocny.setVybrany(null)}
        >
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-8 p-3">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && selected.size === rows.length}
                    onChange={toggleAll}
                  />
                </th>
                <th className="p-3">{rad.hlavicka("cislo", t("Číslo"))}</th>
                <th className="p-3">{rad.hlavicka("dodavatel", t("Dodávateľ"))}</th>
                {je("ico") && <th className="p-3">{rad.hlavicka("ico", t("IČO"))}</th>}
                {je("vs") && <th className="p-3">{rad.hlavicka("vs", t("VS"))}</th>}
                {je("vystavena") && <th className="p-3">{rad.hlavicka("vystavena", t("Vystavená"))}</th>}
                {je("duzp") && <th className="p-3">{rad.hlavicka("duzp", t("DUZP"))}</th>}
                {je("splatnost") && <th className="p-3">{rad.hlavicka("splatnost", t("Splatnosť"))}</th>}
                {je("zaklad") && <th className="p-3 text-right">{rad.hlavicka("zaklad", t("Základ"))}</th>}
                {je("dph") && <th className="p-3 text-right">{rad.hlavicka("dph", t("DPH"))}</th>}
                {je("suma") && <th className="p-3 text-right">{rad.hlavicka("suma", t("Suma"))}</th>}
                {je("predkontacia") && <th className="p-3">{rad.hlavicka("predkontacia", t("Účtovná položka"))}</th>}
                {stlpecStavDokladu && <th className="p-3">{t("Stav dokladu")}</th>}
                {je("zapisal") && <th className="p-3">{t("Zapísal")}</th>}
                {stlpecSpracoval && <th className="hidden p-3 md:table-cell">{t("Spracoval")}</th>}
                {je("stav") && <th className="p-3">{rad.hlavicka("stav", t("Stav"))}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr>
                  <td colSpan={pocetStlpcov} className="p-8 text-center text-muted-foreground">
                    {t("Načítavam…")}
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={pocetStlpcov} className="p-8 text-center text-muted-foreground">
                    {/* Tabuľka je na mobile širšia ako displej — text drží pri
                        ľavom okraji v šírke obrazovky, inak by bol odrezaný. */}
                    <div className="sticky left-8 max-w-[calc(100vw-6rem)] md:max-w-none">
                      <FileText className="mx-auto mb-2 h-8 w-8 opacity-40" />
                      {t("Žiadne prijaté faktúry. Pridajte prvú cez „Nová prijatá faktúra\".")}
                    </div>
                  </td>
                </tr>
              )}
              {postupne.viditelne.map((r) => (
                /*
                  Otvárať detail vedeli len dve bunky z deviatich a robili to
                  cez `window.location`, teda celým znovunačítaním stránky.
                  Ťuknutie na dátum, sumu či stav neurobilo nič — a nebolo to
                  na riadku nijako vidieť. Zvyšok aplikácie má preklikateľný
                  celý riadok, tak nech to tu funguje rovnako.
                */
                <tr
                  key={r.id}
                  {...posledny.riadok(r.id)}
                  data-nahlad-id={r.id}
                  className={`cursor-pointer hover:bg-muted/30 ${posledny.riadok(r.id).className} ${bocny.zapnuty && bocny.vybrany === r.id ? "bg-primary/10" : ""}`}
                  onClick={() => {
                    posledny.zapamataj(r.id);
                    if (bocny.aktivny()) bocny.setVybrany(r.id);
                    else navigate({ to: "/prijate-faktury/$id", params: { id: r.id } });
                  }}
                  onDoubleClick={() => navigate({ to: "/prijate-faktury/$id", params: { id: r.id } })}
                >
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                    />
                  </td>
                  <td className="p-3 font-medium">
                    {r.invoice_number}
                    <span className="ml-1.5 inline-flex align-middle">
                      <OdovzdaneIkona kedy={r.exported_at} />
                    </span>
                    {duplicity.has(r.id) && (
                      <span
                        title={t("Rovnaká faktúra (číslo aj dodávateľ) je v zozname viackrát — skontrolujte, či nejde o duplicitu.")}
                        className="ml-2 inline-flex rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
                      >
                        Duplicita?
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    {r.supplier_name}
                    {r.stitky?.length ? (
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {r.stitky.map((stitok: string) => (
                            <span key={stitok} className="rounded-full bg-secondary px-1.5 text-[11px] text-muted-foreground">
                              {stitok}
                            </span>
                          ))}
                        </div>
                      ) : null}
                  </td>
                  {je("ico") && (
                    <td className="p-3 tabular-nums text-muted-foreground">
                      {r.supplier_ico || "—"}
                    </td>
                  )}
                  {je("vs") && (
                    <td className="p-3 tabular-nums text-muted-foreground">
                      {r.variable_symbol || "—"}
                    </td>
                  )}
                  {je("vystavena") && (
                    <td className="p-3">
                      {datumNaDoklade(r.issue_date)}
                      {!je("duzp") && r.delivery_date && r.delivery_date !== r.issue_date ? (
                        <div
                          className="text-xs text-muted-foreground"
                          title={t("Dátum dodania (daňového plnenia)")}
                        >
                          {t("DUZP")} {datumNaDoklade(r.delivery_date)}
                        </div>
                      ) : null}
                    </td>
                  )}
                  {je("duzp") && (
                    <td
                      className={`p-3 ${r.delivery_date && r.delivery_date !== r.issue_date ? "font-medium" : "text-muted-foreground"}`}
                    >
                      {datumNaDoklade(datumDodania(r))}
                    </td>
                  )}
                  {je("splatnost") && (
                    <td className="p-3">
                      {datumNaDoklade(r.due_date)}
                      {r.povodna_splatnost && r.povodna_splatnost !== r.due_date && (
                        <span
                          className="block text-xs text-muted-foreground"
                          title={t("Pôvodne {datum}", { datum: r.povodna_splatnost })}
                        >
                          {t("predĺžená")}
                        </span>
                      )}
                    </td>
                  )}
                  {je("zaklad") && (
                    <td className="p-3 text-right tabular-nums">
                      {fmtMoney(Number(r.amount_without_vat ?? 0), r.currency)}
                    </td>
                  )}
                  {je("dph") && (
                    <td className="p-3 text-right tabular-nums">
                      {fmtMoney(Number(r.vat_amount ?? 0), r.currency)}
                    </td>
                  )}
                  {je("suma") && (
                    <td className="p-3 text-right tabular-nums">
                      {fmtMoney(Number(r.amount_total ?? 0), r.currency)}
                    </td>
                  )}
                  {je("predkontacia") && (
                    <td className="p-3 text-xs text-muted-foreground" onClick={(e) => e.stopPropagation()}>
                      {/* Účtovná položka priamo v riadku — odovzdanú, zamknutú ani v uzavretom období meniť nejde. */}
                      {(() => {
                        const z = dovodZamku(r, cis.zamknuteDo);
                        return (
                          <VyberVRiadku
                            ariaLabel={t("Predkontácia faktúry {cislo}", { cislo: r.invoice_number })}
                            hodnota={r.pohoda_predkontacia}
                            moznosti={moznostiPredkontacie(platbaPreZoradenie(r.payment_method))}
                            zamok={z ? t(NAZOV_ZAMKU[z]) : null}
                            prazdne={t("Nedefinované")}
                            onVyber={(v) => zmenPredkontaciuRiadku(r.id, v)}
                          />
                        );
                      })()}
                      {r.pohoda_clenenie_dph ? <div className="mt-0.5">{r.pohoda_clenenie_dph}</div> : null}
                    </td>
                  )}
                  {stlpecStavDokladu && (
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      {cis.stavy.length ? (
                        <VyberStavuDokladu
                          kompaktny
                          tabulka="purchase_invoices"
                          id={r.id}
                          stavId={r.stav_id}
                          stavy={cis.stavy}
                          onZmena={(v) => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, stav_id: v } : x)))}
                        />
                      ) : (
                        <StavDokladuOdznak stav={stavPodlaId.get(r.stav_id)} />
                      )}
                    </td>
                  )}
                  {je("zapisal") && (
                    <td className="p-3">
                      <Zapisal zdroj={r.source} autor={r.created_by ? mena[r.created_by] : null} />
                    </td>
                  )}
                  {stlpecSpracoval && (
                    <td className="hidden p-3 text-xs md:table-cell">
                      <Spracoval s={spracovanieDokladu(r, "prijata")} mena={mena} loc={lokalJazyka(jazyk)} />
                    </td>
                  )}
                  {je("stav") && (
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <StatusBadge status={r.status} />
                      {jeCiastocneUhradena(r, uhradene[r.id]) && (
                        <span
                          className="mt-1 block w-fit rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800"
                          title={formatujMenu(uhradene[r.id], r.currency ?? "EUR")}
                        >
                          {t("Čiastočne uhradená")}
                        </span>
                      )}
                      {r.locked_at ? (
                        <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground" title={t("Zamknutý doklad")}>
                          <Lock className="h-3 w-3" /> {t("Zamknutá")}
                        </span>
                      ) : null}
                      {sch.stavy[r.id] ? (
                        <div
                          className={`mt-1 text-xs ${farbaOdznaku(sch.stavy[r.id].stav)}`}
                          title={t("Schvaľovanie")}
                        >
                          {t(sch.stavy[r.id].odznak)}
                        </div>
                      ) : null}
                      {r.exported_at ? (
                        <span className="mt-1 block text-xs text-emerald-700 dark:text-emerald-300">
                          {t("V Pohode")}
                        </span>
                      ) : r.zauctovane_at && r.status !== "booked" ? (
                        <span className="mt-1 block text-xs text-sky-700 dark:text-sky-300">
                          {t("Zaúčtovaná")}
                        </span>
                      ) : null}
                      {/* Účtovnú položku netreba opakovať, keď má vlastný stĺpec. */}
                      {!je("predkontacia") && (r.pohoda_predkontacia || r.pohoda_clenenie_dph) && (
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          {[r.pohoda_predkontacia, r.pohoda_clenenie_dph]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      )}
                      {r.samofakturacia && (
                        <span
                          className={`mt-1 block text-xs ${
                            stavSamofaktury(r) === "odsuhlasena"
                              ? "text-emerald-700 dark:text-emerald-300"
                              : stavSamofaktury(r) === "zamietnuta"
                                ? "text-rose-700 dark:text-rose-300"
                                : "text-amber-700 dark:text-amber-300"
                          }`}
                        >
                          {t("Samofaktúra")} · {t(NAZVY_STAVOV[stavSamofaktury(r)]).toLowerCase()}
                        </span>
                      )}
                      {/*
                      Keď faktúru uhradil pohyb z účtu, je to vidieť priamo tu —
                      inak by sa väzba dala len vytvoriť, nie skontrolovať ani
                      zrušiť.
                    */}
                      {uhrady[r.id] && (
                        <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <Landmark className="h-3 w-3" />
                          <span className="tabular-nums">{uhrady[r.id].datum}</span>
                          <button
                            onClick={() => rozparuj(uhrady[r.id].transactionId)}
                            title={t("Zrušiť väzbu na platbu")}
                            aria-label={t("Zrušiť väzbu na platbu")}
                            className="rounded p-0.5 hover:bg-muted"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {postupne.zarazkaRiadok(pocetStlpcov)}
            </tbody>
          </table>
          {rows.length > 0 ? (
            <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 border-t border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {/* Vybrané ukazuje lišta pod zoznamom (SuctovaListaVyberu). */}
              <span title={t("Zaúčtované a ešte neodovzdané do účtovníctva")}>
                {t("Na export:")} <strong className="text-foreground">{naExport.length}</strong>
                {naExport.length ? ` · ${sumyPodlaMeny(naExport)}` : ""}
              </span>
              <span>
                {t("Spolu:")} <strong className="text-foreground">{rad.zoradene.length}</strong> · {sumyPodlaMeny(rad.zoradene)}
              </span>
            </div>
          ) : null}
        </div>
        </SNahladom>
        </div>
        {/* Súčet označených + úhrada z výberu (lišta drží spodok obrazovky). */}
        <SuctovaListaVyberu
          polozky={vybraneSuhrn}
          onZrusit={() => setSelected(new Set())}
          akcie={
            <button
              type="button"
              onClick={() => setPrikaz(true)}
              disabled={!naUhraduPocet}
              title={t("Pripraví hromadný príkaz na úhradu (SEPA XML) z označených faktúr.")}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Landmark className="h-3.5 w-3.5" /> {t("Uhradiť ({n})", { n: naUhraduPocet })}
            </button>
          }
        />
      </PageBody>

      <ConfirmDialog
        open={mazanie}
        title={
          selected.size === 1
            ? t("Vymazať faktúru?")
            : t("Vymazať {n} faktúr?", { n: selected.size })
        }
        message={t("Doklady sa presunú do koša — v exportoch ani v prehľadoch sa už neobjavia.")}
        confirmLabel={t("Vymazať")}
        onCancel={() => setMazanie(false)}
        onConfirm={hromadneVymazat}
        busy={hromadneBusy}
      />
      {zauctovanie && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setZauctovanie(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("Zaúčtovať vybrané faktúry")}
            className="w-full max-w-2xl rounded-xl border border-border bg-card p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">
              {selected.size === 1
                ? t("Zaúčtovať 1 faktúru")
                : t("Zaúčtovať {n} faktúr", { n: selected.size })}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("Vyplnené pole sa nastaví na všetkých vybraných; prázdne nechá, čo na faktúre je (z pravidla alebo predvolené z nastavení predkontácií). Zaúčtované pôjdu do Pohody pri najbližšom odovzdaní.")}
            </p>
            <div className="mt-4">
              <PoliaZauctovania navrhy={kodyNavrhy} hodnoty={kody} setHodnoty={setKody} hromadne />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setZauctovanie(false)}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
              >
                {t("Zrušiť")}
              </button>
              <button
                onClick={hromadneZauctovat}
                disabled={hromadneBusy}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {hromadneBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("Zaúčtovať")}
              </button>
            </div>
          </div>
        </div>
      )}
      {navrhyAi && getActiveCompanyId() && (
        <NavrhyAiOkno
          companyId={getActiveCompanyId()!}
          ids={[...selected]}
          onClose={() => setNavrhyAi(false)}
          onHotovo={() => {
            setSelected(new Set());
            void load();
          }}
        />
      )}
      {prikaz && getActiveCompanyId() && (
        <HromadnyPrikaz
          companyId={getActiveCompanyId()!}
          // Neodsúhlasená samofaktúra ešte nie je dlh — do príkazu nepatrí.
          // Pri zapnutom schvaľovaní ide na úhradu len schválená.
          faktury={rows.filter(
            (r) =>
              selected.has(r.id) &&
              zapocitatelna(r) &&
              (!sch.zapnute || !sch.stavy[r.id] || sch.stavy[r.id].stav === "schvaleny"),
          )}
          onClose={() => setPrikaz(false)}
        />
      )}
    </>
  );
}

/**
 * Kto doklad zapísal. Pri doklade z mailu je v `created_by` majiteľ adresy, nie
 * ten, kto niečo vypĺňal — meno by tam klamalo, preto rozhoduje zdroj.
 */
function Zapisal({ zdroj, autor }: { zdroj?: string | null; autor?: string | null }) {
  const { t } = useT();
  if (zdroj === "mail")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Mail className="h-3.5 w-3.5" /> {t("E-mailom")}
      </span>
    );
  if (zdroj === "efaktura")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <FileCode className="h-3.5 w-3.5" /> {t("Z eFaktúry")}
      </span>
    );
  if (zdroj === "import")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Upload className="h-3.5 w-3.5" /> {t("Import")}
      </span>
    );
  if (zdroj === "doklad")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <ScanLine className="h-3.5 w-3.5" /> {t("Z dokladov")}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <User className="h-3.5 w-3.5" /> {autor || t("Ručne")}
    </span>
  );
}

/** Kto faktúru vytvoril z Nespracovaných dokladov a kedy. */
function Spracoval({
  s,
  mena,
  loc,
}: {
  s: ReturnType<typeof spracovanieDokladu>;
  mena: Record<string, string>;
  loc: string;
}) {
  const { t } = useT();
  if (!s) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="block whitespace-nowrap">
      {menoSpracovatela(s, mena) ?? (s.kto ? t("kolega") : "—")}
      {s.kedy ? (
        <span className="block text-muted-foreground">
          {new Date(s.kedy).toLocaleString(loc, { dateStyle: "short", timeStyle: "short" })}
        </span>
      ) : null}
    </span>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "amber" | "rose";
}) {
  const toneCls =
    tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100"
      : tone === "rose"
        ? "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-100"
        : "border-border bg-card";
  return (
    <div className={`rounded-xl border p-4 ${toneCls}`}>
      <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
