import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Package, Plus, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { CustomerSearch } from "@/components/faktero/OdberatelPicker";
import { JobPicker } from "@/components/faktero/JobPicker";
import { ulozSamofakturuFn } from "@/lib/faktero/samofakturacia.functions";
import {
  chybaDohody,
  dodavatelPlatitel,
  prepocitajPolozku,
  stavSamofaktury,
  sumySamofaktury,
  zlavaDokladuSuma,
} from "@/lib/faktero/samofakturacia";
import { krajinaDane, sadzbyKrajiny, zakladnaSadzba } from "@/lib/faktero/vat-rates";
import { MENY, formatovacMeny } from "@/lib/faktero/mena";
import { UPRAVY_NA_VYBER } from "@/lib/faktero/faktura-nalezitosti";
import { JAZYKY_DOKLADU } from "@/lib/faktero/faktura-jazyk";

function dnes() {
  return new Date().toISOString().slice(0, 10);
}
function pridajDni(iso: string, d: number) {
  const dt = new Date(iso);
  dt.setDate(dt.getDate() + d);
  return dt.toISOString().slice(0, 10);
}

type Riadok = {
  name: string;
  description: string;
  quantity: string;
  unit: string;
  unit_price: string;
  discount_percent: string;
  vat_rate: string;
  /** Položka z cenníka / skladu — skladová sa dá po odsúhlasení naskladniť. */
  product_id?: string | null;
  stock_item_id?: string | null;
};

const prazdnyRiadok = (sadzba: number): Riadok => ({
  name: "",
  description: "",
  quantity: "1",
  unit: "ks",
  unit_price: "",
  discount_percent: "",
  vat_rate: String(sadzba),
});

const riadokZUlozeneho = (p: any, otoc = false): Riadok => ({
  name: String(p.name ?? ""),
  description: String(p.description ?? ""),
  // Dobropis vracia to isté s opačným znamienkom.
  quantity: String((otoc ? -1 : 1) * Number(p.quantity ?? 1)),
  unit: String(p.unit ?? ""),
  unit_price: String(p.unit_price ?? ""),
  discount_percent: p.discount_percent ? String(p.discount_percent) : "",
  vat_rate: String(p.vat_rate ?? 0),
  product_id: p.product_id ?? null,
  stock_item_id: p.stock_item_id ?? null,
});

const cislo = (v: string) => Number(String(v).replace(",", ".")) || 0;

/**
 * Samofaktúra — faktúra, ktorú za dodávateľa vyhotovujeme my (§ 72 ods. 4
 * zákona o DPH). Hlavička je obrátená: dodávateľ je kontakt z adresára s
 * dohodou o samofakturácii, odberateľ sme my. Sadzby DPH sú podľa krajiny a
 * režimu dodávateľa, nie našej firmy.
 */
