import { KROK_CENY, cenaZoSumySDph } from "@/lib/faktero/mena";
import { useServerFn } from "@tanstack/react-start";
import { druhPodlaTypuFaktury, sablonaZCisla, ukazkaCisla } from "@/lib/faktero/ciselne-rady";
import { pokracujVRaduFn } from "@/lib/faktero/ciselne-rady.functions";
import {
  koeficientZlavy,
  percentoZlavy,
  sumaZlavyDokladu,
  zakladRiadku,
  type TypZlavy,
} from "@/lib/faktero/zlavy";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PAYMENT_METHODS } from "@/lib/faktero/payment-method";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { Trash2, Plus, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_VAT_RATE } from "@/lib/faktero/vat-rates";
import { JobPicker } from "@/components/faktero/JobPicker";

import { useRezimDph } from "@/lib/faktero/krajina-firmy";
import { moznostiSadziebRezimu } from "@/lib/faktero/dph-rezim";
export const Route = createFileRoute("/_authenticated/faktury/$id/upravit")({
  head: () => ({ meta: [{ title: "Upraviť faktúru — Faktero" }] }),
  component: EditInvoice,
});

type Item = {
  id?: string;
  name: string;
  description?: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  /** Zľava riadku v %; jednotková cena ostáva pôvodná. */
  discount_percent?: number;
  stock_item_id?: string | null;
  _original_quantity?: number;
  _original_stock_item_id?: string | null;
  _original_name?: string;
  _locked?: boolean;
};

const EMPTY: Item = {
  name: "",
  quantity: 1,
  unit: "ks",
  unit_price: 0,
  vat_rate: DEFAULT_VAT_RATE,
  discount_percent: 0,
};

