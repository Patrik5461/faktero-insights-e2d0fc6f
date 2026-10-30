import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PoleDokladu, VSTUP_DOKLADU } from "@/components/faktero/PoleDokladu";
import { preloz } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { toast } from "sonner";
import { DEFAULT_VAT_RATE } from "@/lib/faktero/vat-rates";
import { vystavFakturuFn } from "@/lib/faktero/faktura-vystavenie.functions";
import { friendlyError } from "@/lib/faktero/plan-error";

import { useRezimDph, useMenaFirmy } from "@/lib/faktero/krajina-firmy";
import { PoznamkaRezimuDph } from "@/components/faktero/PoznamkaRezimuDph";
import { sadzbyRezimu, zakladnaSadzbaRezimu } from "@/lib/faktero/dph-rezim";
import { dnesBratislava, posunDni } from "@/lib/faktero/datum-vystavenia";
export const Route = createFileRoute("/_authenticated/faktury/rychla")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Rýchla faktúra — Faktero") }] }),
  component: QuickInvoicePage,
});

function QuickInvoicePage() {
  const { t } = useT();
  const mena = useMenaFirmy();
  const navigate = useNavigate();
  const vystav = useServerFn(vystavFakturuFn);
  /* Sadzby DPH vyplývajú z krajiny registrácie firmy, nenastavujú sa ručne. */
  const rezim = useRezimDph();
  const krajina = rezim.krajina;
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [customers, setCustomers] = useState<any[]>([]);
  /* Prázdny výber bez slova nehovoril, prečo sa nedá pokračovať — firma bez odberateľov. */
  const [odberateliaNacitani, setOdberateliaNacitani] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [amount, setAmount] = useState("");
  /* Text nad položkami je povinný; suma ide ako jediný riadok dokladu. */
  const [description, setDescription] = useState("");
  const [vatRate, setVatRate] = useState<number>(DEFAULT_VAT_RATE);
  const [dphRucne, setDphRucne] = useState(false);
  /*
    Krajina firmy dobehne až po načítaní, takže prvé vykreslenie nesie
    slovenskú predvolenú sadzbu. Českej firme by tak v poli ostalo 23 % —
    sadzba, ktorú vôbec neuplatňuje. Kto si sadzbu vybral sám, ten má prednosť.
  */
  useEffect(() => {
    if (!dphRucne) setVatRate(zakladnaSadzbaRezimu(rezim));
  }, [krajina, rezim, dphRucne]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    supabase
      .from("customers")
      .select("id,name")
      .eq("company_id", cid)
      .eq("odberatel", true)
      // Zmazaného odberateľa fakturovať nejde — server ho neprijme.
      .is("deleted_at", null)
      .order("name")
      .limit(100)
      .then(({ data }) => {
        setCustomers(data ?? []);
        setOdberateliaNacitani(true);
      });
  }, []);

  async function save() {
    const cid = getActiveCompanyId();
    if (!cid) return toast.error(t("Vyberte firmu"));
    if (!customerId) return toast.error(t("Vyberte odberateľa"));
    const amt = Number(String(amount).replace(",", "."));
    if (!amt || amt <= 0) return toast.error(t("Zadajte sumu"));
    if (!description.trim()) {
      return toast.error(t("Vyplňte text nad položkami — hovorí, čo sa fakturuje."));
    }
    setSaving(true);
    const today = dnesBratislava();
    const due = posunDni(dnesBratislava(), 14);
    // Suma sa zadáva s DPH, v položke je cena bez nej.
    const unitPrice = Math.round((amt / (1 + vatRate / 100)) * 100) / 100;
    try {
      /*
       * Číslo, súčty aj snímku odberateľa rieši server. Predtým si stránka
       * vymýšľala číslo z času („RYCHLA-123456"), takže faktúra vypadla
       * z číselného radu firmy, nemala variabilný symbol ani súčty.
       */
      const inv = await vystav({
        data: {
          company_id: cid,
          customer_id: customerId,
          issue_date: today,
          due_date: due,
          payment_method: "bank_transfer" as const,
          currency: "EUR",
          status: "draft" as const,
          intro_note: description.trim(),
          items: [
            {
              name: "Fakturovaná suma",
              quantity: 1,
              unit: "ks",
              unit_price: unitPrice,
              vat_rate: vatRate,
            },
          ],
        },
      });
      toast.success(t("Faktúra {cislo} vytvorená", { cislo: inv.invoice_number }));
      navigate({ to: "/faktury/$id", params: { id: inv.id } });
    } catch (e) {
      toast.error(t(friendlyError(e, "Faktúru sa nepodarilo vytvoriť")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title={t("Rýchla faktúra")} description={t("Krok {krok} z 3", { krok: step })} />
      <PageBody>
        <PoznamkaRezimuDph />
        <div className="mx-auto max-w-md space-y-4">
          <div className="flex gap-1">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-primary" : "bg-muted"}`}
              />
            ))}
          </div>

          {step === 1 && (
            <div className="space-y-3 rounded-xl border border-border bg-card p-4">
              <h2 className="font-medium">{t("Odberateľ")}</h2>
              <select
                aria-label={t("Odberateľ")}
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className={VSTUP_DOKLADU}
              >
                <option value="">{t("— vyberte —")}</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {odberateliaNacitani && customers.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {t("Zatiaľ nemáte žiadneho odberateľa.")}{" "}
                  <Link to="/odberatelia" search={{ new: "1" }} className="text-primary underline">
                    {t("Pridať odberateľa")}
                  </Link>
                </p>
              )}
              <button
                disabled={!customerId}
                onClick={() => setStep(2)}
                className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {t("Ďalej")}
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3 rounded-xl border border-border bg-card p-4">
              <h2 className="font-medium">{t("Suma a popis")}</h2>
              <PoleDokladu label={t("Suma (s DPH)")} htmlFor="suma-rychla">
                <input
                  id="suma-rychla"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={`${VSTUP_DOKLADU} text-base`}
                  autoFocus
                />
              </PoleDokladu>
              <PoleDokladu label={t("DPH")} htmlFor="dph-rychla">
                <select
                  id="dph-rychla"
                  value={vatRate}
                  onChange={(e) => {
                    setVatRate(Number(e.target.value));
                    setDphRucne(true);
                  }}
                  className={VSTUP_DOKLADU}
                >
                  {sadzbyRezimu(rezim).map((r) => (
                    <option key={r} value={r}>
                      {r} %
                    </option>
                  ))}
                </select>
              </PoleDokladu>
              <PoleDokladu
                label={
                  <>
                    {t("Text nad položkami")} <span className="text-destructive">*</span>
                  </>
                }
                htmlFor="text-rychla"
                napoveda={t("Vytlačí sa nad tabuľkou; suma pod ním pôjde ako jeden riadok.")}
              >
                <input
                  id="text-rychla"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("Napríklad: Práce podľa objednávky č. 2026/114")}
                  className={VSTUP_DOKLADU}
                />
              </PoleDokladu>
              <div className="flex gap-2">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 rounded-md border border-border px-4 py-2 text-sm"
                >
                  {t("Späť")}
                </button>
                <button
                  disabled={!amount || !description.trim()}
                  onClick={() => setStep(3)}
                  className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {t("Ďalej")}
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3 rounded-xl border border-border bg-card p-4">
              <h2 className="font-medium">{t("Súhrn")}</h2>
              <div className="space-y-1 text-sm">
                <Row
                  label={t("Odberateľ")}
                  value={customers.find((c) => c.id === customerId)?.name ?? ""}
                />
                <Row label={t("Text nad položkami")} value={description} />
                <Row label={t("Suma")} value={t("{suma} {mena} (vrátane {sadzba}% DPH)", { suma: amount, mena: mena.symbol, sadzba: vatRate })} />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 rounded-md border border-border px-4 py-2 text-sm"
                >
                  {t("Späť")}
                </button>
                <button
                  disabled={saving}
                  onClick={save}
                  className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                >
                  {saving ? t("Ukladám…") : t("Vytvoriť faktúru")}
                </button>
              </div>
            </div>
          )}
        </div>
      </PageBody>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
