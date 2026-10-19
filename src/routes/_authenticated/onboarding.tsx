import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { setActiveCompanyId } from "@/lib/faktero/active-company";
import { toast } from "sonner";
import { IcoLookupButton } from "@/components/faktero/IcoLookupButton";
import { CompanyNameAutocomplete } from "@/components/faktero/CompanyNameAutocomplete";
import { mergeCompanyAutofill } from "@/lib/faktero/company-autofill";
import { PLAN_PENDING_KEY } from "@/routes/registracia";

import { VyberKrajiny } from "@/components/faktero/VyberKrajiny";
import { VyberRezimuDph } from "@/components/faktero/VyberRezimuDph";
import { zosuladSchemu, type SchemaDph } from "@/lib/faktero/dph-rezim";
import { krajinaDane } from "@/lib/faktero/vat-rates";
import { jeUstIdNr, popiskyIdentifikatorov } from "@/lib/faktero/firma-de";
import { MENY } from "@/lib/faktero/mena";
import { domacaMena } from "@/lib/faktero/kurzy";
import { preloz } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";
import {
  firmaZPrenosu,
  nacitajPrenos,
  zmazPrenos,
  type FakturaZadarmo,
} from "@/lib/faktero/faktura-zadarmo";
import { vytvorKonceptZPrenosu } from "@/lib/faktero/faktura-zadarmo-prenos";
import { vystavFakturuFn } from "@/lib/faktero/faktura-vystavenie.functions";
export const Route = createFileRoute("/_authenticated/onboarding")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk ?? "sk", "Nastavenie firmy — Faktero") }],
  }),
  component: Onboarding,
});