function EditInvoice() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  /* Sadzby DPH vyplývajú z krajiny registrácie firmy, nenastavujú sa ručne. */
  const rezim = useRezimDph();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  /* Zaškrtnuté = ďalšie doklady majú pokračovať v tvare ručne zadaného čísla. */
  const [pokracovatVRade, setPokracovatVRade] = useState(false);
  const [inv, setInv] = useState<any>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [originalLocked, setOriginalLocked] = useState<
    Array<{ id: string; stock_item_id: string; quantity: number; name: string }>
  >([]);
  const [form, setForm] = useState({
    /* Číslo dokladu sa dá opraviť — preklep v rade sa inak nedal napraviť inak než zmazaním. */
    invoice_number: "",
    issue_date: "",
    delivery_date: "",
    due_date: "",
    variable_symbol: "",
    currency: "EUR",
    payment_method: "bank_transfer",
    job_id: "",
    notes: "",
    intro_note: "",
    /* Zľava na celý doklad — percento alebo pevná suma bez DPH. */
    discount_type: "" as "" | TypZlavy,
    discount_value: 0,
  });

  useEffect(() => {
    (async () => {
      const [{ data: i }, { data: its }] = await Promise.all([
        supabase.from("invoices").select("*").eq("id", id).single(),
        supabase.from("invoice_items").select("*").eq("invoice_id", id).order("position"),
      ]);
      if (!i) {
        toast.error("Faktúra nenájdená");
        navigate({ to: "/faktury" });
        return;
      }
      // Opraviť sa dá aj uhradená faktúra — preklep v adrese sa nájde často až
      // po zaplatení. Stornovaná ostáva zamknutá, tá sa už len archivuje.
      if (i.status === "cancelled") {
        toast.error("Stornovanú faktúru už upraviť nemožno.");
        navigate({ to: "/faktury/$id", params: { id } });
        return;
      }
      setInv(i);
      setForm({
        invoice_number: i.invoice_number ?? "",
        issue_date: i.issue_date ?? "",
        delivery_date: i.delivery_date ?? "",
        due_date: i.due_date ?? "",
        variable_symbol: i.variable_symbol ?? "",
        currency: i.currency ?? "EUR",
        payment_method: i.payment_method ?? "bank_transfer",
        job_id: i.job_id ?? "",
        notes: i.notes ?? "",
        intro_note: i.intro_note ?? "",
        discount_type: (i.discount_type as TypZlavy | null) ?? "",
        discount_value: Number(i.discount_value ?? 0),
      });
      setItems(
        (its ?? []).map((r: any) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          quantity: Number(r.quantity),
          unit: r.unit ?? "ks",
          unit_price: Number(r.unit_price),
          vat_rate: Number(r.vat_rate),
          discount_percent: Number(r.discount_percent ?? 0),
          stock_item_id: r.stock_item_id ?? null,
          _original_quantity: Number(r.quantity),
          _original_stock_item_id: r.stock_item_id ?? null,
          _original_name: r.name,
          _locked: !!r.stock_item_id && (i.status as string) === "sent",
        })),
      );
      if ((i.status as string) === "sent") {
        setOriginalLocked(
          (its ?? [])
            .filter((r: any) => r.stock_item_id)
            .map((r: any) => ({
              id: r.id,
              stock_item_id: r.stock_item_id,
              quantity: Number(r.quantity),
              name: r.name,
            })),
        );
      }
      setLoading(false);
    })();
  }, [id]);

  /* Prázdny riadok (bez názvu aj bez sumy) do dokladu nepatrí — položky povinné nie sú. */
  const riadkyDokladu = useMemo(
    () => items.filter((it) => it.name.trim() !== "" || Number(it.unit_price) !== 0),
    [items],
  );
  const totals = useMemo(() => {
    let sub = 0,
      vat = 0;
    for (const it of riadkyDokladu) {
      const s = zakladRiadku(it.quantity, it.unit_price, it.discount_percent);
      sub += s;
      vat += s * (Number(it.vat_rate) / 100);
    }
    // Zľava na doklad prenásobí základ aj daň rovnakým koeficientom, takže
    // pomer medzi sadzbami DPH ostane nedotknutý.
    const medzisucet = Math.round(sub * 100) / 100;
    const zlava = sumaZlavyDokladu(sub, {
      typ: form.discount_type || null,
      hodnota: Number(form.discount_value),
    });
    const k = koeficientZlavy(sub, zlava);
    sub = sub * k;
    vat = vat * k;
    return { subtotal: sub, vat_total: vat, total: sub + vat, medzisucet, zlava };
  }, [riadkyDokladu, form.discount_type, form.discount_value]);

  /** Suma s DPH napísaná do stĺpca Spolu dopočíta jednotkovú cenu bez dane. */
  function nastavSpolu(idx: number, spolu: number) {
    const it = items[idx];
    if (!it || it._locked) return;
    const zlava = percentoZlavy(it.discount_percent);
    const cena = cenaZoSumySDph(spolu, it.quantity, it.vat_rate);
    setItem(idx, {
      unit_price: zlava >= 100 ? cena : Number((cena / (1 - zlava / 100)).toFixed(5)),
    });
  }

  function setItem(idx: number, patch: Partial<Item>) {
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  const pokracujVRade = useServerFn(pokracujVRaduFn);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!form.invoice_number.trim()) return toast.error("Číslo faktúry nesmie byť prázdne.");
    /* Povinný je text nad položkami, samotné položky nie. */
    if (!form.intro_note.trim()) {
      return toast.error("Vyplňte text nad položkami — hovorí, čo sa fakturuje.");
    }
    const bezNazvu = riadkyDokladu.find((it) => !it.name.trim());
    if (bezNazvu) return toast.error("Položka so sumou musí mať názov.");
    // Lock: stock-linked lines cannot be removed or modified after sent/paid
    if ((inv?.status as string) === "sent") {
      const violation = originalLocked.some((orig) => {
        const cur = items.find((it) => it.id === orig.id);
        if (!cur) return true; // removed
        return (
          Number(cur.quantity) !== orig.quantity ||
          (cur.stock_item_id ?? null) !== orig.stock_item_id ||
          cur.name !== orig.name
        );
      });
      if (violation) {
        toast.error("Položky ovplyvňujúce sklad nie je možné meniť po odoslaní faktúry.");
        return;
      }
    }
    setSaving(true);
    try {
      const { error: upErr } = await supabase
        .from("invoices")
        .update({
          invoice_number: form.invoice_number.trim(),
          issue_date: form.issue_date,
          // Prázdne pole je v HTML formulári "", nie null. Postgres na to
          // odpovie „invalid input syntax for type date" a faktúra bez dátumu
          // dodania sa nedala uložiť vôbec.
          delivery_date: form.delivery_date || null,
          due_date: form.due_date,
          variable_symbol: form.variable_symbol,
          currency: form.currency,
          payment_method: form.payment_method,
          job_id: form.job_id || null,
          notes: form.notes,
          intro_note: form.intro_note.trim() || null,
          discount_type: totals.zlava > 0 ? form.discount_type || "percent" : null,
          discount_value: totals.zlava > 0 ? Number(form.discount_value) : 0,
          discount_total: totals.zlava,
          subtotal: Number(totals.subtotal.toFixed(2)),
          vat_total: Number(totals.vat_total.toFixed(2)),
          total: Number(totals.total.toFixed(2)),
          pdf_url: null,
        })
        .eq("id", id);
      if (upErr) throw upErr;

      const { error: delErr } = await supabase.from("invoice_items").delete().eq("invoice_id", id);
      if (delErr) throw delErr;

      const rows = riadkyDokladu.map((it, idx) => {
        const s = zakladRiadku(it.quantity, it.unit_price, it.discount_percent);
        const v = s * (Number(it.vat_rate) / 100);
        return {
          invoice_id: id,
          position: idx,
          name: it.name,
          description: it.description ?? null,
          quantity: it.quantity,
          unit: it.unit,
          unit_price: it.unit_price,
          discount_percent: percentoZlavy(it.discount_percent),
          vat_rate: it.vat_rate,
          stock_item_id: it.stock_item_id ?? null,
          subtotal: Number(s.toFixed(2)),
          vat_amount: Number(v.toFixed(2)),
          total: Number((s + v).toFixed(2)),
        };
      });
      if (rows.length) {
        const { error: insErr } = await supabase.from("invoice_items").insert(rows);
        if (insErr) throw insErr;
      }

      /*
        „Pokračovať v tomto rade" — až po uložení dokladu. Keby sa rad zmenil
        skôr a zápis faktúry potom padol, číslovanie by sa posunulo kvôli
        dokladu, ktorý nevznikol.
      */
      if (pokracovatVRade && form.invoice_number.trim() !== (inv?.invoice_number ?? "")) {
        try {
          const v = await pokracujVRade({
            data: {
              company_id: inv.company_id,
              kind: druhPodlaTypuFaktury(inv?.type),
              cislo: form.invoice_number.trim(),
              datum: form.issue_date,
              series_id: inv?.number_series_id ?? null,
            },
          });
          toast.success(`Ďalšie doklady pokračujú v rade ${v.format}.`);
        } catch (e: any) {
          toast.warning(e?.message ?? "Číselný rad sa nepodarilo zmeniť.");
        }
      }
      toast.success("Faktúra upravená. PDF treba pregenerovať.");
      navigate({ to: "/faktury/$id", params: { id } });
    } catch (err: any) {
      toast.error(zrozumitelnaChyba(err?.message));
    } finally {
      setSaving(false);
    }
  }

  if (loading || !inv) return <PageBody>Načítavam…</PageBody>;

  return (
    <>
      <PageHeader
        title={`Upraviť faktúru ${inv.invoice_number}`}
        description="Po uložení sa PDF pregeneruje pri ďalšom otvorení."
        action={
          <Link
            to="/faktury/$id"
            params={{ id }}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
          >
            Späť
          </Link>
        }
      />
      <PageBody>
        <form onSubmit={submit} className="mx-auto max-w-6xl space-y-6">
          {/*
            Koncept je interný, ale vystavenú faktúru už mohol odberateľ dostať.
            Nech je vidieť, že sa mení hotový doklad, nie rozpracovaný.
          */}
          {inv.status !== "draft" && (
            <div className="rounded-xl border border-amber-300/50 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/40 dark:text-amber-200">
              <strong>
                {(inv.status as string) === "paid"
                  ? "Opravujete už uhradenú faktúru."
                  : "Opravujete už vystavenú faktúru."}
              </strong>{" "}
              Odberateľ ju mohol dostať, preto mu po oprave pošlite nové PDF. Ak je obdobie
              uzamknuté uzávierkou, dátumy ani sumy sa zmeniť nedajú.
              {(inv.status as string) === "sent" && (
                <> Riadky naviazané na sklad sa už meniť nedajú, aby sedel stav zásob.</>
              )}
            </div>
          )}
          {/*
            Základné a platobné údaje stoja vedľa seba rovnako ako pri vystavovaní —
            na širokej obrazovke sa tak položky nezosúvajú kamsi pod prehyb.
          */}
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-border bg-card p-5">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide">Základné údaje</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <div className="sm:col-span-2 lg:col-span-1 xl:col-span-2">
                  <Lbl label="Číslo faktúry">
                    <input
                      required
                      value={form.invoice_number}
                      onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
                      className={inputCls}
                    />
                  </Lbl>
                  {form.invoice_number.trim() !== (inv?.invoice_number ?? "") && (
                    <label className="mt-2 flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={pokracovatVRade}
                        onChange={(e) => setPokracovatVRade(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-input"
                      />
                      <span>
                        Pokračovať v tomto číselnom rade
                        <span className="block text-xs text-muted-foreground">
                          {(() => {
                            const v = sablonaZCisla(form.invoice_number.trim(), form.issue_date);
                            return v
                              ? `Ďalšie doklady tohto druhu budú číslované ${v.format} — najbližší dostane ${ukazkaCisla(v.format, v.poradie + 1, new Date(form.issue_date))}.`
                              : "Z tohto čísla sa rad odvodiť nedá — potrebuje poradie aspoň o dvoch číslach na konci. Doklad sa uloží, číslovanie ostane pôvodné.";
                          })()}
                        </span>
                      </span>
                    </label>
                  )}
                  {form.invoice_number.trim() !== (inv?.invoice_number ?? "") && (
                    <p className="mt-1 rounded-md border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/40 dark:text-amber-200">
                      Číslo sa mení z <strong>{inv?.invoice_number}</strong> na{" "}
                      <strong>{form.invoice_number.trim() || "—"}</strong>. Odberateľ mohol starý
                      doklad dostať, tak mu pošlite nové PDF. Variabilný symbol sa nemení sám — keď
                      má sedieť s číslom, prepíšte ho tiež.
                    </p>
                  )}
                </div>
                <Lbl label="Dátum vystavenia">
                  <input
                    type="date"
                    required
                    value={form.issue_date}
                    onChange={(e) => setForm({ ...form, issue_date: e.target.value })}
                    className={inputCls}
                  />
                </Lbl>
                <Lbl label="Splatnosť">
                  <input
                    type="date"
                    required
                    value={form.due_date}
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                    className={inputCls}
                  />
                </Lbl>
                <Lbl label="Dátum dodania">
                  <input
                    type="date"
                    value={form.delivery_date}
                    onChange={(e) => setForm({ ...form, delivery_date: e.target.value })}
                    className={inputCls}
                  />
                </Lbl>
                <JobPicker
                  className="sm:col-span-2"
                  value={form.job_id}
                  onChange={(v) => setForm((f) => ({ ...f, job_id: v }))}
                  customerId={inv?.customer_id ?? null}
                  companyId={inv?.company_id ?? null}
                />
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide">
                Platobné údaje a symboly
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <Lbl label="Spôsob platby">
                  <select
                    value={form.payment_method}
                    onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                    className={inputCls}
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </Lbl>
                <Lbl label="Mena">
                  <input
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value })}
                    className={inputCls}
                  />
                </Lbl>
                <Lbl label="Variabilný symbol">
                  <input
                    value={form.variable_symbol}
                    onChange={(e) => setForm({ ...form, variable_symbol: e.target.value })}
                    className={inputCls}
                  />
                </Lbl>
              </div>
            </section>
          </div>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide">
              Text nad položkami <span className="text-destructive">*</span>
            </h3>
            <textarea
              rows={2}
              required
              value={form.intro_note}
              onChange={(e) => setForm({ ...form, intro_note: e.target.value })}
              placeholder="Text, ktorý sa vytlačí nad tabuľkou položiek"
              className={inputCls}
            />
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide">Položky</h3>
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
                    <tr
                      key={idx}
                      className={`border-b border-border/60 ${it._locked ? "bg-muted/30" : ""}`}
                    >
                      <td className="py-2 pr-3">
                        <input
                          value={it.name}
                          disabled={it._locked}
                          onChange={(e) => setItem(idx, { name: e.target.value })}
                          placeholder="Názov položky"
                          className="w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm hover:border-input focus:border-input focus:bg-background"
                        />
                      </td>
                      <td className="py-2 pl-3">
                        <input
                          type="number"
                          step="0.01"
                          value={it.quantity}
                          disabled={it._locked}
                          onChange={(e) => setItem(idx, { quantity: Number(e.target.value) })}
                          className="w-16 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm tabular-nums hover:border-input focus:border-input focus:bg-background"
                        />
                      </td>
                      <td className="py-2 pl-3">
                        <input
                          value={it.unit}
                          disabled={it._locked}
                          onChange={(e) => setItem(idx, { unit: e.target.value })}
                          className="w-14 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm hover:border-input focus:border-input focus:bg-background"
                        />
                      </td>
                      <td className="py-2 pl-3">
                        <input
                          type="number"
                          step={KROK_CENY}
                          value={it.unit_price}
                          disabled={it._locked}
                          onChange={(e) => setItem(idx, { unit_price: Number(e.target.value) })}
                          className="w-24 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm tabular-nums text-right hover:border-input focus:border-input focus:bg-background"
                        />
                      </td>
                      <td className="py-2 pl-3">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={it.discount_percent ?? 0}
                          disabled={it._locked}
                          onChange={(e) =>
                            setItem(idx, { discount_percent: percentoZlavy(e.target.value) })
                          }
                          className="w-16 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-right text-sm tabular-nums hover:border-input focus:border-input focus:bg-background"
                        />
                      </td>
                      <td className="py-2 pl-3">
                        <select
                          value={it.vat_rate}
                          disabled={it._locked}
                          onChange={(e) => setItem(idx, { vat_rate: Number(e.target.value) })}
                          className="rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm hover:border-input focus:border-input focus:bg-background"
                        >
                          {moznostiSadziebRezimu(rezim, it.vat_rate).map((r) => (
                            <option key={r} value={r}>
                              {r}%
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pl-3">
                        <CellSpolu
                          hodnota={
                            zakladRiadku(it.quantity, it.unit_price, it.discount_percent) *
                            (1 + it.vat_rate / 100)
                          }
                          onZmena={(v) => nastavSpolu(idx, v)}
                          disabled={it._locked}
                          w="w-28"
                        />
                      </td>
                      <td className="py-2 pl-2">
                        <button
                          type="button"
                          disabled={it._locked}
                          title={
                            it._locked
                              ? "Položky ovplyvňujúce sklad nie je možné meniť po odoslaní faktúry."
                              : ""
                          }
                          onClick={() => !it._locked && setItems(items.filter((_, i) => i !== idx))}
                          className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-xs text-muted-foreground md:mt-0">
              Do stĺpca <strong>Spolu s DPH</strong> sa dá napísať suma, na ktorej ste sa dohodli —
              jednotková cena bez dane sa dopočíta sama.
            </p>

            <div className="space-y-3 md:hidden">
              {items.map((it, idx) => (
                <div
                  key={idx}
                  className={`rounded-lg border border-border p-3 ${it._locked ? "bg-muted/30" : ""}`}
                >
                  <input
                    value={it.name}
                    disabled={it._locked}
                    onChange={(e) => setItem(idx, { name: e.target.value })}
                    placeholder="Názov položky"
                    className="mb-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <div className="grid grid-cols-5 gap-2">
                    <input
                      type="number"
                      step="0.01"
                      value={it.quantity}
                      disabled={it._locked}
                      onChange={(e) => setItem(idx, { quantity: Number(e.target.value) })}
                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    />
                    <input
                      value={it.unit}
                      disabled={it._locked}
                      onChange={(e) => setItem(idx, { unit: e.target.value })}
                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    />
                    <input
                      type="number"
                      step={KROK_CENY}
                      value={it.unit_price}
                      disabled={it._locked}
                      onChange={(e) => setItem(idx, { unit_price: Number(e.target.value) })}
                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      title="Zľava v %"
                      value={it.discount_percent ?? 0}
                      disabled={it._locked}
                      onChange={(e) =>
                        setItem(idx, { discount_percent: percentoZlavy(e.target.value) })
                      }
                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    />
                    <select
                      value={it.vat_rate}
                      disabled={it._locked}
                      onChange={(e) => setItem(idx, { vat_rate: Number(e.target.value) })}
                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    >
                      {moznostiSadziebRezimu(rezim, it.vat_rate).map((r) => (
                        <option key={r} value={r}>
                          {r}%
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-foreground">Spolu s DPH</span>
                      <CellSpolu
                        hodnota={
                          zakladRiadku(it.quantity, it.unit_price, it.discount_percent) *
                          (1 + it.vat_rate / 100)
                        }
                        onZmena={(v) => nastavSpolu(idx, v)}
                        disabled={it._locked}
                        w="w-28"
                      />
                      <span className="text-muted-foreground">{form.currency}</span>
                    </span>
                    <button
                      type="button"
                      disabled={it._locked}
                      onClick={() => !it._locked && setItems(items.filter((_, i) => i !== idx))}
                      className="text-destructive disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {it._locked && (
                    <div className="mt-2 text-[11px] text-muted-foreground">
                      🔒 Položka ovplyvňujúca sklad — nemožno meniť po odoslaní.
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setItems([...items, { ...EMPTY }])}
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> Pridať položku
            </button>
          </section>

          <section className="rounded-2xl border border-border bg-gradient-to-br from-card to-primary/[0.03] p-5">
            <div className="ml-auto max-w-sm space-y-2 text-sm">
              {/* Zľava na celý doklad — rozpočíta sa pomerne medzi sadzby DPH. */}
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
              <div className="flex justify-between border-t border-border pt-2 text-lg font-bold">
                <span>Spolu</span>
                <span className="tabular-nums text-primary">
                  {totals.total.toFixed(2)} {form.currency}
                </span>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide">Poznámka</h3>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className={inputCls}
            />
          </section>

          <div /* Vpravo dole sedí plávajúce tlačidlo pomoci — nech neprekryje „Uložiť". */
            className="sticky bottom-4 z-10 flex flex-col-reverse gap-2 rounded-2xl border border-border bg-card/95 p-4 pr-20 backdrop-blur sm:flex-row sm:items-center sm:justify-end"
          >
            <Link
              to="/faktury/$id"
              params={{ id }}
              className="rounded-md border border-border bg-card px-4 py-2 text-center text-sm font-medium hover:bg-secondary"
            >
              Zrušiť
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Uložiť zmeny
            </button>
          </div>
        </form>
      </PageBody>
    </>
  );
}

const inputCls =
  "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none";

/**
 * Suma riadku s DPH, ktorú možno prepísať — cena bez dane sa dopočíta.
 * Kým sa píše, pole si drží vlastný text, nech číslo pod prstami neposkakuje.
 */
function CellSpolu({
  hodnota,
  onZmena,
  disabled,
  w = "w-24",
}: {
  hodnota: number;
  onZmena: (v: number) => void;
  disabled?: boolean;
  w?: string;
}) {
  const [rozpisane, setRozpisane] = useState<string | null>(null);
  return (
    <input
      type="number"
      step="0.01"
      inputMode="decimal"
      disabled={disabled}
      title="Suma s DPH — cena bez dane sa dopočíta"
      value={rozpisane ?? (Number.isFinite(hodnota) ? hodnota.toFixed(2) : "0.00")}
      onChange={(e) => {
        setRozpisane(e.target.value);
        onZmena(Number(e.target.value));
      }}
      onBlur={() => setRozpisane(null)}
      className={`${w} rounded-md border border-transparent bg-transparent px-2 py-1.5 text-right text-sm font-medium tabular-nums hover:border-input focus:border-input focus:bg-background disabled:opacity-60`}
    />
  );
}

/**
 * Databázové hlásenia po slovensky.
 *
 * Číslo dokladu stráži jedinečný index a uzamknuté obdobie trigger — človek
 * z ich pôvodného textu nevyčíta, čo má spraviť.
 */
function zrozumitelnaChyba(sprava: string | undefined): string {
  const s = sprava ?? "Chyba pri ukladaní";
  if (s.includes("invoices_cislo_uniq") || s.includes("duplicate key")) {
    return "Faktúra s týmto číslom už existuje. Zvoľte iné číslo.";
  }
  if (s.toLowerCase().includes("uzamknut") || s.includes("locked")) {
    return "Obdobie je uzamknuté uzávierkou — číslo, dátumy ani sumy sa v ňom meniť nedajú.";
  }
  return s;
}

function Lbl({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[13px] font-semibold text-foreground">{label}</span>
      {children}
    </label>
  );
}
