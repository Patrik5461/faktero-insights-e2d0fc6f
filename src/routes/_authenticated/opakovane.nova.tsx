import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MriezkaDokladu, PoleDokladu, VSTUP_DOKLADU, bunka as bunkaDokladu } from "@/components/faktero/PoleDokladu";
import { preloz } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { CreditCard, FileText, Package, Plus, Repeat, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CustomerSearch } from "@/components/faktero/OdberatelPicker";
import { VyberRadu } from "@/components/faktero/VyberRadu";
import { useRezimDph } from "@/lib/faktero/krajina-firmy";
import { sadzbyDoVyberu, zakladnaSadzbaRezimu } from "@/lib/faktero/dph-rezim";
import { MENY, KROK_CENY, cenaZoSumySDph, formatujMenu } from "@/lib/faktero/mena";

export const Route = createFileRoute("/_authenticated/opakovane/nova")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Nová opakovaná faktúra — Faktero") }] }),
  component: NewRecurring,
});

type Item = {
  name: string;
  description?: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
};
const EMPTY: Item = { name: "", quantity: 1, unit: "ks", unit_price: 0, vat_rate: 23 };

const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "Bankový prevod" },
  { value: "cash", label: "Hotovosť" },
  { value: "card", label: "Karta" },
];

/**
 * Šablóna opakovanej faktúry.
 *
 * Vyzerá a ovláda sa ako vystavenie bežnej faktúry — tie isté karty, tá istá
 * tabuľka položiek aj rovnaký výber odberateľa. Kto vie vystaviť faktúru, vie
 * založiť aj paušál; jediné navyše je, ako často a odkedy sa má vystavovať.
 */
