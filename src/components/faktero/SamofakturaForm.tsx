import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
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
} from "@/lib/faktero/samofakturacia";
import { krajinaDane, sadzbyKrajiny, zakladnaSadzba } from "@/lib/faktero/vat-rates";
import { formatovacMeny } from "@/lib/faktero/mena";

function dnes() {
  return new Date().toISOString().slice(0, 10);
}
function pridajDni(iso: string, d: number) {
  const dt = new Date(iso);
  dt.setDate(dt.getDate() + d);
  return dt.toISOString().slice(0, 10);
}

type Riadok = { name: string; quantity: string; unit: string; unit_price: string; vat_rate: string };

const prazdnyRiadok = (sadzba: number): Riadok => ({
  name: "",
  quantity: "1",
  unit: "ks",
  unit_price: "",
  vat_rate: String(sadzba),
});

const cislo = (v: string) => Number(String(v).replace(",", ".")) || 0;

/**
 * Samofaktúra — faktúra, ktorú za dodávateľa vyhotovujeme my (§ 72 ods. 4
 * zákona o DPH). Hlavička je obrátená: dodávateľ je kontakt z adresára s
 * dohodou o samofakturácii, odberateľ sme my. Sadzby DPH sú podľa krajiny a
 * režimu dodávateľa, nie našej firmy.
 */
export function SamofakturaForm({ id }: { id?: string }) {
  const navigate = useNavigate();
  const uloz = useServerFn(ulozSamofakturuFn);
  const [kontakty, setKontakty] = useState<any[]>([]);
  const [nacitavam, setNacitavam] = useState(true);
  const [busy, setBusy] = useState(false);
  const [cisloDokladu, setCisloDokladu] = useState<string | null>(null);
  const [stav, setStav] = useState<string | null>(null);
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
    payment_method: "prevod",
    note: "",
    job_id: "",
  });
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
      if (id) {
        const { data: sf } = await (supabase as any)
          .from("purchase_invoices")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        if (!sf?.samofakturacia) {
          toast.error("Samofaktúra sa nenašla.");
          navigate({ to: "/prijate-faktury" });
          return;
        }
        setCisloDokladu(sf.invoice_number);
        setStav(stavSamofaktury(sf));
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
          issue_date: sf.issue_date,
          delivery_date: sf.delivery_date ?? sf.issue_date,
          due_date: sf.due_date,
          currency: sf.currency ?? "EUR",
          variable_symbol: sf.variable_symbol ?? "",
          payment_method: sf.payment_method ?? "prevod",
          note: sf.note ?? "",
          job_id: sf.job_id ?? "",
        });
        const pol = Array.isArray(sf.items) ? sf.items : [];
        if (pol.length) {
          setRiadky(
            pol.map((p: any) => ({
              name: String(p.name ?? ""),
              quantity: String(p.quantity ?? 1),
              unit: String(p.unit ?? ""),
              unit_price: String(p.unit_price ?? ""),
              vat_rate: String(p.vat_rate ?? 0),
            })),
          );
        }
      }
      setNacitavam(false);
    })();
  }, [id, navigate]);

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
            quantity: cislo(r.quantity),
            unit: r.unit,
            unit_price: cislo(r.unit_price),
            vat_rate: cislo(r.vat_rate),
          },
          platitel,
        ),
      ),
    [riadky, platitel],
  );
  const sumy = sumySamofaktury(polozky);
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
    const plne = polozky.filter((p) => p.name);
    if (!plne.length) return toast.error("Pridajte aspoň jednu položku.");
    setBusy(true);
    try {
      const r = await uloz({
        data: {
          ...f,
          company_id: cid,
          id,
          job_id: f.job_id || null,
          items: plne.map(({ total: _t, ...p }) => p),
        },
      });
      toast.success(id ? "Samofaktúra je uložená" : `Samofaktúra ${r.cislo} je vyhotovená`);
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
        title={id ? `Úprava samofaktúry ${cisloDokladu ?? ""}` : "Nová samofaktúra"}
        description="Faktúru za dodávateľa vyhotovujete vy podľa dohody o samofakturácii. Dodávateľ ju potom odsúhlasí — až potom vstupuje do DPH a na úhradu."
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
                  <option value="EUR">EUR</option>
                  <option value="CZK">CZK</option>
                  <option value="USD">USD</option>
                </select>
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
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Číslo dostane faktúra z vášho radu Samofaktúry (SF…) — dodávateľ si ju zaeviduje
              pod týmto číslom.
            </p>
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Položky
            </h3>
            <div className="space-y-3">
              {riadky.map((r, i) => (
                <div
                  key={i}
                  className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_80px_70px_110px_90px_auto] sm:items-end sm:border-0 sm:p-0"
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

            <div className="mt-5 ml-auto max-w-xs space-y-1 text-sm">
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
              <div className="flex justify-between gap-4 border-t border-border pt-2 text-base font-semibold">
                <span>Spolu</span>
                <span className="tabular-nums">{mena(sumy.spolu)}</span>
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
              {id ? "Uložiť zmeny" : "Vyhotoviť samofaktúru"}
            </button>
          </div>
        </form>
      </PageBody>
    </>
  );
}
