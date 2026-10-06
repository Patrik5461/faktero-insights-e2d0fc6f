import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PAYMENT_METHODS } from "@/lib/faktero/payment-method";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { nezuctovaneZalohyFn, type NezuctovanaZaloha } from "@/lib/faktero/zalohy-odberatela.functions";
import { JAZYKY_DOKLADU, jazykDokladu } from "@/lib/faktero/faktura-jazyk";
import { getPriceContext } from "@/lib/faktero/ceny.functions";
import {
  getSalesOrderForInvoice,
  markSalesOrderInvoiced,
} from "@/lib/faktero/sales-orders.functions";
import { cenaZPodkladov, type Podklady } from "@/lib/faktero/ceny";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import {
  Trash2,
  Plus,
  Sparkles,
  Search,
  ChevronDown,
  ChevronUp,
  Package,
  Calendar,
  FileText,
  Loader2,
  Command,
  X,
  AlertTriangle,
  CreditCard,
  Link2,
  FileDown,
  Percent,
} from "lucide-react";
import { toast } from "sonner";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { useServerFn } from "@tanstack/react-start";
import { triggerEventFn } from "@/lib/faktero/email.functions";
import { aiParseInvoiceFn } from "@/lib/faktero/ai-invoice.functions";
import { ConstantSymbolCombobox } from "@/components/faktero/ConstantSymbolCombobox";
import { JobPicker } from "@/components/faktero/JobPicker";
import { DEFAULT_VAT_RATE } from "@/lib/faktero/vat-rates";
import { MENY, KROK_CENY, cenaZoSumySDph } from "@/lib/faktero/mena";
import { druhPodlaTypuFaktury } from "@/lib/faktero/ciselne-rady";
import { VyberRadu } from "@/components/faktero/VyberRadu";
import {
  koeficientZlavy,
  maZlavu,
  percentoZlavy,
  sumaZlavyDokladu,
  zakladRiadku,
  type TypZlavy,
} from "@/lib/faktero/zlavy";

import { useRezimDph } from "@/lib/faktero/krajina-firmy";
import { PoznamkaRezimuDph } from "@/components/faktero/PoznamkaRezimuDph";
import { prepocitajFakturuFn } from "@/lib/faktero/kurzy.functions";
import { jeHotovost, prekrocenyStrop } from "@/lib/faktero/hotovost";
import { skontrolujDatumy, UPRAVY_NA_VYBER } from "@/lib/faktero/faktura-nalezitosti";
import { OverenieVies } from "@/components/faktero/OverenieVies";
import { SADZBY_EU, sadzbyStatu, zakladnaSadzbaStatu } from "@/lib/faktero/sadzby-eu";
import { sadzbyRezimu, zakladnaSadzbaRezimu } from "@/lib/faktero/dph-rezim";
import { historickeSadzby } from "@/lib/faktero/vat-rates";
import { CustomerSearch } from "@/components/faktero/OdberatelPicker";
import { VyberUctu } from "@/components/faktero/banka/VyberUctu";
export const Route = createFileRoute("/_authenticated/faktury/nova")({
  head: () => ({ meta: [{ title: "Nová faktúra — Faktero" }] }),
  /**
   * `supplier_hint` a `total_hint` posiela skener dokladov. Bez nich by sa po
   * naskenovaní otvoril prázdny formulár a celé ťaženie by vyšlo nazmar.
   */
  validateSearch: (
    s: Record<string, unknown>,
  ): {
    type?: "proforma" | "credit_note";
    supplier_hint?: string;
    total_hint?: string;
    /** Faktúra vystavovaná z prijatej objednávky. */
    sales_order?: string;
    /** Dobropis k tejto faktúre — z tlačidla „Vystaviť dobropis“ na detaile. */
    opravuje?: string;
  } => ({
    opravuje: typeof s.opravuje === "string" && /^[0-9a-f-]{36}$/i.test(s.opravuje) ? s.opravuje : undefined,
    sales_order: typeof s.sales_order === "string" && s.sales_order ? s.sales_order : undefined,
    type: (s.type === "proforma" || s.type === "credit_note" ? s.type : undefined) as
      "proforma" | "credit_note" | undefined,
    supplier_hint:
      typeof s.supplier_hint === "string" && s.supplier_hint.trim() ? s.supplier_hint : undefined,
    // Router si číselný parameter sám prevedie na number, takže "42.50" sem
    // nepríde ako reťazec — kontrola na typ string by sumu ticho zahodila.
    total_hint:
      (typeof s.total_hint === "string" || typeof s.total_hint === "number") &&
      Number.isFinite(Number(s.total_hint))
        ? String(s.total_hint)
        : undefined,
  }),
  component: NewInvoice,
});

type Item = {
  name: string;
  description?: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  /** Zľava tohto riadku v percentách; jednotková cena ostáva pôvodná. */
  discount_percent?: number;
  product_id?: string | null;
  stock_item_id?: string | null;
  // UI hints (not persisted):
  _track_stock?: boolean;
  _available?: number;
  _sku?: string | null;
  /** Prečo je cena taká, aká je — „Zľava odberateľa 10 %". */
  _dovod?: string;
  /** Základná cena z katalógu, aby sa dala ukázať preškrtnutá. */
  _zakladna?: number;
  /** Cenu prepísal používateľ ručne — cenník ju už prepisovať nesmie. */
  _cena_rucne?: boolean;
  /** Sadzbu vybral človek — režim krajiny ju už neprepíše. */
  _dph_rucne?: boolean;
};
const EMPTY_ITEM: Item = {
  name: "",
  quantity: 1,
  unit: "ks",
  unit_price: 0,
  vat_rate: DEFAULT_VAT_RATE,
  discount_percent: 0,
};

type StockMeta = {
  stock_item_id: string;
  track_stock: boolean;
  available: number;
  sku: string | null;
};

