import { PreddefinovanaPoznamka } from "./PreddefinovanaPoznamka";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { toast } from "sonner";
import { potvrd } from "@/lib/potvrdenie";
import { useServerFn } from "@tanstack/react-start";
import { prepocitajPrijatuFn } from "@/lib/faktero/kurzy.functions";
import { najdiDuplicituPrijatejFn } from "@/lib/faktero/prijate-duplicity.functions";
import { textDuplicity } from "@/lib/faktero/prijate-duplicity";
import { ArrowLeft, Upload, Loader2 } from "lucide-react";
import { IcoLookupButton } from "@/components/faktero/IcoLookupButton";
import { JobPicker } from "@/components/faktero/JobPicker";

function today() {
  return new Date().toISOString().slice(0, 10);
}
function addDays(iso: string, d: number) {
  const dt = new Date(iso);
  dt.setDate(dt.getDate() + d);
  return dt.toISOString().slice(0, 10);
}

/**
 * Formulár prijatej faktúry — ten istý na zaevidovanie aj na opravu.
 *
 * Bez úpravy sa preklep v sume dal opraviť len zmazaním a napísaním odznova,
 * čo je na účtovnom doklade zbytočne drsné.
 */
export function PrijataFakturaForm({
  id,
  druh = "regular",
}: {
  id?: string;
  /** Predvolený druh dokladu pri zakladaní — zo zoznamu prijatých záloh. */
  druh?: "regular" | "proforma";
}) {
  const upravujeme = Boolean(id);
  const prepocitaj = useServerFn(prepocitajPrijatuFn);
  const hladajDuplicitu = useServerFn(najdiDuplicituPrijatejFn);
  const [povodnyKluc, setPovodnyKluc] = useState<string | null>(null);
  const navigate = useNavigate();
  const [form, setForm] = useState({
    supplier_name: "",
    supplier_ico: "",
    supplier_dic: "",
    supplier_ic_dph: "",
    supplier_iban: "",
    variable_symbol: "",
    constant_symbol: "",
    specific_symbol: "",
    order_number: "",
    delivery_note_number: "",
    invoice_number: "",
    issue_date: today(),
    received_date: today(),
    due_date: addDays(today(), 14),
    amount_without_vat: "" as string,
    vat_amount: "" as string,
    amount_total: "" as string,
    currency: "EUR",
    payment_method: "prevod",
    note: "",
    job_id: "",
    status: "received" as "draft" | "received" | "booked" | "paid" | "cancelled",
    /* Výkazy k DPH: kto daň platí, či si ju odpočítavame a čo doklad opravuje. */
    dph_rezim: "" as "" | "tuzemsko" | "samozdanenie" | "nadobudnutie" | "dovoz" | "bez_dane",
    delivery_date: "",
    odpocet: true,
    opravuje_cislo: "",
    /*
      Zálohová faktúra od dodávateľa nie je daňový doklad — platí sa, ale daň
      prinesie až ostrá faktúra. Preto má vlastný typ a do výkazov nevstupuje.
    */
    type: druh as "regular" | "proforma",
    /** Prijatá záloha, ktorú táto faktúra zúčtováva. */
    advance_invoice_id: "",
  });
  /** Nezúčtované prijaté zálohy toho istého dodávateľa. */
  const [zalohy, setZalohy] = useState<
    { id: string; invoice_number: string; amount_total: number; currency: string }[]
  >([]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [nacitavam, setNacitavam] = useState(Boolean(id));
  /*
    Doklad, ktorý sa nenačítal. Bez tohto sa vykreslil prázdny formulár
    „Úprava prijatej faktúry" — chybová bublina zmizla, na obrazovke ostalo
    18 prázdnych polí a nič nenaznačovalo, že sa upravuje neexistujúci doklad.
  */
  const [nenajdene, setNenajdene] = useState(false);
  /** Príloha, ktorá je na faktúre už uložená — nová ju nahradí. */
  const [prilohaCesta, setPrilohaCesta] = useState<string | null>(null);

  /*
    Faktúra v cudzej mene sa do priznania k DPH uvádza v eurách, prepočítaná
    kurzom ECB zo dňa pred dodaním. Prepočet robí server hneď po uložení —
    inak by doklad vo výkazoch chýbal alebo by tam bol v cudzej sume.
  */
  async function doplnKurz(id: string) {
    if (!form.currency || form.currency === "EUR") return;
    try {
      await prepocitaj({ data: { id } });
    } catch {
      toast.warning("Kurz ECB sa nepodarilo načítať — prepočet doplňte pred podaním DPH.");
    }
  }

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  useEffect(() => {
    if (!id) return;
    let zrusene = false;
    (async () => {
      const { data, error } = await supabase
        .from("purchase_invoices")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (zrusene) return;
      if (error || !data) {
        toast.error("Prijatú faktúru sa nepodarilo načítať.");
        setNenajdene(true);
        setNacitavam(false);
        return;
      }
      // Kľúč faktúry pri načítaní — otázka na duplicitu len keď sa zmení.
      setPovodnyKluc(
        [data.invoice_number, data.supplier_ico, data.supplier_name].map((x) => String(x ?? "").trim()).join("|"),
      );
      setForm({
        supplier_name: data.supplier_name ?? "",
        supplier_ico: data.supplier_ico ?? "",
        supplier_dic: data.supplier_dic ?? "",
        supplier_ic_dph: data.supplier_ic_dph ?? "",
        supplier_iban: data.supplier_iban ?? "",
        variable_symbol: data.variable_symbol ?? "",
        constant_symbol: (data as any).constant_symbol ?? "",
        specific_symbol: (data as any).specific_symbol ?? "",
        order_number: (data as any).order_number ?? "",
        delivery_note_number: (data as any).delivery_note_number ?? "",
        invoice_number: data.invoice_number ?? "",
        issue_date: data.issue_date ?? today(),
        received_date: data.received_date ?? today(),
        due_date: data.due_date ?? today(),
        amount_without_vat: data.amount_without_vat?.toString() ?? "",
        vat_amount: data.vat_amount?.toString() ?? "",
        amount_total: data.amount_total?.toString() ?? "",
        currency: data.currency ?? "EUR",
        payment_method: data.payment_method ?? "prevod",
        note: data.note ?? "",
        job_id: data.job_id ?? "",
        status: (data.status ?? "received") as typeof form.status,
        dph_rezim: (data.dph_rezim ?? "") as typeof form.dph_rezim,
        delivery_date: data.delivery_date ?? "",
        odpocet: data.odpocet !== false,
        opravuje_cislo: data.opravuje_cislo ?? "",
        type: ((data as any).type ?? "regular") as "regular" | "proforma",
        advance_invoice_id: (data as any).advance_invoice_id ?? "",
      });
      setPrilohaCesta(data.file_path ?? null);
      setNacitavam(false);
    })();
    return () => {
      zrusene = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /*
    Nezúčtované zálohy toho istého dodávateľa. Hľadá sa podľa IČO, a keď ho
    dodávateľ nemá vyplnené, podľa názvu — inak by sa ponúkali zálohy od
    cudzích firiem.
  */
  useEffect(() => {
    const cid = getActiveCompanyId();
    const ico = form.supplier_ico.trim();
    const nazov = form.supplier_name.trim();
    if (!cid || form.type !== "regular" || (!ico && !nazov)) {
      setZalohy([]);
      return;
    }
    let zrusene = false;
    const t = setTimeout(async () => {
      let q = supabase
        .from("purchase_invoices")
        .select("id, invoice_number, amount_total, currency")
        .eq("company_id", cid)
        .eq("type", "proforma")
        .is("deleted_at", null)
        .order("issue_date", { ascending: false })
        .limit(20);
      q = ico ? q.eq("supplier_ico", ico) : q.ilike("supplier_name", nazov);
      const { data: proformy } = await q;
      if (zrusene) return;
      const ids = (proformy ?? []).map((z: any) => z.id);
      /* Záloha, ktorú už niekto zúčtoval, sa druhýkrát ponúkať nemá. */
      const { data: pouzite } = ids.length
        ? await supabase
            .from("purchase_invoices")
            .select("advance_invoice_id")
            .eq("company_id", cid)
            .is("deleted_at", null)
            .in("advance_invoice_id", ids)
        : { data: [] as any[] };
      if (zrusene) return;
      const obsadene = new Set((pouzite ?? []).map((r: any) => r.advance_invoice_id));
      setZalohy(
        (proformy ?? [])
          .filter((z: any) => !obsadene.has(z.id) || z.id === form.advance_invoice_id)
          .map((z: any) => ({
            id: z.id,
            invoice_number: z.invoice_number,
            amount_total: Number(z.amount_total ?? 0),
            currency: z.currency ?? "EUR",
          })),
      );
    }, 400);
    return () => {
      zrusene = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.supplier_ico, form.supplier_name, form.type]);

  // auto-compute amount_total when net/vat change
  useEffect(() => {
    const net = parseFloat(form.amount_without_vat || "0");
    const vat = parseFloat(form.vat_amount || "0");
    if (!isNaN(net) || !isNaN(vat)) {
      const total = (isNaN(net) ? 0 : net) + (isNaN(vat) ? 0 : vat);
      set("amount_total", total.toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.amount_without_vat, form.vat_amount]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cid = getActiveCompanyId();
    if (!cid) return toast.error("Vyberte firmu.");
    if (!form.supplier_name.trim()) return toast.error("Zadajte dodávateľa.");
    if (!form.invoice_number.trim()) return toast.error("Zadajte číslo faktúry.");
    // Splatnosť pred vystavením je takmer vždy preklep v roku či mesiaci.
    if (form.due_date && form.issue_date && form.due_date < form.issue_date)
      return toast.error("Splatnosť je skôr ako dátum vystavenia — skontrolujte dátumy.");

    setBusy(true);
    try {
      /*
        Tá istá faktúra už v evidencii je (prišla mailom, zadal ju niekto iný)?
        Druhýkrát by bola náklad, odpočet DPH aj platba. Pýta sa pri novej
        faktúre a pri úprave, keď sa zmenilo číslo či dodávateľ.
      */
      const kluc = [form.invoice_number, form.supplier_ico, form.supplier_name]
        .map((x) => String(x ?? "").trim())
        .join("|");
      const dup = id && kluc === povodnyKluc ? null : await hladajDuplicitu({
        data: {
          company_id: cid,
          invoice_number: form.invoice_number.trim(),
          supplier_ico: form.supplier_ico.trim() || null,
          supplier_name: form.supplier_name.trim(),
          supplier_iban: form.supplier_iban.replace(/\s+/g, "") || null,
          amount_total: parseFloat(form.amount_total || "0") || null,
          vylucit_id: id ?? null,
        },
      }).catch(() => null);
      if (
        dup &&
        !(await potvrd(`${textDuplicity(dup)}\nUložiť ju aj tak druhýkrát?`, {
          potvrdit: "Uložiť aj tak",
          zrusit: "Neukladať",
          nebezpecne: true,
        }))
      ) {
        setBusy(false);
        return;
      }
      const { data: user } = await supabase.auth.getUser();
      // Optional PDF upload first
      let file_path: string | null = null;
      let file_mime: string | null = null;
      let file_size: number | null = null;
      if (file) {
        const ext = file.name.split(".").pop() ?? "bin";
        const path = `${cid}/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage
          .from("purchase-invoices")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (up.error) throw new Error(`Upload PDF zlyhal: ${up.error.message}`);
        file_path = path;
        file_mime = file.type || null;
        file_size = file.size;
      }

      const payload = {
        company_id: cid,
        created_by: user.user?.id ?? null,
        source: "rucne",
        supplier_name: form.supplier_name.trim(),
        supplier_ico: form.supplier_ico.trim() || null,
        supplier_dic: form.supplier_dic.trim() || null,
        supplier_ic_dph: form.supplier_ic_dph.trim() || null,
        // IBAN bez medzier, aby sa dal rovno použiť v platobnom príkaze.
        supplier_iban: form.supplier_iban.replace(/\s+/g, "").toUpperCase() || null,
        variable_symbol: form.variable_symbol.trim() || null,
        constant_symbol: form.constant_symbol.trim() || null,
        specific_symbol: form.specific_symbol.trim() || null,
        order_number: form.order_number.trim() || null,
        delivery_note_number: form.delivery_note_number.trim() || null,
        invoice_number: form.invoice_number.trim(),
        issue_date: form.issue_date,
        received_date: form.received_date,
        due_date: form.due_date,
        amount_without_vat: parseFloat(form.amount_without_vat || "0") || 0,
        vat_amount: parseFloat(form.vat_amount || "0") || 0,
        amount_total: parseFloat(form.amount_total || "0") || 0,
        currency: form.currency,
        payment_method: form.payment_method || null,
        note: form.note || null,
        job_id: form.job_id || null,
        status: form.status,
        dph_rezim: form.dph_rezim || null,
        delivery_date: form.delivery_date || null,
        // Zo zálohovej faktúry sa daň neodpočítava a výkazy ju nevidia.
        odpocet: form.type === "proforma" ? false : form.odpocet,
        opravuje_cislo: form.opravuje_cislo.trim() || null,
        type: form.type,
        advance_invoice_id:
          form.type === "regular" && form.advance_invoice_id ? form.advance_invoice_id : null,
        file_path,
        file_mime,
        file_size,
      };
      if (id) {
        // Autora ani firmu úprava nemení; nová príloha sa doplní, len keď je.
        const { created_by, company_id, ...zmeny } = payload;
        const uprava: Record<string, unknown> = { ...zmeny };
        if (!file) {
          delete uprava.file_path;
          delete uprava.file_mime;
          delete uprava.file_size;
        }
        const { error } = await supabase
          .from("purchase_invoices")
          .update(uprava as never)
          .eq("id", id);
        if (error) throw error;
        await doplnKurz(id);
        toast.success("Zmeny sú uložené");
        navigate({ to: "/prijate-faktury/$id", params: { id } });
        return;
      }
      const { data, error } = await supabase
        .from("purchase_invoices")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      await doplnKurz(data!.id);
      toast.success("Prijatá faktúra bola uložená");
      navigate({ to: "/prijate-faktury/$id", params: { id: data!.id } });
    } catch (e: any) {
      toast.error(e?.message ?? "Uloženie zlyhalo");
    } finally {
      setBusy(false);
    }
  }

  if (nacitavam) {
    return (
      <PageBody>
        <div className="text-sm text-muted-foreground">Načítavam…</div>
      </PageBody>
    );
  }

  if (nenajdene) {
    return (
      <>
        <PageHeader title="Prijatá faktúra sa nenašla" />
        <PageBody>
          <div className="rounded-md border border-border p-6 text-sm text-muted-foreground">
            Doklad neexistuje alebo patrí inej firme.{" "}
            <Link to="/prijate-faktury" className="text-primary hover:underline">
              Späť na prijaté faktúry
            </Link>
          </div>
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={
          form.type === "proforma"
            ? upravujeme
              ? "Úprava prijatej zálohovej faktúry"
              : "Nová prijatá zálohová faktúra"
            : upravujeme
              ? "Úprava prijatej faktúry"
              : "Nová prijatá faktúra"
        }
        description={
          form.type === "proforma"
            ? "Zálohová faktúra od dodávateľa — platí sa, ale daň z nej neodpočítavate."
            : upravujeme
              ? "Opravte údaje dokladu. Doklad z uzamknutého obdobia sa zmeniť nedá."
              : "Zaevidujte faktúru od dodávateľa (nákup / výdavok)."
        }
        action={
          <Link
            to={form.type === "proforma" ? "/prijate-zalohove" : "/prijate-faktury"}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-secondary"
          >
            <ArrowLeft className="h-4 w-4" /> Späť
          </Link>
        }
      />
      <PageBody>
        <form onSubmit={submit} className="mx-auto grid max-w-4xl gap-6">
          <section className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Dodávateľ
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Názov *">
                <input
                  required
                  value={form.supplier_name}
                  onChange={(e) => set("supplier_name", e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="IČO">
                <div className="flex -space-x-px items-start">
                  <input
                    value={form.supplier_ico}
                    onChange={(e) => set("supplier_ico", e.target.value)}
                    className="input flex-1 rounded-l-md focus:z-10"
                  />
                  <IcoLookupButton
                    ico={form.supplier_ico}
                    onResult={(r) => {
                      if (r.name) set("supplier_name", r.name);
                      if (r.dic) set("supplier_dic", r.dic);
                      if (r.ic_dph) set("supplier_ic_dph", r.ic_dph);
                    }}
                  />
                </div>
              </Field>
              <Field label="DIČ">
                <input
                  value={form.supplier_dic}
                  onChange={(e) => set("supplier_dic", e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="IČ DPH">
                <input
                  value={form.supplier_ic_dph}
                  onChange={(e) => set("supplier_ic_dph", e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="IBAN dodávateľa">
                <input
                  value={form.supplier_iban}
                  onChange={(e) => set("supplier_iban", e.target.value)}
                  placeholder="SK00 0000 0000 0000 0000 0000"
                  className="input font-mono"
                />
              </Field>
              <Field label="Variabilný symbol">
                <input
                  value={form.variable_symbol}
                  onChange={(e) => set("variable_symbol", e.target.value)}
                  placeholder={form.invoice_number || "napr. 20260112"}
                  className="input"
                />
              </Field>
              <Field label="Konštantný symbol">
                <input
                  value={form.constant_symbol}
                  onChange={(e) => set("constant_symbol", e.target.value)}
                  inputMode="numeric"
                  maxLength={4}
                  className="input"
                />
              </Field>
              <Field label="Špecifický symbol">
                <input
                  value={form.specific_symbol}
                  onChange={(e) => set("specific_symbol", e.target.value)}
                  inputMode="numeric"
                  maxLength={10}
                  className="input"
                />
              </Field>
              <Field label="Číslo objednávky">
                <input value={form.order_number} onChange={(e) => set("order_number", e.target.value)} className="input" />
              </Field>
              <Field label="Číslo dodacieho listu">
                <input
                  value={form.delivery_note_number}
                  onChange={(e) => set("delivery_note_number", e.target.value)}
                  className="input"
                />
              </Field>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Faktúra
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Druh dokladu">
                <select
                  value={form.type}
                  onChange={(e) => set("type", e.target.value as "regular" | "proforma")}
                  className="input"
                >
                  <option value="regular">Prijatá faktúra (daňový doklad)</option>
                  <option value="proforma">Prijatá zálohová faktúra</option>
                </select>
                {form.type === "proforma" && (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Do výkazov k DPH nevstupuje. Daň si odpočítate až z ostrej faktúry.
                  </span>
                )}
              </Field>
              {form.type === "regular" && zalohy.length > 0 && (
                <Field label="Zúčtováva prijatú zálohu">
                  <select
                    value={form.advance_invoice_id}
                    onChange={(e) => set("advance_invoice_id", e.target.value)}
                    className="input"
                  >
                    <option value="">— žiadnu —</option>
                    {zalohy.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.invoice_number} · {z.amount_total.toFixed(2)} {z.currency}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Číslo faktúry dodávateľa *">
                <input
                  required
                  value={form.invoice_number}
                  onChange={(e) => set("invoice_number", e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Dátum vystavenia">
                <input
                  type="date"
                  required
                  value={form.issue_date}
                  onChange={(e) => set("issue_date", e.target.value)}
                  className="input"
                />
              </Field>
              {/* Dátum dodania = deň daňového plnenia: rozhoduje o období DPH
                  a ide do kontrolného výkazu aj do Pohody (dateTax). */}
              <Field label="Dátum dodania (daňového plnenia)">
                <input
                  type="date"
                  value={form.delivery_date}
                  onChange={(e) => set("delivery_date", e.target.value)}
                  className="input"
                />
                <span className="mt-1 block text-xs text-muted-foreground">
                  Rozhoduje o období DPH. Prázdne = dátum vystavenia.
                </span>
              </Field>
              <Field label="Dátum prijatia">
                <input
                  type="date"
                  required
                  value={form.received_date}
                  onChange={(e) => set("received_date", e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Dátum splatnosti">
                <input
                  type="date"
                  required
                  value={form.due_date}
                  onChange={(e) => set("due_date", e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Spôsob platby">
                <select
                  value={form.payment_method}
                  onChange={(e) => set("payment_method", e.target.value)}
                  className="input"
                >
                  <option value="prevod">Prevod</option>
                  <option value="hotovost">Hotovosť</option>
                  <option value="karta">Karta</option>
                  <option value="dobierka">Dobierka</option>
                  <option value="inkaso">Inkaso</option>
                  <option value="zaloha">Úhrada zálohou</option>
                  <option value="zapocet">Zápočet</option>
                </select>
              </Field>
              <Field label="Stav">
                <select
                  value={form.status}
                  onChange={(e) => set("status", e.target.value as any)}
                  className="input"
                >
                  <option value="draft">Koncept</option>
                  <option value="received">Prijaté</option>
                  <option value="booked">Zaúčtované</option>
                  <option value="paid">Zaplatené</option>
                </select>
              </Field>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Sumy
            </h3>
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Bez DPH">
                <input
                  type="number"
                  step="0.01"
                  value={form.amount_without_vat}
                  onChange={(e) => set("amount_without_vat", e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="DPH">
                <input
                  type="number"
                  step="0.01"
                  value={form.vat_amount}
                  onChange={(e) => set("vat_amount", e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Celkom">
                <input
                  type="number"
                  step="0.01"
                  value={form.amount_total}
                  onChange={(e) => set("amount_total", e.target.value)}
                  className="input font-semibold"
                />
              </Field>
              <Field label="Mena">
                <select
                  value={form.currency}
                  onChange={(e) => set("currency", e.target.value)}
                  className="input"
                >
                  <option value="EUR">EUR</option>
                  <option value="CZK">CZK</option>
                  <option value="USD">USD</option>
                </select>
              </Field>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Príloha & poznámka
            </h3>
            <Field label="PDF príloha">
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-background px-4 py-6 text-sm text-muted-foreground hover:bg-muted/30">
                <Upload className="h-4 w-4" />
                {file
                  ? file.name
                  : prilohaCesta
                    ? "Priložený súbor ostáva — kliknutím ho nahradíte"
                    : "Kliknite pre výber PDF/obrázka"}
                <input
                  type="file"
                  className="hidden"
                  accept="application/pdf,image/*"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </Field>
            <JobPicker
              value={form.job_id}
              onChange={(v) => set("job_id", v)}
              label="Zákazka (náklad sa započíta do jej vyhodnotenia)"
            />
            <Field label="Režim DPH">
              <select
                value={form.dph_rezim}
                onChange={(e) => set("dph_rezim", e.target.value as typeof form.dph_rezim)}
                className="input"
              >
                <option value="">Určiť podľa dodávateľa</option>
                <option value="tuzemsko">Tuzemská faktúra od platiteľa (B.2)</option>
                <option value="samozdanenie">Daň platím ja — § 69 (B.1)</option>
                <option value="nadobudnutie">Nadobudnutie tovaru z EÚ</option>
                <option value="dovoz">Dovoz — daň zaplatená colnému úradu</option>
                <option value="bez_dane">Bez dane / od neplatiteľa</option>
              </select>
              <span className="mt-1 block text-xs text-muted-foreground">
                Rozhoduje, do ktorej časti kontrolného výkazu a do ktorého riadku priznania faktúra
                vstúpi.
              </span>
            </Field>
            <Field label="Odpočítanie dane">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.odpocet}
                  onChange={(e) => set("odpocet", e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                Daň si z tejto faktúry odpočítavam
              </label>
            </Field>
            <Field label="Opravuje faktúru číslo">
              <input
                value={form.opravuje_cislo}
                onChange={(e) => set("opravuje_cislo", e.target.value)}
                placeholder="pri dobropise číslo pôvodnej faktúry"
                className="input"
              />
            </Field>
            <Field label="Poznámka">
              <textarea
                rows={3}
                value={form.note}
                onChange={(e) => set("note", e.target.value)}
                className="input"
              />
              <PreddefinovanaPoznamka
                companyId={getActiveCompanyId()}
                onVyber={(t) => set("note", form.note ? `${form.note}\n${t}` : t)}
              />
            </Field>
          </section>

          <div className="flex justify-end gap-2">
            <Link
              to="/prijate-faktury"
              className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm hover:bg-secondary"
            >
              Zrušiť
            </Link>
            <button
              disabled={busy}
              type="submit"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {upravujeme ? "Uložiť zmeny" : "Uložiť prijatú faktúru"}
            </button>
          </div>
        </form>
      </PageBody>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
      {children}
    </label>
  );
}