function Onboarding() {
  const { t } = useT();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    ico: "",
    dic: "",
    ic_dph: "",
    street: "",
    city: "",
    zip: "",
    country: "SK",
    email: "",
    phone: "",
    iban: "",
    default_currency: "EUR",
    vat_payer: false,
    vat_scheme: "sk_neplatitel" as SchemaDph,
  });
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  /*
    Faktúra z verejnej stránky „Faktúra zadarmo“ (localStorage). Údaje
    dodávateľa predvyplnia firmu; po založení z odberateľa bude kontakt
    v adresári a z faktúry koncept.
  */
  const [prenos, setPrenos] = useState<FakturaZadarmo | null>(null);
  const [prenosPouzity, setPrenosPouzity] = useState(false);
  const [vytvoritKoncept, setVytvoritKoncept] = useState(true);
  const vystav = useServerFn(vystavFakturuFn);
  useEffect(() => {
    setPrenos(nacitajPrenos());
  }, []);

  function pouziPrenos() {
    if (!prenos) return;
    setForm((f) => ({ ...f, ...firmaZPrenosu(prenos) }));
    setPrenosPouzity(true);
  }

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => {
      const n = { ...f, [k]: v };
      // Krajina prepína, ktoré paragrafy pripadajú do úvahy.
      if (k === "country") return sMenouKrajiny(f, n);
      return n;
    });
  }

  /**
   * Po zmene krajiny (ručne aj z registra) prispôsobí režim DPH a menu. Mena sa
   * prepne len vtedy, keď bola domácou menou pôvodnej krajiny — vedome
   * vybranú inú menu nemení.
   */
  function sMenouKrajiny(pred: typeof form, po: typeof form): typeof form {
    const n = {
      ...po,
      vat_scheme: zosuladSchemu(po.vat_scheme, krajinaDane(po.country), po.vat_payer),
    };
    if (pred.default_currency === domacaMena(pred.country))
      n.default_currency = domacaMena(po.country);
    return n;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setErrorMsg(null);
    if (!form.name.trim()) {
      setErrorMsg(t("Zadajte názov firmy."));
      return;
    }
    if (krajinaDane(form.country) === "DE" && form.ic_dph.trim() && !jeUstIdNr(form.ic_dph)) {
      setErrorMsg(t("USt-IdNr. má tvar DE a 9 číslic, napríklad DE123456789."));
      return;
    }
    setLoading(true);
    try {
      const { data: userData, error: authErr } = await supabase.auth.getUser();
      if (authErr || !userData.user) {
        throw new Error(t("Chýba prihlásenie. Prihláste sa znova."));
      }
      const { data: companyId, error } = await supabase.rpc("create_company_with_owner", {
        _name: form.name,
        _ico: form.ico || undefined,
        _dic: form.dic || undefined,
        _ic_dph: form.ic_dph || undefined,
        _street: form.street || undefined,
        _city: form.city || undefined,
        _zip: form.zip || undefined,
        _country: krajinaDane(form.country),
        _email: form.email || undefined,
        _phone: form.phone || undefined,
        _iban: form.iban || undefined,
        _default_currency: form.default_currency || domacaMena(form.country),
        _vat_payer: form.vat_payer,
        _vat_scheme: zosuladSchemu(form.vat_scheme, krajinaDane(form.country), form.vat_payer),
      });
      if (error || !companyId) {
        throw new Error(error?.message ?? t("Nepodarilo sa vytvoriť firmu."));
      }
      setActiveCompanyId(companyId as string);
      toast.success(t("Firma vytvorená"));
      let konceptId: string | null = null;
      if (prenos && prenosPouzity) {
        if (vytvoritKoncept) {
          try {
            konceptId = (await vytvorKonceptZPrenosu(prenos, companyId as string, vystav as any))
              .invoiceId;
            zmazPrenos();
          } catch (e: any) {
            // Firma už je; koncept sa dá vytvoriť z karty na nástenke.
            console.warn("[onboarding] koncept z faktúry zadarmo", e?.message ?? e);
            toast.error(t("Koncept faktúry sa nepodarilo vytvoriť — nájdete ho na nástenke."));
          }
        } else {
          zmazPrenos();
        }
      }
      // Keď používateľ prišiel z objednávky s vybraným plánom, dokončíme, čo začal —
      // firmu už má, takže platba má kam patriť.
      let pendingPlan: string | null = null;
      try {
        pendingPlan = sessionStorage.getItem(PLAN_PENDING_KEY);
        if (pendingPlan) sessionStorage.removeItem(PLAN_PENDING_KEY);
      } catch {
        // sessionStorage môže byť zakázané — pokračujeme na nástenku
      }
      // Hard reload so the authed layout re-reads memberships fresh.
      window.location.assign(
        pendingPlan
          ? `/predplatne?plan=${encodeURIComponent(pendingPlan)}`
          : konceptId
            ? `/faktury/${konceptId}`
            : "/dashboard",
      );
    } catch (err: any) {
      const msg = err?.message ?? t("Nepodarilo sa vytvoriť firmu.");
      setErrorMsg(msg);
      toast.error(msg);
      setLoading(false);
    }
  }

  // Nemecká firma: Steuernummer a USt-IdNr. namiesto DIČ a IČ DPH, IČO nepovinné.
  const jeDe = krajinaDane(form.country) === "DE";
  const popisky = popiskyIdentifikatorov(form.country);

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">{t("Vytvorte si firmu")}</h1>
      <p className="mt-2 text-muted-foreground">
        {t("Tieto údaje sa zobrazia na faktúrach. Môžete ich kedykoľvek upraviť.")}
      </p>

      {prenos && !prenosPouzity && (
        <div className="mt-6 flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center">
          <FileText className="hidden h-5 w-5 shrink-0 text-primary sm:block" />
          <p className="min-w-0 flex-1 text-sm">
            {t(
              "Pred registráciou ste vytvorili faktúru za {firma}. Údaje dodávateľa môžeme použiť pre vašu firmu.",
              {
                firma: prenos.dodavatel.nazov,
              },
            )}
          </p>
          <button
            type="button"
            onClick={pouziPrenos}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {t("Použiť údaje z faktúry, ktorú ste vytvorili")}
          </button>
        </div>
      )}

      <form
        onSubmit={onSubmit}
        className="mt-8 space-y-5 rounded-xl border border-border bg-card p-6"
      >
        {errorMsg && (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {errorMsg}
          </div>
        )}
        <label className="block">
          <span className="text-sm font-medium">
            {t("Názov firmy")}
            <span className="text-destructive"> *</span>
          </span>
          <div className="mt-1">
            <CompanyNameAutocomplete
              value={form.name}
              onChange={(v) => set("name", v)}
              onPick={(d, { auto }) =>
                setForm((f) =>
                  sMenouKrajiny(
                    f,
                    mergeCompanyAutofill(f, d, { mode: auto ? "fill-empty" : "overwrite" }),
                  ),
                )
              }
            />
          </div>
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="text-sm font-medium">{t(popisky.ico)}</span>
            <div className="mt-1 flex -space-x-px items-start">
              <input
                value={form.ico}
                onChange={(e) => set("ico", e.target.value)}
                className={`w-full border border-input bg-background px-3 py-2 text-sm outline-none focus:z-10 focus:ring-2 focus:ring-ring ${jeDe ? "rounded-md" : "rounded-l-md"}`}
              />
              {!jeDe && (
                <IcoLookupButton
                  ico={form.ico}
                  onResult={(d, { auto }) =>
                    setForm((f) =>
                      sMenouKrajiny(
                        f,
                        mergeCompanyAutofill(f, d, { mode: auto ? "fill-empty" : "overwrite" }),
                      ),
                    )
                  }
                />
              )}
            </div>
          </label>
          <Field label={popisky.dic} value={form.dic} onChange={(v) => set("dic", v)} />
          <Field label={popisky.icDph} value={form.ic_dph} onChange={(v) => set("ic_dph", v)} />
        </div>
        <Field label="Ulica" value={form.street} onChange={(v) => set("street", v)} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Mesto" value={form.city} onChange={(v) => set("city", v)} />
          <Field label="PSČ" value={form.zip} onChange={(v) => set("zip", v)} />
          <VyberKrajiny hodnota={form.country} onZmena={(v) => set("country", v)} />
        </div>
        <div className="grid gap-4">
          <VyberRezimuDph
            krajina={form.country}
            platitel={form.vat_payer}
            schema={form.vat_scheme}
            icDph={form.ic_dph}
            onZmena={({ platitel, schema }) =>
              setForm((f) => ({ ...f, vat_payer: platitel, vat_scheme: schema }))
            }
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" type="email" value={form.email} onChange={(v) => set("email", v)} />
          <Field label="Telefón" value={form.phone} onChange={(v) => set("phone", v)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="IBAN" value={form.iban} onChange={(v) => set("iban", v)} />
          {/* Mena firmy sa dedí do dokladov — voľný text by sem pustil kód,
              ktorý nikto nekontroluje. */}
          <label className="block">
            <span className="text-sm font-medium">{t("Mena")}</span>
            <select
              value={form.default_currency}
              onChange={(e) => set("default_currency", e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {MENY.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.code} {m.symbol} — {m.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {prenos && prenosPouzity && (
          <label className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
            <input
              type="checkbox"
              checked={vytvoritKoncept}
              onChange={(e) => setVytvoritKoncept(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              {t(
                "Po založení firmy pridať odberateľa {odberatel} do adresára a faktúru {cislo} uložiť ako koncept.",
                {
                  odberatel: prenos.odberatel.nazov,
                  cislo: prenos.cislo,
                },
              )}
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {t(
                  "Koncept dostane číslo z vášho číselného radu. Pred vystavením ho môžete upraviť.",
                )}
              </span>
            </span>
          </label>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-primary px-4 py-2.5 font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {loading ? t("Vytváram...") : t("Vytvoriť firmu a pokračovať")}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
}) {
  const { t } = useT();
  return (
    <label className="block">
      <span className="text-sm font-medium">
        {t(label)}
        {required && <span className="text-destructive"> *</span>}
      </span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}