function NewInvoice() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const triggerEvt = useServerFn(triggerEventFn);
  const aiParse = useServerFn(aiParseInvoiceFn);
  const prepocitaj = useServerFn(prepocitajFakturuFn);
  /* Sadzby DPH vyplývajú z krajiny registrácie firmy, nenastavujú sa ručne. */
  const rezim = useRezimDph();
  const krajina = rezim.krajina;
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [stockByProduct, setStockByProduct] = useState<Record<string, StockMeta>>({});
  const [warehouseName, setWarehouseName] = useState<string>("");
  const [company, setCompany] = useState<any>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    type: (search.type ?? "regular") as "regular" | "proforma" | "credit_note",
    customer_id: "",
    issue_date: new Date().toISOString().slice(0, 10),
    delivery_date: new Date().toISOString().slice(0, 10),
    due_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    variable_symbol: "",
    constant_symbol: "",
    specific_symbol: "",
    order_number: "",
    currency: "EUR",
    payment_method: "bank_transfer",
    /** Účet, na ktorý majú prísť peniaze; prázdny = predvolený účet firmy. */
    payment_account_id: "" as string,
    delivery_method: "",
    rounding_mode: "per_document" as "per_item" | "per_document" | "retail",
    reverse_charge: false,
    reverse_charge_type: "" as "" | "domestic_69" | "eu_b2b" | "export",
    /* Súhrnný výkaz potrebuje vedieť, čo sa do EÚ dodalo — z položiek to nevyplýva. */
    eu_plnenie: "tovar" as "tovar" | "sluzba" | "trojstranny",
    /* Predaj spotrebiteľovi v EÚ — daň sa odvádza cez OSS sadzbou jeho štátu. */
    oss: false,
    oss_country: "",
    /* Úprava zdaňovania prirážky — cestovné kancelárie a použitý tovar. */
    osobitna_uprava: "",
    /* Jazyk PDF dokladu; predvolí sa z odberateľa. */
    language: "sk",
    advance_invoice_id: "" as string | "",
    opravuje_fakturu_id: "" as string | "",
    advance_amount: 0,
    job_id: "",
    notes: "",
    intro_note: "",
    /* Zľava na celý doklad — percento alebo pevná suma bez DPH. */
    discount_type: "" as "" | TypZlavy,
    discount_value: 0,
    /* Číselný rad, z ktorého sa vezme číslo. Prázdny = predvolený pre druh. */
    number_series_id: "",
  });
  /*
    Krajina firmy dobehne až po načítaní. Prvé vykreslenie preto nesie
    slovenskú predvolenú sadzbu a českej firme by v položke ostalo 23 % —
    sadzba, ktorú vôbec neuplatňuje. Riadky, ktorých sa človek nedotkol, sa
    prepnú na základnú sadzbu jeho krajiny; ručne vybranú sadzbu neprepisujeme.
  */
  const [items, setItems] = useState<Item[]>(() => {
    // Predvyplnenie zo skenera dokladov. Suma ide ako jedna položka za 1 ks —
    // rozpis položiek z dokladu nemáme, len celkovú sumu.
    const total = Number(search.total_hint);
    if (!search.supplier_hint && !Number.isFinite(total)) return [{ ...EMPTY_ITEM }];
    return [
      {
        ...EMPTY_ITEM,
        name: search.supplier_hint ? `Doklad — ${search.supplier_hint}` : "Naskenovaný doklad",
        unit_price: Number.isFinite(total) ? total : 0,
      },
    ];
  });
  /* Pri predaji do EÚ cez OSS sa účtuje sadzbami štátu zákazníka. */
  const sadzbyPolozky =
    form.oss && form.oss_country ? sadzbyStatu(form.oss_country) : sadzbyRezimu(rezim);
  /*
    Historické sadzby patria do zoznamu zvlášť: faktúra k zálohovej faktúre
    z minulého roka alebo dodávka spred zmeny zákona nesie sadzbu, ktorá vtedy
    platila. Pri OSS sa neponúkajú — tam rozhoduje štát zákazníka.
  */
  const historickeSadzbyDokladu = useMemo(
    () =>
      form.oss && form.oss_country
        ? []
        : historickeSadzby(rezim.krajina, form.delivery_date || form.issue_date).filter(
            (h) => !sadzbyPolozky.includes(h.sadzba),
          ),
    [form.oss, form.oss_country, rezim.krajina, form.delivery_date, form.issue_date, sadzbyPolozky],
  );
  /**
    Základná sadzba, ktorú má dostať riadok, ktorého sa človek nedotkol.
    Pri OSS je to sadzba štátu spotreby — inak by na faktúre do Rakúska
    ostalo slovenských 23 %, hoci sa má odviesť rakúskych 20 %.
  */
  const zakladnaSadzba =
    form.oss && form.oss_country ? zakladnaSadzbaStatu(form.oss_country) : zakladnaSadzbaRezimu(rezim);
  /* Skratka ⌘I visí na listeneri bez závislostí, tak jej sadzbu podávam cez ref. */
  const sadzbaRef = useRef(zakladnaSadzba);
  sadzbaRef.current = zakladnaSadzba;
  useEffect(() => {
    setItems((rs) =>
      rs.some((r) => !r._dph_rucne && r.vat_rate !== zakladnaSadzba)
        ? rs.map((r) => (r._dph_rucne ? r : { ...r, vat_rate: zakladnaSadzba }))
        : rs,
    );
  }, [krajina, rezim.platitel, form.oss, form.oss_country]);

  const [pickerOpen, setPickerOpen] = useState<null | "copy" | "advance" | "opravuje">(null);

  /**
   * Podklady cenníka pre tohto odberateľa a tento dátum. Načítajú sa raz na
   * doklad; cenu každého riadku počíta formulár sám cez `cenaZPodkladov`.
   */
  const [podklady, setPodklady] = useState<(Podklady & { maCennik: boolean }) | null>(null);

  /**
   * Faktúra z prijatej objednávky. Prenesú sa len množstvá, ktoré ešte
   * zostávajú vybaviť — inak by sa pri druhej faktúre z tej istej objednávky
   * vyfakturovalo druhýkrát to isté.
   */
  const nacitajObjednavku = useServerFn(getSalesOrderForInvoice);
  const oznacVyfakturovane = useServerFn(markSalesOrderInvoiced);
  const [objednavka, setObjednavka] = useState<any>(null);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid || !search.sales_order) return;
    nacitajObjednavku({ data: { company_id: cid, id: search.sales_order } })
      .then((o: any) => {
        setObjednavka(o);
        if (!o.polozky?.length) {
          toast.error("Objednávka je už celá vyfakturovaná.");
          return;
        }
        setForm((f) => ({
          ...f,
          customer_id: o.customer_id ?? f.customer_id,
          order_number: o.customer_order_number ?? o.order_number ?? f.order_number,
          job_id: o.job_id ?? f.job_id,
          currency: o.currency ?? f.currency,
        }));
        setItems(
          o.polozky.map((p: any) => ({
            ...EMPTY_ITEM,
            name: p.name,
            description: p.description ?? "",
            quantity: Number(p.quantity),
            unit: p.unit ?? "ks",
            unit_price: Number(p.unit_price),
            vat_rate: Number(p.vat_rate),
            product_id: p.product_id ?? null,
            stock_item_id: p.stock_item_id ?? null,
            // Ceny dohodnuté v objednávke sa cenníkom neprepisujú.
            _cena_rucne: true,
          })),
        );
      })
      .catch((e: any) => toast.error(e?.message ?? "Objednávku sa nepodarilo načítať"));
  }, [search.sales_order, nacitajObjednavku]);

  /*
    Dobropis z detailu faktúry: odberateľ, mena, režim DPH, väzba na faktúru a
    položky so záporným množstvom. Človek potom len zmaže, čo sa nevracia —
    kladný dobropis by eFaktúra poslala ako ťarchopis.
  */
  const [opravujeCislo, setOpravujeCislo] = useState("");
  const [hladajOpravovanu, setHladajOpravovanu] = useState("");
  const [hladamOpravovanu, setHladamOpravovanu] = useState(false);

  async function predvyplnDobropis(invoiceId: string, sPolozkami: boolean) {
    const cid = getActiveCompanyId();
    if (!cid) return;
    {
      const { data: f } = await supabase
        .from("invoices")
        .select(
          "id, invoice_number, type, customer_id, currency, language, reverse_charge, reverse_charge_type, eu_plnenie, oss, oss_country, osobitna_uprava, job_id, order_number, rounding_mode",
        )
        .eq("company_id", cid)
        .eq("id", invoiceId)
        .maybeSingle();
      if (!f) return toast.error("Faktúru na dobropis sa nepodarilo načítať");
      if ((f as any).type !== "regular")
        return toast.error("Dobropis sa vystavuje k bežnej faktúre, nie k zálohovej ani k dobropisu.");
      setOpravujeCislo(String((f as any).invoice_number ?? ""));
      if (!sPolozkami) {
        setForm((x) => ({ ...x, opravuje_fakturu_id: (f as any).id }));
        return;
      }
      const { data: polozky } = await supabase
        .from("invoice_items")
        .select("name, description, quantity, unit, unit_price, vat_rate, discount_percent, product_id, stock_item_id")
        .eq("invoice_id", f.id)
        .order("position");
      const ff = f as any;
      setForm((x) => ({
        ...x,
        type: "credit_note",
        customer_id: ff.customer_id ?? x.customer_id,
        currency: ff.currency ?? x.currency,
        language: ff.language ?? x.language,
        reverse_charge: !!ff.reverse_charge,
        reverse_charge_type: ff.reverse_charge_type ?? "",
        eu_plnenie: ff.eu_plnenie ?? x.eu_plnenie,
        oss: !!ff.oss,
        oss_country: ff.oss_country ?? "",
        osobitna_uprava: ff.osobitna_uprava ?? "",
        job_id: ff.job_id ?? "",
        order_number: ff.order_number ?? "",
        rounding_mode: ff.rounding_mode ?? x.rounding_mode,
        opravuje_fakturu_id: ff.id,
      }));
      if (polozky?.length)
        setItems(
          polozky.map((p: any) => ({
            ...EMPTY_ITEM,
            name: p.name,
            description: p.description ?? "",
            quantity: -Math.abs(Number(p.quantity)),
            unit: p.unit ?? "ks",
            unit_price: Number(p.unit_price),
            vat_rate: Number(p.vat_rate),
            discount_percent: Number(p.discount_percent ?? 0),
            product_id: p.product_id ?? null,
            stock_item_id: p.stock_item_id ?? null,
            _cena_rucne: true,
          })),
        );
      toast.success(`Dobropis k faktúre ${ff.invoice_number} — upravte, čo sa vracia`);
    }
  }

  /** Priradenie opravovanej faktúry podľa jej čísla alebo variabilného symbolu. */
  async function priradPodlaVs() {
    const cid = getActiveCompanyId();
    const q = hladajOpravovanu.trim().replace(/[^\w\-/. ]/g, "");
    if (!cid || !q) return;
    setHladamOpravovanu(true);
    try {
      const { data } = await supabase
        .from("invoices")
        .select("id, invoice_number, customer_name, total, currency")
        .eq("company_id", cid)
        .eq("type", "regular")
        .neq("status", "draft")
        .is("deleted_at", null)
        .or(`invoice_number.eq.${q},variable_symbol.eq.${q}`)
        .limit(5);
      if (!data?.length) return toast.error(`Faktúra s číslom ani VS „${q}“ sa nenašla.`);
      if (data.length > 1) {
        toast.message("Tomu zodpovedá viac faktúr — vyberte zo zoznamu.");
        setPickerOpen("opravuje");
        return;
      }
      const f = data[0] as any;
      setForm((x) => ({ ...x, opravuje_fakturu_id: f.id, customer_id: x.customer_id || "" }));
      setOpravujeCislo(f.invoice_number);
      setHladajOpravovanu("");
      // Prázdny dobropis si rovno vezme položky faktúry so záporným množstvom.
      const prazdny = items.every((i) => !i.name.trim() && !Number(i.unit_price));
      await predvyplnDobropis(f.id, prazdny);
      if (!prazdny) toast.success(`Dobropis opravuje faktúru ${f.invoice_number}`);
    } finally {
      setHladamOpravovanu(false);
    }
  }

  useEffect(() => {
    if (search.opravuje) void predvyplnDobropis(search.opravuje, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.opravuje]);
  const nacitajCennik = useServerFn(getPriceContext);
  const nacitajZalohy = useServerFn(nezuctovaneZalohyFn);
  /* Zaplatené zálohy odberateľa, ktoré ešte nikto nezúčtoval. */
  const [nezuctovane, setNezuctovane] = useState<NezuctovanaZaloha[]>([]);
  /*
    Zálohy odpočítané na tejto faktúre. Pri etapovej dodávke ich býva viac —
    doteraz sa dala pripojiť len jedna a zvyšok dopočítaval človek ručne.
  */
  const [odpocty, setOdpocty] = useState<{ id: string; cislo: string; suma: number }[]>([]);
  // Pri prvom načítaní sa ceny už zadaných riadkov neprepisujú — mohli prísť
  // z kópie faktúry alebo zo skenera a prepísať ich by bola tichá zmena sumy.
  const cennikPrvyRaz = useRef(true);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid || !form.issue_date) return;
    let zrusene = false;
    nacitajCennik({
      data: { company_id: cid, customer_id: form.customer_id || null, datum: form.issue_date },
    })
      .then((p: any) => {
        if (!zrusene) setPodklady(p);
      })
      .catch(() => {
        if (!zrusene) setPodklady(null);
      });
    return () => {
      zrusene = true;
    };
  }, [form.customer_id, form.issue_date, nacitajCennik]);

  /*
    Jazyk dokladu sa predvolí podľa odberateľa — kto fakturuje do Rakúska,
    nemá ho prepínať pri každej faktúre znovu. Ručnú zmenu to neprepisuje,
    lebo beží len pri zmene odberateľa.
  */
  useEffect(() => {
    if (!form.customer_id) return;
    const odb = customers.find((c) => c.id === form.customer_id) as any;
    if (!odb) return;
    setForm((f) => ({ ...f, language: jazykDokladu(odb.invoice_language) }));
  }, [form.customer_id, customers]);

  /*
    Nezúčtované zálohy odberateľa. Bez upozornenia sa na zaplatenú zálohu ľahko
    zabudne a to isté plnenie sa vyfakturuje druhýkrát — chyba, ktorá sa hľadá
    ťažko, lebo oba doklady vyzerajú v poriadku.
  */
  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid || !form.customer_id || form.type !== "regular") {
      setNezuctovane([]);
      return;
    }
    let zrusene = false;
    nacitajZalohy({ data: { company_id: cid, customer_id: form.customer_id } })
      .then((z: any) => {
        if (!zrusene) setNezuctovane(z ?? []);
      })
      .catch(() => {
        if (!zrusene) setNezuctovane([]);
      });
    return () => {
      zrusene = true;
    };
  }, [form.customer_id, form.type, nacitajZalohy]);

  // Po zmene odberateľa sa prepočítajú riadky, do ktorých používateľ nesiahol.
  useEffect(() => {
    if (!podklady) return;
    if (cennikPrvyRaz.current) {
      cennikPrvyRaz.current = false;
      return;
    }
    setItems((arr) =>
      arr.map((it) => {
        if (!it.product_id || it._cena_rucne) return it;
        const produkt = products.find((p) => p.id === it.product_id);
        if (!produkt) return it;
        const r = cenaZPodkladov(
          podklady,
          { id: it.product_id, unit_price: produkt.unit_price },
          Number(it.quantity) || 0,
        );
        return {
          ...it,
          unit_price: r.cena,
          _dovod: r.zdroj === "zakladna" ? undefined : r.dovod,
          _zakladna: r.zdroj === "zakladna" ? undefined : r.zakladna,
        };
      }),
    );
  }, [podklady, products]);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    supabase
      .from("customers")
      .select(
        "id, name, ico, dic, ic_dph, street, city, zip, country, email, invoice_language, vies_platne, vies_overene_at",
      )
      .eq("company_id", cid)
      .order("name")
      .then(({ data }) => setCustomers(data ?? []));
    supabase
      .from("products")
      .select("id, name, unit, unit_price, vat_rate, description")
      .eq("company_id", cid)
      .eq("active", true)
      .order("name")
      .then(({ data }) => setProducts(data ?? []));
    supabase
      .from("companies")
      .select("*")
      .eq("id", cid)
      .single()
      .then(({ data }) => {
        if (data) {
          setCompany(data);
          setForm((f) => ({ ...f, currency: data.default_currency || "EUR" }));
        }
      });
    // Build product_id → stock metadata map
    (async () => {
      const [{ data: si }, { data: lvl }, { data: wh }] = await Promise.all([
        supabase
          .from("stock_items")
          .select("id, product_id, sku, track_stock")
          .eq("company_id", cid),
        supabase.from("stock_levels").select("stock_item_id, quantity").eq("company_id", cid),
        supabase
          .from("warehouses")
          .select("id, name")
          .eq("company_id", cid)
          .eq("active", true)
          .order("created_at")
          .limit(1),
      ]);
      const totals = new Map<string, number>();
      (lvl ?? []).forEach((l: any) =>
        totals.set(l.stock_item_id, (totals.get(l.stock_item_id) ?? 0) + Number(l.quantity)),
      );
      const m: Record<string, StockMeta> = {};
      (si ?? []).forEach((s: any) => {
        if (!s.product_id) return;
        m[s.product_id] = {
          stock_item_id: s.id,
          track_stock: !!s.track_stock,
          available: totals.get(s.id) ?? 0,
          sku: s.sku ?? null,
        };
      });
      setStockByProduct(m);
      if (wh?.[0]) setWarehouseName(wh[0].name);
    })();
  }, []);
  void company;

  // Keyboard shortcuts: Cmd/Ctrl+Enter submit, Cmd/Ctrl+K AI, Cmd/Ctrl+I new item
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "Enter") {
        e.preventDefault();
        document.getElementById("invoice-submit")?.click();
      } else if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAiOpen(true);
      } else if (e.key.toLowerCase() === "i") {
        e.preventDefault();
        setItems((arr) => [...arr, { ...EMPTY_ITEM, vat_rate: sadzbaRef.current }]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /*
    Riadok bez názvu aj bez sumy je len prázdne miesto vo formulári — do
    dokladu ani do súčtov nepatrí. Riadok so sumou bez názvu prepustíme do
    súčtov a odoslanie ho zastaví hláškou, nech sa suma ticho nestratí.
  */
  const riadkyDokladu = useMemo(
    () => items.filter((it) => it.name.trim() !== "" || Number(it.unit_price) !== 0),
    [items],
  );
  const totals = useMemo(() => {
    const mode = form.rounding_mode;
    const rc = form.reverse_charge;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    let sub = 0,
      vat = 0;
    for (const it of riadkyDokladu) {
      // Riadková zľava je už v základe; jednotková cena ostáva pôvodná, nech
      // je na doklade vidieť, z čoho sa zľavovalo.
      let s = zakladRiadku(it.quantity, it.unit_price, it.discount_percent);
      let v = rc ? 0 : s * (Number(it.vat_rate) / 100);
      if (mode === "per_item") {
        s = r2(s);
        v = r2(v);
      }
      sub += s;
      vat += v;
    }
    /*
      Zľava na celý doklad sa nerozdeľuje po riadkoch — prenásobí základ aj
      daň tým istým koeficientom. Pomer medzi sadzbami tak ostane a DPH vyjde
      rovnako, ako keby bola dohodnutá nižšia cena od začiatku.
    */
    const medzisucet = r2(sub);
    const zlava = sumaZlavyDokladu(sub, {
      typ: form.discount_type || null,
      hodnota: Number(form.discount_value),
    });
    if (zlava > 0) {
      const k = koeficientZlavy(sub, zlava);
      sub = sub * k;
      vat = vat * k;
    }
    let total = sub + vat;
    if (mode === "per_document") {
      sub = r2(sub);
      vat = r2(vat);
      total = r2(sub + vat);
    }
    if (mode === "retail") {
      sub = r2(sub);
      vat = r2(vat);
      total = Math.round((sub + vat) * 20) / 20;
    }
    const advance = Math.round(odpocty.reduce((a, z) => a + z.suma, 0) * 100) / 100;
    const payable = r2(total - advance);
    return { subtotal: sub, vat_total: vat, total, advance, payable, medzisucet, zlava };
  }, [
    riadkyDokladu,
    form.rounding_mode,
    odpocty,
    form.reverse_charge,
    form.discount_type,
    form.discount_value,
  ]);

  /**
   * Cena z riadku sa počíta z podkladov cenníka, nie na serveri — množstevná
   * cena závisí od množstva na riadku a to server v čase načítania nepozná.
   * Riadok, do ktorého používateľ zasiahol, sa už neprepisuje.
   */
  function cenaRiadku(it: Item, mnozstvo: number): Partial<Item> {
    if (!podklady || !it.product_id || it._cena_rucne) return {};
    const produkt = products.find((p) => p.id === it.product_id);
    if (!produkt) return {};
    const r = cenaZPodkladov(
      podklady,
      { id: it.product_id, unit_price: produkt.unit_price },
      mnozstvo,
    );
    return {
      unit_price: r.cena,
      _dovod: r.zdroj === "zakladna" ? undefined : r.dovod,
      _zakladna: r.zdroj === "zakladna" ? undefined : r.zakladna,
    };
  }

  /**
    Do stĺpca Spolu sa dá napísať suma, ktorú má zákazník za riadok zaplatiť —
    jednotková cena bez dane sa z nej dopočíta. Ľudia sa dohadujú na sume
    s daňou a cenu bez nej inak hľadajú na kalkulačke.
  */
  function nastavSpolu(idx: number, spolu: number) {
    const it = items[idx];
    if (!it) return;
    const sadzba = form.reverse_charge ? 0 : it.vat_rate;
    // So zľavou riadku sa počíta späť: napísaná suma je to, čo zákazník platí.
    const zlava = percentoZlavy(it.discount_percent);
    const cena = cenaZoSumySDph(spolu, it.quantity, sadzba);
    setItem(idx, {
      unit_price: zlava >= 100 ? cena : Number((cena / (1 - zlava / 100)).toFixed(5)),
      _cena_rucne: true,
    });
  }

  function setItem(idx: number, patch: Partial<Item>) {
    setItems((arr) =>
      arr.map((it, i) => {
        if (i !== idx) return it;
        const novy = { ...it, ...patch };
        // Zmena množstva môže preklopiť riadok do inej množstevnej ceny.
        if (patch.quantity !== undefined && patch.unit_price === undefined) {
          return { ...novy, ...cenaRiadku(novy, Number(patch.quantity) || 0) };
        }
        return novy;
      }),
    );
  }

  async function generateNumber(
    companyId: string,
    issueDate: string,
    typ: string,
    seriesId?: string,
  ) {
    // Server-side, transactional (SELECT ... FOR UPDATE) — supports {YYYY} {YY} {MM} {NN}-{NNNN}
    // Zálohová faktúra si berie číslo z vlastnej rady (ZF…).
    const { data, error } = await supabase.rpc("faktero_next_invoice_number", {
      _company_id: companyId,
      _issue_date: issueDate,
      _type: typ,
      _series_id: seriesId || null,
    } as never);
    if (error) throw new Error(error.message);
    const row = data as unknown as {
      invoice_number: string;
      sequence_number: number;
      series_id?: string | null;
    } | null;
    if (!row?.invoice_number) throw new Error("Nepodarilo sa vygenerovať číslo faktúry.");
    return {
      invoice_number: row.invoice_number,
      sequence_number: Number(row.sequence_number),
      series_id: row.series_id ?? null,
    };
  }

  async function runAi() {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const r = await aiParse({ data: { prompt: aiPrompt } });
      if (r.items.length) {
        setItems(r.items.map((it) => ({ ...EMPTY_ITEM, ...it })));
      }
      if (r.notes) setForm((f) => ({ ...f, notes: r.notes! }));
      if (r.currency) setForm((f) => ({ ...f, currency: r.currency! }));
      if (r.customer_hint) {
        const match = customers.find((c) =>
          c.name.toLowerCase().includes(r.customer_hint!.toLowerCase()),
        );
        if (match) setForm((f) => ({ ...f, customer_id: match.id }));
      }
      toast.success("Položky vyplnené pomocou AI");
      setAiOpen(false);
      setAiPrompt("");
    } catch (e: any) {
      toast.error(e?.message ?? "AI chyba");
    } finally {
      setAiLoading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const cid = getActiveCompanyId();
    if (!cid) return;
    const cust = customers.find((c) => c.id === form.customer_id);
    if (!cust) return toast.error("Vyberte odberateľa");
    /*
      Položky povinné nie sú — doklad môže znieť len na text nad položkami
      (nájomné, paušál, práce podľa zmluvy). Povinný je preto ten text.
    */
    if (!form.intro_note.trim()) {
      return toast.error("Vyplňte text nad položkami — hovorí, čo sa fakturuje.");
    }
    const bezNazvu = riadkyDokladu.find((it) => !it.name.trim());
    if (bezNazvu) return toast.error("Položka so sumou musí mať názov.");
    // Dátum dodania je na faktúre platiteľa povinný a určuje obdobie DPH.
    const datumy = skontrolujDatumy({
      platitel: rezim.platitel,
      datumDodania: form.delivery_date,
      datumVystavenia: form.issue_date,
    });
    if (datumy.chyba) return toast.error(datumy.chyba);
    if (datumy.upozornenie) toast.warning(datumy.upozornenie);
    // Reverse charge validations
    if (form.reverse_charge && form.reverse_charge_type === "eu_b2b") {
      const vat = (cust.ic_dph || "").trim();
      if (!vat) {
        return toast.error(
          "Pri intrakomunitárnom dodaní (EÚ B2B) je IČ DPH odberateľa povinné. Doplňte ho v karte odberateľa.",
        );
      }
      if (!/^[A-Z]{2}[A-Z0-9]{2,}$/i.test(vat)) {
        return toast.error("IČ DPH odberateľa musí byť v platnom EU formáte (napr. CZ12345678).");
      }
      if (/^SK/i.test(vat)) {
        return toast.error(
          "Pri intrakomunitárnom dodaní musí byť odberateľ z iného členského štátu EÚ (nie SK).",
        );
      }
    }
    // Block submit if any stock-tracked line exceeds available
    const offending = items.find(
      (it) =>
        it.stock_item_id && it._track_stock && Number(it.quantity) > Number(it._available ?? 0),
    );
    if (offending) {
      toast.error(
        `Na sklade nie je dostatok kusov pre „${offending.name}". Dostupné: ${offending._available ?? 0}.`,
      );
      return;
    }
    setSubmitting(true);

    try {
      const { invoice_number, sequence_number, series_id } = await generateNumber(
        cid,
        form.issue_date,
        form.type,
        form.number_series_id,
      );
      const variable_symbol = form.variable_symbol || invoice_number.replace(/\D/g, "");

      const { data: inv, error } = await supabase
        .from("invoices")
        .insert({
          company_id: cid,
          customer_id: cust.id,
          type: form.type,
          status: "issued",
          invoice_number,
          sequence_number,
          number_series_id: series_id,
          variable_symbol,
          constant_symbol: form.constant_symbol || null,
          specific_symbol: form.specific_symbol || null,
          order_number: form.order_number || null,
          delivery_method: form.delivery_method || null,
          rounding_mode: form.rounding_mode,
          reverse_charge: form.reverse_charge,
          eu_plnenie:
            form.reverse_charge && form.reverse_charge_type === "eu_b2b" ? form.eu_plnenie : null,
          oss: form.oss,
          oss_country: form.oss ? form.oss_country : null,
          osobitna_uprava: form.osobitna_uprava || null,
          language: form.language || null,
          reverse_charge_type: form.reverse_charge
            ? form.reverse_charge_type || "domestic_69"
            : null,
          // Prvá záloha aj v stĺpci kvôli staršiemu rozhraniu; celý zoznam sa
          // zapisuje nižšie do `invoice_advances`.
          advance_invoice_id: odpocty[0]?.id ?? null,
          payment_account_id: form.payment_account_id || null,
          opravuje_fakturu_id: form.opravuje_fakturu_id || null,
          advance_amount: odpocty.length ? totals.advance : null,
          job_id: form.job_id || null,
          issue_date: form.issue_date,
          // Dátum dodania je nepovinný a dátumové pole sa dá vyprázdniť.
          // Prázdny reťazec Postgres odmietne s „invalid input syntax for
          // type date" a faktúra sa neuloží.
          delivery_date: form.delivery_date || null,
          due_date: form.due_date,
          currency: form.currency,
          payment_method: form.payment_method,
          customer_name: cust.name,
          customer_ico: cust.ico,
          customer_dic: cust.dic,
          customer_ic_dph: cust.ic_dph,
          customer_street: cust.street,
          customer_city: cust.city,
          customer_zip: cust.zip,
          customer_country: cust.country,
          customer_email: cust.email,
          subtotal: Number(totals.subtotal.toFixed(2)),
          vat_total: Number(totals.vat_total.toFixed(2)),
          total: Number(totals.total.toFixed(2)),
          notes: form.notes,
          intro_note: form.intro_note.trim() || null,
          // Zľava na doklad: typ a zadaná hodnota kvôli doúčtovaniu a PDF,
          // discount_total je jej suma bez DPH, ktorú súčty už odpočítali.
          discount_type: totals.zlava > 0 ? form.discount_type || "percent" : null,
          discount_value: totals.zlava > 0 ? Number(form.discount_value) : 0,
          discount_total: totals.zlava,
        })
        .select()
        .single();
      if (error || !inv) {
        const { friendlyError } = await import("@/lib/faktero/plan-error");
        toast.error(friendlyError(error));
        setSubmitting(false);
        return;
      }

      const rows = riadkyDokladu.map((it, idx) => {
        // Sumy riadku sú po jeho vlastnej zľave; zľava na doklad sa do
        // riadkov nepremieta, tá sedí v hlavičke.
        const s = zakladRiadku(it.quantity, it.unit_price, it.discount_percent);
        const effRate = form.reverse_charge ? 0 : Number(it.vat_rate);
        const v = s * (effRate / 100);
        return {
          invoice_id: inv.id,
          position: idx,
          name: it.name,
          description: it.description,
          product_id: it.product_id ?? null,
          stock_item_id: it.stock_item_id ?? null,
          quantity: it.quantity,
          unit: it.unit,
          unit_price: it.unit_price,
          discount_percent: percentoZlavy(it.discount_percent),
          vat_rate: effRate,
          subtotal: Number(s.toFixed(2)),
          vat_amount: Number(v.toFixed(2)),
          total: Number((s + v).toFixed(2)),
        };
      });
      const { error: e2 } = rows.length
        ? await supabase.from("invoice_items").insert(rows)
        : { error: null };
      if (e2) {
        toast.error(e2.message);
        setSubmitting(false);
        return;
      }

      if (odpocty.length) {
        const { error: e3 } = await supabase.from("invoice_advances").insert(
          odpocty.map((z) => ({
            company_id: cid,
            invoice_id: inv.id,
            advance_invoice_id: z.id,
            amount: z.suma,
          })),
        );
        if (e3) {
          // Bez zapísaných odpočtov by faktúra pýtala celú sumu znovu.
          toast.error(`Odpočet zálohy sa nezapísal: ${e3.message}`);
          setSubmitting(false);
          return;
        }
      }

      try {
        await triggerEvt({
          data: {
            companyId: cid,
            event: "invoice.created",
            data: {
              invoice_id: inv.id,
              invoice_number: inv.invoice_number,
              status: inv.status,
              total: Number(inv.total),
              currency: inv.currency,
              external_id: inv.external_id ?? null,
              customer_id: inv.customer_id ?? null,
              customer_name: inv.customer_name,
              customer_email: inv.customer_email,
            },
          },
        });
      } catch (e) {
        console.warn("[webhook] invoice.created trigger zlyhal", e);
      }

      // Vybavenie objednávky sa posúva až tu — keď faktúra naozaj existuje.
      if (search.sales_order) {
        try {
          await oznacVyfakturovane({
            data: {
              company_id: cid,
              id: search.sales_order,
              invoice_id: inv.id,
              polozky: items
                .filter((it) => it.name?.trim())
                .map((it) => ({
                  name: it.name.trim(),
                  product_id: it.product_id ?? null,
                  quantity: Number(it.quantity) || 0,
                })),
            },
          });
        } catch (e: any) {
          toast.error(
            "Faktúra vznikla, ale objednávku sa nepodarilo označiť za vybavenú: " +
              (e?.message ?? ""),
          );
        }
      }

      // Faktúra v cudzej mene musí niesť daň aj v eurách — kurz sa doťahuje
      // na serveri hneď po vystavení, aby ho mala aj tlač a výkazy k DPH.
      if (form.currency && form.currency !== "EUR") {
        try {
          await prepocitaj({ data: { invoice_id: inv.id } });
        } catch {
          toast.warning("Kurz ECB sa nepodarilo načítať — daň v eurách doplňte pred podaním DPH.");
        }
      }

      toast.success("Faktúra vytvorená");
      navigate({ to: "/faktury/$id", params: { id: inv.id } });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title={form.type === "credit_note" ? "Nový dobropis" : form.type === "proforma" ? "Nová zálohová faktúra" : "Nová faktúra"}
        description={
          form.type === "credit_note"
            ? "Opravný doklad k vystavenej faktúre — priraďte ju podľa čísla alebo VS, alebo nechajte dobropis samostatný."
            : "Vytvorte faktúru za menej než 30 sekúnd."
        }
        action={
          <button
            type="button"
            onClick={() => setAiOpen(true)}
            className="inline-flex items-center gap-2 rounded-md border border-primary/40 bg-gradient-to-r from-primary/15 to-primary/5 px-3 py-2 text-sm font-medium text-primary hover:opacity-90"
          >
            <Sparkles className="h-4 w-4" /> AI vytvorenie
            <kbd className="ml-1 hidden rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-mono sm:inline">
              ⌘K
            </kbd>
          </button>
        }
      />
      <PageBody>
        <PoznamkaRezimuDph />
        <form onSubmit={submit} className="mx-auto max-w-6xl space-y-6">
          {/*
            Základné a platobné údaje vedľa seba. Pod sebou zaberali na
            monitore dve obrazovky a k položkám sa človek doscrolloval až po
            údajoch, ktoré vypĺňa raz za čas. Na úzkej obrazovke sa mriežka
            zloží späť pod seba.
          */}
          {/* items-stretch: obe karty končia na tej istej čiare, aj keď má jedna menej polí. */}
          <div className="grid gap-6 lg:grid-cols-2">
          {/* SECTION 1 — basic info */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <SectionHeader icon={FileText} title="Základné údaje" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <div>
                <label className="text-[13px] font-semibold text-foreground">Odberateľ *</label>
                <CustomerSearch
                  customers={customers}
                  value={form.customer_id}
                  onChange={(id) => setForm({ ...form, customer_id: id })}
                  onCreated={(c) => {
                    setCustomers((prev) => [c, ...prev]);
                    setForm((f) => ({ ...f, customer_id: c.id }));
                  }}
                />
              </div>
              <div>
                <label className="text-[13px] font-semibold text-foreground">Typ dokladu</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as any })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="regular">Faktúra</option>
                  <option value="proforma">Zálohová faktúra</option>
                  <option value="credit_note">Dobropis</option>
                </select>
              </div>
              <VyberRadu
                druh={druhPodlaTypuFaktury(form.type)}
                hodnota={form.number_series_id}
                onZmena={(id) => setForm({ ...form, number_series_id: id })}
              />
              {form.type === "credit_note" && (
                <div className="col-span-full rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <div className="text-[13px] font-semibold text-foreground">Opravovaná faktúra</div>
                  {form.opravuje_fakturu_id ? (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                      <span>
                        Dobropis opravuje faktúru <strong>{opravujeCislo || "vybranú faktúru"}</strong> — v
                        účtovníctve aj eFaktúre sa spárujú.
                      </span>
                      <button
                        type="button"
                        onClick={() => predvyplnDobropis(form.opravuje_fakturu_id, true)}
                        className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-secondary"
                      >
                        Načítať jej položky (so mínusom)
                      </button>
                      <button
                        type="button"
                        onClick={() => setPickerOpen("opravuje")}
                        className="text-xs text-primary hover:underline"
                      >
                        Zmeniť
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setForm({ ...form, opravuje_fakturu_id: "" });
                          setOpravujeCislo("");
                        }}
                        className="text-xs text-muted-foreground hover:underline"
                      >
                        Samostatný dobropis
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <input
                          value={hladajOpravovanu}
                          onChange={(e) => setHladajOpravovanu(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void priradPodlaVs();
                            }
                          }}
                          placeholder="Číslo faktúry alebo VS"
                          aria-label="Číslo faktúry alebo variabilný symbol"
                          className="w-48 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                        />
                        <button
                          type="button"
                          onClick={priradPodlaVs}
                          disabled={hladamOpravovanu || !hladajOpravovanu.trim()}
                          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                        >
                          {hladamOpravovanu && <Loader2 className="h-4 w-4 animate-spin" />}
                          Priradiť
                        </button>
                        <button
                          type="button"
                          onClick={() => setPickerOpen("opravuje")}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-secondary"
                        >
                          <Link2 className="h-4 w-4" /> Vybrať zo zoznamu
                        </button>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Nechajte prázdne pre <strong>samostatný dobropis</strong> bez väzby na faktúru
                        (napr. zľava za obdobie). Sumy zadávajte so mínusom.
                      </p>
                    </>
                  )}
                </div>
              )}
              <div>
                <label className="text-[13px] font-semibold text-foreground">
                  Dátum vystavenia
                </label>
                <input
                  type="date"
                  required
                  value={form.issue_date}
                  onChange={(e) => setForm({ ...form, issue_date: e.target.value })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-[13px] font-semibold text-foreground">Dátum dodania</label>
                <input
                  type="date"
                  value={form.delivery_date}
                  onChange={(e) => setForm({ ...form, delivery_date: e.target.value })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-[13px] font-semibold text-foreground">Splatnosť</label>
                {/* V polovičnom stĺpci sa dátum a rýchle tlačidlá do jedného
                    riadku nezmestia — nech sa radšej zalomia, než orežú. */}
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    required
                    value={form.due_date}
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                    className="min-w-[10rem] flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <div className="flex shrink-0 gap-1">
                    {[7, 14, 30].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            due_date: new Date(Date.now() + d * 86400000)
                              .toISOString()
                              .slice(0, 10),
                          })
                        }
                        className="rounded-md border border-border px-2 text-xs hover:bg-secondary"
                      >
                        {d}d
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label className="text-[13px] font-semibold text-foreground">Spôsob platby</label>
                <select
                  value={form.payment_method}
                  onChange={(e) => {
                    const sposob = e.target.value;
                    setForm((f) => ({
                      ...f,
                      payment_method: sposob,
                      /* Hotovosť sa platí na päť centov — jedno- a dvojcentovky
                         sa už nevydávajú (zákon o cenách od 1. 7. 2022). */
                      rounding_mode: jeHotovost(sposob)
                        ? "retail"
                        : f.rounding_mode === "retail"
                          ? "per_document"
                          : f.rounding_mode,
                    }));
                  }}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              {jeHotovost(form.payment_method) && (
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Suma sa zaokrúhli na päť centov, ako to pri platbe v hotovosti ukladá zákon o
                  cenách.
                </p>
              )}
              {prekrocenyStrop(totals.payable, form.payment_method) && (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive sm:col-span-2">
                  {prekrocenyStrop(totals.payable, form.payment_method)}
                </p>
              )}
              {form.payment_method === "bank_transfer" && (
                <VyberUctu
                  companyId={getActiveCompanyId()}
                  value={form.payment_account_id || null}
                  onChange={(id) => setForm((f) => ({ ...f, payment_account_id: id }))}
                  className="[&>span]:text-xs [&>span]:font-medium"
                />
              )}
              <div>
                <label className="text-[13px] font-semibold text-foreground">Mena</label>
                <select
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {MENY.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.code} {c.symbol} — {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <JobPicker
                className="sm:col-span-2"
                value={form.job_id}
                onChange={(v) => setForm((f) => ({ ...f, job_id: v }))}
                customerId={form.customer_id || null}
              />
            </div>

            {/* Quick action links */}
            <div className="mt-4 flex flex-wrap gap-3 border-t border-border pt-4 text-sm">
              <button
                type="button"
                onClick={() => setPickerOpen("copy")}
                className="inline-flex items-center gap-1.5 text-primary hover:underline"
              >
                <FileDown className="h-4 w-4" /> Načítať položky z dokladu
              </button>
              <button
                type="button"
                onClick={() => setPickerOpen("advance")}
                className="inline-flex items-center gap-1.5 text-primary hover:underline"
              >
                <Link2 className="h-4 w-4" />{" "}
                {odpocty.length ? "Pridať ďalšiu zálohu" : "Pridať zálohovú faktúru"}
              </button>
              {nezuctovane.filter((z) => !odpocty.some((o) => o.id === z.id)).length > 0 && (
                /*
                  Upozornenie, nie zákaz: sú prípady, keď sa záloha zámerne
                  vyúčtuje inou faktúrou. Odpočet je preto na jedno kliknutie,
                  ale nikto ho nevnucuje.
                */
                <div className="w-full rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-100">
                  <div className="font-medium">
                    {nezuctovane.length === 1
                      ? "Odberateľ má zaplatenú zálohu, ktorá ešte nie je zúčtovaná."
                      : `Odberateľ má ${nezuctovane.length} zaplatené zálohy, ktoré ešte nie sú zúčtované.`}
                  </div>
                  <ul className="mt-2 space-y-1">
                    {nezuctovane
                      .filter((z) => !odpocty.some((o) => o.id === z.id))
                      .map((z) => (
                      <li key={z.id} className="flex flex-wrap items-center gap-2">
                        <span className="tabular-nums">
                          <strong>{z.invoice_number}</strong> · {z.issue_date} ·{" "}
                          {z.total.toFixed(2)} {z.currency}
                        </span>
                        {z.doklad_k_platbe && (
                          <span className="text-xs opacity-80">
                            daň priznaná dokladom {z.doklad_k_platbe}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setOdpocty((zoz) =>
                              zoz.some((o) => o.id === z.id)
                                ? zoz
                                : [...zoz, { id: z.id, cislo: z.invoice_number, suma: z.total }],
                            );
                            toast.success(`Záloha ${z.invoice_number} pripojená`);
                          }}
                          className="rounded-md bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:opacity-90"
                        >
                          Odpočítať
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs opacity-80">
                    Bez odpočtu zaplatí zákazník to isté plnenie druhýkrát.
                  </p>
                </div>
              )}
              {odpocty.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {odpocty.length === 1 ? "Záloha odpočítaná:" : "Odpočítané zálohy:"}{" "}
                  {odpocty.map((z) => (
                    <span key={z.id} className="mr-2 inline-flex items-center gap-1">
                      <strong>
                        {z.cislo} · {z.suma.toFixed(2)} {form.currency}
                      </strong>
                      <button
                        type="button"
                        onClick={() => setOdpocty((zoz) => zoz.filter((o) => o.id !== z.id))}
                        className="text-destructive hover:underline"
                      >
                        Zrušiť
                      </button>
                    </span>
                  ))}
                  {odpocty.length > 1 && (
                    <strong className="ml-1">
                      Spolu {totals.advance.toFixed(2)} {form.currency}
                    </strong>
                  )}
                </span>
              )}
            </div>
          </section>

          {/* SECTION 1b — payment & symbols */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <SectionHeader icon={CreditCard} title="Platobné údaje a symboly" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <div>
                <label className="text-[13px] font-semibold text-foreground">
                  Variabilný symbol
                </label>
                <input
                  value={form.variable_symbol}
                  onChange={(e) => setForm({ ...form, variable_symbol: e.target.value })}
                  placeholder="Automaticky podľa čísla faktúry"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-[13px] font-semibold text-foreground">
                  Konštantný symbol
                </label>
                <div className="mt-1">
                  <ConstantSymbolCombobox
                    value={form.constant_symbol}
                    onChange={(v) => setForm({ ...form, constant_symbol: v })}
                  />
                </div>
              </div>
              <div>
                <label className="text-[13px] font-semibold text-foreground">
                  Špecifický symbol
                </label>
                <input
                  value={form.specific_symbol}
                  onChange={(e) => setForm({ ...form, specific_symbol: e.target.value })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-[13px] font-semibold text-foreground">
                  Číslo objednávky
                </label>
                <input
                  value={form.order_number}
                  onChange={(e) => setForm({ ...form, order_number: e.target.value })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-[13px] font-semibold text-foreground">Jazyk dokladu</label>
                <select
                  value={form.language}
                  onChange={(e) => setForm({ ...form, language: e.target.value })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {JAZYKY_DOKLADU.map((j) => (
                    <option key={j.kod} value={j.kod}>
                      {j.nazov}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Prekladajú sa popisky v PDF, nie názvy položiek a poznámky.
                </p>
              </div>
              <div>
                <label className="text-[13px] font-semibold text-foreground">Spôsob dodania</label>
                <select
                  value={form.delivery_method}
                  onChange={(e) => setForm({ ...form, delivery_method: e.target.value })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">— nevyplnené —</option>
                  <option value="personal">Osobne</option>
                  <option value="courier">Kuriér</option>
                  <option value="post">Pošta</option>
                  <option value="electronic">Elektronicky</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-[13px] font-semibold text-foreground">
                  Spôsob zaokrúhľovania
                </label>
                <select
                  value={form.rounding_mode}
                  onChange={(e) => setForm({ ...form, rounding_mode: e.target.value as any })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="per_item">Po položkách (zaokrúhli každú položku zvlášť)</option>
                  <option value="per_document">Za celý doklad (zaokrúhli až finálny súčet)</option>
                  <option value="retail">Maloobchod (na 0,05 €, SK pravidlá)</option>
                </select>
              </div>
            </div>
          </section>
          </div>

          {/*
            Daňový režim stojí samostatne pod hlavičkou — je to voľba, ktorá mení
            sadzby na položkách, nie ďalší symbol k platbe. Prepínače sú dlaždice,
            nech je na prvý pohľad vidieť, ktorý režim je zapnutý.
          */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <SectionHeader icon={Percent} title="Daňový režim" />
            <p className="-mt-1 mb-4 text-xs text-muted-foreground">
              Bežne sa fakturuje so slovenskou DPH. Prepnite len vtedy, keď daň odvedie odberateľ
              alebo predávate spotrebiteľovi v inom štáte EÚ.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                  form.reverse_charge
                    ? "border-primary bg-primary/5"
                    : "border-border bg-muted/20 hover:border-primary/40"
                }`}
              >
                <input
                  type="checkbox"
                  checked={form.reverse_charge}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      reverse_charge: e.target.checked,
                      reverse_charge_type: e.target.checked
                        ? form.reverse_charge_type || "domestic_69"
                        : "",
                    })
                  }
                  className="mt-0.5 h-4 w-4 rounded border-input"
                />
                <span className="text-sm">
                  <strong>Prenos daňovej povinnosti (PDP)</strong>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    DPH neúčtujem — daň odvedie odberateľ. Sadzba na položkách bude 0 %.
                  </span>
                </span>
              </label>
              {!form.reverse_charge && (
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                    form.oss
                      ? "border-primary bg-primary/5"
                      : "border-border bg-muted/20 hover:border-primary/40"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={form.oss}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        oss: e.target.checked,
                        oss_country: e.target.checked ? f.oss_country || "AT" : "",
                      }))
                    }
                    className="mt-0.5 h-4 w-4 rounded border-input"
                  />
                  <span className="text-sm">
                    <strong>Predaj spotrebiteľovi v EÚ (OSS)</strong>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Sadzba štátu zákazníka; daň sa odvádza cez jedno kontaktné miesto, nie v
                      slovenskom priznaní.
                    </span>
                  </span>
                </label>
              )}
            </div>

            {/* Podrobnosti k zvolenému režimu — pod dlaždicami, nech sa nerozhadzuje mriežka. */}
            {form.reverse_charge && (
              <div className="mt-4 grid items-start gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-[13px] font-semibold text-foreground">Druh prenosu</span>
                  <select
                    value={form.reverse_charge_type || "domestic_69"}
                    onChange={(e) =>
                      setForm({ ...form, reverse_charge_type: e.target.value as any })
                    }
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="domestic_69">
                      Tuzemský prenos podľa §69 zákona o DPH (stavebné práce, kovový odpad…)
                    </option>
                    <option value="eu_b2b">
                      Intrakomunitárne dodanie do EÚ (B2B, odberateľ má IČ DPH)
                    </option>
                    <option value="export">Vývoz mimo EÚ (oslobodené podľa §47)</option>
                  </select>
                </label>
                {form.reverse_charge_type === "eu_b2b" && (
                  <label className="block">
                    <span className="text-[13px] font-semibold text-foreground">
                      Druh plnenia do súhrnného výkazu
                    </span>
                    <select
                      value={form.eu_plnenie}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          eu_plnenie: e.target.value as typeof form.eu_plnenie,
                        })
                      }
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="tovar">Dodanie tovaru</option>
                      <option value="sluzba">Dodanie služby (§ 15 ods. 1)</option>
                      <option value="trojstranny">Trojstranný obchod</option>
                    </select>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Tovar ide aj do priznania (r. 13 a 14), služba len do súhrnného výkazu.
                    </span>
                  </label>
                )}
                {form.reverse_charge_type === "eu_b2b" &&
                  (() => {
                    const cust = customers.find((c) => c.id === form.customer_id);
                    if (!cust?.ic_dph) return null;
                    return (
                      <div className="md:col-span-2">
                        <OverenieVies
                          companyId={getActiveCompanyId()}
                          icDph={cust.ic_dph}
                          customerId={cust.id}
                          posledne={{
                            platne: cust.vies_platne ?? null,
                            kedy: cust.vies_overene_at ?? null,
                          }}
                        />
                      </div>
                    );
                  })()}
                {form.reverse_charge_type === "eu_b2b" &&
                  (() => {
                    const cust = customers.find((c) => c.id === form.customer_id);
                    const vat = (cust?.ic_dph || "").trim();
                    const ok = vat && /^[A-Z]{2}[A-Z0-9]{2,}$/i.test(vat) && !/^SK/i.test(vat);
                    if (ok) return null;
                    return (
                      <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive md:col-span-2">
                        {!cust
                          ? "Vyberte odberateľa s platným IČ DPH z iného členského štátu EÚ."
                          : !vat
                            ? "Odberateľ nemá vyplnené IČ DPH. Pri intrakomunitárnom dodaní je povinné — doplňte ho v karte odberateľa."
                            : /^SK/i.test(vat)
                              ? "Odberateľ má slovenské IČ DPH. Intrakomunitárne dodanie sa vzťahuje len na iné členské štáty EÚ."
                              : "IČ DPH odberateľa nie je v platnom EU formáte (napr. CZ12345678)."}
                      </p>
                    );
                  })()}
              </div>
            )}
            {!form.reverse_charge && (form.oss || rezim.platitel) && (
              <div className="mt-4 grid items-start gap-4 md:grid-cols-2">
                {form.oss && (
                  <label className="block">
                    <span className="text-[13px] font-semibold text-foreground">Štát spotreby</span>
                    <select
                      value={form.oss_country}
                      onChange={(e) =>
                        // Sadzby riadkov dorovná efekt vyššie podľa štátu spotreby.
                        setForm((f) => ({ ...f, oss_country: e.target.value }))
                      }
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {SADZBY_EU.filter((x) => x.kod !== "SK").map((x) => (
                        <option key={x.kod} value={x.kod}>
                          {x.nazov} — základná {x.zakladna} %
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {rezim.platitel && (
                  <label className="block">
                    <span className="text-[13px] font-semibold text-foreground">
                      Osobitná úprava (nepovinné)
                    </span>
                    <select
                      value={form.osobitna_uprava}
                      onChange={(e) => setForm({ ...form, osobitna_uprava: e.target.value })}
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Bez osobitnej úpravy</option>
                      {UPRAVY_NA_VYBER.map((u) => (
                        <option key={u.kod} value={u.kod}>
                          {u.nazov}
                        </option>
                      ))}
                    </select>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Veta sa vytlačí na faktúru; zdaňuje sa len prirážka, nie celá cena.
                    </span>
                  </label>
                )}
              </div>
            )}
          </section>

          {/*
            Text nad položkami — čoho sa dodávka týka, číslo objednávky,
            obdobie. Bez neho ľudia píšu tieto vety do názvu prvej položky,
            kde potom kazia súčty aj export do účtovníctva.
          */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <label className="block">
              <span className="text-[13px] font-semibold text-foreground">
                Text nad položkami <span className="text-destructive">*</span>
              </span>
              <textarea
                rows={2}
                required
                value={form.intro_note}
                onChange={(e) => setForm({ ...form, intro_note: e.target.value })}
                placeholder="Napríklad: Fakturujeme vám práce podľa objednávky č. 2026/114 za obdobie 1. – 31. 8. 2026."
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                Povinný — hovorí, čo sa fakturuje. Položky pod ním sú nepovinné.
              </span>
            </label>
          </section>


          {/* SECTION 2 — items */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <SectionHeader icon={Package} title="Položky">
              <ProductSearch
                products={products}
                onPick={(p) => {
                  setItems((arr) => {
                    const next = [...arr];
                    const last = next[next.length - 1];
                    const meta = stockByProduct[p.id];
                    const zCennika = podklady
                      ? cenaZPodkladov(podklady, { id: p.id, unit_price: p.unit_price }, 1)
                      : null;
                    const newItem: Item = {
                      name: p.name,
                      description: p.description ?? "",
                      quantity: 1,
                      unit: p.unit ?? "ks",
                      unit_price: zCennika ? zCennika.cena : Number(p.unit_price ?? 0),
                      _dovod:
                        zCennika && zCennika.zdroj !== "zakladna" ? zCennika.dovod : undefined,
                      _zakladna:
                        zCennika && zCennika.zdroj !== "zakladna" ? zCennika.zakladna : undefined,
                      vat_rate: Number(p.vat_rate ?? DEFAULT_VAT_RATE),
                      product_id: p.id,
                      stock_item_id: meta?.stock_item_id ?? null,
                      _track_stock: meta?.track_stock ?? false,
                      _available: meta?.available ?? 0,
                      _sku: meta?.sku ?? null,
                    };
                    if (last && !last.name && !last.unit_price) next[next.length - 1] = newItem;
                    else next.push(newItem);
                    return next;
                  });
                }}
                stockByProduct={stockByProduct}
              />
            </SectionHeader>

            {/* desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-foreground">
                    <th className="py-2 font-medium">Názov</th>
                    <th className="py-2 pl-3 font-medium">Mn.</th>
                    <th className="py-2 pl-3 font-medium">MJ</th>
                    <th className="py-2 pl-3 font-medium text-right">Cena</th>
                    <th className="py-2 pl-3 font-medium text-right">Zľava %</th>
                    <th className="py-2 pl-3 font-medium">DPH</th>
                    <th className="py-2 pl-3 font-medium text-right">Spolu s DPH</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx} className="border-b border-border/60">
                      <td className="py-2 pr-3">
                        <input
                          value={it.name}
                          onChange={(e) => setItem(idx, { name: e.target.value })}
                          placeholder="Názov položky"
                          className="w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm hover:border-input focus:border-input focus:bg-background"
                        />
                        <StockHint item={it} warehouseName={warehouseName} />
                      </td>
                      <td className="py-2 pl-3">
                        <CellNum
                          value={it.quantity}
                          onChange={(v) => setItem(idx, { quantity: v })}
                          w="w-16"
                        />
                      </td>
                      <td className="py-2 pl-3">
                        <input
                          value={it.unit}
                          onChange={(e) => setItem(idx, { unit: e.target.value })}
                          className="w-14 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm hover:border-input focus:border-input focus:bg-background"
                        />
                      </td>
                      <td className="py-2 pl-3">
                        <CellNum
                          value={it.unit_price}
                          onChange={(v) => setItem(idx, { unit_price: v, _cena_rucne: true })}
                          w="w-24"
                          align="right"
                          step={KROK_CENY}
                        />
                        {it._dovod && (
                          <div className="pr-2 text-right text-[10px] leading-tight text-emerald-600">
                            {it._zakladna != null && it._zakladna !== it.unit_price && (
                              <span className="mr-1 text-muted-foreground line-through">
                                {it._zakladna.toFixed(2)} €
                              </span>
                            )}
                            {it._dovod}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pl-3">
                        <CellNum
                          value={it.discount_percent ?? 0}
                          onChange={(v) => setItem(idx, { discount_percent: percentoZlavy(v) })}
                          w="w-16"
                          align="right"
                        />
                      </td>
                      <td className="py-2 pl-3">
                        {form.reverse_charge ? (
                          <span
                            className="inline-block rounded bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-900 dark:text-amber-100"
                            title="Prenesenie daňovej povinnosti"
                          >
                            PDP
                          </span>
                        ) : (
                          <select
                            value={it.vat_rate}
                            onChange={(e) =>
                              setItem(idx, { vat_rate: Number(e.target.value), _dph_rucne: true })
                            }
                            className="rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm hover:border-input focus:border-input focus:bg-background"
                          >
                            {sadzbyPolozky.map((r) => (
                              <option key={r} value={r}>
                                {r}%
                              </option>
                            ))}
                            {historickeSadzbyDokladu.length > 0 && (
                              <optgroup label="Historické sadzby">
                                {historickeSadzbyDokladu.map((h) => (
                                  <option key={h.sadzba} value={h.sadzba}>
                                    {h.sadzba}% (do {h.doRoku})
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                        )}
                      </td>
                      <td className="py-2 pl-3">
                        <CellSpolu
                          hodnota={
                            zakladRiadku(it.quantity, it.unit_price, it.discount_percent) *
                            (form.reverse_charge ? 1 : 1 + it.vat_rate / 100)
                          }
                          onZmena={(v) => nastavSpolu(idx, v)}
                          w="w-28"
                        />
                      </td>
                      <td className="py-2 pl-2">
                        <button
                          type="button"
                          onClick={() => setItems(items.filter((_, i) => i !== idx))}
                          className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* mobile cards */}
            <div className="space-y-3 md:hidden">
              {items.map((it, idx) => (
                <div key={idx} className="rounded-lg border border-border p-3">
                  <input
                    value={it.name}
                    onChange={(e) => setItem(idx, { name: e.target.value })}
                    placeholder="Názov položky"
                    className="mb-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <StockHint item={it} warehouseName={warehouseName} />
                  <div className="grid grid-cols-5 gap-2">
                    <CellNum value={it.quantity} onChange={(v) => setItem(idx, { quantity: v })} />
                    <input
                      value={it.unit}
                      onChange={(e) => setItem(idx, { unit: e.target.value })}
                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    />
                    <CellNum
                      value={it.unit_price}
                      onChange={(v) => setItem(idx, { unit_price: v, _cena_rucne: true })}
                      step={KROK_CENY}
                    />
                    <CellNum
                      value={it.discount_percent ?? 0}
                      onChange={(v) => setItem(idx, { discount_percent: percentoZlavy(v) })}
                      title="Zľava v %"
                    />
                    {form.reverse_charge ? (
                      <span className="inline-flex items-center justify-center rounded bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-900 dark:text-amber-100">
                        PDP
                      </span>
                    ) : (
                      <select
                        value={it.vat_rate}
                        onChange={(e) =>
                          setItem(idx, { vat_rate: Number(e.target.value), _dph_rucne: true })
                        }
                        className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                      >
                        {sadzbyPolozky.map((r) => (
                          <option key={r} value={r}>
                            {r}%
                          </option>
                        ))}
                        {historickeSadzbyDokladu.length > 0 && (
                          <optgroup label="Historické sadzby">
                            {historickeSadzbyDokladu.map((h) => (
                              <option key={h.sadzba} value={h.sadzba}>
                                {h.sadzba}% (do {h.doRoku})
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-foreground">Spolu s DPH</span>
                      <CellSpolu
                        hodnota={
                          zakladRiadku(it.quantity, it.unit_price, it.discount_percent) *
                          (form.reverse_charge ? 1 : 1 + it.vat_rate / 100)
                        }
                        onZmena={(v) => nastavSpolu(idx, v)}
                        w="w-28"
                      />
                      <span className="text-muted-foreground">{form.currency}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setItems(items.filter((_, i) => i !== idx))}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              Do stĺpca <strong>Spolu s DPH</strong> sa dá napísať suma, na ktorej ste sa dohodli —
              jednotková cena bez dane sa dopočíta sama.
            </p>
            <button
              type="button"
              onClick={() => setItems([...items, { ...EMPTY_ITEM, vat_rate: zakladnaSadzba }])}
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> Pridať položku
              <kbd className="ml-1 hidden rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono sm:inline">
                ⌘I
              </kbd>
            </button>
          </section>

          {/* SECTION 3 — totals */}
          <section className="rounded-2xl border border-border bg-gradient-to-br from-card to-primary/[0.03] p-5">
            <div className="ml-auto max-w-sm space-y-2 text-sm">
              {/*
                Zľava na celý doklad — dohodne sa až na konci, preto stojí
                pri súčtoch, nie v hlavičke. Rozpočíta sa pomerne medzi
                sadzby DPH, riadky ostanú nedotknuté.
              */}
              <div className="flex items-center justify-between gap-2 pb-1">
                <span className="text-[13px] font-semibold text-foreground">Zľava na doklad</span>
                <span className="flex items-center gap-1">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={form.discount_value || ""}
                    placeholder="0"
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setForm((f) => ({
                        ...f,
                        discount_value: v,
                        discount_type: v > 0 ? f.discount_type || "percent" : f.discount_type,
                      }));
                    }}
                    className="w-24 rounded-md border border-input bg-background px-2 py-1.5 text-right text-sm tabular-nums"
                  />
                  <select
                    value={form.discount_type || "percent"}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, discount_type: e.target.value as TypZlavy }))
                    }
                    className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  >
                    <option value="percent">%</option>
                    <option value="amount">{form.currency}</option>
                  </select>
                </span>
              </div>
              {totals.zlava > 0 && (
                <>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Medzisúčet</span>
                    <span className="tabular-nums">
                      {totals.medzisucet.toFixed(2)} {form.currency}
                    </span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Zľava</span>
                    <span className="tabular-nums">
                      −{totals.zlava.toFixed(2)} {form.currency}
                    </span>
                  </div>
                </>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bez DPH</span>
                <span className="tabular-nums">
                  {totals.subtotal.toFixed(2)} {form.currency}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">DPH</span>
                <span className="tabular-nums">
                  {totals.vat_total.toFixed(2)} {form.currency}
                </span>
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
                <span>Celkom</span>
                <span className="tabular-nums">
                  {totals.total.toFixed(2)} {form.currency}
                </span>
              </div>
              {totals.advance > 0 && (
                <>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Odpočet zálohy</span>
                    <span className="tabular-nums">
                      −{totals.advance.toFixed(2)} {form.currency}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2 text-lg font-bold">
                    <span>K úhrade</span>
                    <span className="tabular-nums text-primary">
                      {totals.payable.toFixed(2)} {form.currency}
                    </span>
                  </div>
                </>
              )}
              {totals.advance === 0 && (
                <div className="flex justify-between text-lg font-bold">
                  <span>K úhrade</span>
                  <span className="tabular-nums text-primary">
                    {totals.total.toFixed(2)} {form.currency}
                  </span>
                </div>
              )}
            </div>
          </section>

          {/* SECTION 4 — advanced */}
          <section className="rounded-2xl border border-border bg-card">
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex w-full items-center justify-between p-5 text-left"
            >
              <SectionHeader icon={Calendar} title="Rozšírené nastavenia" />
              {advancedOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            {advancedOpen && (
              <div className="grid gap-4 p-5 pt-0">
                <label className="block">
                  <span className="text-[13px] font-semibold text-foreground">Poznámka</span>
                  <textarea
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Voliteľná poznámka, ktorá sa zobrazí na faktúre"
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </label>
              </div>
            )}
          </section>

          {/* SECTION 5 — actions */}
          <div /*
              Plávajúce tlačidlo pomoci sedí v pravom dolnom rohu a prekrývalo
              „Vystaviť faktúru" — na užšom okne z neho ostalo „Vystaviť fak…".
              Lišta si preto vpravo nechá miesto.
            */
            className="sticky bottom-4 z-10 flex flex-col-reverse gap-2 rounded-2xl border border-border bg-card/95 p-4 pr-20 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-muted-foreground">
              <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">⌘↵</kbd> uložiť ·
              <kbd className="ml-1 rounded bg-muted px-1.5 py-0.5 font-mono">⌘K</kbd> AI
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => navigate({ to: "/faktury" })}
                className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-secondary"
              >
                Zrušiť
              </button>
              <button
                id="invoice-submit"
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {form.type === "credit_note"
                  ? "Vystaviť dobropis"
                  : form.type === "proforma"
                    ? "Vystaviť zálohovú faktúru"
                    : "Vystaviť faktúru"}
              </button>
            </div>
          </div>
        </form>

        {aiOpen && (
          <AiModal
            prompt={aiPrompt}
            setPrompt={setAiPrompt}
            loading={aiLoading}
            onClose={() => setAiOpen(false)}
            onRun={runAi}
          />
        )}

        {pickerOpen && (
          <InvoicePickerModal
            mode={pickerOpen}
            onClose={() => setPickerOpen(null)}
            onPickCopy={(loaded) => {
              setItems(loaded.map((it) => ({ ...EMPTY_ITEM, ...it })));
              toast.success(`Načítaných ${loaded.length} položiek`);
              setPickerOpen(null);
            }}
            onPickAdvance={(inv) => {
              if (pickerOpen === "opravuje") {
                setForm((f) => ({ ...f, opravuje_fakturu_id: inv.id }));
                setOpravujeCislo(inv.invoice_number);
                toast.success(`Dobropis opravuje faktúru ${inv.invoice_number}`);
              } else {
                setOdpocty((zoz) =>
                  zoz.some((o) => o.id === inv.id)
                    ? zoz
                    : [
                        ...zoz,
                        { id: inv.id, cislo: inv.invoice_number, suma: Number(inv.total) },
                      ],
                );
                toast.success(`Záloha pripojená: ${inv.invoice_number}`);
              }
              setPickerOpen(null);
            }}
          />
        )}
      </PageBody>
    </>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  children,
}: {
  icon: any;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold uppercase tracking-wide">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function CellNum({
  value,
  onChange,
  w = "w-20",
  align = "left",
  /* Množstvo si vystačí s dvoma miestami, cena ich potrebuje päť. */
  step = "0.01",
  title,
}: {
  value: number;
  onChange: (v: number) => void;
  w?: string;
  align?: "left" | "right";
  step?: string;
  title?: string;
}) {
  return (
    <input
      type="number"
      step={step}
      inputMode="decimal"
      title={title}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`${w} rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm tabular-nums hover:border-input focus:border-input focus:bg-background ${align === "right" ? "text-right" : ""}`}
    />
  );
}

/**
 * Suma riadku s DPH, ktorá sa dá aj prepísať.
 *
 * Kým sa v poli píše, drží si vlastný text — inak by prepočet jednotkovej
 * ceny vrátil zaokrúhlenú hodnotu späť a číslo pod prstami by poskakovalo.
 * Po opustení poľa sa ukáže presne to, čo z riadku vychádza.
 */
function CellSpolu({
  hodnota,
  onZmena,
  w = "w-24",
}: {
  hodnota: number;
  onZmena: (v: number) => void;
  w?: string;
}) {
  const [rozpisane, setRozpisane] = useState<string | null>(null);
  return (
    <input
      type="number"
      step="0.01"
      inputMode="decimal"
      title="Suma s DPH — cena bez dane sa dopočíta"
      value={rozpisane ?? (Number.isFinite(hodnota) ? hodnota.toFixed(2) : "0.00")}
      onChange={(e) => {
        setRozpisane(e.target.value);
        onZmena(Number(e.target.value));
      }}
      onBlur={() => setRozpisane(null)}
      className={`${w} rounded-md border border-transparent bg-transparent px-2 py-1.5 text-right text-sm font-medium tabular-nums hover:border-input focus:border-input focus:bg-background`}
    />
  );
}

const modalInput =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none";

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-[13px] font-semibold text-foreground">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function ProductSearch({
  products,
  onPick,
  stockByProduct,
}: {
  products: any[];
  onPick: (p: any) => void;
  stockByProduct: Record<string, StockMeta>;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = q
    ? products.filter((p) => p.name?.toLowerCase().includes(q.toLowerCase())).slice(0, 8)
    : products.slice(0, 8);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
      >
        <Search className="h-3.5 w-3.5" /> Z katalógu
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-80 rounded-lg border border-border bg-card shadow-lg">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Hľadať produkt…"
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <ul className="max-h-64 overflow-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground">Žiadne produkty</li>
            )}
            {filtered.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(p);
                    setOpen(false);
                    setQ("");
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/60"
                >
                  <span className="flex flex-col">
                    <span>{p.name}</span>
                    {stockByProduct[p.id]?.track_stock && (
                      <span
                        className={`text-[11px] ${stockByProduct[p.id].available <= 0 ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        Sklad: {stockByProduct[p.id].available} {p.unit ?? "ks"}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {Number(p.unit_price).toFixed(2)} €
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StockHint({ item, warehouseName }: { item: Item; warehouseName: string }) {
  if (!item.stock_item_id || !item._track_stock) return null;
  const available = Number(item._available ?? 0);
  const insufficient = Number(item.quantity) > available;
  return (
    <div
      className={`mt-1 inline-flex items-center gap-1 text-[11px] ${insufficient ? "text-destructive" : "text-muted-foreground"}`}
    >
      {insufficient && <AlertTriangle className="h-3 w-3" />}
      {insufficient ? (
        <>
          Na sklade nie je dostatok kusov. Dostupné: {available}
          {warehouseName ? ` · ${warehouseName}` : ""}
        </>
      ) : (
        <>
          Sklad: {available} {item.unit}
          {warehouseName ? ` · ${warehouseName}` : ""}
          {item._sku ? ` · ${item._sku}` : ""}
        </>
      )}
    </div>
  );
}

function AiModal({
  prompt,
  setPrompt,
  loading,
  onClose,
  onRun,
}: {
  prompt: string;
  setPrompt: (v: string) => void;
  loading: boolean;
  onClose: () => void;
  onRun: () => void;
}) {
  useZatvorNaEscape(onClose);
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/60 p-4 pt-24 backdrop-blur"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Faktúra z dokumentu"
        className="w-full max-w-xl rounded-2xl border border-border bg-card p-5 shadow-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">AI vytvorenie faktúry</h3>
        </div>
        <p className="mb-3 text-sm text-muted-foreground">
          Opíšte faktúru bežnou rečou — AI vyplní položky, ceny a DPH.
        </p>
        <textarea
          autoFocus
          rows={5}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onRun();
          }}
          placeholder="Napr. 10 hodín konzultácií po 60 € pre Acme s.r.o. + licencia softvéru 240 € s DPH"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            <Command className="inline h-3 w-3" />↵ spustiť
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
            >
              Zrušiť
            </button>
            <button
              type="button"
              onClick={onRun}
              disabled={loading || !prompt.trim()}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Vygenerovať
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InvoicePickerModal({
  mode,
  onClose,
  onPickCopy,
  onPickAdvance,
}: {
  mode: "copy" | "advance" | "opravuje";
  onClose: () => void;
  onPickCopy: (items: Partial<Item>[]) => void;
  onPickAdvance: (inv: { id: string; invoice_number: string; total: number }) => void;
}) {
  useZatvorNaEscape(onClose);
  const [list, setList] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    let query = supabase
      .from("invoices")
      .select("id, invoice_number, variable_symbol, customer_name, total, currency, issue_date, type, status")
      .eq("company_id", cid)
      .order("issue_date", { ascending: false })
      .limit(50);
    if (mode === "advance") query = query.eq("type", "proforma");
    // Dobropis opravuje bežnú faktúru, nie zálohovú ani iný dobropis.
    if (mode === "opravuje") query = query.eq("type", "regular");
    query.then(({ data }) => {
      setList(data ?? []);
      setLoading(false);
    });
  }, [mode]);

  const filtered = q
    ? list.filter((i) =>
        `${i.invoice_number} ${i.variable_symbol ?? ""} ${i.customer_name ?? ""}`
          .toLowerCase()
          .includes(q.toLowerCase()),
      )
    : list;

  async function handlePick(inv: any) {
    if (mode === "advance" || mode === "opravuje") {
      onPickAdvance({ id: inv.id, invoice_number: inv.invoice_number, total: Number(inv.total) });
      return;
    }
    const { data } = await supabase
      .from("invoice_items")
      .select("name, description, quantity, unit, unit_price, vat_rate")
      .eq("invoice_id", inv.id)
      .order("position");
    onPickCopy((data ?? []) as Partial<Item>[]);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Výber faktúry"
        className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-xl max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold">
            {mode === "copy"
              ? "Načítať položky z dokladu"
              : mode === "opravuje"
                ? "Ktorú faktúru dobropis opravuje"
                : "Vybrať zálohovú faktúru"}
          </h3>
          <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="border-b border-border px-3 py-2">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Hľadať podľa čísla, VS alebo odberateľa…"
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>
        </div>
        <ul className="max-h-96 overflow-auto">
          {loading && <li className="p-4 text-sm text-muted-foreground">Načítavam…</li>}
          {!loading && filtered.length === 0 && (
            <li className="p-4 text-sm text-muted-foreground">
              {mode === "advance" ? "Žiadne zálohové faktúry." : "Žiadne faktúry."}
            </li>
          )}
          {filtered.map((inv) => (
            <li key={inv.id} className="border-b border-border last:border-0">
              <button
                type="button"
                onClick={() => handlePick(inv)}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-muted/60"
              >
                <div>
                  <div className="font-medium">{inv.invoice_number}</div>
                  <div className="text-xs text-muted-foreground">
                    {inv.customer_name} · {inv.issue_date}
                  </div>
                </div>
                <div className="tabular-nums font-medium">
                  {Number(inv.total).toFixed(2)} {inv.currency}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
