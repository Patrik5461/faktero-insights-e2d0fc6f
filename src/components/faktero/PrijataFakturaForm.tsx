import { PreddefinovanaPoznamka } from "./PreddefinovanaPoznamka";
import { vsPrijatejNaUlozenie, vsZCislaPrijatej } from "@/lib/faktero/variabilny-symbol";
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
import { Upload, Loader2 } from "lucide-react";
import { formatujCislo, formatujMenu } from "@/lib/faktero/mena";
import { IcoLookupButton } from "@/components/faktero/IcoLookupButton";
import { JobPicker } from "@/components/faktero/JobPicker";
import { VozidloPicker } from "@/components/faktero/VozidloPicker";
import { vsetkyRiadky } from "@/lib/faktero/strankovanie";
import { RegistrPlatcuDph } from "@/components/faktero/RegistrPlatcuDph";
import { dicPreRegister, ucetNaIban } from "@/lib/faktero/cz-registr-dph";
import { useT } from "@/lib/i18n/useT";
import { upravIban } from "@/lib/faktero/platobny-ucet";
import { PravidloZDokladu } from "@/components/faktero/PravidloZDokladu";
import { PrijataUpravaKompaktna } from "@/components/faktero/PrijataUpravaKompaktna";
import type { PolozkaK } from "@/components/faktero/DetailDokladuKompaktny";