export function SamofakturaForm({ id, opravuje }: { id?: string; opravuje?: string }) {
  const navigate = useNavigate();
  const uloz = useServerFn(ulozSamofakturuFn);
  const [kontakty, setKontakty] = useState<any[]>([]);
  const [nacitavam, setNacitavam] = useState(true);
  const [busy, setBusy] = useState(false);
  const [cisloDokladu, setCisloDokladu] = useState<string | null>(null);
  const [stav, setStav] = useState<string | null>(null);
  /** Číslo samofaktúry, ktorú tento dobropis opravuje. */
  const [opravujeCislo, setOpravujeCislo] = useState<string | null>(null);
  const [f, setF] = useState({
    customer_id: "",
    supplier_name: "",
    supplier_ico: "",
    supplier_dic: "",
    supplier_ic_dph: "",
    supplier_street: "",
    supplier_city: "",
    supplier_zip: "",
    supplier_country: "SK",
    supplier_email: "",
    supplier_iban: "",
    issue_date: dnes(),
    delivery_date: dnes(),
    due_date: pridajDni(dnes(), 14),
    currency: "EUR",
    variable_symbol: "",
    constant_symbol: "",
    specific_symbol: "",
    payment_method: "prevod",
    note: "",
    intro_note: "",
    language: "sk",
    job_id: "",
    reverse_charge: false,
    reverse_charge_type: "domestic_69" as "domestic_69" | "eu_b2b",
    eu_plnenie: "tovar" as "tovar" | "sluzba",
    osobitna_uprava: "" as "" | "65" | "66_tovar" | "66_umenie" | "66_starozitnosti",
    opravuje_id: "",
    discount_type: "" as "" | "percent" | "amount",
    discount_value: "",
    advance_invoice_id: "",
  });
  /** Cenník a skladové karty na výber položiek. */
  const [katalog, setKatalog] = useState<
    { id: string; product_id: string | null; stock_item_id: string | null; name: string; unit: string; cena: number; sklad: boolean }[]
  >([]);
  const [zalohy, setZalohy] = useState<
    { id: string; invoice_number: string; amount_total: number; currency: string }[]
  >([]);
  const [riadky, setRiadky] = useState<Riadok[]>(() => [prazdnyRiadok(zakladnaSadzba("SK", dnes()))]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    (async () => {
      const { data: k } = await supabase
        .from("customers")
        .select("*")
        .eq("company_id", cid)
        .is("deleted_at", null)
        .order("name");
      setKontakty(k ?? []);
      /*
        Pri výkupe je cena nákupná: skladová karta má poslednú nákupnú cenu,
        tovar mimo skladu len predajnú z cenníka (človek ju prepíše).
      */
      const [{ data: produkty }, { data: karty }] = await Promise.all([
        supabase
          .from("products")
          .select("id, name, unit, unit_price")
          .eq("company_id", cid)
          .is("deleted_at", null)
          .eq("active", true)
          .order("name")
          .limit(500),
        (supabase as any)
          .from("stock_items")
          .select("id, product_id, unit, purchase_price, last_purchase_price, track_stock")
          .eq("company_id", cid)
          .is("archived_at", null)
          .limit(1000),
      ]);
      const kartaPodlaProduktu = new Map<string, any>(
        (karty ?? []).filter((x: any) => x.product_id).map((x: any) => [x.product_id, x]),
      );
      setKatalog(
        (produkty ?? []).map((pr: any) => {
          const karta = kartaPodlaProduktu.get(pr.id);
          return {
            id: pr.id,
            product_id: pr.id,
            stock_item_id: karta?.id ?? null,
            name: pr.name,
            unit: karta?.unit ?? pr.unit ?? "ks",
            cena: Number(karta?.last_purchase_price ?? karta?.purchase_price ?? pr.unit_price ?? 0),
            sklad: Boolean(karta?.track_stock),
          };
        }),
      );
      const zdrojId = id ?? opravuje;
      if (zdrojId) {
        const { data: sf } = await (supabase as any)
          .from("purchase_invoices")
          .select("*")
          .eq("id", zdrojId)
          .maybeSingle();
        if (!sf?.samofakturacia) {
          toast.error("Samofaktúra sa nenašla.");
          navigate({ to: "/prijate-faktury" });
          return;
        }
        const dobropis = !id;
        if (!dobropis) {
          setCisloDokladu(sf.invoice_number);
          setStav(stavSamofaktury(sf));
          setOpravujeCislo(sf.opravuje_cislo ?? null);
        } else {
          setOpravujeCislo(sf.invoice_number);
        }
        setF({
          customer_id: sf.customer_id ?? "",
          supplier_name: sf.supplier_name ?? "",
          supplier_ico: sf.supplier_ico ?? "",
          supplier_dic: sf.supplier_dic ?? "",
          supplier_ic_dph: sf.supplier_ic_dph ?? "",
          supplier_street: sf.supplier_street ?? "",
          supplier_city: sf.supplier_city ?? "",
          supplier_zip: sf.supplier_zip ?? "",
          supplier_country: sf.supplier_country ?? "SK",
          supplier_email: sf.supplier_email ?? "",
          supplier_iban: sf.supplier_iban ?? "",
          issue_date: dobropis ? dnes() : sf.issue_date,
          delivery_date: dobropis ? dnes() : (sf.delivery_date ?? sf.issue_date),
          due_date: dobropis ? pridajDni(dnes(), 14) : sf.due_date,
          currency: sf.currency ?? "EUR",
          variable_symbol: dobropis ? "" : (sf.variable_symbol ?? ""),
          constant_symbol: sf.constant_symbol ?? "",
          specific_symbol: sf.specific_symbol ?? "",
          payment_method: sf.payment_method ?? "prevod",
          note: dobropis ? "" : (sf.note ?? ""),
          intro_note: dobropis
            ? `Dobropis k faktúre ${sf.invoice_number}`
            : (sf.intro_note ?? ""),
          language: sf.language ?? "sk",
          job_id: sf.job_id ?? "",
          reverse_charge: Boolean(sf.reverse_charge),
          reverse_charge_type: sf.reverse_charge_type === "eu_b2b" ? "eu_b2b" : "domestic_69",
          eu_plnenie: sf.eu_plnenie === "sluzba" ? "sluzba" : "tovar",
          osobitna_uprava: sf.osobitna_uprava ?? "",
          opravuje_id: dobropis ? sf.id : (sf.opravuje_id ?? ""),
          discount_type: dobropis ? "" : (sf.discount_type ?? ""),
          discount_value: dobropis ? "" : sf.discount_value != null ? String(sf.discount_value) : "",
          advance_invoice_id: dobropis ? "" : (sf.advance_invoice_id ?? ""),
        });
        const pol = Array.isArray(sf.items) ? sf.items : [];
        if (pol.length) setRiadky(pol.map((p: any) => riadokZUlozeneho(p, dobropis)));
      }
      setNacitavam(false);
    })();
  }, [id, opravuje, navigate]);

  const kontakt = kontakty.find((k) => k.id === f.customer_id) ?? null;
  const platitel = dodavatelPlatitel(f.supplier_ic_dph);
  const krajina = krajinaDane(f.supplier_country);
  const sadzby = sadzbyKrajiny(krajina, f.issue_date);
  const chyba = f.customer_id ? chybaDohody(kontakt, f.issue_date) : null;
  const polozky = useMemo(
    () =>
      riadky.map((r) =>
        prepocitajPolozku(
          {
            name: r.name,
            description: r.description,
            quantity: cislo(r.quantity),
            unit: r.unit,
            unit_price: cislo(r.unit_price),
            discount_percent: cislo(r.discount_percent),
            vat_rate: cislo(r.vat_rate),
          },
          platitel,
        ),
      ),
    [riadky, platitel],
  );
  const zlava = zlavaDokladuSuma(polozky, f.discount_type || null, cislo(f.discount_value));
  const sumy = sumySamofaktury(polozky, zlava);
  const prenesenie = platitel && f.reverse_charge;
  const zaloha = zalohy.find((z) => z.id === f.advance_invoice_id) ?? null;
  const spoluDoklad = prenesenie ? sumy.zaklad : sumy.spolu;
  const naUhradu = zaloha ? Math.max(0, Math.round((spoluDoklad - zaloha.amount_total) * 100) / 100) : spoluDoklad;

  /*
    Prijaté zálohové faktúry toho istého dodávateľa, ktoré ešte nikto
    nezúčtoval — ako pri bežnej prijatej faktúre.
  */
  useEffect(() => {
    const cid = getActiveCompanyId();
    const ico = f.supplier_ico.trim();
    const nazov = f.supplier_name.trim();
    if (!cid || opravujeCislo || (!ico && !nazov)) {
      setZalohy([]);
      return;
    }
    let zrusene = false;
    (async () => {
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
      const ids = (proformy ?? []).map((z: any) => z.id);
      const { data: pouzite } = ids.length
        ? await supabase
            .from("purchase_invoices")
            .select("id, advance_invoice_id")
            .eq("company_id", cid)
            .is("deleted_at", null)
            .in("advance_invoice_id", ids)
        : { data: [] as any[] };
      if (zrusene) return;
      const obsadene = new Set(
        (pouzite ?? []).filter((r: any) => r.id !== id).map((r: any) => r.advance_invoice_id),
      );
      setZalohy(
        (proformy ?? [])
          .filter((z: any) => !obsadene.has(z.id))
          .map((z: any) => ({
            id: z.id,
            invoice_number: z.invoice_number,
            amount_total: Number(z.amount_total ?? 0),
            currency: z.currency ?? "EUR",
          })),
      );
    })();
    return () => {
      zrusene = true;
    };
  }, [f.supplier_ico, f.supplier_name, opravujeCislo, id]);
  const mena = formatovacMeny(f.currency);

  async function vyberDodavatela(kid: string) {
    const k = kontakty.find((x) => x.id === kid);
    if (!k) return;
    setF((p) => ({
      ...p,
      customer_id: k.id,
      supplier_name: k.name ?? "",
      supplier_ico: k.ico ?? "",
      supplier_dic: k.dic ?? "",
      supplier_ic_dph: k.ic_dph ?? "",
      supplier_street: k.street ?? "",
      supplier_city: k.city ?? "",
      supplier_zip: k.zip ?? "",
      supplier_country: k.country || "SK",
      supplier_email: k.email ?? "",
    }));
    // IBAN v adresári nie je — vezme sa z poslednej samofaktúry tomu istému dodávateľovi.
    const { data: posledna } = await (supabase as any)
      .from("purchase_invoices")
      .select("supplier_iban")
      .eq("customer_id", k.id)
      .eq("samofakturacia", true)
      .not("supplier_iban", "is", null)
      .order("issue_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (posledna?.supplier_iban) set("supplier_iban", posledna.supplier_iban);
    const zaklad = zakladnaSadzba(krajinaDane(k.country), f.issue_date);
    if (!k.ic_dph) setRiadky((rs) => rs.map((r) => ({ ...r, vat_rate: "0" })));
    else setRiadky((rs) => rs.map((r) => (r.vat_rate === "0" ? { ...r, vat_rate: String(zaklad) } : r)));
  }

  function upravRiadok(i: number, k: keyof Riadok, v: string) {
    setRiadky((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  }

  async function ulozit(e: React.FormEvent) {
    e.preventDefault();
    const cid = getActiveCompanyId();
    if (!cid) return toast.error("Vyberte firmu.");
    if (!f.customer_id) return toast.error("Vyberte dodávateľa z adresára.");
    if (chyba) return toast.error(chyba);
    const plne = polozky
      .map((p, i) => ({
        ...p,
        product_id: riadky[i]?.product_id ?? null,
        stock_item_id: riadky[i]?.stock_item_id ?? null,
      }))
      .filter((p) => p.name);
    if (!plne.length) return toast.error("Pridajte aspoň jednu položku.");
    setBusy(true);
    try {
      const r = await uloz({
        data: {
          ...f,
          company_id: cid,
          id,
          job_id: f.job_id || null,
          reverse_charge: prenesenie,
          osobitna_uprava: f.osobitna_uprava || null,
          opravuje_id: f.opravuje_id || null,
          discount_type: f.discount_type || null,
          discount_value: f.discount_type ? cislo(f.discount_value) : null,
          advance_invoice_id: f.advance_invoice_id || null,
          items: plne.map(({ total: _t, ...p }) => p),
        },
      });
      toast.success(
        id
          ? "Samofaktúra je uložená"
          : opravujeCislo
            ? `Dobropis ${r.cislo} k faktúre ${opravujeCislo} je vyhotovený`
            : `Samofaktúra ${r.cislo} je vyhotovená`,
      );
      navigate({ to: "/prijate-faktury/$id", params: { id: r.id } });
    } catch (e: any) {
      toast.error(e?.message ?? "Uloženie zlyhalo");
    } finally {
      setBusy(false);
    }
  }

  if (nacitavam) return <PageBody>Načítavam…</PageBody>;

  if (stav === "odsuhlasena") {
    return (
      <PageBody>
        <div className="mx-auto max-w-xl rounded-xl border border-border bg-card p-8 text-center text-sm">
          <p>Samofaktúru {cisloDokladu} dodávateľ už odsúhlasil, takže sa meniť nedá.</p>
          <p className="mt-1 text-muted-foreground">
            Chybu na nej opravíte dobropisom, ako pri každej faktúre.
          </p>
          <Link
            to="/prijate-faktury/$id"
            params={{ id: id! }}
            className="mt-4 inline-block text-primary underline"
          >
            Späť na faktúru
          </Link>
        </div>
      </PageBody>
    );
  }

  const vstup = "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

  return (
    <>
      <PageHeader
        title={
          id
            ? `Úprava ${opravujeCislo ? "dobropisu" : "samofaktúry"} ${cisloDokladu ?? ""}`
            : opravujeCislo
              ? `Dobropis k samofaktúre ${opravujeCislo}`
              : "Nová samofaktúra"
        }
        description={
          opravujeCislo
            ? "Opravný doklad k odsúhlasenej samofaktúre. Množstvá sú záporné — upravte ich na to, čo sa vracia alebo zľavuje. Aj dobropis musí dodávateľ odsúhlasiť."
            : "Faktúru za dodávateľa vyhotovujete vy podľa dohody o samofakturácii. Dodávateľ ju potom odsúhlasí — až potom vstupuje do DPH a na úhradu."
        }
        action={
          <Link
            to={id ? "/prijate-faktury/$id" : "/prijate-faktury"}
            params={id ? { id } : undefined}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-secondary"
          >
            <ArrowLeft className="h-4 w-4" /> Späť
          </Link>
        }
      />
      <PageBody>
        <form onSubmit={ulozit} className="mx-auto grid max-w-4xl gap-6">
          {stav === "caka" && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
              Faktúra čaká na odsúhlasenie. Po uložení zmien prestane platiť odkaz, ktorý dostal
              dodávateľ — treba mu ju poslať znova.
            </div>
          )}
          <section className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Dodávateľ
            </h3>
            <p className="mb-4 text-xs text-muted-foreground">
              Faktúra je jeho — v hlavičke bude ako dodávateľ, vaša firma ako odberateľ.
            </p>
            <div className="max-w-md">
              <CustomerSearch
                customers={kontakty}
                value={f.customer_id}
                onChange={vyberDodavatela}
                onCreated={(c) => {
                  setKontakty((ks) => [...ks, c].sort((a, b) => a.name.localeCompare(b.name)));
                  vyberDodavatela(c.id);
                }}
              />
            </div>
            {chyba && (
              <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
                {chyba}{" "}
                <Link to="/odberatelia" className="font-medium underline">
                  Otvoriť adresár
                </Link>
              </div>
            )}
            {f.customer_id && !chyba && kontakt?.samofakturacia_dohoda && (
              <p className="mt-2 text-xs text-muted-foreground">
                Dohoda: {kontakt.samofakturacia_dohoda}
              </p>
            )}
            {f.customer_id && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium">Názov *</span>
                  <input
                    required
                    value={f.supplier_name}
                    onChange={(e) => set("supplier_name", e.target.value)}
                    className={vstup}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">IČO</span>
                  <input
                    value={f.supplier_ico}
                    onChange={(e) => set("supplier_ico", e.target.value)}
                    className={vstup}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">DIČ</span>
                  <input
                    value={f.supplier_dic}
                    onChange={(e) => set("supplier_dic", e.target.value)}
                    className={vstup}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">IČ DPH</span>
                  <input
                    value={f.supplier_ic_dph}
                    onChange={(e) => {
                      const v = e.target.value;
                      // Dodávateľ sa stal platiteľom — nulové riadky dostanú jeho základnú sadzbu.
                      if (!platitel && dodavatelPlatitel(v)) {
                        const zaklad = String(zakladnaSadzba(krajina, f.issue_date));
                        setRiadky((rs) => rs.map((r) => (r.vat_rate === "0" ? { ...r, vat_rate: zaklad } : r)));
                      }
                      set("supplier_ic_dph", v);
                    }}
                    className={vstup}
                  />
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {platitel
                      ? "Dodávateľ je platiteľ DPH — daň sa vyčísli podľa jeho sadzieb."
                      : "Bez IČ DPH je dodávateľ neplatiteľ — faktúra bude bez dane."}
                  </span>
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-sm font-medium">Ulica</span>
                  <input
                    value={f.supplier_street}
                    onChange={(e) => set("supplier_street", e.target.value)}
                    className={vstup}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Mesto</span>
                  <input
                    value={f.supplier_city}
                    onChange={(e) => set("supplier_city", e.target.value)}
                    className={vstup}
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-sm font-medium">PSČ</span>
                    <input
                      value={f.supplier_zip}
                      onChange={(e) => set("supplier_zip", e.target.value)}
                      className={vstup}
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium">Krajina</span>
                    <input
                      value={f.supplier_country}
                      maxLength={2}
                      onChange={(e) => set("supplier_country", e.target.value.toUpperCase())}
                      className={vstup}
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="text-sm font-medium">IBAN dodávateľa</span>
                  <input
                    value={f.supplier_iban}
                    onChange={(e) => set("supplier_iban", e.target.value)}
                    placeholder="SK…"
                    className={`${vstup} font-mono`}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">E-mail na odsúhlasenie</span>
                  <input
                    type="email"
                    value={f.supplier_email}
                    onChange={(e) => set("supplier_email", e.target.value)}
                    className={vstup}
                  />
                </label>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Údaje faktúry
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="text-sm font-medium">Dátum vyhotovenia</span>
                <input
                  type="date"
                  required
                  value={f.issue_date}
                  onChange={(e) => set("issue_date", e.target.value)}
                  className={vstup}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Dátum dodania</span>
                <input
                  type="date"
                  required
                  value={f.delivery_date}
                  onChange={(e) => set("delivery_date", e.target.value)}
                  className={vstup}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Splatnosť</span>
                <input
                  type="date"
                  required
                  value={f.due_date}
                  onChange={(e) => set("due_date", e.target.value)}
                  className={vstup}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Variabilný symbol</span>
                <input
                  value={f.variable_symbol}
                  placeholder="podľa čísla faktúry"
                  onChange={(e) => set("variable_symbol", e.target.value.replace(/\D/g, ""))}
                  className={vstup}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Mena</span>
                <select
                  value={f.currency}
                  onChange={(e) => set("currency", e.target.value)}
                  className={vstup}
                >
                  {MENY.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.code} — {m.name}
                    </option>
                  ))}
                </select>
                {f.currency !== "EUR" && (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Daň sa prepočíta na eurá kurzom ECB zo dňa pred dodaním a vypíše sa na faktúre.
                  </span>
                )}
              </label>
              <label className="block">
                <span className="text-sm font-medium">Forma úhrady</span>
                <select
                  value={f.payment_method}
                  onChange={(e) => set("payment_method", e.target.value)}
                  className={vstup}
                >
                  <option value="prevod">Prevod</option>
                  <option value="hotovost">Hotovosť</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium">Konštantný symbol</span>
                <input
                  value={f.constant_symbol}
                  onChange={(e) => set("constant_symbol", e.target.value.replace(/\D/g, ""))}
                  className={vstup}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Špecifický symbol</span>
                <input
                  value={f.specific_symbol}
                  onChange={(e) => set("specific_symbol", e.target.value.replace(/\D/g, ""))}
                  className={vstup}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Jazyk faktúry</span>
                <select
                  value={f.language}
                  onChange={(e) => set("language", e.target.value)}
                  className={vstup}
                >
                  {JAZYKY_DOKLADU.map((j) => (
                    <option key={j.kod} value={j.kod}>
                      {j.nazov}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Číslo dostane faktúra z vášho radu Samofaktúry (SF…) — dodávateľ si ju zaeviduje
              pod týmto číslom.
            </p>
          </section>

          {platitel && (
            <section className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Režim DPH
              </h3>
              <p className="mb-4 text-xs text-muted-foreground">
                Podľa toho, čo dodávateľ dodáva — faktúra je jeho, režim určuje jeho plnenie.
              </p>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={f.reverse_charge}
                  onChange={(e) => {
                    set("reverse_charge", e.target.checked);
                    if (e.target.checked) set("osobitna_uprava", "");
                  }}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">Prenesenie daňovej povinnosti</span>
                  <span className="block text-xs text-muted-foreground">
                    Daň na faktúre nebude — samozdaníte ju vy (napr. kovový šrot a odpad, stavebné
                    práce, dodávateľ z EÚ). Dodávateľovi platíte len základ.
                  </span>
                </span>
              </label>
              {f.reverse_charge && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-medium">Dôvod</span>
                    <select
                      value={f.reverse_charge_type}
                      onChange={(e) => set("reverse_charge_type", e.target.value as any)}
                      className={vstup}
                    >
                      <option value="domestic_69">Tuzemsko — § 69 ods. 12</option>
                      <option value="eu_b2b">Dodávateľ z iného štátu EÚ</option>
                    </select>
                  </label>
                  {f.reverse_charge_type === "eu_b2b" && (
                    <label className="block">
                      <span className="text-sm font-medium">Čo dodáva</span>
                      <select
                        value={f.eu_plnenie}
                        onChange={(e) => set("eu_plnenie", e.target.value as any)}
                        className={vstup}
                      >
                        <option value="tovar">Tovar (nadobudnutie)</option>
                        <option value="sluzba">Službu</option>
                      </select>
                    </label>
                  )}
                </div>
              )}
              {!f.reverse_charge && (
                <label className="mt-4 block max-w-md">
                  <span className="text-sm font-medium">Osobitná úprava</span>
                  <select
                    value={f.osobitna_uprava}
                    onChange={(e) => set("osobitna_uprava", e.target.value as any)}
                    className={vstup}
                  >
                    <option value="">Žiadna</option>
                    {UPRAVY_NA_VYBER.map((u) => (
                      <option key={u.kod} value={u.kod}>
                        {u.nazov}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </section>
          )}

          <section className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Položky
            </h3>
            <label className="mb-4 block">
              <span className="text-sm font-medium">Text nad položkami</span>
              <textarea
                rows={2}
                value={f.intro_note}
                placeholder="napr. Fakturujeme Vám výkup dreva podľa dodacích listov za september"
                onChange={(e) => set("intro_note", e.target.value)}
                className={vstup}
              />
            </label>
            <div className="space-y-3">
              {riadky.map((r, i) => (
                <div
                  key={i}
                  className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_80px_70px_110px_70px_90px_auto] sm:items-end"
                >
                  <label className="block min-w-0">
                    <span className="text-xs text-muted-foreground">Názov</span>
                    <input
                      value={r.name}
                      onChange={(e) => upravRiadok(i, "name", e.target.value)}
                      className={vstup}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted-foreground">Množstvo</span>
                    <input
                      inputMode="decimal"
                      value={r.quantity}
                      onChange={(e) => upravRiadok(i, "quantity", e.target.value)}
                      className={vstup}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted-foreground">MJ</span>
                    <input
                      value={r.unit}
                      onChange={(e) => upravRiadok(i, "unit", e.target.value)}
                      className={vstup}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted-foreground">Cena bez DPH</span>
                    <input
                      inputMode="decimal"
                      value={r.unit_price}
                      onChange={(e) => upravRiadok(i, "unit_price", e.target.value)}
                      className={vstup}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted-foreground">Zľava %</span>
                    <input
                      inputMode="decimal"
                      value={r.discount_percent}
                      onChange={(e) => upravRiadok(i, "discount_percent", e.target.value)}
                      className={vstup}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted-foreground">DPH</span>
                    <select
                      value={platitel ? r.vat_rate : "0"}
                      disabled={!platitel}
                      onChange={(e) => upravRiadok(i, "vat_rate", e.target.value)}
                      className={vstup}
                    >
                      {(platitel ? sadzby : [0]).map((s) => (
                        <option key={s} value={String(s)}>
                          {s} %
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    aria-label="Odstrániť položku"
                    disabled={riadky.length === 1}
                    onClick={() => setRiadky((rs) => rs.filter((_, j) => j !== i))}
                    className="inline-flex h-9 items-center justify-center rounded-md border border-border px-2 text-muted-foreground hover:bg-secondary disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <input
                    aria-label="Popis položky"
                    value={r.description}
                    placeholder="Popis (nepovinné) — napr. číslo dodacieho listu, druh materiálu"
                    onChange={(e) => upravRiadok(i, "description", e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs sm:col-span-7"
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                setRiadky((rs) => [
                  ...rs,
                  prazdnyRiadok(platitel ? zakladnaSadzba(krajina, f.issue_date) : 0),
                ])
              }
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
            >
              <Plus className="h-4 w-4" /> Pridať položku
            </button>
            {katalog.length > 0 && (
              <Katalog
                polozky={katalog}
                onPick={(k) =>
                  setRiadky((rs) => {
                    const novy: Riadok = {
                      ...prazdnyRiadok(platitel ? zakladnaSadzba(krajina, f.issue_date) : 0),
                      name: k.name,
                      unit: k.unit,
                      unit_price: k.cena ? String(k.cena) : "",
                      product_id: k.product_id,
                      stock_item_id: k.stock_item_id,
                    };
                    // Prázdny prvý riadok sa nahradí, inak sa pridá nový.
                    return rs.length === 1 && !rs[0].name.trim() ? [novy] : [...rs, novy];
                  })
                }
              />
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="flex items-end gap-2">
                <label className="block flex-1">
                  <span className="text-sm font-medium">Zľava na celú faktúru</span>
                  <input
                    inputMode="decimal"
                    value={f.discount_value}
                    placeholder="žiadna"
                    onChange={(e) => {
                      set("discount_value", e.target.value);
                      if (!f.discount_type && e.target.value) set("discount_type", "percent");
                    }}
                    className={vstup}
                  />
                </label>
                <select
                  aria-label="Druh zľavy"
                  value={f.discount_type || "percent"}
                  onChange={(e) => set("discount_type", e.target.value as any)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="percent">%</option>
                  <option value="amount">{f.currency} bez DPH</option>
                </select>
              </div>
              {zalohy.length > 0 && (
                <label className="block">
                  <span className="text-sm font-medium">Zúčtovať zaplatenú zálohu</span>
                  <select
                    value={f.advance_invoice_id}
                    onChange={(e) => set("advance_invoice_id", e.target.value)}
                    className={vstup}
                  >
                    <option value="">— žiadnu —</option>
                    {zalohy.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.invoice_number} · {z.amount_total.toFixed(2)} {z.currency}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <div className="mt-5 ml-auto max-w-xs space-y-1 text-sm">
              {zlava > 0 && (
                <div className="flex justify-between gap-4 text-muted-foreground">
                  <span>Zľava na faktúru</span>
                  <span className="tabular-nums">− {mena(zlava)}</span>
                </div>
              )}
              {sumy.sadzby.map((s) => (
                <div key={s.sadzba} className="flex justify-between gap-4 text-muted-foreground">
                  <span>
                    Základ {s.sadzba} % / DPH
                  </span>
                  <span className="tabular-nums">
                    {mena(s.zaklad)} / {mena(s.dan)}
                  </span>
                </div>
              ))}
              {prenesenie && (
                <div className="text-xs text-muted-foreground">
                  Daň {mena(sumy.dan)} samozdaníte vy — na faktúre nebude a dodávateľovi sa neplatí.
                </div>
              )}
              {zaloha && (
                <div className="flex justify-between gap-4 text-muted-foreground">
                  <span>Záloha {zaloha.invoice_number}</span>
                  <span className="tabular-nums">− {mena(zaloha.amount_total)}</span>
                </div>
              )}
              <div className="flex justify-between gap-4 border-t border-border pt-2 text-base font-semibold">
                <span>{prenesenie || zaloha ? "Na úhradu" : "Spolu"}</span>
                <span className="tabular-nums">{mena(naUhradu)}</span>
              </div>
            </div>
          </section>

          <section className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-2">
            <JobPicker value={f.job_id} onChange={(v) => set("job_id", v)} label="Zákazka" />
            <label className="block">
              <span className="text-sm font-medium">Poznámka na faktúre</span>
              <textarea
                rows={2}
                value={f.note}
                onChange={(e) => set("note", e.target.value)}
                className={vstup}
              />
            </label>
          </section>

          <div className="flex justify-end gap-2">
            <Link
              to={id ? "/prijate-faktury/$id" : "/prijate-faktury"}
              params={id ? { id } : undefined}
              className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm hover:bg-secondary"
            >
              Zrušiť
            </Link>
            <button
              type="submit"
              disabled={busy || Boolean(chyba)}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {id ? "Uložiť zmeny" : opravujeCislo ? "Vyhotoviť dobropis" : "Vyhotoviť samofaktúru"}
            </button>
          </div>
        </form>
      </PageBody>
    </>
  );
}

type PolozkaKatalogu = {
  id: string;
  product_id: string | null;
  stock_item_id: string | null;
  name: string;
  unit: string;
  cena: number;
  sklad: boolean;
};

/** Výber položky z cenníka a skladových kariet. */
function Katalog({
  polozky,
  onPick,
}: {
  polozky: PolozkaKatalogu[];
  onPick: (p: PolozkaKatalogu) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const holy = (v: string) => v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const filtrovane = (q ? polozky.filter((p) => holy(p.name).includes(holy(q))) : polozky).slice(0, 12);
  return (
    <div className="relative ml-2 inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
      >
        <Search className="h-4 w-4" /> Z cenníka / skladu
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card shadow-lg">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Hľadať položku…"
            className="w-full border-b border-border bg-transparent px-3 py-2 text-sm outline-none"
          />
          <ul className="max-h-64 overflow-auto py-1">
            {filtrovane.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground">Nič sa nenašlo</li>
            )}
            {filtrovane.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(p);
                    setOpen(false);
                    setQ("");
                  }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    {p.sklad && <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                    <span className="truncate">{p.name}</span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {p.cena.toFixed(2)} / {p.unit}
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
