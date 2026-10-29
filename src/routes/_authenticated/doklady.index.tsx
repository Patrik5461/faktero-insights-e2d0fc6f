import { preloz, lokalJazyka } from "@/lib/i18n/jazyk";
import { toastNeodovzdane } from "@/components/faktero/NeodovzdaneDoklady";
import { useT } from "@/lib/i18n/useT";
import { VolbyExportuOkno, type VolbyExportu } from "@/components/faktero/VolbyExportuOkno";
import { OdovzdaneIkona } from "@/components/faktero/OdovzdaneIkona";
import { VyuctovanieZVyberu } from "@/components/faktero/VyuctovanieZVyberu";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { NastaveniaZoznamu } from "@/components/faktero/NastaveniaZoznamu";
import { useNastaveniaZoznamu } from "@/hooks/useNastaveniaZoznamu";
import { useRadenie } from "@/hooks/useRadenie";
import { stiahniExcel, tabulka } from "@/lib/faktero/excel-zoznamu";
import { useExportDoProgramu } from "@/hooks/useExportDoProgramu";
import type { StlpecZoznamu } from "@/lib/faktero/nastavenia-zoznamov";
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
  Lock,
  Trash2,
  Upload as UploadIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PredkontaciaDokladovOkno } from "@/components/faktero/PredkontaciaDokladovOkno";
import { KosDokladovOkno } from "@/components/faktero/KosDokladovOkno";
import { useStavSchvalovania, farbaOdznaku } from "@/hooks/useStavSchvalovania";
import { potvrd } from "@/lib/potvrdenie";
import { useMenaFirmy } from "@/lib/faktero/krajina-firmy";
import { formatujMenu, formatujCislo } from "@/lib/faktero/mena";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { usePoslednyOtvoreny } from "@/hooks/usePoslednyOtvoreny";
import { usePostupneZobrazenie } from "@/hooks/usePostupneZobrazenie";
import { spracovanieDokladu, menoSpracovatela } from "@/lib/faktero/spracoval";
import { menaClenovFirmy } from "@/lib/faktero/invitations.functions";
import { DocumentListToolbar, HlavickaViac } from "@/components/faktero/DocumentListToolbar";
import { useListFilters, zoznamSearch, type ListSearch } from "@/hooks/useListFilters";
import { SuctovaListaVyberu } from "@/components/faktero/SuctovaListaVyberu";
import { polozkaBlocku } from "@/lib/faktero/suhrn-vyberu";
import { HromadnaAkciaDokladov } from "@/components/faktero/HromadnaAkciaDokladov";
import { VyberVRiadku, moznostiKodov } from "@/components/faktero/VyberVRiadku";
import { StavDokladuOdznak, VyberStavuDokladu } from "@/components/faktero/StavDokladu";
import { useCiselnikyDokladov, filtreStavuAStitkov, splnaStavAStitok } from "@/hooks/useCiselnikyDokladov";
import { dovodZamku, NAZOV_ZAMKU } from "@/lib/faktero/doklady-hromadne";
import { daSaPresunutMedziPrijate } from "@/lib/faktero/doklad-je-blocek";
import { zoradPodlaDokladu } from "@/lib/faktero/predkontacie";
import { zauctujDokladyFn } from "@/lib/faktero/zauctovanie.functions";
import { SNahladom, useBocnyNahlad, useSipkyNahladu } from "@/components/faktero/BocnyNahlad";

export const Route = createFileRoute("/_authenticated/doklady/")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Doklady — Faktero") }] }),
  /*
   * `mesiac` v adrese otvorí zoznam rovno na mesiaci dokladu. Bez neho sa
   * zoznam otvára na tomto mesiaci a doklad vystavený v minulom mesiaci sa hneď
   * po uložení stratí z dohľadu — vyzerá to, že sa neuložil.
   */
  /*
   * `stav` vyberá záložku. Bez neho sa zoznam otvára na spracovaných —
   * bloček na kontrolu čaká v Nespracovaných dokladoch a sem príde, až keď
   * ho niekto spracuje (ako v sekcii Bločky v Doklado).
   */
  /*
   * Hľadanie a filtre (úhrada, zvolený mesiac) sú v adrese cez `zoznamSearch`.
   * Mesiac zvolený v zozname sa ukladá do `f.mesiac` („vsetky“ = bez mesiaca);
   * `?mesiac=` ostáva len ako vstup z odkazu po uložení dokladu.
   */
  validateSearch: (
    s: Record<string, unknown>,
  ): { mesiac?: string; stav?: ZalozkaDokladov } & ListSearch => {
    const m = typeof s.mesiac === "string" && /^\d{4}-\d{2}$/.test(s.mesiac) ? s.mesiac : undefined;
    const stav = jeZalozkaDokladov(s.stav) ? s.stav : undefined;
    return { ...(m ? { mesiac: m } : {}), ...(stav ? { stav } : {}), ...zoznamSearch(s) };
  },
  component: DokladyPage,
});

/** Stĺpce zoznamu dokladov na výber (ako v Doklado). */
/** Súčet súm s DPH po menách — meny sa nesčítavajú. */
function sumyDokladov(riadky: any[]): string {
  const po = new Map<string, number>();
  for (const r of riadky) {
    const m = String(r.currency ?? "EUR");
    po.set(m, (po.get(m) ?? 0) + Number(r.total_amount ?? 0));
  }
  return [...po.entries()].map(([m, v]) => formatujMenu(v, m)).join(" + ");
}

const STLPCE_DOKLADOV: StlpecZoznamu[] = [
  { kluc: "datum", nazov: "Dátum" },
  { kluc: "dodavatel", nazov: "Dodávateľ", povinny: true },
  { kluc: "cislo", nazov: "Číslo a predkontácia" },
  { kluc: "predkontacia", nazov: "Účtovná položka" },
  { kluc: "stavDokladu", nazov: "Stav dokladu" },
  { kluc: "kategoria", nazov: "Kategória", predvoleny: false },
  { kluc: "zaklad", nazov: "Základ", predvoleny: false },
  { kluc: "dph", nazov: "DPH", predvoleny: false },
  { kluc: "celkom", nazov: "Celkom" },
  { kluc: "platba", nazov: "Spôsob úhrady", predvoleny: false },
  { kluc: "stav", nazov: "Stav", povinny: true },
  { kluc: "zdroj", nazov: "Zdroj" },
  { kluc: "spracoval", nazov: "Spracoval" },
  { kluc: "uhrada", nazov: "Úhrada z účtu" },
];