import { dnesBratislava, posunDni } from "@/lib/faktero/datum-vystavenia";
function today() {
  return dnesBratislava();
}
function addDays(iso: string, d: number) {
  return posunDni(iso, d);
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
  kompaktne,
}: {
  id?: string;
  /** Predvolený druh dokladu pri zakladaní — zo zoznamu prijatých záloh. */
  druh?: "regular" | "proforma";
  /** Kompaktné rozloženie úpravy: vľavo náhľad dokladu, vpravo panel s poliami. */
  kompaktne?: boolean;
}) {
  const { t } = useT();
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
    vehicle_id: "",
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
  /*
    Dodávatelia z adresára (Kontakty → Dodávatelia). Výber doplní údaje
    dodávateľa; nový dodávateľ sa po uložení faktúry do adresára pridá sám.
  */
  const [dodavatelia, setDodavatelia] = useState<any[]>([]);
  const [adresaDodavatela, setAdresaDodavatela] = useState<Record<string, string | null> | null>(
    null,
  );
  const [pridatDoAdresara, setPridatDoAdresara] = useState(true);
  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    vsetkyRiadky((od, po) =>
      supabase
        .from("customers")
        .select("id, name, ico, dic, ic_dph, iban, street, city, zip, country, email")
        .eq("company_id", cid)
        .eq("dodavatel", true)
        .is("deleted_at", null)
        .order("id")
        .range(od, po),
    )
      .then((r) => setDodavatelia(r.sort((a: any, b: any) => a.name.localeCompare(b.name, "sk"))))
      .catch(() => setDodavatelia([]));
  }, []);
  const icoBezMedzier = form.supplier_ico.replace(/\s+/g, "");
  const znamyDodavatel = dodavatelia.find((d) =>
    icoBezMedzier
      ? String(d.ico ?? "").replace(/\s+/g, "") === icoBezMedzier
      : d.name.trim().toLowerCase() === form.supplier_name.trim().toLowerCase(),
  );
  function vyberDodavatela(idDodavatela: string) {
    const d = dodavatelia.find((x) => x.id === idDodavatela);
    if (!d) return;
    setForm((p) => ({
      ...p,
      supplier_name: d.name ?? "",
      supplier_ico: d.ico ?? "",
      supplier_dic: d.dic ?? "",
      supplier_ic_dph: d.ic_dph ?? "",
      supplier_iban: d.iban ?? p.supplier_iban,
    }));
    setAdresaDodavatela({
      supplier_street: d.street,
      supplier_city: d.city,
      supplier_zip: d.zip,
      supplier_country: d.country,
      supplier_email: d.email,
    });
  }

  /** Dodávateľ z novej faktúry do adresára — ak tam ešte nie je. Nezhodí uloženie faktúry. */
  async function ulozDodavatelaDoAdresara(cid: string) {
    if (!pridatDoAdresara || znamyDodavatel || !form.supplier_name.trim()) return;
    try {
      // Kontakt môže v adresári byť ako odberateľ — vtedy sa mu len pridá rola.
      if (icoBezMedzier) {
        const { data: uz } = await supabase
          .from("customers")
          .select("id")
          .eq("company_id", cid)
          .eq("ico", icoBezMedzier)
          .is("deleted_at", null)
          .limit(1);
        if (uz?.length) {
          await supabase.from("customers").update({ dodavatel: true }).eq("id", uz[0].id);
          return;
        }
      }
      await supabase.from("customers").insert({
        company_id: cid,
        name: form.supplier_name.trim(),
        ico: icoBezMedzier || null,
        dic: form.supplier_dic.trim() || null,
        ic_dph: form.supplier_ic_dph.trim() || null,
        iban: form.supplier_iban.replace(/\s+/g, "").toUpperCase() || null,
        odberatel: false,
        dodavatel: true,
      });
    } catch (e) {
      console.warn("[prijata] dodávateľ do adresára:", e);
    }
  }
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
  const [prilohaMime, setPrilohaMime] = useState<string | null>(null);
  /** Kódy zaúčtovania a položky — len na čítanie (pravidlo z dokladu, kompaktná úprava). */
  const [kody, setKody] = useState({ predkontacia: "", clenenie: "", kv: "", kategoria: "" });
  const [polozkyDokladu, setPolozkyDokladu] = useState<PolozkaK[]>([]);

  /*
    Faktúra v cudzej mene sa do priznania k DPH uvádza v domácej mene firmy
    (SK eurá kurzom ECB zo dňa pred dodaním, CZ koruny kurzom ČNB). Prepočet robí server hneď po uložení —
    inak by doklad vo výkazoch chýbal alebo by tam bol v cudzej sume.
  */
  async function doplnKurz(id: string) {
    // Či je mena domáca (SK eurá, CZ koruny), rozhodne server podľa krajiny firmy.
    if (!form.currency) return;
    try {
      await prepocitaj({ data: { id } });
    } catch {
      toast.warning(t("Kurz sa nepodarilo načítať — prepočet doplňte pred podaním DPH."));
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
        toast.error(t("Prijatú faktúru sa nepodarilo načítať."));
        setNenajdene(true);
        setNacitavam(false);
        return;
      }
      // Kľúč faktúry pri načítaní — otázka na duplicitu len keď sa zmení.
      setPovodnyKluc(
        [data.invoice_number, data.supplier_ico, data.supplier_name]
          .map((x) => String(x ?? "").trim())
          .join("|"),
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
        amount_without_vat:
          data.amount_without_vat != null ? formatujCislo(data.amount_without_vat, 2, 2) : "",
        vat_amount: data.vat_amount != null ? formatujCislo(data.vat_amount, 2, 2) : "",
        amount_total: data.amount_total != null ? formatujCislo(data.amount_total, 2, 2) : "",
        currency: data.currency ?? "EUR",
        payment_method: data.payment_method ?? "prevod",
        note: data.note ?? "",
        job_id: data.job_id ?? "",
        vehicle_id: (data as any).vehicle_id ?? "",
        status: (data.status ?? "received") as typeof form.status,
        dph_rezim: (data.dph_rezim ?? "") as typeof form.dph_rezim,
        delivery_date: data.delivery_date ?? "",
        odpocet: data.odpocet !== false,
        opravuje_cislo: data.opravuje_cislo ?? "",
        type: ((data as any).type ?? "regular") as "regular" | "proforma",
        advance_invoice_id: (data as any).advance_invoice_id ?? "",
      });
      setPrilohaCesta(data.file_path ?? null);
      setPrilohaMime(data.file_mime ?? null);
      setKody({
        predkontacia: (data as any).pohoda_predkontacia ?? "",
        clenenie: (data as any).pohoda_clenenie_dph ?? "",
        kv: (data as any).kv_clenenie ?? "",
        kategoria: (data as any).category ?? "",
      });
      setPolozkyDokladu(Array.isArray(data.items) ? (data.items as PolozkaK[]) : []);
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
    const casovac = setTimeout(async () => {
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
      clearTimeout(casovac);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.supplier_ico, form.supplier_name, form.type]);

  // auto-compute amount_total when net/vat change
  useEffect(() => {
    const net = sumaZPola(form.amount_without_vat || "0");
    const vat = sumaZPola(form.vat_amount || "0");
    if (!isNaN(net) || !isNaN(vat)) {
      const total = (isNaN(net) ? 0 : net) + (isNaN(vat) ? 0 : vat);
      set("amount_total", formatujCislo(total, 2, 2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.amount_without_vat, form.vat_amount]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cid = getActiveCompanyId();
    if (!cid) return toast.error(t("Vyberte firmu."));
    if (!form.supplier_name.trim()) return toast.error(t("Zadajte dodávateľa."));
    if (!form.invoice_number.trim()) return toast.error(t("Zadajte číslo faktúry."));
    // Splatnosť pred vystavením je takmer vždy preklep v roku či mesiaci.
    if (form.due_date && form.issue_date && form.due_date < form.issue_date)
      return toast.error(t("Splatnosť je skôr ako dátum vystavenia — skontrolujte dátumy."));

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
      const dup =
        id && kluc === povodnyKluc
          ? null
          : await hladajDuplicitu({
              data: {
                company_id: cid,
                invoice_number: form.invoice_number.trim(),
                supplier_ico: form.supplier_ico.trim() || null,
                supplier_name: form.supplier_name.trim(),
                supplier_iban: form.supplier_iban.replace(/\s+/g, "") || null,
                amount_total: sumaZPola(form.amount_total || "0") || null,
                vylucit_id: id ?? null,
              },
            }).catch(() => null);
      if (
        dup &&
        !(await potvrd(`${t(textDuplicity(dup))}\n${t("Uložiť ju aj tak druhýkrát?")}`, {
          potvrdit: t("Uložiť aj tak"),
          zrusit: t("Neukladať"),
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
        if (up.error) throw new Error(t("Upload PDF zlyhal: {chyba}", { chyba: up.error.message }));
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
        // Bez VS sa vezme číslo faktúry, keď je celé z číslic (tak ho dáva väčšina dodávateľov).
        variable_symbol: vsPrijatejNaUlozenie(form.variable_symbol, form.invoice_number),
        constant_symbol: form.constant_symbol.trim() || null,
        specific_symbol: form.specific_symbol.trim() || null,
        order_number: form.order_number.trim() || null,
        delivery_note_number: form.delivery_note_number.trim() || null,
        invoice_number: form.invoice_number.trim(),
        issue_date: form.issue_date,
        received_date: form.received_date,
        due_date: form.due_date,
        amount_without_vat: sumaZPola(form.amount_without_vat || "0") || 0,
        vat_amount: sumaZPola(form.vat_amount || "0") || 0,
        amount_total: sumaZPola(form.amount_total || "0") || 0,
        currency: form.currency,
        payment_method: form.payment_method || null,
        note: form.note || null,
        job_id: form.job_id || null,
        vehicle_id: form.vehicle_id || null,
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
        toast.success(t("Zmeny sú uložené"));
        navigate({ to: "/prijate-faktury/$id", params: { id } });
        return;
      }
      const { data, error } = await supabase
        .from("purchase_invoices")
        .insert({ ...(znamyDodavatel && adresaDodavatela ? adresaDodavatela : {}), ...payload })
        .select("id")
        .single();
      if (error) throw error;
      await ulozDodavatelaDoAdresara(cid);
      await doplnKurz(data!.id);
      toast.success(t("Prijatá faktúra bola uložená"));
      navigate({ to: "/prijate-faktury/$id", params: { id: data!.id } });
    } catch (e: any) {
      toast.error(t(e?.message ?? "Uloženie zlyhalo"));
    } finally {
      setBusy(false);
    }
  }

  if (nacitavam) {
    return (
      <PageBody>
        <div className="text-sm text-muted-foreground">{t("Načítavam…")}</div>
      </PageBody>
    );
  }

  if (nenajdene) {
    return (
      <>
        <PageHeader title={t("Prijatá faktúra sa nenašla")} />
        <PageBody>
          <div className="rounded-md border border-border p-6 text-sm text-muted-foreground">
            {t("Doklad neexistuje alebo patrí inej firme.")}{" "}
            <Link to="/prijate-faktury" className="text-primary hover:underline">
              {t("Späť na prijaté faktúry")}
            </Link>
          </div>
        </PageBody>
      </>
    );
  }

  // Zelená fajka pri sumách a IBAN-e v kompaktnom rozložení.
  const sumaSedi = (() => {
    const z = sumaZPola(form.amount_without_vat || "0");
    const d = sumaZPola(form.vat_amount || "0");
    const c = sumaZPola(form.amount_total || "0");
    return Number.isFinite(c) && c !== 0 && Math.abs((z || 0) + (d || 0) - c) < 0.015;
  })();
  const ibanOk = Boolean(form.supplier_iban.trim() && upravIban(form.supplier_iban));

  /*
    Polia formulára sú raz — klasické rozloženie ich skladá do štyroch kariet,
    kompaktné do úzkeho panelu vedľa náhľadu dokladu (ako Nespracované).
  */
  const poliaDodavatela = (
    <>
      {dodavatelia.length > 0 && (
        <Field label="Z adresára dodávateľov">
          <select
            value={znamyDodavatel?.id ?? ""}
            onChange={(e) => vyberDodavatela(e.target.value)}
            className="input"
          >
            <option value="">{t("— vybrať dodávateľa —")}</option>
            {dodavatelia.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.ico ? ` · ${t("IČO {ico}", { ico: d.ico })}` : ""}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Názov *">
        <input
          required
          value={form.supplier_name}
          onChange={(e) => set("supplier_name", e.target.value)}
          className="input"
        />
      </Field>
      <Field label="IČO">
        {/* Úzky stĺpec (Kompaktné rozloženie): tlačidlo radšej pod pole, než aby sa IČO orezalo. */}
        <div className="flex flex-wrap -space-x-px items-start">
          <input
            value={form.supplier_ico}
            onChange={(e) => set("supplier_ico", e.target.value)}
            className="input min-w-[7.5rem] flex-1 rounded-l-md focus:z-10"
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
      <OverenieRegistraCz
        dic={form.supplier_dic}
        icDph={form.supplier_ic_dph}
        iban={form.supplier_iban}
      />
      {!upravujeme && !znamyDodavatel && form.supplier_name.trim() && (
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={pridatDoAdresara}
            onChange={(e) => setPridatDoAdresara(e.target.checked)}
          />
          <span>
            {t("Uložiť dodávateľa do adresára")}
            <span className="block text-xs text-muted-foreground">
              {t("Nabudúce ho vyberiete zo zoznamu a údaje sa doplnia samy.")}
            </span>
          </span>
        </label>
      )}
    </>
  );
  const poliaPlatby = (
    <>
      <Field label="Variabilný symbol">
        <input
          value={form.variable_symbol}
          onChange={(e) => set("variable_symbol", e.target.value)}
          placeholder={vsZCislaPrijatej(form.invoice_number) || t("napr. 20260112")}
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
        <input
          value={form.order_number}
          onChange={(e) => set("order_number", e.target.value)}
          className="input"
        />
      </Field>
      <Field label="Číslo dodacieho listu">
        <input
          value={form.delivery_note_number}
          onChange={(e) => set("delivery_note_number", e.target.value)}
          className="input"
        />
      </Field>
    </>
  );
  const poliaFaktury = (
    <>
      <Field label="Druh dokladu">
        <select
          value={form.type}
          onChange={(e) => set("type", e.target.value as "regular" | "proforma")}
          className="input"
        >
          <option value="regular">{t("Prijatá faktúra (daňový doklad)")}</option>
          <option value="proforma">{t("Prijatá zálohová faktúra")}</option>
        </select>
        {form.type === "proforma" && (
          <span className="mt-1 block text-xs text-muted-foreground">
            {t("Do výkazov k DPH nevstupuje. Daň si odpočítate až z ostrej faktúry.")}
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
            <option value="">{t("— žiadnu —")}</option>
            {zalohy.map((z) => (
              <option key={z.id} value={z.id}>
                {z.invoice_number} · {formatujMenu(z.amount_total, z.currency)}
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
          {t("Rozhoduje o období DPH. Prázdne = dátum vystavenia.")}
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
          <option value="prevod">{t("Prevod")}</option>
          <option value="hotovost">{t("Hotovosť")}</option>
          <option value="karta">{t("Karta")}</option>
          <option value="dobierka">{t("Dobierka")}</option>
          <option value="inkaso">{t("Inkaso")}</option>
          <option value="zaloha">{t("Úhrada zálohou")}</option>
          <option value="zapocet">{t("Zápočet")}</option>
        </select>
      </Field>
      <Field label="Stav">
        <select
          value={form.status}
          onChange={(e) => set("status", e.target.value as any)}
          className="input"
        >
          <option value="draft">{t("Koncept")}</option>
          <option value="received">{t("Prijaté")}</option>
          <option value="booked">{t("Zaúčtované")}</option>
          <option value="paid">{t("Zaplatené")}</option>
        </select>
      </Field>
    </>
  );
  const poliaSum = (
    <>
      <Field label="Bez DPH">
        <input
          type="text"
          inputMode="decimal"
          value={form.amount_without_vat}
          onChange={(e) => set("amount_without_vat", e.target.value)}
          className="input"
        />
      </Field>
      <Field label="DPH">
        <input
          type="text"
          inputMode="decimal"
          value={form.vat_amount}
          onChange={(e) => set("vat_amount", e.target.value)}
          className="input"
        />
      </Field>
      <Field label="Celkom">
        <input
          type="text"
          inputMode="decimal"
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
    </>
  );
  const poliaPrilohy = (
    <>
      <Field label="PDF príloha">
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-background px-4 py-6 text-sm text-muted-foreground hover:bg-muted/30">
          <Upload className="h-4 w-4" />
          {file
            ? file.name
            : prilohaCesta
              ? t("Priložený súbor ostáva — kliknutím ho nahradíte")
              : t("Kliknite pre výber PDF/obrázka")}
          <input
            type="file"
            className="hidden"
            accept="application/pdf,image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </Field>
    </>
  );
  const poliaOstatne = (
    <>
      <JobPicker
        value={form.job_id}
        onChange={(v) => set("job_id", v)}
        label={t("Zákazka (náklad sa započíta do jej vyhodnotenia)")}
      />
      <VozidloPicker value={form.vehicle_id} onChange={(v) => set("vehicle_id", v)} />
      <Field label="Režim DPH">
        <select
          value={form.dph_rezim}
          onChange={(e) => set("dph_rezim", e.target.value as typeof form.dph_rezim)}
          className="input"
        >
          <option value="">{t("Určiť podľa dodávateľa")}</option>
          <option value="tuzemsko">{t("Tuzemská faktúra od platiteľa (B.2)")}</option>
          <option value="samozdanenie">{t("Daň platím ja — § 69 (B.1)")}</option>
          <option value="nadobudnutie">{t("Nadobudnutie tovaru z EÚ")}</option>
          <option value="dovoz">{t("Dovoz — daň zaplatená colnému úradu")}</option>
          <option value="bez_dane">{t("Bez dane / od neplatiteľa")}</option>
        </select>
        <span className="mt-1 block text-xs text-muted-foreground">
          {t(
            "Rozhoduje, do ktorej časti kontrolného výkazu a do ktorého riadku priznania faktúra vstúpi.",
          )}
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
          {t("Daň si z tejto faktúry odpočítavam")}
        </label>
      </Field>
      <Field label="Opravuje faktúru číslo">
        <input
          value={form.opravuje_cislo}
          onChange={(e) => set("opravuje_cislo", e.target.value)}
          placeholder={t("pri dobropise číslo pôvodnej faktúry")}
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
          agenda="prijata_faktura"
          onVyber={(text) => set("note", form.note ? `${form.note}\n${text}` : text)}
        />
      </Field>
    </>
  );

  if (kompaktne && upravujeme)
    return (
      <PrijataUpravaKompaktna
        titulok={t(
          form.type === "proforma"
            ? "Úprava prijatej zálohovej faktúry"
            : "Úprava prijatej faktúry",
        )}
        priloha={prilohaCesta ? { cesta: prilohaCesta, mime: prilohaMime } : null}
        onSubmit={submit}
        busy={busy}
        sumaSedi={sumaSedi}
        ibanOk={ibanOk}
        pravidlo={
          <PravidloZDokladu
            companyId={getActiveCompanyId() ?? ""}
            tlacidlo
            zaklad={{
              druh: "prijata",
              nazov: form.supplier_name,
              ico: form.supplier_ico,
              vs: form.variable_symbol,
              platba: form.payment_method,
              predkontacia: kody.predkontacia,
              clenenie: kody.clenenie,
              kv: kody.kv,
              kategoria: kody.kategoria,
            }}
          />
        }
        zakladne={poliaFaktury}
        sumy={poliaSum}
        dodavatel={poliaDodavatela}
        platba={poliaPlatby}
        poznamka={
          <>
            {poliaOstatne}
            {poliaPrilohy}
          </>
        }
        polozky={polozkyDokladu}
        mena={form.currency}
      />
    );

  return (
    <>
      <PageHeader
        title={t(
          form.type === "proforma"
            ? upravujeme
              ? "Úprava prijatej zálohovej faktúry"
              : "Nová prijatá zálohová faktúra"
            : upravujeme
              ? "Úprava prijatej faktúry"
              : "Nová prijatá faktúra",
        )}
        description={t(
          form.type === "proforma"
            ? "Zálohová faktúra od dodávateľa — platí sa, ale daň z nej neodpočítavate."
            : upravujeme
              ? "Opravte údaje dokladu. Doklad z uzamknutého obdobia sa zmeniť nedá."
              : "Zaevidujte faktúru od dodávateľa (nákup / výdavok).",
        )}
      />
      <PageBody>
        <form onSubmit={submit} className="mx-auto grid max-w-4xl gap-6">
          <section className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("Dodávateľ")}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">{poliaDodavatela}</div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("Faktúra")}
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">{poliaFaktury}</div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("Sumy")}
            </h3>
            <div className="grid gap-3 sm:grid-cols-4">{poliaSum}</div>
          </section>

          {/* Platobné údaje až za dokladom a sumami — sú najmenej dôležité. */}
          <section className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("Platobné údaje")}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">{poliaPlatby}</div>
          </section>

          <section className="space-y-4 rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("Príloha & poznámka")}
            </h3>
            {poliaPrilohy}
            {poliaOstatne}
          </section>

          <div className="flex justify-end gap-2">
            <Link
              to="/prijate-faktury"
              className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm hover:bg-secondary"
            >
              {t("Zrušiť")}
            </Link>
            <button
              disabled={busy}
              type="submit"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {upravujeme ? t("Uložiť zmeny") : t("Uložiť prijatú faktúru")}
            </button>
          </div>
        </form>
      </PageBody>
    </>
  );
}

/** Suma z poľa po slovensky — „1 234,50“ aj „1234.50“. */
function sumaZPola(v: string): number {
  return parseFloat(
    String(v)
      .replace(/[\s\u00a0\u202f]/g, "")
      .replace(",", "."),
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { t } = useT();
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium text-muted-foreground">{t(label)}</div>
      {children}
    </label>
  );
}

/**
 * Česká firma: pri zadaní českého DIČ a IBAN-u dodávateľa hneď overí Registr
 * plátců DPH (nespoľahlivý platca, zverejnený účet). Pýta sa až po chvíli
 * bez písania a len keď je účet celý (alebo prázdny), nie pri každom znaku.
 */
function OverenieRegistraCz({ dic, icDph, iban }: { dic: string; icDph: string; iban: string }) {
  const [hodnoty, setHodnoty] = useState({ dic, icDph, iban });
  useEffect(() => {
    const casovac = setTimeout(() => setHodnoty({ dic, icDph, iban }), 700);
    return () => clearTimeout(casovac);
  }, [dic, icDph, iban]);
  const cid = getActiveCompanyId();
  const ucetOk = !hodnoty.iban.trim() || ucetNaIban(hodnoty.iban) != null;
  if (!cid || !ucetOk || !(dicPreRegister(hodnoty.icDph) ?? dicPreRegister(hodnoty.dic)))
    return null;
  return (
    <div className="sm:col-span-2">
      <RegistrPlatcuDph
        key={`${hodnoty.dic}|${hodnoty.icDph}|${hodnoty.iban}`}
        companyId={cid}
        dic={hodnoty.dic}
        icDph={hodnoty.icDph}
        iban={hodnoty.iban.replace(/\s+/g, "") || null}
      />
    </div>
  );
}
