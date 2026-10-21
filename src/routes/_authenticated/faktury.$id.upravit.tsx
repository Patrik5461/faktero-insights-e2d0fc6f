import { PoznamkaPolozky } from "@/components/faktero/PoznamkaPolozky";
import { preloz } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";
import { ColneUdajePolozky } from "@/components/faktero/ColneUdajePolozky";
import { colneUdajeNaZapis } from "@/lib/faktero/colny-kod";
import { riadkyNaZapis, sumaFormulara, znamienkoFormulara } from "@/lib/faktero/dobropis-zobrazenie";
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
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { Trash2, Plus, Loader2, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_VAT_RATE } from "@/lib/faktero/vat-rates";
import { JobPicker } from "@/components/faktero/JobPicker";
import { CustomerSearch } from "@/components/faktero/OdberatelPicker";
import {
  odberatelNaZapis,
  odberatelZAdresara,
  odberatelZFaktury,
  upozorneniaZmeny,
  zmenilSaOdberatel,
  type OdberatelFaktury,
} from "@/lib/faktero/odberatel-faktury";

import { useRezimDph } from "@/lib/faktero/krajina-firmy";
import { sadzbyDoVyberu } from "@/lib/faktero/dph-rezim";
export const Route = createFileRoute("/_authenticated/faktury/$id/upravit")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Upraviť faktúru — Faktero") }] }),
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
  product_id?: string | null;
  /** Prenesenie daňovej povinnosti len na túto položku. */
  prenesenie?: boolean;
  /** Colný kód (KN), krajina pôvodu a hmotnosť. */
  colny_kod?: string | null;
  krajina_povodu?: string | null;
  hmotnost_kg?: string | number | null;
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
  const { t } = useT();
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
  /*
    Koncept (napr. kópia faktúry) sa dal doteraz len uložiť znova ako koncept —
    vystaviť sa nedal nikde, a tak ľudia kópie mazali a písali faktúru nanovo.
  */
  const vystavitRef = useRef(false);
  /* Odberateľ: kópia na faktúre, pôvodná na porovnanie a adresár na výber iného. */
  const [odberatel, setOdberatel] = useState<OdberatelFaktury | null>(null);
  const [povodnyOdberatel, setPovodnyOdberatel] = useState<OdberatelFaktury | null>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [efakturaOdoslana, setEfakturaOdoslana] = useState(false);
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
        toast.error(t("Faktúra nenájdená"));
        navigate({ to: "/faktury" });
        return;
      }
      // Opraviť sa dá aj uhradená faktúra — preklep v adrese sa nájde často až
      // po zaplatení. Stornovaná ostáva zamknutá, tá sa už len archivuje.
      if (i.status === "cancelled") {
        toast.error(t("Stornovanú faktúru už upraviť nemožno."));
        navigate({ to: "/faktury/$id", params: { id } });
        return;
      }
      setInv(i);
      const o = odberatelZFaktury(i);
      setOdberatel(o);
      setPovodnyOdberatel(o);
      const [{ data: odb }, { data: ef }] = await Promise.all([
        supabase
          .from("customers")
          .select("*")
          .eq("company_id", i.company_id)
          .eq("odberatel", true)
          .is("deleted_at", null)
          .order("name"),
        supabase.from("efaktura_documents").select("id").eq("invoice_id", id).limit(1),
      ]);
      setCustomers(odb ?? []);
      setEfakturaOdoslana((ef ?? []).length > 0);
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
      // Dobropis sa vo formulári ukazuje kladne, pri uložení sa otočí späť.
      const znNacitania = znamienkoFormulara(i.type, i);
      setItems(
        (its ?? []).map((r: any) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          quantity: znNacitania * Number(r.quantity) || 0,
          unit: r.unit ?? "ks",
          unit_price: Number(r.unit_price),
          vat_rate: Number(r.vat_rate),
          discount_percent: Number(r.discount_percent ?? 0),
          stock_item_id: r.stock_item_id ?? null,
          product_id: r.product_id ?? null,
          prenesenie: Boolean(r.prenesenie),
          colny_kod: r.colny_kod ?? null,
          krajina_povodu: r.krajina_povodu ?? null,
          hmotnost_kg: r.hmotnost_kg ?? null,
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
  /*
    Dobropis: riadky vo formulári sú kladné, súčty a zápis idú z riadkov so
    znamienkom databázy — uložené hodnoty sú tak rovnaké ako predtým.
  */
  const znForm = znamienkoFormulara(inv?.type, inv);
  const riadkyZapis = useMemo(() => riadkyNaZapis(riadkyDokladu, znForm), [riadkyDokladu, znForm]);
  const totals = useMemo(() => {
    let sub = 0,
      vat = 0;
    for (const it of riadkyZapis) {
      const s = zakladRiadku(it.quantity, it.unit_price, it.discount_percent);
      sub += s;
      vat += it.prenesenie ? 0 : s * (Number(it.vat_rate) / 100);
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
  }, [riadkyZapis, form.discount_type, form.discount_value]);
  /** Súčty, ako ich vidí človek — dobropis bez mínusu. */
  const zobrazene = {
    medzisucet: sumaFormulara(totals.medzisucet, znForm),
    subtotal: sumaFormulara(totals.subtotal, znForm),
    vat_total: sumaFormulara(totals.vat_total, znForm),
    total: sumaFormulara(totals.total, znForm),
  };

  /** Suma s DPH napísaná do stĺpca Spolu dopočíta jednotkovú cenu bez dane. */
  function nastavSpolu(idx: number, spolu: number) {
    const it = items[idx];
    if (!it || it._locked) return;
    const zlava = percentoZlavy(it.discount_percent);
    const cena = cenaZoSumySDph(spolu, it.quantity, it.prenesenie ? 0 : it.vat_rate);
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
    if (!form.invoice_number.trim()) return toast.error(t("Číslo faktúry nesmie byť prázdne."));
    /* Povinný je text nad položkami, samotné položky nie. */
    if (!form.intro_note.trim()) {
      return toast.error(t("Vyplňte text nad položkami — hovorí, čo sa fakturuje."));
    }
    if (!odberatel?.customer_name.trim()) return toast.error(t("Odberateľ musí mať názov."));
    const bezNazvu = riadkyDokladu.find((it) => !it.name.trim());
    if (bezNazvu) return toast.error(t("Položka so sumou musí mať názov."));
    if (znForm === -1 && totals.total > 0)
      return toast.error(t("Dobropis cenu znižuje — sumy zadajte kladne, mínus doplní Faktero samo."));
    // Lock: stock-linked lines cannot be removed or modified after sent/paid
    if ((inv?.status as string) === "sent") {
      const violation = originalLocked.some((orig) => {
        const cur = items.find((it) => it.id === orig.id);
        if (!cur) return true; // removed
        return (
          znForm * Number(cur.quantity) !== orig.quantity ||
          (cur.stock_item_id ?? null) !== orig.stock_item_id ||
          cur.name !== orig.name
        );
      });
      if (violation) {
        toast.error(t("Položky ovplyvňujúce sklad nie je možné meniť po odoslaní faktúry."));
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
          ...(odberatel ? odberatelNaZapis(odberatel) : {}),
          ...(inv?.status === "draft" && vystavitRef.current ? { status: "issued" } : {}),
          subtotal: Number(totals.subtotal.toFixed(2)),
          vat_total: Number(totals.vat_total.toFixed(2)),
          total: Number(totals.total.toFixed(2)),
          pdf_url: null,
        })
        .eq("id", id);
      if (upErr) throw upErr;

      const { error: delErr } = await supabase.from("invoice_items").delete().eq("invoice_id", id);
      if (delErr) throw delErr;

      const rows = riadkyZapis.map((it, idx) => {
        const s = zakladRiadku(it.quantity, it.unit_price, it.discount_percent);
        const v = it.prenesenie ? 0 : s * (Number(it.vat_rate) / 100);
        return {
          invoice_id: id,
          position: idx,
          name: it.name,
          description: it.description?.trim() || null,
          quantity: it.quantity,
          unit: it.unit,
          unit_price: it.unit_price,
          discount_percent: percentoZlavy(it.discount_percent),
          vat_rate: it.prenesenie ? 0 : it.vat_rate,
          prenesenie: Boolean(it.prenesenie),
          stock_item_id: it.stock_item_id ?? null,
          // Väzba na cenník sa pri úprave nesmie stratiť (predtým sa zahodila).
          product_id: it.product_id ?? null,
          ...colneUdajeNaZapis(it),
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
          toast.success(t("Ďalšie doklady pokračujú v rade {format}.", { format: v.format }));
        } catch (e: any) {
          toast.warning(e?.message ?? t("Číselný rad sa nepodarilo zmeniť."));
        }
      }
      toast.success(
        inv?.status === "draft" && vystavitRef.current
          ? t("Faktúra {cislo} je vystavená.", { cislo: form.invoice_number.trim() })
          : t("Faktúra upravená. PDF treba pregenerovať."),
      );
      navigate({ to: "/faktury/$id", params: { id } });
    } catch (err: any) {
      toast.error(t(zrozumitelnaChyba(err?.message)));
    } finally {
      setSaving(false);
    }
  }

  if (loading || !inv) return <PageBody>{t("Načítavam…")}</PageBody>;

  return (
    <>
      <PageHeader
        title={t("Upraviť faktúru {cislo}", { cislo: inv.invoice_number })}
        description={t("Po uložení sa PDF pregeneruje pri ďalšom otvorení.")}
      />
      <PageBody>
        <form onSubmit={submit} className="mx-auto max-w-6xl space-y-6">
          {/*
            Koncept je interný, ale vystavenú faktúru už mohol odberateľ dostať.
            Nech je vidieť, že sa mení hotový doklad, nie rozpracovaný.
          */}
          {inv.status === "draft" && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
              <strong>{t("Toto je koncept.")}</strong>{" "}
              {t("Skontrolujte odberateľa, položky a dátumy a tlačidlom „Vystaviť faktúru“ ho vystavíte. Kým je to koncept, odberateľ ho nemá a do prehľadov sa nepočíta.")}
            </div>
          )}
          {inv.status !== "draft" && (
            <div className="rounded-xl border border-amber-300/50 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/40 dark:text-amber-200">
              <strong>
                {(inv.status as string) === "paid"
                  ? t("Opravujete už uhradenú faktúru.")
                  : t("Opravujete už vystavenú faktúru.")}
              </strong>{" "}
              {t("Odberateľ ju mohol dostať, preto mu po oprave pošlite nové PDF. Ak je obdobie uzamknuté uzávierkou, dátumy ani sumy sa zmeniť nedajú.")}
              {(inv.status as string) === "sent" && (
                <> {t("Riadky naviazané na sklad sa už meniť nedajú, aby sedel stav zásob.")}</>
              )}
            </div>
          )}
          {odberatel && povodnyOdberatel && (
            <OdberatelSekcia
              odberatel={odberatel}
              povodny={povodnyOdberatel}
              customers={customers}
              stav={String(inv.status)}
              reverseCharge={!!inv.reverse_charge}
              efakturaOdoslana={efakturaOdoslana}
              onZmena={setOdberatel}
              onVyber={async (c) => {
                setOdberatel(odberatelZAdresara(c));
                /*
                  Zákazka patrí odberateľovi. Keď ostala vybraná zákazka
                  pôvodného, faktúra by sa započítala do cudzej ziskovosti.
                */
                if (form.job_id) {
                  const { data: z } = await supabase
                    .from("jobs")
                    .select("customer_id")
                    .eq("id", form.job_id)
                    .maybeSingle();
                  if (z?.customer_id && z.customer_id !== c.id) {
                    setForm((f) => ({ ...f, job_id: "" }));
                    toast.info(
                      t("Zákazka patrila pôvodnému odberateľovi, tak sa z faktúry odobrala."),
                    );
                  }
                }
              }}
              onNovy={(c) => setCustomers((prev) => [c, ...prev])}
            />
          )}
          {/*
            Základné a platobné údaje stoja vedľa seba rovnako ako pri vystavovaní —
            na širokej obrazovke sa tak položky nezosúvajú kamsi pod prehyb.
          */}
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-border bg-card p-5">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide">{t("Základné údaje")}</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <div className="sm:col-span-2 lg:col-span-1 xl:col-span-2">
                  <Lbl label={t("Číslo faktúry")}>
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
                        {t("Pokračovať v tomto číselnom rade")}
                        <span className="block text-xs text-muted-foreground">
                          {(() => {
                            const v = sablonaZCisla(form.invoice_number.trim(), form.issue_date);
                            return v
                              ? t("Ďalšie doklady tohto druhu budú číslované {format} — najbližší dostane {cislo}.", { format: v.format, cislo: ukazkaCisla(v.format, v.poradie + 1, new Date(form.issue_date)) })
                              : t("Z tohto čísla sa rad odvodiť nedá — potrebuje poradie aspoň o dvoch číslach na konci. Doklad sa uloží, číslovanie ostane pôvodné.");
                          })()}
                        </span>
                      </span>
                    </label>
                  )}
                  {form.invoice_number.trim() !== (inv?.invoice_number ?? "") && (
                    <p className="mt-1 rounded-md border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/40 dark:text-amber-200">
                      {t("Číslo sa mení z {stare} na {nove}. Odberateľ mohol starý doklad dostať, tak mu pošlite nové PDF. Variabilný symbol sa nemení sám — keď má sedieť s číslom, prepíšte ho tiež.", { stare: inv?.invoice_number ?? "", nove: form.invoice_number.trim() || "—" })}
                    </p>
                  )}
                </div>
                <Lbl label={t("Dátum vystavenia")}>
                  <input
                    type="date"
                    required
                    value={form.issue_date}
                    onChange={(e) => setForm({ ...form, issue_date: e.target.value })}
                    className={inputCls}
                  />
                </Lbl>
                <Lbl label={t("Splatnosť")}>
                  <input
                    type="date"
                    required
                    value={form.due_date}
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                    className={inputCls}
                  />
                </Lbl>
                <Lbl label={t("Dátum dodania")}>
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
                  customerId={odberatel?.customer_id ?? inv?.customer_id ?? null}
                  companyId={inv?.company_id ?? null}
                />
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide">
                {t("Platobné údaje a symboly")}
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <Lbl label={t("Spôsob platby")}>
                  <select
                    value={form.payment_method}
                    onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                    className={inputCls}
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {t(m.label)}
                      </option>
                    ))}
                  </select>
                </Lbl>
                <Lbl label={t("Mena")}>
                  <input
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value })}
                    className={inputCls}
                  />
                </Lbl>
                <Lbl label={t("Variabilný symbol")}>
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
              {t("Text nad položkami")} <span className="text-destructive">*</span>
            </h3>
            <textarea
              rows={2}
              required
              value={form.intro_note}
              onChange={(e) => setForm({ ...form, intro_note: e.target.value })}
              placeholder={t("Text, ktorý sa vytlačí nad tabuľkou položiek")}
              className={inputCls}
            />
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide">{t("Položky")}</h3>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-foreground">
                    <th className="py-2 font-medium">{t("Názov")}</th>
                    <th className="py-2 pl-3 font-medium">{t("Mn.")}</th>
                    <th className="py-2 pl-3 font-medium">{t("MJ")}</th>
                    <th className="py-2 pl-3 font-medium text-right">{t("Cena")}</th>
                    <th className="py-2 pl-3 font-medium text-right">{t("Zľava %")}</th>
                    <th className="py-2 pl-3 font-medium">{t("DPH")}</th>
                    <th className="py-2 pl-3 font-medium text-right">{t("Spolu s DPH")}</th>
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
                          placeholder={t("Názov položky")}
                          className="w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm hover:border-input focus:border-input focus:bg-background"
                        />
                        <PoznamkaPolozky
                          value={it.description}
                          disabled={it._locked}
                          onChange={(v) => setItem(idx, { description: v })}
                        />
                        <ColneUdajePolozky
                          value={it}
                          disabled={it._locked}
                          onChange={(v) => setItem(idx, v)}
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
                          value={it.unit_price === 0 ? "" : it.unit_price}
                          placeholder="0"
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
                          value={Number(it.discount_percent ?? 0) === 0 ? "" : it.discount_percent}
                          placeholder="0"
                          disabled={it._locked}
                          onChange={(e) =>
                            setItem(idx, { discount_percent: percentoZlavy(e.target.value) })
                          }
                          className="w-16 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-right text-sm tabular-nums hover:border-input focus:border-input focus:bg-background"
                        />
                      </td>
                      <td className="py-2 pl-3">
                        <select
                          value={it.prenesenie ? "pdp" : it.vat_rate}
                          disabled={it._locked}
                          onChange={(e) =>
                            e.target.value === "pdp"
                              ? setItem(idx, { prenesenie: true })
                              : setItem(idx, {
                                  vat_rate: Number(e.target.value),
                                  prenesenie: false,
                                })
                          }
                          className="rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm hover:border-input focus:border-input focus:bg-background"
                        >
                          {(() => {
                            const v = sadzbyDoVyberu(rezim, it.vat_rate, form.issue_date);
                            return (
                              <>
                                {v.platne.map((r) => (
                                  <option key={r} value={r}>
                                    {r}%
                                  </option>
                                ))}
                                {/* Prenesenie len na túto položku. */}
                                {rezim.platitel && <option value="pdp">{t("PDP (prenesenie)")}</option>}
                                {v.historicke.length > 0 && (
                                  <optgroup label={t("Historické sadzby")}>
                                    {v.historicke.map((h) => (
                                      <option key={h.sadzba} value={h.sadzba}>
                                        {t("{sadzba}% (do {rok})", { sadzba: h.sadzba, rok: h.doRoku })}
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                              </>
                            );
                          })()}
                        </select>
                      </td>
                      <td className="py-2 pl-3">
                        <CellSpolu
                          hodnota={
                            zakladRiadku(it.quantity, it.unit_price, it.discount_percent) *
                            (it.prenesenie ? 1 : 1 + it.vat_rate / 100)
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
                              ? t("Položky ovplyvňujúce sklad nie je možné meniť po odoslaní faktúry.")
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
              {t("Do stĺpca „Spolu s DPH“ sa dá napísať suma, na ktorej ste sa dohodli — jednotková cena bez dane sa dopočíta sama.")}
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
                    placeholder={t("Názov položky")}
                    className="mb-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <PoznamkaPolozky
                    mobil
                    value={it.description}
                    disabled={it._locked}
                    onChange={(v) => setItem(idx, { description: v })}
                  />
                  <ColneUdajePolozky
                    mobil
                    value={it}
                    disabled={it._locked}
                    onChange={(v) => setItem(idx, v)}
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
                      value={it.unit_price === 0 ? "" : it.unit_price}
                      placeholder="0"
                      disabled={it._locked}
                      onChange={(e) => setItem(idx, { unit_price: Number(e.target.value) })}
                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      title={t("Zľava v %")}
                      value={Number(it.discount_percent ?? 0) === 0 ? "" : it.discount_percent}
                      placeholder="0"
                      disabled={it._locked}
                      onChange={(e) =>
                        setItem(idx, { discount_percent: percentoZlavy(e.target.value) })
                      }
                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    />
                    <select
                      value={it.prenesenie ? "pdp" : it.vat_rate}
                      disabled={it._locked}
                      onChange={(e) =>
                        e.target.value === "pdp"
                          ? setItem(idx, { prenesenie: true })
                          : setItem(idx, { vat_rate: Number(e.target.value), prenesenie: false })
                      }
                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    >
                      {(() => {
                        const v = sadzbyDoVyberu(rezim, it.vat_rate, form.issue_date);
                        return (
                          <>
                            {v.platne.map((r) => (
                              <option key={r} value={r}>
                                {r}%
                              </option>
                            ))}
                            {/* Prenesenie len na túto položku. */}
                            {rezim.platitel && <option value="pdp">{t("PDP (prenesenie)")}</option>}
                            {v.historicke.length > 0 && (
                              <optgroup label={t("Historické sadzby")}>
                                {v.historicke.map((h) => (
                                  <option key={h.sadzba} value={h.sadzba}>
                                    {t("{sadzba}% (do {rok})", { sadzba: h.sadzba, rok: h.doRoku })}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </>
                        );
                      })()}
                    </select>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-foreground">{t("Spolu s DPH")}</span>
                      <CellSpolu
                        hodnota={
                          zakladRiadku(it.quantity, it.unit_price, it.discount_percent) *
                          (it.prenesenie ? 1 : 1 + it.vat_rate / 100)
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
                      🔒 {t("Položka ovplyvňujúca sklad — nemožno meniť po odoslaní.")}
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
              <Plus className="h-3.5 w-3.5" /> {t("Pridať položku")}
            </button>
          </section>

          <section className="rounded-2xl border border-border bg-gradient-to-br from-card to-primary/[0.03] p-5">
            <div className="ml-auto max-w-sm space-y-2 text-sm">
              {/* Zľava na celý doklad — rozpočíta sa pomerne medzi sadzby DPH. */}
              <div className="flex items-center justify-between gap-2 pb-1">
                <span className="text-[13px] font-semibold text-foreground">{t("Zľava na doklad")}</span>
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
                    <span>{t("Medzisúčet")}</span>
                    <span className="tabular-nums">
                      {zobrazene.medzisucet.toFixed(2)} {form.currency}
                    </span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>{t("Zľava")}</span>
                    <span className="tabular-nums">
                      −{totals.zlava.toFixed(2)} {form.currency}
                    </span>
                  </div>
                </>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("Bez DPH")}</span>
                <span className="tabular-nums">
                  {zobrazene.subtotal.toFixed(2)} {form.currency}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("DPH")}</span>
                <span className="tabular-nums">
                  {zobrazene.vat_total.toFixed(2)} {form.currency}
                </span>
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-lg font-bold">
                <span>{t("Spolu")}</span>
                <span className="tabular-nums text-primary">
                  {zobrazene.total.toFixed(2)} {form.currency}
                </span>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide">{t("Poznámka")}</h3>
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
              {t("Zrušiť")}
            </Link>
            {inv.status === "draft" ? (
              <>
                <button
                  type="submit"
                  disabled={saving}
                  onClick={() => (vystavitRef.current = false)}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2.5 text-sm font-medium hover:bg-secondary disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {t("Uložiť koncept")}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  onClick={() => (vystavitRef.current = true)}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {t("Vystaviť faktúru")}
                </button>
              </>
            ) : (
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {t("Uložiť zmeny")}
              </button>
            )}
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
  const { t } = useT();
  const [rozpisane, setRozpisane] = useState<string | null>(null);
  return (
    <input
      type="number"
      step="0.01"
      inputMode="decimal"
      disabled={disabled}
      title={t("Suma s DPH — cena bez dane sa dopočíta")}
      placeholder="0.00"
      // Nulová suma sa nepíše do poľa, je len nápovedou — klik a hneď sa píše.
      value={rozpisane ?? (Number.isFinite(hodnota) && hodnota !== 0 ? hodnota.toFixed(2) : "")}
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

/**
 * Odberateľ na opravovanej faktúre: výber iného z adresára alebo oprava údajov
 * len na tejto faktúre. Adresár sa tu nemení — to je kópia na doklade.
 */
function OdberatelSekcia({
  odberatel,
  povodny,
  customers,
  stav,
  reverseCharge,
  efakturaOdoslana,
  onZmena,
  onVyber,
  onNovy,
}: {
  odberatel: OdberatelFaktury;
  povodny: OdberatelFaktury;
  customers: any[];
  stav: string;
  reverseCharge: boolean;
  efakturaOdoslana: boolean;
  onZmena: (o: OdberatelFaktury) => void;
  onVyber: (c: any) => void;
  onNovy: (c: any) => void;
}) {
  const { t } = useT();
  const pole = (k: keyof OdberatelFaktury, label: string, extra = "") => (
    <Lbl label={label}>
      <input
        value={String(odberatel[k] ?? "")}
        onChange={(e) => onZmena({ ...odberatel, [k]: e.target.value })}
        className={`${inputCls} ${extra}`}
      />
    </Lbl>
  );
  const upozornenia = upozorneniaZmeny({
    povodny,
    novy: odberatel,
    stav,
    reverseCharge,
    efakturaOdoslana,
  });
  const zmeneny = zmenilSaOdberatel(povodny, odberatel);
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide">{t("Odberateľ")}</h3>
        {zmeneny && (
          <button
            type="button"
            onClick={() => onZmena(povodny)}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            {t("Vrátiť pôvodného ({nazov})", { nazov: povodny.customer_name || t("bez názvu") })}
          </button>
        )}
      </div>
      <div className="max-w-xl">
        <span className="text-xs font-medium text-muted-foreground">{t("Vybrať iného z adresára")}</span>
        <CustomerSearch
          customers={customers}
          value={odberatel.customer_id ?? ""}
          onChange={(cid) => {
            const c = customers.find((x) => x.id === cid);
            if (c) onVyber(c);
          }}
          onCreated={(c) => {
            onNovy(c);
            onVyber(c);
          }}
        />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {t("Údaje nižšie sú tie, ktoré sú na faktúre. Opravíte ich len na tomto doklade — v adresári ostanú, ako sú.")}
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">{pole("customer_name", t("Názov / meno"))}</div>
        {pole("customer_ico", t("IČO"))}
        {pole("customer_dic", t("DIČ"))}
        {pole("customer_ic_dph", t("IČ DPH"))}
        <div className="sm:col-span-2">{pole("customer_street", t("Ulica a číslo"))}</div>
        {pole("customer_zip", t("PSČ"))}
        {pole("customer_city", t("Mesto"))}
        {pole("customer_country", t("Krajina (kód)"), "uppercase")}
        <div className="sm:col-span-2">{pole("customer_email", t("E-mail"))}</div>
      </div>
      {upozornenia.length > 0 && (
        <ul className="mt-4 space-y-1 rounded-md border border-amber-300/50 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/40 dark:text-amber-200">
          {upozornenia.map((u) => (
            <li key={u}>{t(u)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