/** „2026-08" → „august 2026" — do vety, nie do tabuľky. */
function nazovMesiaca(m: string, jazyk: string = "sk"): string {
  const [r, me] = m.split("-").map(Number);
  if (!r || !me) return m;
  return new Date(r, me - 1, 1).toLocaleDateString(lokalJazyka(jazyk), {
    month: "long",
    year: "numeric",
  });
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
  const { t, jazyk } = useT();
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
  // Naposledy otvorený doklad — zvýraznený riadok po návrate z detailu.
  const posledny = usePoslednyOtvoreny("doklady");
  // Mená kolegov pre stĺpec „Spracoval“ (profily číta server po overení členstva).
  const nacitajMena = useServerFn(menaClenovFirmy);
  const [mena, setMena] = useState<Record<string, string>>({});
  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    nacitajMena({ data: { company_id: cid } })
      .then((m) => setMena(m as Record<string, string>))
      .catch(() => setMena({}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /** Ktorý doklad je uhradený z účtu, kedy a ktorým pohybom. */
  const [uhrady, setUhrady] = useState<Record<string, { datum: string; transactionId: string }>>(
    {},
  );
  const [navrhy, setNavrhy] = useState<any[]>([]);
  const [parujem, setParujem] = useState<string | null>(null);
  const [vsetkyRiadky, setRows] = useState<any[]>([]);
  // Hľadanie a filtre sú v adrese — odkaz sa dá poslať a prežije obnovenie stránky.
  const lf = useListFilters({ pageSizeKey: "doklady" });
  /** Dohľadanie a spôsob úhrady sa filtrujú v prehliadači nad načítaným výberom. */
  const hladaj = lf.q;
  const platba = lf.filter("platba");
  const stavFiltra = lf.filter("stavDokladu");
  const stitokFiltra = lf.filter("stitok");
  const rows = useMemo(() => {
    const h = hladaj.trim().toLowerCase();
    return vsetkyRiadky.filter(
      (r) =>
        (!platba || r.payment_method === platba) &&
        splnaStavAStitok(r, stavFiltra, stitokFiltra) &&
        (!h ||
          [r.supplier_name, r.supplier_ico, r.document_number, r.note, r.komentar, r.int_poznamka, ...(r.stitky ?? [])]
            .filter(Boolean)
            .some((x) => String(x).toLowerCase().includes(h))),
    );
  }, [vsetkyRiadky, hladaj, platba, stavFiltra, stitokFiltra]);
  const zobrazenie = useNastaveniaZoznamu("doklady", STLPCE_DOKLADOV);
  const je = zobrazenie.je;
  // Číselník predkontácií sa načíta raz (len keď je stĺpec zapnutý), stavy a uzávierka vždy.
  const cis = useCiselnikyDokladov(getActiveCompanyId(), "doklad", je("predkontacia"));
  const stavPodlaId = useMemo(() => new Map(cis.stavy.map((s) => [s.id, s])), [cis.stavy]);
  /* Predkontácie pre výber v riadku — líšia sa len podľa spôsobu platby, tak
     nech sa celý číselník nezoraďuje pre každý riadok pri každom prekreslení. */
  const moznostiPredkontacie = useMemo(() => {
    const pamat = new Map<string, ReturnType<typeof moznostiKodov>>();
    return (platba: string | null) => {
      const k = String(platba);
      let m = pamat.get(k);
      if (!m) {
        m = moznostiKodov(
          zoradPodlaDokladu(cis.navrhy?.predkontacie ?? [], { typ: "blocek", platba }),
        );
        pamat.set(k, m);
      }
      return m;
    };
  }, [cis.navrhy]);
  const program = useExportDoProgramu();
  const rad = useRadenie(rows, {
    datum: (r: any) => r.issue_date,
    dodavatel: (r: any) => r.supplier_name,
    cislo: (r: any) => r.document_number,
    kategoria: (r: any) => r.category,
    zaklad: (r: any) => (r.net_amount == null ? null : Number(r.net_amount)),
    dph: (r: any) => (r.vat_amount == null ? null : Number(r.vat_amount)),
    celkom: (r: any) => (r.total_amount == null ? null : Number(r.total_amount)),
    platba: (r: any) => r.payment_method,
    stav: (r: any) => r.status,
    zdroj: (r: any) => r.source,
  });
  const sch = useStavSchvalovania(
    getActiveCompanyId(),
    "doklad",
    rows.map((r: any) => r.id),
  );
  const [loading, setLoading] = useState(true);
  /** Doklad, ktorý sa práve presúva medzi prijaté faktúry. */
  const [presuvam, setPresuvam] = useState<string | null>(null);
  const { mesiac: mesiacZAdresy, stav: zalozkaZAdresy } = Route.useSearch();
  const zalozka: ZalozkaDokladov = zalozkaZAdresy ?? "spracovane";
  const status = ZALOZKY_DOKLADOV.find((z) => z.kluc === zalozka)!.stav;
  /** Nespracované sa ukazujú zo všetkých mesiacov — nič nesmie ostať schované. */
  const bezMesiaca = zalozka === "nespracovane";
  // Mesiac zvolený v zozname (`f.mesiac`) má prednosť pred `?mesiac=` z odkazu;
  // bez oboch sa zoznam otvára na tomto mesiaci. „vsetky“ = všetky mesiace.
  const mesiacFiltra = lf.filter("mesiac");
  const month =
    mesiacFiltra === "vsetky"
      ? ""
      : /^\d{4}-\d{2}$/.test(mesiacFiltra)
        ? mesiacFiltra
        : (mesiacZAdresy ?? new Date().toISOString().slice(0, 7));
  // Stovky bločkov naraz zablokovali prehliadač — kreslí sa po dávkach.
  const postupne = usePostupneZobrazenie(rad.zoradene, {
    reset: [zalozka, month],
    potrebneId: posledny.id,
  });
  // Sken bločku vedľa zoznamu — pri kontrole netreba otvárať každý doklad zvlášť.
  const bocny = useBocnyNahlad("doklady");
  useSipkyNahladu(
    bocny.zapnuty,
    rad.zoradene.map((r: any) => r.id),
    bocny.vybrany,
    bocny.setVybrany,
  );
  /** Zmena mesiaca — `?mesiac=` z odkazu sa pri tom zahodí, nech v adrese nie sú dva. */
  function setMonth(m: string) {
    navigate({
      to: ".",
      replace: true,
      search: (prev: Record<string, unknown>) => {
        const n: Record<string, unknown> = { ...prev };
        delete n.mesiac;
        delete n.page;
        n.f = { ...((prev.f as Record<string, string>) ?? {}), mesiac: m || "vsetky" };
        return n;
      },
    } as any);
  }
  /** Koľko dokladov je mimo vybraného mesiaca a kam sa dá skočiť. */
  const [mimo, setMimo] = useState<{ pocet: number; mesiac: string | null }>({
    pocet: 0,
    mesiac: null,
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Súčty do pätičky — vybrané a tie, čo čakajú na odovzdanie.
  const vybrane = rad.zoradene.filter((r: any) => selected.has(r.id));
  const naExport = rad.zoradene.filter((r: any) => r.status === "processed" && !r.exported_at);
  async function zmenPlatbuRiadku(id: string, platbaRiadku: string) {
    const { error } = await supabase
      .from("expense_documents")
      .update({ payment_method: platbaRiadku || null } as any)
      .eq("id", id);
    if (error) return toast.error(error.message);
    setRows((rs: any[]) => rs.map((x) => (x.id === id ? { ...x, payment_method: platbaRiadku || null } : x)));
  }
  /** Predkontácia v riadku — tá istá serverová funkcia ako v úprave dokladu. */
  async function zmenPredkontaciuRiadku(id: string, kodPk: string) {
    const c = getActiveCompanyId();
    if (!c || !kodPk) return;
    try {
      const v = await zauctujDokladyFn({ data: { company_id: c, ids: [id], predkontacia: kodPk } });
      if (v.preskocenych) {
        toast.warning(t("Doklad je už odovzdaný — predkontácia sa nezmenila."));
        return;
      }
      setRows((rs: any[]) => rs.map((x) => (x.id === id ? { ...x, pohoda_predkontacia: kodPk } : x)));
    } catch (e: any) {
      toast.error(e?.message ?? t("Predkontáciu sa nepodarilo uložiť"));
    }
  }
  /** Hromadné mazanie — každý doklad ide do koša rovnako ako jednotlivo. */
  async function zmazVybrane() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!(await potvrd(t("Presunúť {n} dokladov do koša? Do 90 dní sa dajú obnoviť.", { n: ids.length })))) return;
    let ok = 0;
    const chyby: string[] = [];
    for (const id of ids) {
      try {
        await deleteFn({ data: { id } });
        ok++;
      } catch (e: any) {
        chyby.push(String(e?.message ?? e));
      }
    }
    if (ok) toast.success(t("Do koša presunuté: {n}", { n: ok }));
    if (chyby.length) toast.warning(t("Nezmazané: {n}", { n: chyby.length }), { description: chyby[0] });
    refresh();
  }
  const [predkontaciaOkno, setPredkontaciaOkno] = useState(false);
  const [kos, setKos] = useState(false);
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
      toast.success(t("Doklad označený za uhradený z účtu."));
    } catch (e: any) {
      toast.error(e?.message ?? t("Spárovať sa to nepodarilo."));
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
      toast.success(t("Párovanie zrušené."));
    } catch (e: any) {
      toast.error(e?.message ?? t("Zrušiť sa to nepodarilo."));
    }
  }

  /**
   * `ponechatVyber` — po hromadnej akcii ostane výber (ako v Prijatých faktúrach),
   * aby sa na tie isté doklady dala hneď pustiť ďalšia akcia.
   */
  async function refresh(ponechatVyber = false) {
    if (!cid) return;
    setLoading(true);
    try {
      const data = await listFn({
        data: { company_id: cid, status, month: bezMesiaca ? null : month || null },
      });
      setRows(data ?? []);
      if (ponechatVyber) {
        const v = new Set((data ?? []).map((r: any) => r.id as string));
        setSelected((s) => new Set([...s].filter((id) => v.has(id))));
      } else setSelected(new Set());
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
      toast.error(e?.message ?? t("Chyba pri načítaní"));
    } finally {
      setLoading(false);
    }
  }
  async function doPrijatych(r: any) {
    const cid = getActiveCompanyId();
    if (!cid) return;
    const popis = r.supplier_name ?? t("doklad");
    if (
      !(await potvrd(
        t(
          "Presunúť {popis} medzi prijaté faktúry? Z Dokladov zmizne, aby sa ten istý náklad nepočítal dvakrát.",
          { popis },
        ),
      ))
    )
      return;
    setPresuvam(r.id);
    try {
      const { presunDokladDoPrijatychFn } = await import("@/lib/faktero/doklad-presun.functions");
      const v: any = await presunDokladDoPrijatychFn({ data: { company_id: cid, id: r.id } });
      toast.success(t("Doklad je medzi prijatými faktúrami."));
      navigate({ to: "/prijate-faktury/$id", params: { id: v.id } });
    } catch (e: any) {
      const { friendlyError } = await import("@/lib/faktero/plan-error");
      toast.error(friendlyError(e, t("Presun sa nepodaril")));
    } finally {
      setPresuvam(null);
    }
  }

  useEffect(() => {
    refresh(); /* eslint-disable-next-line */
  }, [status, month]);

  // Záložka mení len `stav` — hľadanie, mesiac a filtre z adresy ostávajú.
  function prepniZalozku(kluc: ZalozkaDokladov) {
    navigate({
      to: "/doklady",
      search: (prev: Record<string, unknown>) => ({ ...prev, stav: kluc }),
      replace: true,
    } as any);
  }

  async function zmenStav(ids: string[], stav: "new" | "processed") {
    if (!cid || !ids.length) return;
    setMenimStav(true);
    try {
      const v = await stavFn({ data: { company_id: cid, ids, stav } });
      if (stav === "processed") {
        if (v.zmenene)
          toast.success(
            v.zmenene === 1
              ? t("Doklad je spracovaný.")
              : t("Spracovaných dokladov: {n}.", { n: v.zmenene }),
          );
        if (v.preskocene.length)
          toast.warning(
            v.preskocene.length === 1
              ? t("Jeden doklad nemá sumu alebo dátum — otvorte ho a doplňte.")
              : t("{n} dokladov nemá sumu alebo dátum — otvorte ich a doplňte.", {
                  n: v.preskocene.length,
                }),
          );
      } else if (v.zmenene) {
        toast.success(t("Vrátené medzi nespracované."));
      }
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? t("Zmena stavu sa nepodarila."));
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

  const [volbyExportu, setVolbyExportu] = useState(false);
  // Či firma posiela položky bločkov — predvolená voľba „Exportovať položky dokladu".
  const [polozkyBlockovFirmy, setPolozkyBlockovFirmy] = useState(false);
  useEffect(() => {
    if (!volbyExportu || !cid) return;
    supabase
      .from("companies")
      .select("pohoda_polozky_blockov")
      .eq("id", cid)
      .maybeSingle()
      .then(({ data }) => setPolozkyBlockovFirmy(Boolean((data as any)?.pohoda_polozky_blockov)));
  }, [volbyExportu, cid]);
  /**
   * Export do Pohody: `zip` = pohoda.xml + CSV + skeny, `xml` = len pohoda.xml
   * (pri prelome rokov jeden súbor na rok).
   */
  async function handleExport(
    markExported: boolean,
    volby?: VolbyExportu,
    format: "xml" | "zip" = volby?.format ?? "zip",
  ) {
    if (!cid) return;
    const vyber = selected.size ? rows.filter((r) => selected.has(r.id)) : rows;
    const nesprac = vyber.filter((r) => r.status === "new").length;
    if (
      markExported &&
      nesprac > 0 &&
      !(await potvrd(
        nesprac === 1
          ? t("Jeden doklad je ešte nespracovaný. Odovzdať aj ten?")
          : t("{n} dokladov je ešte nespracovaných. Odovzdať aj tie?", { n: nesprac }),
      ))
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
          datum_zauctovania: volby?.datumZauctovania ?? null,
          aj_odovzdane: volby ? volby.ajOdovzdane : undefined,
          radenie: volby?.radenie ?? null,
          polozky: volby?.polozky ?? null,
          format,
        },
      });
      const stiahni = (blob: Blob, nazov: string) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = nazov;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      };
      if (format === "xml") {
        for (const f of res.subory)
          stiahni(new Blob([f.xml], { type: "application/xml;charset=utf-8" }), f.fileName);
        toast.success(
          t("XML pre Pohodu: {n} dokladov", { n: res.v_xml }) +
            (res.subory.length > 1 ? " " + t("v {n} súboroch podľa roka", { n: res.subory.length }) : ""),
        );
        toastNeodovzdane(t, res.preskocene);
      } else {
        const bin = atob(res.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        stiahni(new Blob([bytes], { type: "application/zip" }), res.filename);
        if (!res.v_xml) {
          // Bez XML je ZIP pre Pohodu nepoužiteľný — povedať to nahlas, nie „Exportované“.
          toast.error(t("V ZIP-e nie je XML pre Pohodu — žiadny doklad neprešiel kontrolou"), {
            description: (res.preskocene ?? []).slice(0, 6).join(" · "),
            duration: 20000,
          });
        } else {
          toast.success(
            t("Exportované doklady: {n}", { n: res.count }) +
              (res.v_xml < res.count ? " · " + t("v XML pre Pohodu {n}", { n: res.v_xml }) : ""),
          );
          toastNeodovzdane(t, res.preskocene);
        }
      }
      if (markExported) refresh();
    } catch (e: any) {
      toast.error(e?.message ?? t("Export zlyhal"));
    } finally {
      setExporting(false);
    }
  }

  /** Excel z toho, čo je na obrazovke — v poradí, ako je zoznam zoradený. */
  function stiahniExcelDokladov() {
    const r = rad.zoradene as any[];
    void stiahniExcel(`doklady-${new Date().toISOString().slice(0, 10)}.xlsx`, [
      {
        nazov: t("Doklady"),
        data: tabulka(r, [
          { nazov: t("Dátum"), hodnota: (x: any) => x.issue_date },
          { nazov: t("Dodávateľ"), hodnota: (x: any) => x.supplier_name },
          { nazov: t("IČO"), hodnota: (x: any) => x.supplier_ico },
          { nazov: t("IČ DPH"), hodnota: (x: any) => x.supplier_ic_dph },
          { nazov: t("Číslo"), hodnota: (x: any) => x.document_number },
          { nazov: t("Kategória"), hodnota: (x: any) => x.category },
          { nazov: t("Základ"), hodnota: (x: any) => (x.net_amount == null ? null : Number(x.net_amount)) },
          { nazov: t("DPH"), hodnota: (x: any) => (x.vat_amount == null ? null : Number(x.vat_amount)) },
          { nazov: t("Spolu"), hodnota: (x: any) => (x.total_amount == null ? null : Number(x.total_amount)) },
          { nazov: t("Mena"), hodnota: (x: any) => x.currency },
          { nazov: t("Úhrada"), hodnota: (x: any) => x.payment_method },
          { nazov: t("Stav"), hodnota: (x: any) => t(STATUS_LABEL[x.status] ?? x.status) },
          { nazov: t("Predkontácia"), hodnota: (x: any) => x.pohoda_predkontacia },
          { nazov: t("Členenie DPH"), hodnota: (x: any) => x.pohoda_clenenie_dph },
          { nazov: t("Zdroj"), hodnota: (x: any) => t(ZDROJ_DOKLADU[x.source] ?? x.source) },
        ]),
      },
      {
        nazov: t("Položky"),
        data: tabulka(
          r.flatMap((x: any) =>
            (Array.isArray(x.items) ? x.items : []).map((p: any) => ({
              doklad: x.document_number,
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

  async function openFile(path: string) {
    try {
      const { url } = await urlFn({ data: { file_path: path } });
      window.open(url, "_blank");
    } catch (e: any) {
      toast.error(e?.message ?? t("Nedá sa otvoriť súbor"));
    }
  }

  async function del(id: string) {
    if (!(await potvrd(t("Presunúť doklad do koša? Do 90 dní sa dá obnoviť.")))) return;
    try {
      await deleteFn({ data: { id } });
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? t("Zmazanie zlyhalo"));
    }
  }

  return (
    <>
      <PageHeader
        title={t("Bločky")}
        description={t("Spracované bločky a výdavkové doklady. Nové najprv skontrolujete v Nespracovaných dokladoch.")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/importy/doklady"
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-secondary"
            >
              <UploadIcon className="h-4 w-4" /> {t("Import z Doklado")}
            </Link>
            <button
              onClick={() => handleExport(false)}
              disabled={exporting || !rows.length}
              title={t("pohoda.xml, súpiska CSV a skeny dokladov")}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> ZIP {selected.size ? `(${selected.size})` : t("všetko")}
            </button>
            <button
              onClick={() => handleExport(false, undefined, "xml")}
              disabled={exporting || !rows.length}
              title={t("Len pohoda.xml na import do Pohody, bez skenov (tie sú v ZIP-e)")}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> {t("XML pre Pohodu")}{" "}
              {selected.size ? `(${selected.size})` : t("všetko")}
            </button>
            <button
              onClick={() => setVolbyExportu(true)}
              disabled={exporting || !rows.length || (!month && !bezMesiaca && !selected.size)}
              title={
                !month && !bezMesiaca && !selected.size
                  ? t("Vyberte mesiac alebo označte doklady — inak by sa za odovzdané označili všetky.")
                  : undefined
              }
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> {t("Odovzdať účtovníkovi")}
            </button>
            <Link
              to="/doklady/novy"
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> {t("Nový doklad")}
            </Link>
            {/* Kôš a Excel sa používajú zriedka — patria do „⋯“. */}
            <HlavickaViac
              akcie={[
                { label: "Excel", icon: Download, onClick: stiahniExcelDokladov },
                { label: "Kôš", icon: Trash2, onClick: () => setKos(true) },
              ]}
            />
          </div>
        }
      />
      <PageBody>
        <div
          role="tablist"
          aria-label={t("Stav dokladov")}
          className="mb-4 flex flex-wrap gap-1 border-b border-border"
        >
          {/* Nespracované bločky majú vlastné miesto v Nespracovaných dokladoch;
              záložka ostáva len pre staré odkazy (?stav=nespracovane). */}
          {ZALOZKY_DOKLADOV.filter((z) => z.kluc !== "nespracovane" || zalozka === "nespracovane").map((z) => (
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
              {t(z.nazov)}
              {z.kluc === "nespracovane" && nespracovanych ? (
                <span className="rounded-full bg-amber-500/15 px-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                  {nespracovanych}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {!bezMesiaca && nespracovanych ? (
          <Link
            to="/nespracovane"
            className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <span>
              {nespracovanych === 1
                ? t("1 bloček čaká na kontrolu v Nespracovaných dokladoch — sem sa presunie, keď ho spracujete.")
                : t("{n} bločkov čaká na kontrolu v Nespracovaných dokladoch — sem sa presunú, keď ich spracujete.", {
                    n: nespracovanych,
                  })}
            </span>
            <span className="shrink-0 font-medium">{t("Otvoriť")} →</span>
          </Link>
        ) : null}

        {bezMesiaca && (
          <p className="mb-4 text-sm text-muted-foreground">
            {t("Sem padne každý nový doklad — z appky, z webu aj naskenovaný. Skontrolujte ho a označte ako spracovaný; ukazujú sa tu nespracované zo všetkých mesiacov.")}
          </p>
        )}

        <DocumentListToolbar
          lf={lf}
          previewToggle={bocny}
          searchPlaceholder="Dodávateľ, IČO, číslo…"
          filters={[
            {
              key: "platba",
              label: "Úhrada",
              type: "select",
              options: [
                { value: "hotovost", label: "Hotovosť" },
                { value: "karta", label: "Karta" },
                { value: "prevod", label: "Prevod" },
              ],
            },
            ...filtreStavuAStitkov(cis.stavy, cis.stitky),
          ]}
          extra={
            <>
              {/* Mesiac načítava server (a hlási doklady mimo neho) — preto ostáva
                  samostatný výber vedľa hľadania, nie rozsah vo Filtroch. */}
              {!bezMesiaca && (
                <div className="flex items-center gap-2">
                  <input
                    type="month"
                    aria-label={t("Mesiac")}
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setMonth("")}
                    disabled={!month}
                    className="h-9 rounded-md border border-input bg-background px-2 text-xs hover:bg-secondary disabled:opacity-40"
                  >
                    {t("Všetky")}
                  </button>
                </div>
              )}
              <NastaveniaZoznamu
                nastavenia={zobrazenie}
                stlpce={STLPCE_DOKLADOV}
                aktualne={{ stav: zalozka, mesiac: month, hladaj, platba }}
                pouzi={(h) => {
                  // Jedným zápisom do adresy — viac navigate po sebe by sa prepisovalo.
                  navigate({
                    to: ".",
                    replace: true,
                    search: (prev: Record<string, unknown>) => {
                      const n: Record<string, unknown> = { ...prev };
                      delete n.mesiac;
                      delete n.page;
                      if (h.stav && ZALOZKY_DOKLADOV.some((z) => z.kluc === h.stav)) n.stav = h.stav;
                      if (h.hladaj) n.q = h.hladaj;
                      else delete n.q;
                      const f: Record<string, string> = {
                        ...((prev.f as Record<string, string>) ?? {}),
                        mesiac: h.mesiac || "vsetky",
                      };
                      if (h.platba) f.platba = h.platba;
                      else delete f.platba;
                      n.f = f;
                      return n;
                    },
                  } as any);
                }}
              />
            </>
          }
        />

        <div className="mb-4 flex flex-wrap items-center gap-2">
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
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> {t("Označiť ako spracované")} (
                  {selected.size})
                </>
              ) : (
                <>
                  <Undo2 className="h-4 w-4" /> {t("Vrátiť medzi nespracované")} ({selected.size})
                </>
              )}
            </button>
          )}
          {selected.size > 0 && (
            <button
              onClick={() => setPredkontaciaOkno(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-secondary"
            >
              {t("Predkontácia")} ({selected.size})
            </button>
          )}
          {selected.size > 0 && cid && (
            <HromadnaAkciaDokladov
              companyId={cid}
              agenda="doklad"
              ids={Array.from(selected)}
              onHotovo={() => void refresh(true)}
              pdfZip={() => void handleExport(false)}
              pdfZipNazov={t("Stiahnuť ZIP (skeny + XML)")}
              xmlPohoda={() => void handleExport(false, undefined, "xml")}
              zmazat={() => void zmazVybrane()}
            />
          )}
          {selected.size > 0 && cid && (
            <VyuctovanieZVyberu companyId={cid} druh="blocek" ids={Array.from(selected)} onHotovo={refresh} />
          )}
          {selected.size > 0 && program.inyProgram && (
            <button
              onClick={async () => {
                if (await program.spusti("doklad", Array.from(selected))) await refresh();
              }}
              disabled={program.busy}
              title={t("Spracované doklady so zaúčtovaním; označia sa ako odovzdané")}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-secondary disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> {t("Export pre {program}", { program: program.nazov })} (
              {selected.size})
            </button>
          )}
          {volbyExportu ? (
            <VolbyExportuOkno
              pocet={selected.size || rows.length}
              nazov={t("Bločky do Pohody — samotné XML na import, alebo ZIP so XML a skenmi")}
              ponukaPolozky={{ predvolene: polozkyBlockovFirmy }}
              ponukaFormat
              onClose={() => setVolbyExportu(false)}
              onExport={(v) => handleExport(v.oznacit, v)}
            />
          ) : null}
        </div>

        {month && !bezMesiaca && mimo.pocet > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
            <span>
              {rows.length === 0
                ? t("V tomto mesiaci nie je žiadny doklad.")
                : mimo.pocet === 1
                  ? t("Mimo tohto mesiaca je ešte 1 doklad.")
                  : t("Mimo tohto mesiaca je ešte {n} dokladov.", { n: mimo.pocet })}{" "}
              {t("Doklady sa radia podľa dátumu vystavenia, nie podľa dňa nahratia.")}
            </span>
            {mimo.mesiac && (
              <button
                type="button"
                onClick={() => setMonth(mimo.mesiac!)}
                className="rounded-md border border-border bg-card px-2 py-1 text-xs font-medium hover:bg-secondary"
              >
                {t("Zobraziť {mesiac}", { mesiac: nazovMesiaca(mimo.mesiac, jazyk) })}
              </button>
            )}
            <button
              type="button"
              onClick={() => setMonth("")}
              className="rounded-md border border-border bg-card px-2 py-1 text-xs hover:bg-secondary"
            >
              {t("Zobraziť všetky")}
            </button>
          </div>
        )}

        <p className="mb-4 text-xs text-muted-foreground">
          {t("V balíku je")} <strong>{t("pohoda.xml")}</strong>{" "}
          {t("na priamy import do Pohody, súpiska v CSV a naskenované doklady. Predkontáciu prijatých dokladov nastavíte v Účtovníctvo → Prepojenie s Pohodou.")}
        </p>

        {/*
          Návrhy na spárovanie s platbami na účte. Hotovosť sa sem nedostane —
          v banke sa neobjaví. Nič sa nepáruje potichu, aj istá dvojica čaká na
          potvrdenie: zle priradený náklad sa v účtovníctve hľadá ťažko.
        */}
        {navrhy.length > 0 && (
          <div className="mb-4 overflow-hidden rounded-xl border border-primary/40 bg-primary/5">
            <div className="px-4 py-3 text-sm font-medium">
              {t("Našli sme platby k dokladom")} ({navrhy.length})
            </div>
            {navrhy.map((z) => (
              <div
                key={z.transactionId}
                className="flex flex-wrap items-center gap-3 border-t border-primary/20 px-4 py-3 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {z.doklad?.supplier_name ?? t("Doklad")}{" "}
                    <span className="tabular-nums">
                      {z.doklad?.total_amount != null
                        ? formatujMenu(z.doklad.total_amount, z.doklad.currency ?? "EUR")
                        : ""}
                    </span>
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {datumNaDoklade(z.pohyb?.booking_date)} ·{" "}
                    {z.dovody.map((x: string) => t(x)).join(" · ")}
                  </span>
                </span>
                {/* Pred potvrdením si treba bloček pozrieť — v bočnom náhľade, ak je zapnutý, inak v novej karte, aby zoznam návrhov ostal. */}
                {z.expenseId && (
                  <button
                    onClick={() => {
                      const id = z.expenseId as string;
                      if (bocny.aktivny() && rows.some((x: any) => x.id === id)) bocny.setVybrany(id);
                      else window.open(`/doklady/novy?id=${encodeURIComponent(id)}`, "_blank", "noopener");
                    }}
                    className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {t("Náhľad bločku")}
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

        <div className="mb-4 grid grid-cols-3 gap-3">
          <SummaryCard label={t("Základ")} value={totals.net} />
          <SummaryCard label={t("DPH")} value={totals.vat} />
          <SummaryCard label={t("Celkom")} value={totals.total} highlight />
        </div>

        <SNahladom
          zapnuty={bocny.zapnuty}
          vybrany={bocny.vybrany}
          nazov={(() => {
            const r: any = rows.find((x: any) => x.id === bocny.vybrany);
            return r ? [r.supplier_name, r.document_number].filter(Boolean).join(" · ") || t("Bloček") : null;
          })()}
          nacitaj={async (id) => {
            const r: any = vsetkyRiadky.find((x: any) => x.id === id);
            if (!r?.file_path) return null;
            // Podpísaný odkaz vydá server zo storage `expense-receipts` — sken bločku býva fotka, niekedy PDF.
            const { url } = await urlFn({ data: { file_path: r.file_path } });
            if (!url) return null;
            const pdf = (r.file_mime ?? "").includes("pdf") || /\.pdf$/i.test(r.file_path);
            return { url, obrazok: !pdf };
          }}
          onOtvorit={(id) => {
            posledny.zapamataj(id);
            navigate({ to: "/doklady/novy", search: { id } as any });
          }}
          onZavriet={() => bocny.setVybrany(null)}
        >
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          {loading ? (
            <div className="p-12 text-center text-sm text-muted-foreground">{t("Načítavam…")}</div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              <FileText className="mx-auto mb-2 h-8 w-8 opacity-40" />
              {bezMesiaca
                ? t("Všetko je spracované — žiadny doklad nečaká na kontrolu.")
                : mimo.pocet > 0
                  ? mimo.pocet === 1
                    ? t("Vo výbere nie je žiadny doklad — jeden je v inom mesiaci.")
                    : t("Vo výbere nie je žiadny doklad — {n} ich je v inom mesiaci.", { n: mimo.pocet })
                  : t("Zatiaľ tu nemáte žiadne doklady. Odfoťte blok alebo nahrajte fotku/PDF.")}
              <div className="mt-4 flex justify-center gap-2">
                {bezMesiaca ? (
                  <button
                    type="button"
                    onClick={() => prepniZalozku("vsetky")}
                    className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-secondary"
                  >
                    {t("Zobraziť všetky doklady")}
                  </button>
                ) : mimo.pocet > 0 ? (
                  <button
                    type="button"
                    onClick={() => setMonth("")}
                    className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-secondary"
                  >
                    {t("Zobraziť všetky doklady")}
                  </button>
                ) : (
                  <Link
                    to="/doklady/novy"
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                  >
                    <Camera className="h-4 w-4" /> {t("Skenovať doklad")}
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <>
            {rows.length >= 500 && (
              <p className="border-b border-border bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                {t("Zobrazuje sa 500 najnovších dokladov za tento výber — ostatné sa nezmestili, zúžte výber stavom alebo mesiacom.")}
              </p>
            )}
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
                  {je("datum") && <th className="px-3 py-2 text-left">{rad.hlavicka("datum", t("Dátum"))}</th>}
                  <th className="px-3 py-2 text-left">{rad.hlavicka("dodavatel", t("Dodávateľ"))}</th>
                  {je("cislo") && <th className="px-3 py-2 text-left">{rad.hlavicka("cislo", t("Číslo"))}</th>}
                  {je("predkontacia") && <th className="px-3 py-2 text-left">{t("Účtovná položka")}</th>}
                  {je("stavDokladu") && <th className="px-3 py-2 text-left">{t("Stav dokladu")}</th>}
                  {je("kategoria") && <th className="px-3 py-2 text-left">{rad.hlavicka("kategoria", t("Kategória"))}</th>}
                  {je("zaklad") && <th className="px-3 py-2 text-right">{rad.hlavicka("zaklad", t("Základ"))}</th>}
                  {je("dph") && <th className="px-3 py-2 text-right">{rad.hlavicka("dph", t("DPH"))}</th>}
                  {je("celkom") && <th className="px-3 py-2 text-right">{rad.hlavicka("celkom", t("Celkom"))}</th>}
                  {je("platba") && <th className="px-3 py-2 text-left">{rad.hlavicka("platba", t("Spôsob úhrady"))}</th>}
                  <th className="px-3 py-2 text-left">{rad.hlavicka("stav", t("Stav"))}</th>
                  {je("zdroj") && <th className="px-3 py-2 text-left">{rad.hlavicka("zdroj", t("Zdroj"))}</th>}
                  {je("spracoval") && <th className="hidden px-3 py-2 text-left md:table-cell">{t("Spracoval")}</th>}
                  {je("uhrada") && <th className="px-3 py-2 text-left">{t("Úhrada z účtu")}</th>}
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {postupne.viditelne.map((r) => (
                  <tr
                    key={r.id}
                    {...posledny.riadok(r.id)}
                    data-nahlad-id={r.id}
                    className={`border-t border-border ${posledny.riadok(r.id).className} ${bocny.zapnuty ? "cursor-pointer" : ""} ${bocny.zapnuty && bocny.vybrany === r.id ? "bg-primary/10" : ""}`}
                    onClick={(e) => {
                      // Pri zapnutom náhľade vyberie riadok; tlačidlá a výbery v riadku robia ďalej svoje.
                      if (!bocny.aktivny()) return;
                      const ciel = e.target as HTMLElement;
                      if (ciel.closest("button, a, input, select, textarea, label, [role='combobox'], [role='button']"))
                        return;
                      bocny.setVybrany(r.id);
                    }}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggle(r.id)}
                      />
                    </td>
                    {je("datum") && (
                      <td className="px-3 py-2 whitespace-nowrap">{datumNaDoklade(r.issue_date)}</td>
                    )}
                    <td className="px-3 py-2">
                      <button
                        onClick={() =>
                          {
                          posledny.zapamataj(r.id);
                          // Zapnutý náhľad ukáže sken vedľa zoznamu, detail sa otvorí z neho.
                          if (bocny.aktivny()) bocny.setVybrany(r.id);
                          else navigate({ to: "/doklady/novy", search: { id: r.id } as any });
                        }
                        }
                        className="text-left hover:underline"
                      >
                        {r.supplier_name ?? (
                          <span className="text-muted-foreground italic">{t("bez názvu")}</span>
                        )}
                      </button>
                      <span className="ml-1.5 inline-flex align-middle">
                        <OdovzdaneIkona kedy={r.exported_at} />
                      </span>
                      {r.supplier_ico ? (
                        <div className="text-xs text-muted-foreground">
                          {t("IČO")} {r.supplier_ico}
                        </div>
                      ) : null}
                      {r.stitky?.length ? (
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {r.stitky.map((stitok: string) => (
                            <span key={stitok} className="rounded-full bg-secondary px-1.5 text-[11px] text-muted-foreground">
                              {stitok}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {r.status === "new" && chybajuceUdaje(r).length > 0 && (
                        <div className="text-xs text-amber-700 dark:text-amber-400">
                          {t("Chýba: {polia}", { polia: chybajuceUdaje(r).map((x) => t(x)).join(", ") })}
                        </div>
                      )}
                    </td>
                    {je("cislo") && (
                      <td className="px-3 py-2">
                        {r.document_number ?? "—"}
                        {r.pohoda_predkontacia || r.pohoda_clenenie_dph ? (
                          <div
                            className="text-xs text-muted-foreground"
                            title={t("Predkontácia / členenie DPH pre Pohodu")}
                          >
                            {[r.pohoda_predkontacia, r.pohoda_clenenie_dph]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        ) : null}
                      </td>
                    )}
                    {je("predkontacia") && (
                      <td className="px-3 py-2">
                        {(() => {
                          const z = dovodZamku(r, cis.zamknuteDo);
                          return (
                            <VyberVRiadku
                              ariaLabel={t("Účtovná položka dokladu {cislo}", { cislo: r.document_number ?? "" })}
                              hodnota={r.pohoda_predkontacia}
                              moznosti={moznostiPredkontacie(r.payment_method)}
                              zamok={z ? t(NAZOV_ZAMKU[z]) : null}
                              onVyber={(v) => zmenPredkontaciuRiadku(r.id, v)}
                            />
                          );
                        })()}
                      </td>
                    )}
                    {je("stavDokladu") && (
                      <td className="px-3 py-2">
                        {cis.stavy.length ? (
                          <VyberStavuDokladu
                            kompaktny
                            tabulka="expense_documents"
                            id={r.id}
                            stavId={r.stav_id}
                            stavy={cis.stavy}
                            onZmena={(v) =>
                              setRows((rs: any[]) => rs.map((x) => (x.id === r.id ? { ...x, stav_id: v } : x)))
                            }
                          />
                        ) : (
                          <StavDokladuOdznak stav={stavPodlaId.get(r.stav_id)} />
                        )}
                      </td>
                    )}
                    {je("kategoria") && (
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {r.category ?? "—"}
                      </td>
                    )}
                    {je("zaklad") && (
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.net_amount != null ? formatujCislo(r.net_amount) : "—"}
                      </td>
                    )}
                    {je("dph") && (
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.vat_amount != null ? formatujCislo(r.vat_amount) : "—"}
                      </td>
                    )}
                    {je("celkom") && (
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                        {r.total_amount != null ? formatujMenu(r.total_amount, r.currency) : "—"}
                      </td>
                    )}
                    {je("platba") && (
                      <td className="px-3 py-2 text-xs text-muted-foreground" onClick={(e) => e.stopPropagation()}>
                        {/* Spôsob úhrady priamo v riadku — odovzdaný ani zamknutý doklad meniť nejde. */}
                        {!dovodZamku(r, cis.zamknuteDo) ? (
                          <select
                            aria-label={t("Spôsob úhrady dokladu {cislo}", { cislo: r.document_number ?? "" })}
                            value={r.payment_method ?? ""}
                            onChange={(e) => void zmenPlatbuRiadku(r.id, e.target.value)}
                            className="rounded-md border border-input bg-background px-1.5 py-1 text-xs text-foreground"
                          >
                            <option value="">—</option>
                            <option value="hotovost">{t("hotovosť")}</option>
                            <option value="karta">{t("karta")}</option>
                            <option value="prevod">{t("prevod")}</option>
                          </select>
                        ) : (
                          t(
                            ({ hotovost: "hotovosť", karta: "karta", prevod: "prevod" } as Record<string, string>)[
                              r.payment_method as string
                            ] ?? "—",
                          )
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          title={
                            r.processed_at
                              ? t("Spracované {datum}", {
                                  datum: new Date(r.processed_at).toLocaleDateString("sk-SK"),
                                })
                              : undefined
                          }
                          className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_STYLE[r.status]}`}
                        >
                          {t(STATUS_LABEL[r.status] ?? r.status)}
                        </span>
                        {r.locked_at ? (
                          <span title={t("Zamknutý doklad")} className="text-muted-foreground">
                            <Lock className="h-3.5 w-3.5" />
                          </span>
                        ) : null}
                        {sch.stavy[r.id] ? (
                          <span
                            className={`text-xs ${farbaOdznaku(sch.stavy[r.id].stav)}`}
                            title={t("Schvaľovanie")}
                          >
                            {t(sch.stavy[r.id].odznak)}
                          </span>
                        ) : null}
                        {r.status === "new" &&
                          (daSaSpracovat(r) ? (
                            <button
                              onClick={() => zmenStav([r.id], "processed")}
                              disabled={menimStav}
                              className="inline-flex items-center gap-1 rounded-md bg-emerald-600/10 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-600/20 disabled:opacity-50 dark:text-emerald-400"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" /> {t("Spracovať")}
                            </button>
                          ) : (
                            <button
                              onClick={() =>
                                {
                          posledny.zapamataj(r.id);
                          navigate({ to: "/doklady/novy", search: { id: r.id } as any });
                        }
                              }
                              className="rounded-md border border-border px-2 py-0.5 text-xs hover:bg-secondary"
                            >
                              {t("Doplniť")}
                            </button>
                          ))}
                        {r.status === "processed" && (
                          <button
                            onClick={() => zmenStav([r.id], "new")}
                            disabled={menimStav}
                            title={t("Vrátiť medzi nespracované")}
                            className="rounded-md p-0.5 text-muted-foreground hover:bg-secondary disabled:opacity-50"
                          >
                            <Undo2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                    {je("zdroj") && (
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {t(ZDROJ_DOKLADU[r.source] ?? r.source)}
                      </td>
                    )}
                    {je("spracoval") && (
                      <td className="hidden px-3 py-2 text-xs md:table-cell">
                        {(() => {
                          const sp = spracovanieDokladu(r, "doklad");
                          if (!sp) return <span className="text-muted-foreground">—</span>;
                          return (
                            <span className="block whitespace-nowrap">
                              {menoSpracovatela(sp, mena) ?? (sp.kto ? t("kolega") : "—")}
                              {sp.kedy ? (
                                <span className="block text-muted-foreground">
                                  {new Date(sp.kedy).toLocaleString(lokalJazyka(jazyk), {
                                    dateStyle: "short",
                                    timeStyle: "short",
                                  })}
                                </span>
                              ) : null}
                            </span>
                          );
                        })()}
                      </td>
                    )}
                    {je("uhrada") && (
                      <td className="px-3 py-2 text-xs whitespace-nowrap">
                        {uhrady[r.id] ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="text-emerald-700 dark:text-emerald-400">
                              {uhrady[r.id].datum}
                            </span>
                            <button
                              onClick={() => rozparuj(r.id, uhrady[r.id].transactionId)}
                              title={t("Zrušiť párovanie s platbou")}
                              className="text-muted-foreground hover:underline"
                            >
                              {t("zrušiť")}
                            </button>
                          </span>
                        ) : r.payment_method === "hotovost" ? (
                          // Hotovosť v banke nikdy nebude — pomlčka by tu vyzerala ako chýbajúci údaj.
                          <span className="text-muted-foreground">{t("hotovosť")}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right">
                      {r.file_path && (
                        <button
                          onClick={() => openFile(r.file_path)}
                          title={t("Otvoriť súbor")}
                          className="rounded-md p-1.5 hover:bg-secondary"
                        >
                          <FileText className="h-4 w-4" />
                        </button>
                      )}
                      {/* Bloček z pokladnice faktúrou nie je — presun sa ponúka len tomu, čo ňou byť môže. */}
                      {daSaPresunutMedziPrijate(r) && (
                        <button
                          onClick={() => doPrijatych(r)}
                          disabled={presuvam === r.id}
                          title={t("Presunúť medzi prijaté faktúry")}
                          className="rounded-md p-1.5 hover:bg-secondary disabled:opacity-50"
                        >
                          <FileInput className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => del(r.id)}
                        title={t("Zmazať")}
                        className="rounded-md p-1.5 hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </button>
                    </td>
                  </tr>
                ))}
                {postupne.zarazkaRiadok(100)}
              </tbody>
            </table>
            </>
          )}
          {rows.length > 0 ? (
            <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 border-t border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {/* Vybrané ukazuje lišta pod zoznamom (SuctovaListaVyberu). */}
              <span title={t("Spracované a ešte neodovzdané do účtovníctva")}>
                {t("Na export:")} <strong className="text-foreground">{naExport.length}</strong>
                {naExport.length ? ` · ${sumyDokladov(naExport)}` : ""}
              </span>
              <span>
                {t("Spolu:")} <strong className="text-foreground">{rad.zoradene.length}</strong> · {sumyDokladov(rad.zoradene)}
              </span>
            </div>
          ) : null}
        </div>
        </SNahladom>
        {kos && getActiveCompanyId() && (
          <KosDokladovOkno
            companyId={getActiveCompanyId()!}
            onClose={() => setKos(false)}
            onObnovene={refresh}
          />
        )}
        {predkontaciaOkno && getActiveCompanyId() && (
          <PredkontaciaDokladovOkno
            companyId={getActiveCompanyId()!}
            ids={Array.from(selected)}
            onClose={() => setPredkontaciaOkno(false)}
            onHotovo={refresh}
          />
        )}
        {/* Súčet označených bločkov (lišta drží spodok obrazovky). */}
        <SuctovaListaVyberu
          polozky={vybrane.map((r: any) => polozkaBlocku(r, !!uhrady[r.id]))}
          onZrusit={() => setSelected(new Set())}
        />
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
  const mena = useMenaFirmy();
  return (
    <div
      className={`min-w-0 rounded-xl border border-border p-3 sm:p-4 ${highlight ? "bg-primary/5" : "bg-card"}`}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      {/* whitespace-nowrap: „€“ sa na úzkej karte inak zalomí na nový riadok. */}
      <div className="mt-1 whitespace-nowrap text-base font-semibold tabular-nums sm:text-xl">{formatujMenu(value, mena.kod)}</div>
    </div>
  );
}