function NewRecurring() {
  const { t } = useT();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<any[]>([]);
  const [form, setForm] = useState({
    name: "",
    customer_id: "",
    frequency: "monthly" as "weekly" | "monthly" | "quarterly" | "yearly",
    next_run: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    currency: "EUR",
    due_days: 14,
    payment_method: "bank_transfer",
    intro_note: "",
    notes: "",
    active: true,
    /* Číselný rad faktúr z tejto šablóny; prázdne = predvolený. */
    number_series_id: "",
  });
  /* Sadzby DPH podľa krajiny registrácie firmy. */
  const rezim = useRezimDph();
  const krajina = rezim.krajina;
  const [items, setItems] = useState<Item[]>([{ ...EMPTY }]);
  const [ukladam, setUkladam] = useState(false);

  useEffect(() => {
    const z = zakladnaSadzbaRezimu(rezim);
    setItems((a) =>
      a.some((it) => !it.name && it.vat_rate !== z)
        ? a.map((it) => (it.name ? it : { ...it, vat_rate: z }))
        : a,
    );
  }, [krajina, rezim.platitel]);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    supabase
      .from("customers")
      .select("id, name, ico, dic, ic_dph, street, city, zip, country, email")
      .eq("company_id", cid)
      .is("deleted_at", null)
      .eq("odberatel", true)
      .then(({ data }) => setCustomers(data ?? []));
  }, []);

  /* Prázdny riadok do šablóny nepatrí — rovnako ako na faktúre. */
  const riadkyDokladu = useMemo(
    () => items.filter((it) => it.name.trim() !== "" || Number(it.unit_price) !== 0),
    [items],
  );

  const totals = useMemo(() => {
    let sub = 0,
      vat = 0;
    for (const it of riadkyDokladu) {
      const s = Number(it.quantity) * Number(it.unit_price);
      sub += s;
      vat += s * (Number(it.vat_rate) / 100);
    }
    return {
      subtotal: +sub.toFixed(2),
      vat_total: +vat.toFixed(2),
      total: +(sub + vat).toFixed(2),
    };
  }, [riadkyDokladu]);

  function setItem(i: number, patch: Partial<Item>) {
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  /** Suma s DPH napísaná do stĺpca Spolu dopočíta jednotkovú cenu — ako na faktúre. */
  function nastavSpolu(idx: number, spolu: number) {
    const it = items[idx];
    if (!it) return;
    setItem(idx, { unit_price: cenaZoSumySDph(spolu, it.quantity, it.vat_rate) });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (ukladam) return;
    const cid = getActiveCompanyId();
    if (!cid) return;
    const cust = customers.find((c) => c.id === form.customer_id);
    if (!cust) return toast.error(t("Vyberte odberateľa"));
    if (!form.name.trim()) return toast.error(t("Zadajte názov šablóny"));
    if (!form.intro_note.trim()) {
      return toast.error(t("Vyplňte text nad položkami — hovorí, čo sa fakturuje."));
    }
    const bezNazvu = riadkyDokladu.find((it) => !it.name.trim());
    if (bezNazvu) return toast.error(t("Položka so sumou musí mať názov."));

    setUkladam(true);
    const { data, error } = await supabase
      .from("recurring_invoices")
      .insert({
        company_id: cid,
        name: form.name.trim(),
        customer_id: cust.id,
        customer_name: cust.name,
        customer_ico: cust.ico,
        customer_dic: cust.dic,
        customer_ic_dph: cust.ic_dph,
        customer_street: cust.street,
        customer_city: cust.city,
        customer_zip: cust.zip,
        customer_country: cust.country,
        customer_email: cust.email,
        frequency: form.frequency,
        next_run: form.next_run,
        currency: form.currency,
        due_days: form.due_days,
        payment_method: form.payment_method,
        number_series_id: form.number_series_id || null,
        intro_note: form.intro_note.trim(),
        notes: form.notes,
        active: form.active,
        items: riadkyDokladu as any,
        subtotal: totals.subtotal,
        vat_total: totals.vat_total,
        total: totals.total,
      })
      .select()
      .single();
    setUkladam(false);
    if (error || !data) {
      const { friendlyError } = await import("@/lib/faktero/plan-error");
      return toast.error(t(friendlyError(error)));
    }
    toast.success(t("Šablóna vytvorená"));
    navigate({ to: "/opakovane/$id", params: { id: data.id } });
  }

  return (
    <>
      <PageHeader
        sirka="formular"
        title={t("Nová opakovaná faktúra")}
        description={t("Šablóna, podľa ktorej bude Faktero pravidelne vystavovať faktúry.")}
      />
      <PageBody>
        <form onSubmit={submit} className="mx-auto max-w-6xl space-y-6">
          {/* Základné údaje a opakovanie vedľa seba — rovnako ako na faktúre. */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Tie isté polia a mriežka ako na faktúre (PoleDokladu). */}
            <section className="min-w-0 rounded-2xl border border-border bg-card p-5">
              <SectionHeader icon={FileText} title={t("Základné údaje")} />
              <MriezkaDokladu>
                <PoleDokladu label={t("Odberateľ *")} htmlFor="odberatel-dokladu" className={bunkaDokladu.cela}>
                  <CustomerSearch
                    ako="pole"
                    id="odberatel-dokladu"
                    customers={customers}
                    value={form.customer_id}
                    onChange={(id) => setForm({ ...form, customer_id: id })}
                    onCreated={(c) => {
                      setCustomers((prev) => [...prev, c]);
                      setForm((prev) => ({ ...prev, customer_id: c.id }));
                    }}
                  />
                </PoleDokladu>
                <PoleDokladu
                  label={t("Názov šablóny *")}
                  htmlFor="nazov-sablony"
                  napoveda={t("Vidíte ho len vy v zozname šablón — na faktúre nie je.")}
                  className={bunkaDokladu.cela}
                >
                  <input
                    id="nazov-sablony"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder={t("napr. Mesačný paušál ACME")}
                    className={VSTUP_DOKLADU}
                  />
                </PoleDokladu>
                <VyberRadu
                  vzhlad="pole"
                  druh="invoice"
                  hodnota={form.number_series_id}
                  onZmena={(id) => setForm({ ...form, number_series_id: id })}
                  label={t("Číselný rad faktúr")}
                  bezNahladu
                  className={bunkaDokladu.cela}
                />
                <PoleDokladu label={t("Spôsob platby")} htmlFor="sposob-platby" className={bunkaDokladu.polovica}>
                  <select
                    id="sposob-platby"
                    value={form.payment_method}
                    onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                    className={VSTUP_DOKLADU}
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {t(m.label)}
                      </option>
                    ))}
                  </select>
                </PoleDokladu>
                <PoleDokladu label={t("Mena")} htmlFor="mena-dokladu" className={bunkaDokladu.polovica}>
                  <select
                    id="mena-dokladu"
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value })}
                    className={VSTUP_DOKLADU}
                  >
                    {MENY.map((m) => (
                      <option key={m.code} value={m.code}>
                        {m.code} {m.symbol} — {t(m.name)}
                      </option>
                    ))}
                  </select>
                </PoleDokladu>
              </MriezkaDokladu>
            </section>

            <section className="min-w-0 rounded-2xl border border-border bg-card p-5">
              <SectionHeader icon={Repeat} title={t("Opakovanie")} />
              <MriezkaDokladu>
                <PoleDokladu label={t("Ako často")} htmlFor="frekvencia" className={bunkaDokladu.tretina}>
                  <select
                    id="frekvencia"
                    value={form.frequency}
                    onChange={(e) => setForm({ ...form, frequency: e.target.value as any })}
                    className={VSTUP_DOKLADU}
                  >
                    <option value="weekly">{t("Týždenne")}</option>
                    <option value="monthly">{t("Mesačne")}</option>
                    <option value="quarterly">{t("Štvrťročne")}</option>
                    <option value="yearly">{t("Ročne")}</option>
                  </select>
                </PoleDokladu>
                <PoleDokladu label={t("Prvé vystavenie")} htmlFor="prve-vystavenie" className={bunkaDokladu.tretina}>
                  <input
                    id="prve-vystavenie"
                    type="date"
                    required
                    value={form.next_run}
                    onChange={(e) => setForm({ ...form, next_run: e.target.value })}
                    className={VSTUP_DOKLADU}
                  />
                </PoleDokladu>
                <PoleDokladu
                  label={t("Splatnosť (dni)")}
                  htmlFor="splatnost-dni"
                  napoveda={t("Počíta sa od dňa vystavenia každej faktúry.")}
                  className={bunkaDokladu.tretinaPosledna}
                >
                  <input
                    id="splatnost-dni"
                    type="number"
                    min={1}
                    value={form.due_days}
                    onChange={(e) => setForm({ ...form, due_days: Number(e.target.value) })}
                    className={VSTUP_DOKLADU}
                  />
                </PoleDokladu>
                <div className={bunkaDokladu.cela}>
                  <label className="flex items-start gap-2 rounded-xl border border-border bg-muted/20 p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(e) => setForm({ ...form, active: e.target.checked })}
                      className="mt-0.5 h-4 w-4 rounded border-input"
                    />
                    <span>
                      <strong>{t("Aktívna")}</strong>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {t("Vypnutá šablóna ostáva uložená, ale faktúry z nej nevznikajú.")}
                      </span>
                    </span>
                  </label>
                </div>
              </MriezkaDokladu>
            </section>
          </div>

          <section className="rounded-2xl border border-border bg-card p-5">
            <label className="block">
              <span className="text-[13px] font-semibold text-foreground">
                {t("Text nad položkami")} <span className="text-destructive">*</span>
              </span>
              <textarea
                rows={2}
                required
                value={form.intro_note}
                onChange={(e) => setForm({ ...form, intro_note: e.target.value })}
                placeholder={t("Napríklad: Fakturujeme vám mesačný paušál za správu serverov.")}
                className={vstup}
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                {t("Dostane ho každá faktúra z tejto šablóny. Položky pod ním sú nepovinné.")}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {t(
                  "Obdobie sa doplní samo: [MESIAC], [ROK], [MESIAC_ROK], [MINULY_MESIAC] a [BUDUCI_MESIAC] funguje v tomto texte aj v názvoch položiek a poznámke, napr. „Paušál za [MESIAC_ROK]“.",
                )}
              </span>
            </label>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <SectionHeader icon={Package} title={t("Položky")} />
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-foreground">
                    <th className="py-2 font-medium">{t("Názov")}</th>
                    <th className="py-2 pl-3 font-medium">{t("Mn.")}</th>
                    <th className="py-2 pl-3 font-medium">{t("MJ")}</th>
                    <th className="py-2 pl-3 font-medium text-right">{t("Cena")}</th>
                    <th className="py-2 pl-3 font-medium">{t("DPH")}</th>
                    <th className="py-2 pl-3 font-medium text-right">{t("Spolu s DPH")}</th>
                    <th><span className="sr-only">{t("Akcie")}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx} className="border-b border-border/60">
                      <td className="py-2 pr-3">
                        <input
                          value={it.name}
                          onChange={(e) => setItem(idx, { name: e.target.value })}
                          placeholder={t("Názov položky")}
                          className={bunka}
                        />
                      </td>
                      <td className="py-2 pl-3">
                        <input
                          type="number"
                          step="0.01"
                          value={it.quantity}
                          onChange={(e) => setItem(idx, { quantity: Number(e.target.value) })}
                          className={`${bunka} w-16 tabular-nums`}
                        />
                      </td>
                      <td className="py-2 pl-3">
                        <input
                          aria-label={t("Merná jednotka")}
                          value={it.unit}
                          onChange={(e) => setItem(idx, { unit: e.target.value })}
                          className={`${bunka} w-14`}
                        />
                      </td>
                      <td className="py-2 pl-3">
                        <input
                          type="number"
                          step={KROK_CENY}
                          value={it.unit_price}
                          onChange={(e) => setItem(idx, { unit_price: Number(e.target.value) })}
                          className={`${bunka} w-24 text-right tabular-nums`}
                        />
                      </td>
                      <td className="py-2 pl-3">
                        <SadzbaSelect
                          hodnota={it.vat_rate}
                          onZmena={(v) => setItem(idx, { vat_rate: v })}
                          rezim={rezim}
                        />
                      </td>
                      <td className="py-2 pl-3">
                        <input
                          type="number"
                          step="0.01"
                          title={t("Suma s DPH — cena bez dane sa dopočíta")}
                          value={(it.quantity * it.unit_price * (1 + it.vat_rate / 100)).toFixed(2)}
                          onChange={(e) => nastavSpolu(idx, Number(e.target.value))}
                          className={`${bunka} w-28 text-right font-medium tabular-nums`}
                        />
                      </td>
                      <td className="py-2 pl-2">
                        <button aria-label={t("Odstrániť")}
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

            {/* Mobil: karta na riadok, rovnako ako na faktúre. */}
            <div className="space-y-3 md:hidden">
              {items.map((it, idx) => (
                <div key={idx} className="rounded-lg border border-border p-3">
                  <input
                    value={it.name}
                    onChange={(e) => setItem(idx, { name: e.target.value })}
                    placeholder={t("Názov položky")}
                    className="mb-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <div className="grid grid-cols-4 gap-2">
                    <input
                      type="number"
                      step="0.01"
                      value={it.quantity}
                      onChange={(e) => setItem(idx, { quantity: Number(e.target.value) })}
                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    />
                    <input
                      aria-label={t("Merná jednotka")}
                      value={it.unit}
                      onChange={(e) => setItem(idx, { unit: e.target.value })}
                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    />
                    <input
                      type="number"
                      step={KROK_CENY}
                      value={it.unit_price}
                      onChange={(e) => setItem(idx, { unit_price: Number(e.target.value) })}
                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    />
                    <SadzbaSelect
                      hodnota={it.vat_rate}
                      onZmena={(v) => setItem(idx, { vat_rate: v })}
                      rezim={rezim}
                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="font-medium tabular-nums">
                      {formatujMenu(
                        it.quantity * it.unit_price * (1 + it.vat_rate / 100),
                        form.currency,
                      )}
                    </span>
                    <button aria-label={t("Odstrániť")}
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

            <button
              type="button"
              onClick={() =>
                setItems([...items, { ...EMPTY, vat_rate: zakladnaSadzbaRezimu(rezim) }])
              }
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> {t("Pridať položku")}
            </button>
          </section>

          <section className="rounded-2xl border border-border bg-gradient-to-br from-card to-primary/[0.03] p-5">
            <div className="ml-auto max-w-sm space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("Bez DPH")}</span>
                <span className="tabular-nums">{formatujMenu(totals.subtotal, form.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("DPH")}</span>
                <span className="tabular-nums">
                  {formatujMenu(totals.vat_total, form.currency)}
                </span>
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-lg font-bold">
                <span>{t("Každá faktúra")}</span>
                <span className="tabular-nums text-primary">
                  {formatujMenu(totals.total, form.currency)}
                </span>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <SectionHeader icon={CreditCard} title={t("Poznámka pod položkami")} />
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder={t("Text, ktorý sa vytlačí pod tabuľkou položiek")}
              className={vstup}
            />
          </section>

          {/*
            Lišta s tlačidlami je obyčajný posledný blok formulára. Ako `sticky`
            plávala v strede stránky medzi kartami a zakrývala obsah pod sebou.
          */}
          <div className="rounded-2xl border border-border bg-card px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link
                to="/opakovane"
                className="rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary"
              >
                {t("Zrušiť")}
              </Link>
              <button
                type="submit"
                disabled={ukladam}
                className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {ukladam ? t("Ukladám…") : t("Vytvoriť šablónu")}
              </button>
            </div>
          </div>
        </form>
      </PageBody>
    </>
  );
}

const vstup = "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
const bunka =
  "w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm hover:border-input focus:border-input focus:bg-background";

function SectionHeader({ icon: Icon, title }: { icon: typeof FileText; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <Icon className="h-4 w-4 text-primary" />
      <h3 className="text-sm font-semibold uppercase tracking-wide">{title}</h3>
    </div>
  );
}

/** Sadzby vrátane historických — šablóna môže niesť aj staršiu sadzbu. */
function SadzbaSelect({
  hodnota,
  onZmena,
  rezim,
  className,
}: {
  hodnota: number;
  onZmena: (v: number) => void;
  rezim: ReturnType<typeof useRezimDph>;
  className?: string;
}) {
  const { t } = useT();
  const v = sadzbyDoVyberu(rezim, hodnota);
  return (
    <select
      value={hodnota}
      onChange={(e) => onZmena(Number(e.target.value))}
      className={
        className ??
        "w-20 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm hover:border-input focus:border-input focus:bg-background"
      }
    >
      {v.platne.map((r) => (
        <option key={r} value={r}>
          {r}%
        </option>
      ))}
      {v.historicke.length > 0 && (
        <optgroup label={t("Historické sadzby")}>
          {v.historicke.map((h) => (
            <option key={h.sadzba} value={h.sadzba}>
              {t("{sadzba}% (do {rok})", { sadzba: h.sadzba, rok: h.doRoku })}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
