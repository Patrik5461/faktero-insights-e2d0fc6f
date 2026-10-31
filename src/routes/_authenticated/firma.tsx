import { MENY } from "@/lib/faktero/mena";
import { VlastnySmtp } from "@/components/faktero/VlastnySmtp";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId, oznamZmenuFiriem } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { toast } from "sonner";
import { IcoLookupButton } from "@/components/faktero/IcoLookupButton";
import { CompanyNameAutocomplete } from "@/components/faktero/CompanyNameAutocomplete";
import { mergeCompanyAutofill } from "@/lib/faktero/company-autofill";

import { VyberKrajiny } from "@/components/faktero/VyberKrajiny";
import { VyberRezimuDph } from "@/components/faktero/VyberRezimuDph";
import { PlatitelDphRegister } from "@/components/faktero/PlatitelDphRegister";
import { UpozornenieKleinunternehmer } from "@/components/faktero/UpozornenieKleinunternehmer";
import { zosuladSchemu } from "@/lib/faktero/dph-rezim";
import { krajinaDane } from "@/lib/faktero/vat-rates";
import { chybyIdentifikatorovDe, popiskyIdentifikatorov } from "@/lib/faktero/firma-de";
import { zabudniKrajinuDane, zabudniRezimDph } from "@/lib/faktero/krajina-firmy";
import { BankoveUctyFirmy } from "@/components/faktero/banka/BankoveUctyFirmy";
import { EditorOpravneni, VysvetlenieRoli } from "@/components/faktero/pristupy/Opravnenia";
import { TechnickaPodpora, UdajeClena } from "@/components/faktero/pristupy/ClenFirmy";
import { suhrnOpravneni, type Opravnenia } from "@/lib/faktero/opravnenia";
import { potvrd } from "@/lib/potvrdenie";
import { domacaMena } from "@/lib/faktero/kurzy";
import { preloz, lokalJazyka } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";
export const Route = createFileRoute("/_authenticated/firma")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk ?? "sk", "Firma — Faktero") }],
  }),
  component: CompanyPage,
});

function CompanyPage() {
  const { t } = useT();
  const [c, setC] = useState<any>(null);
  useEffect(() => {
    const id = getActiveCompanyId();
    if (!id) return;
    supabase
      .from("companies")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data }) => setC(data));
  }, []);
  if (!c) return <PageBody>{t("Načítavam…")}</PageBody>;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    // IBAN a SWIFT spravujú Bankové účty nižšie — uloženie firmy ich nesmie
    // prepísať hodnotou z času, keď sa stránka otvorila.
    // Stav overenia v registri DPH zapisuje len server — staré hodnoty z načítania sa neposielajú.
    const {
      id,
      created_at,
      updated_at,
      created_by,
      iban: _iban,
      swift: _swift,
      dph_overit_od: _overit,
      dph_overene_at: _overene,
      ...patch
    } = c;
    const { error } = await supabase.from("companies").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    // Krajina určuje sadzby DPH a formuláre si ju pamätajú — po zmene sa musí
    // zabudnúť, inak by faktúra ďalej ponúkala sadzby predchádzajúcej krajiny.
    zabudniKrajinuDane(id);
    zabudniRezimDph(id);
    // Názov a krajinu ukazuje aj menu — zoznam firiem sa inak neobnoví.
    oznamZmenuFiriem();
    toast.success(t("Uložené"));
  }

  const f = (k: string) => (v: string) => setC({ ...c, [k]: v });
  /*
    Nemecká firma: Steuernummer ide do `dic`, USt-IdNr. do `ic_dph`, IČO je
    nepovinné a vyhľadanie v registri (FinStat/ARES) pre ňu nemá zmysel.
  */
  const jeDe = krajinaDane(c.country) === "DE";
  const popisky = popiskyIdentifikatorov(c.country);
  const chybyDe = jeDe ? chybyIdentifikatorovDe(c) : [];
  return (
    <>
      <PageHeader title={t("Firma")} description={t("Údaje, ktoré sa zobrazia na faktúrach.")} />
      <PageBody>
        <form
          onSubmit={save}
          className="grid gap-4 rounded-xl border border-border bg-card p-6 sm:grid-cols-2"
        >
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium">{t("Názov *")}</span>
            <div className="mt-1">
              <CompanyNameAutocomplete
                value={c.name ?? ""}
                onChange={f("name")}
                onPick={(d, { auto }) =>
                  setC((prev: any) =>
                    mergeCompanyAutofill(prev ?? {}, d, {
                      mode: auto ? "fill-empty" : "overwrite",
                    }),
                  )
                }
              />
            </div>
          </label>
          <label className="block min-w-0">
            <span className="text-sm font-medium">{t(popisky.ico)}</span>
            {/* Políčko sa zmenší (min-w-0), tlačidlo nie — česky je jeho text dlhší. */}
            <div className="mt-1 flex min-w-0 -space-x-px items-start">
              <input
                value={c.ico ?? ""}
                onChange={(e) => f("ico")(e.target.value)}
                className={`h-10 w-full min-w-0 flex-1 border border-input bg-background px-3 py-2 text-sm focus:z-10 ${jeDe ? "rounded-md" : "rounded-l-md"}`}
              />
              {!jeDe && (
                <IcoLookupButton
                  ico={c.ico ?? ""}
                  onResult={(d, { auto }) =>
                    setC((prev: any) =>
                      mergeCompanyAutofill(prev ?? {}, d, {
                        mode: auto ? "fill-empty" : "overwrite",
                      }),
                    )
                  }
                />
              )}
            </div>
          </label>
          <In
            label={popisky.dic}
            value={c.dic ?? ""}
            onChange={f("dic")}
            placeholder={jeDe ? "12/345/67890" : undefined}
          />
          <In
            label={popisky.icDph}
            value={c.ic_dph ?? ""}
            onChange={f("ic_dph")}
            placeholder={jeDe ? "DE123456789" : undefined}
          />
          {jeDe && (
            <>
              <In
                label="Registergericht"
                value={c.registergericht ?? ""}
                onChange={f("registergericht")}
                placeholder="Amtsgericht München"
              />
              <In
                label="Handelsregister-Nr."
                value={c.handelsregister_nr ?? ""}
                onChange={f("handelsregister_nr")}
                placeholder="HRB 123456"
              />
              <In
                label="Geschäftsführer"
                value={c.geschaeftsfuehrer ?? ""}
                onChange={f("geschaeftsfuehrer")}
              />
              <p className="self-end text-xs text-muted-foreground">
                {t("Registergericht, číslo HRB a konateľ sa vytlačia do päty faktúry.")}
              </p>
              {chybyDe.length > 0 && (
                <ul className="sm:col-span-2 space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-400">
                  {chybyDe.map((ch) => (
                    <li key={ch}>{t(ch)}</li>
                  ))}
                </ul>
              )}
            </>
          )}
          <In label="Email" value={c.email ?? ""} onChange={f("email")} />
          <In full label="Ulica" value={c.street ?? ""} onChange={f("street")} />
          <In label="Mesto" value={c.city ?? ""} onChange={f("city")} />
          <In label="PSČ" value={c.zip ?? ""} onChange={f("zip")} />
          {/* Krajina prepína režim sadzieb DPH, tak sa vyberá, nepíše. */}
          <VyberKrajiny
            hodnota={c.country}
            onZmena={(v) =>
              setC((prev: any) => ({
                ...prev,
                country: v,
                vat_scheme: zosuladSchemu(prev.vat_scheme, krajinaDane(v), Boolean(prev.vat_payer)),
                // Mena faktúr nasleduje domácu menu krajiny, ak ju nikto nezmenil vedome.
                default_currency:
                  (prev.default_currency ?? "EUR") === domacaMena(prev.country)
                    ? domacaMena(v)
                    : prev.default_currency,
              }))
            }
          />
          <VyberRezimuDph
            krajina={c.country}
            platitel={Boolean(c.vat_payer)}
            schema={c.vat_scheme}
            icDph={c.ic_dph}
            onZmena={({ platitel, schema }) =>
              setC((prev: any) => ({ ...prev, vat_payer: platitel, vat_scheme: schema }))
            }
          />
          <PlatitelDphRegister
            companyId={c.id}
            firma={c}
            onAuto={(zapnute) => setC((prev: any) => ({ ...prev, dph_auto_overenie: zapnute }))}
            onPrevzate={(zmena) => {
              setC((prev: any) => ({ ...prev, ...zmena }));
              // Formuláre si pamätajú režim DPH firmy — po zmene ho treba zabudnúť.
              zabudniRezimDph(c.id);
            }}
          />
          <div className="sm:col-span-2 empty:hidden">
            <UpozornenieKleinunternehmer firma={c} />
          </div>
          {/* § 68d je slovenská/česká veta; nemecká Ist-Versteuerung vetu na faktúre nemá. */}
          {Boolean(c.vat_payer) && !jeDe && (
            <label className="flex items-start gap-2 sm:col-span-2">
              <input
                type="checkbox"
                checked={Boolean(c.dan_z_prijatej_platby)}
                onChange={(e) =>
                  setC((prev: any) => ({ ...prev, dan_z_prijatej_platby: e.target.checked }))
                }
                className="mt-0.5 h-4 w-4 rounded border-input"
              />
              <span className="text-sm">
                {t("Uplatňujem daň na základe prijatia platby (§ 68d)")}
                <span className="block text-xs text-muted-foreground">
                  {t(
                    'Na každú faktúru pribudne veta „Daň sa uplatňuje na základe prijatia platby" — bez nej je doklad neúplný.',
                  )}
                </span>
              </span>
            </label>
          )}
          {/*
            Nemecký platiteľ: spôsob zdaňovania (§ 13/§ 20 UStG) a obdobie UStVA
            (§ 18 UStG, § 46 UStDV). Kleinunternehmer UStVA nepodáva, tak sa mu to neponúka.
          */}
          {jeDe && Boolean(c.vat_payer) && c.vat_scheme !== "de_kleinunternehmer" && (
            <fieldset className="grid gap-4 rounded-lg border border-border p-4 sm:col-span-2 sm:grid-cols-2">
              <legend className="px-1 text-sm font-medium">{t("Umsatzsteuer-Voranmeldung")}</legend>
              <label className="block">
                <span className="text-sm font-medium">{t("Spôsob zdaňovania")}</span>
                <select
                  value={c.de_versteuerung === "ist" ? "ist" : "soll"}
                  onChange={(e) => f("de_versteuerung")(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="soll">
                    {t("Versteuerung nach vereinbarten Entgelten (Soll)")}
                  </option>
                  <option value="ist">
                    {t("Versteuerung nach vereinnahmten Entgelten (Ist)")}
                  </option>
                </select>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {t(
                    "Ist len s povolením Finanzamtu (§ 20 UStG) — daň z faktúr sa priznáva až v období, keď prišla platba.",
                  )}
                </span>
              </label>
              <label className="block">
                <span className="text-sm font-medium">{t("Voranmeldungszeitraum")}</span>
                <select
                  value={c.de_ustva_obdobie === "stvrtrocne" ? "stvrtrocne" : "mesacne"}
                  onChange={(e) => f("de_ustva_obdobie")(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="mesacne">{t("Mesačne")}</option>
                  <option value="stvrtrocne">{t("Štvrťročne")}</option>
                </select>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {t("Určuje Finanzamt — mesačne pri dani za minulý rok nad 9 000 €.")}
                </span>
              </label>
              <label className="flex items-start gap-2 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={Boolean(c.de_dauerfrist)}
                  onChange={(e) =>
                    setC((prev: any) => ({ ...prev, de_dauerfrist: e.target.checked }))
                  }
                  className="mt-0.5 h-4 w-4 rounded border-input"
                />
                <span className="text-sm">
                  {t("Dauerfristverlängerung")}
                  <span className="block text-xs text-muted-foreground">
                    {t(
                      "Termín UStVA sa posúva o mesiac (§ 46 UStDV). Pri mesačnom podávaní k nej patrí Sondervorauszahlung — 1/11 záloh za minulý rok, odpočíta sa v decembri (KZ 39).",
                    )}
                  </span>
                </span>
              </label>
              <label className="block sm:col-span-2">
                <span className="text-sm font-medium">{t("Kurz pri faktúre v cudzej mene")}</span>
                <select
                  value={c.kurz_de_zdroj === "ecb_tageskurs" ? "ecb_tageskurs" : "bmf"}
                  onChange={(e) => f("kurz_de_zdroj")(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="bmf">{t("BMF-Monatskurs (§ 16 Abs. 6 UStG)")}</option>
                  <option value="ecb_tageskurs">
                    {t("Tageskurs EZB (mit Genehmigung des Finanzamts)")}
                  </option>
                </select>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {t(
                    "Kým BMF kurz mesiaca nezverejní, použije sa predbežne kurz ECB a doklad sa potom prepočíta sám.",
                  )}
                </span>
              </label>
            </fieldset>
          )}
          <In label="Telefón" value={c.phone ?? ""} onChange={f("phone")} />
          <In label="Web" value={c.website ?? ""} onChange={f("website")} />
          {/* Predvolená mena firmy sa dedí do každého nového dokladu, takže
              práve tu voľný text škodí najviac. */}
          <label className="block">
            <span className="text-sm font-medium">{t("Mena")}</span>
            <select
              value={c.default_currency ?? "EUR"}
              onChange={(e) => f("default_currency")(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {MENY.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.code} {m.symbol} — {t(m.name)}
                </option>
              ))}
            </select>
          </label>
          <div>
            <In
              label="Formát čísla faktúry"
              value={c.invoice_number_format ?? ""}
              onChange={f("invoice_number_format")}
            />
            <NumberingPreview companyId={c.id} format={c.invoice_number_format ?? ""} />
            <p className="mt-1 text-xs text-muted-foreground">
              {t(
                "Tokeny: {YYYY} rok, {YY} rok 2-cif., {MM} mesiac, {NN}–{NNNN} poradie (počet N = počet číslic). Ak formát obsahuje {MM}, poradie sa resetuje mesačne, inak ročne.",
              )}
            </p>
            <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-400">
              {t(
                "Pozor: zmena šablóny uprostred roka rozdelí číselný rad — nové faktúry budú číslované podľa novej šablóny, staré zostanú nezmenené. Ak by nové číslo kolidovalo s existujúcim, poradie sa automaticky posunie na najbližšie voľné.",
              )}
            </p>
          </div>

          <label className="block">
            <span className="text-sm font-medium">{t("Preferovaný účtovný systém")}</span>
            <select
              value={c.preferred_accounting_system ?? "pohoda"}
              onChange={(e) => setC({ ...c, preferred_accounting_system: e.target.value })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="pohoda">Pohoda</option>
              <option value="omega">Omega</option>
              <option value="money">Money</option>
              <option value="alfa_plus">Alfa Plus</option>
              <option value="other">{t("Iný")}</option>
            </select>
          </label>
          <div className="sm:col-span-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">{t("Prepojenie s Pohodou")}</div>
                <div className="text-xs text-muted-foreground">
                  {t("Predkontácie, členenia DPH, čo sa posiela a balíček pre účtovníčku.")}
                </div>
              </div>
              <Link
                to="/uctovnictvo/pohoda"
                className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
              >
                {t("Otvoriť")}
              </Link>
            </div>
          </div>
          <label className="sm:col-span-2 block">
            <span className="text-sm font-medium">{t("Pätička faktúry")}</span>
            <textarea
              rows={3}
              value={c.invoice_footer ?? ""}
              onChange={(e) => setC({ ...c, invoice_footer: e.target.value })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <div className="sm:col-span-2 mt-2 border-t border-border pt-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("E-mail")}
            </h2>
          </div>
          <In
            label="Meno odosielateľa"
            value={c.email_sender_name ?? ""}
            onChange={f("email_sender_name")}
          />
          <In
            label="Odpovedať na (Reply-To)"
            value={c.email_reply_to ?? ""}
            onChange={f("email_reply_to")}
          />
          <In
            full
            label="Predvolený predmet e-mailu"
            value={c.email_default_subject ?? ""}
            onChange={f("email_default_subject")}
          />
          <label className="sm:col-span-2 block">
            <span className="text-sm font-medium">{t("Predvolená správa e-mailu")}</span>
            <textarea
              rows={5}
              value={c.email_default_message ?? ""}
              onChange={(e) => setC({ ...c, email_default_message: e.target.value })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              {t("Premenné:")} {"{invoice_number}"}, {"{due_date}"}, {"{total}"}, {"{company_name}"}
            </span>
          </label>
          {/* Upozornenie ide na e-mail firmy hore; uloží sa tlačidlom Uložiť ako ostatné polia. */}
          <label className="sm:col-span-2 flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={c.efaktura_upozornenie_email !== false}
              onChange={(e) => setC({ ...c, efaktura_upozornenie_email: e.target.checked })}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{t("Upozornenie na prijatú eFaktúru")}</span>
              <span className="block text-xs text-muted-foreground">
                {t(
                  "Keď vám dodávateľ pošle eFaktúru, príde na e-mail firmy správa s odkazom na Prijaté eFaktúry. Viac eFaktúr naraz príde v jednom e-maile.",
                )}
              </span>
            </span>
          </label>
          <div className="sm:col-span-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">{t("E-mailové šablóny")}</div>
                <div className="text-xs text-muted-foreground">
                  {t("Editor pre odoslanie faktúry, upomienky a žiadosti o schválenie.")}
                </div>
              </div>
              <Link
                to="/nastavenia/email-sablony"
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
              >
                {t("Otvoriť editor")}
              </Link>
            </div>
          </div>
          <div className="sm:col-span-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">{t("Vzhľad faktúry")}</div>
                <div className="text-xs text-muted-foreground">
                  {t("Logo, farba akcentu a pätička na PDF faktúrach.")}
                </div>
              </div>
              <Link
                to="/nastavenia/vzhlad-faktury"
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
              >
                {t("Otvoriť editor")}
              </Link>
            </div>
          </div>

          <div className="sm:col-span-2 mt-2 border-t border-border pt-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("Automatické upomienky po splatnosti")}
            </h2>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={c.reminders_enabled ?? true}
                onChange={(e) => setC({ ...c, reminders_enabled: e.target.checked })}
              />
              {t("Zapnúť automatické upomienky")}
            </label>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("Komu a kedy upomienky odišli, nájdete v")}{" "}
              <Link to="/faktury/upomienky" className="font-medium text-primary hover:underline">
                {t("Odoslaných upomienkach")}
              </Link>
              .
            </p>
          </div>
          <label className="block">
            <span className="text-sm font-medium">{t("Dní po splatnosti — 1. upomienka")}</span>
            <input
              type="number"
              min={1}
              value={c.reminder_days_1 ?? 3}
              onChange={(e) => setC({ ...c, reminder_days_1: Number(e.target.value) })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">{t("Dní po splatnosti — 2. upomienka")}</span>
            <input
              type="number"
              min={1}
              value={c.reminder_days_2 ?? 7}
              onChange={(e) => setC({ ...c, reminder_days_2: Number(e.target.value) })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">{t("Dní po splatnosti — 3. upomienka")}</span>
            <input
              type="number"
              min={1}
              value={c.reminder_days_3 ?? 14}
              onChange={(e) => setC({ ...c, reminder_days_3: Number(e.target.value) })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          {[1, 2, 3].map((n) => (
            <div key={n} className="sm:col-span-2 grid gap-2 rounded-md border border-border p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("{n}. upomienka — e-mail", { n })}
              </div>
              <input
                placeholder={t("Predmet (napr. Upomienka: Faktúra {invoice_number})")}
                value={c[`reminder_subject_${n}`] ?? ""}
                onChange={(e) => setC({ ...c, [`reminder_subject_${n}`]: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <textarea
                rows={4}
                placeholder={t(
                  "Text upomienky (premenné: {invoice_number}, {due_date}, {total}, {company_name}, {iban}, {variable_symbol})",
                )}
                value={c[`reminder_message_${n}`] ?? ""}
                onChange={(e) => setC({ ...c, [`reminder_message_${n}`]: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          ))}

          <div className="sm:col-span-2 flex justify-end">
            <button
              type="submit"
              className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              {t("Uložiť zmeny")}
            </button>
          </div>
        </form>

        <div className="mt-6">
          <BankoveUctyFirmy companyId={c.id} />
        </div>

        <VlastnySmtp companyId={c.id} />

        <TeamSection companyId={c.id} />
      </PageBody>
    </>
  );
}

const ROLA_POPIS: Record<string, string> = {
  owner: "Majiteľ",
  admin: "Administrátor",
  accountant: "Účtovník",
  employee: "Používateľ",
  custom: "Vlastný prístup",
};

function TeamSection({ companyId }: { companyId: string }) {
  const { t, jazyk } = useT();
  const datum = (d: string) => new Date(d).toLocaleDateString(lokalJazyka(jazyk));
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "accountant" | "employee" | "custom">("employee");
  /** Oblasti pri pozvánke s vlastným prístupom. */
  const [oprPozvanky, setOprPozvanky] = useState<Opravnenia>({});
  /** Člen, ktorému sa práve upravuje vlastný prístup. */
  const [upravuje, setUpravuje] = useState<{ userId: string; opr: Opravnenia } | null>(null);
  const [invs, setInvs] = useState<any[]>([]);
  const [clenovia, setClenovia] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  /** Odkaz na poslednú pozvánku — ukáže sa, keď e-mail neodišiel. */
  const [odkaz, setOdkaz] = useState<string | null>(null);

  async function load() {
    const { listInvitationsFn, listMembersFn } =
      await import("@/lib/faktero/invitations.functions");
    try {
      const rows = await listInvitationsFn({ data: { company_id: companyId } });
      setInvs(rows as any[]);
    } catch (e: any) {
      console.error(e);
    }
    try {
      const m = await listMembersFn({ data: { company_id: companyId } });
      setClenovia(m as any[]);
    } catch (e: any) {
      // Bežný člen zoznam prístupov nevidí — nie je to chyba, len nemá právo.
      setClenovia([]);
    }
  }

  async function zmenRolu(userId: string, novaRola: string, opravnenia?: Opravnenia) {
    const { changeMemberRoleFn } = await import("@/lib/faktero/invitations.functions");
    try {
      await changeMemberRoleFn({
        data: {
          company_id: companyId,
          user_id: userId,
          role: novaRola as any,
          permissions: opravnenia,
        },
      });
      toast.success(novaRola === "custom" ? t("Prístup uložený") : t("Rola zmenená"));
      setUpravuje(null);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? t("Rolu sa nepodarilo zmeniť"));
    }
  }

  async function odober(userId: string, popis: string) {
    if (!(await potvrd(t("Odobrať prístup do firmy používateľovi {popis}?", { popis })))) return;
    const { removeMemberFn } = await import("@/lib/faktero/invitations.functions");
    try {
      await removeMemberFn({ data: { company_id: companyId, user_id: userId } });
      toast.success(t("Prístup odobratý"));
      load();
    } catch (e: any) {
      toast.error(e?.message ?? t("Prístup sa nepodarilo odobrať"));
    }
  }
  useEffect(() => {
    load();
  }, [companyId]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (role === "custom" && !Object.keys(oprPozvanky).length) {
      toast.error(t("Vyberte aspoň jednu oblasť, ku ktorej bude mať prístup."));
      return;
    }
    setBusy(true);
    try {
      const { createInvitationFn } = await import("@/lib/faktero/invitations.functions");
      const r: any = await createInvitationFn({
        data: {
          company_id: companyId,
          email,
          role,
          permissions: role === "custom" ? oprPozvanky : undefined,
        },
      });
      if (r?.emailOdoslany) {
        toast.success(t("Pozvánka odoslaná na {email}", { email }));
        setOdkaz(null);
      } else {
        // Pozvánka platí aj tak — treba len poslať odkaz ručne.
        toast.warning(
          t("Pozvánka je vytvorená, ale e-mail neodišiel. {chyba} Pošlite kolegovi odkaz nižšie.", {
            chyba: r?.chybaEmailu ?? "",
          }),
        );
        setOdkaz(r?.odkaz ?? null);
      }
      setEmail("");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba pri pozývaní"));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!(await potvrd(t("Zrušiť pozvánku?")))) return;
    const { revokeInvitationFn } = await import("@/lib/faktero/invitations.functions");
    await revokeInvitationFn({ data: { id } });
    load();
  }

  return (
    <div className="mt-8 rounded-xl border border-border bg-card p-6">
      <h2 className="text-lg font-semibold">{t("Používatelia a pozvánky")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t(
          "Pozvite kolegu alebo účtovníka na e-mail. Prijatie pozvánky ich pripojí k tejto firme.",
        )}
      </p>
      <VysvetlenieRoli />

      {clenovia && clenovia.length > 0 && (
        <div className="mt-5 overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">{t("Kto má prístup")}</th>
                <th className="p-3">{t("Rola")}</th>
                <th className="p-3">{t("Telefón, číslo zamestnanca, projekt")}</th>
                <th className="p-3">{t("Od")}</th>
                <th className="p-3"><span className="sr-only">{t("Akcie")}</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {clenovia.map((m) => (
                <tr key={m.user_id}>
                  <td className="p-3">
                    {m.full_name ? `${m.full_name} · ` : ""}
                    {m.email ?? m.user_id.slice(0, 8)}
                    {m.je_to_ja && (
                      <span className="ml-2 text-xs text-muted-foreground">{t("(vy)")}</span>
                    )}
                  </td>
                  <td className="p-3">
                    {m.podpora_do ? (
                      <div className="max-w-xs text-xs">
                        <div className="font-medium text-foreground">
                          {t("Technická podpora Faktero")}
                        </div>
                        <div className="text-muted-foreground">
                          {t("dočasný prístup do {datum}", { datum: datum(m.podpora_do) })}
                        </div>
                      </div>
                    ) : (
                      <>
                        <select aria-label={t("Rola")}
                          value={upravuje?.userId === m.user_id ? "custom" : m.role}
                          onChange={(e) =>
                            // Vlastný prístup potrebuje oblasti — najprv sa vyklikajú, uloží sa potom.
                            e.target.value === "custom"
                              ? setUpravuje({
                                  userId: m.user_id,
                                  opr: (m.permissions ?? {}) as Opravnenia,
                                })
                              : zmenRolu(m.user_id, e.target.value)
                          }
                          className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                        >
                          <option value="owner">{t("Majiteľ")}</option>
                          <option value="admin">{t("Administrátor")}</option>
                          <option value="accountant">{t("Účtovník")}</option>
                          <option value="employee">{t("Používateľ")}</option>
                          <option value="custom">{t("Vlastný prístup")}</option>
                        </select>
                        {m.role === "custom" && upravuje?.userId !== m.user_id && (
                          <div className="mt-1 max-w-xs text-xs text-muted-foreground">
                            {suhrnOpravneni(m.permissions)}{" "}
                            <button
                              type="button"
                              onClick={() =>
                                setUpravuje({
                                  userId: m.user_id,
                                  opr: (m.permissions ?? {}) as Opravnenia,
                                })
                              }
                              className="font-medium text-primary hover:underline"
                            >
                              {t("Upraviť")}
                            </button>
                          </div>
                        )}
                        {upravuje?.userId === m.user_id && (
                          <div className="mt-2 min-w-[20rem]">
                            <EditorOpravneni
                              hodnota={upravuje?.opr ?? {}}
                              onZmena={(opr) => setUpravuje({ userId: m.user_id, opr })}
                            />
                            <div className="mt-2 flex gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  const opr = upravuje?.opr ?? {};
                                  if (!Object.keys(opr).length)
                                    return toast.error(t("Vyberte aspoň jednu oblasť."));
                                  zmenRolu(m.user_id, "custom", opr);
                                }}
                                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                              >
                                {t("Uložiť prístup")}
                              </button>
                              <button
                                type="button"
                                onClick={() => setUpravuje(null)}
                                className="rounded-md border border-border px-3 py-1.5 text-xs"
                              >
                                {t("Zrušiť")}
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </td>
                  <td className="p-3 align-top">
                    <UdajeClena companyId={companyId} clen={m} onUlozene={load} />
                  </td>
                  <td className="p-3 text-muted-foreground">{datum(m.created_at)}</td>
                  <td className="p-3 text-right">
                    <button
                      type="button"
                      onClick={() => odober(m.user_id, m.email ?? t("tento účet"))}
                      className="text-xs text-rose-600 hover:underline"
                    >
                      {t("Odobrať prístup")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {clenovia && clenovia.length > 0 && <TechnickaPodpora companyId={companyId} onZmena={load} />}

      <form onSubmit={invite} className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-sm font-medium">{t("Email")}</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="kolega@firma.sk"
            className="mt-1 w-64 rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">{t("Rola")}</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as any)}
            className="mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="employee">{t("Používateľ")}</option>
            <option value="accountant">{t("Účtovník")}</option>
            <option value="admin">{t("Administrátor")}</option>
            <option value="custom">{t("Vlastný prístup")}</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? t("Odosielam…") : t("Pozvať používateľa")}
        </button>
      </form>
      {role === "custom" && (
        <div className="mt-3">
          <p className="text-sm text-muted-foreground">
            {t("Vyberte, ku ktorým oblastiam bude mať pozvaný prístup:")}
          </p>
          <EditorOpravneni hodnota={oprPozvanky} onZmena={setOprPozvanky} />
        </div>
      )}

      {odkaz && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100 dark:border-amber-900/40">
          <div className="font-medium">{t("Odkaz na pozvánku")}</div>
          <div className="mt-1 break-all font-mono text-xs">{odkaz}</div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(odkaz);
              toast.success(t("Odkaz skopírovaný"));
            }}
            className="mt-2 rounded-md border border-amber-300 px-2 py-1 text-xs hover:bg-amber-100 dark:border-amber-900/40"
          >
            {t("Skopírovať")}
          </button>
        </div>
      )}

      {invs.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">{t("Email")}</th>
                <th className="p-3">{t("Rola")}</th>
                <th className="p-3">{t("Stav")}</th>
                <th className="p-3">{t("Vytvorené")}</th>
                <th className="p-3"><span className="sr-only">{t("Akcie")}</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invs.map((r) => {
                const expired = new Date(r.expires_at) < new Date();
                const status = r.accepted_at
                  ? "pozvanka::Prijaté"
                  : expired
                    ? "Expirované"
                    : "Čaká sa";
                return (
                  <tr key={r.id}>
                    <td className="p-3">{r.email}</td>
                    <td className="p-3">
                      {t(ROLA_POPIS[r.role] ?? r.role)}
                      {r.role === "custom" && (
                        <div className="text-xs text-muted-foreground">
                          {suhrnOpravneni(r.permissions)}
                        </div>
                      )}
                    </td>
                    <td className="p-3">{t(status)}</td>
                    <td className="p-3 text-muted-foreground">{datum(r.created_at)}</td>
                    <td className="p-3 text-right">
                      {!r.accepted_at && (
                        <button
                          onClick={() => revoke(r.id)}
                          className="text-xs text-rose-600 hover:underline"
                        >
                          {t("Zrušiť")}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function In({
  label,
  value,
  onChange,
  full,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  full?: boolean;
  placeholder?: string;
}) {
  const { t } = useT();
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="text-sm font-medium">{t(label)}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}

/** Živý náhľad ďalšieho čísla faktúry — rovnaká logika ako DB funkcia. */
function NumberingPreview({ companyId, format }: { companyId: string; format: string }) {
  const { t } = useT();
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fmt = (format || "").trim() || "{YYYY}{NNNN}";
    const d = new Date();
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const monthly = fmt.includes("{MM}");
    const start = monthly ? `${yyyy}-${mm}-01` : `${yyyy}-01-01`;
    const end = monthly
      ? new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().slice(0, 10)
      : `${d.getFullYear() + 1}-01-01`;
    const padToken = (fmt.match(/\{(N{2,4})\}/g) ?? [])
      .map((t) => t.replace(/[{}]/g, "").length)
      .sort((a, b) => b - a)[0];
    const pad = padToken ?? 4;

    (async () => {
      const [periodRes, allRes] = await Promise.all([
        supabase
          // aj-zmazane: číslovanie — poradie zmazanej faktúry je obsadené
          .from("invoices")
          .select("sequence_number")
          .eq("company_id", companyId)
          .gte("issue_date", start)
          .lt("issue_date", end),
        // aj-zmazane: číslovanie — číslo zmazanej faktúry je obsadené
        supabase.from("invoices").select("invoice_number").eq("company_id", companyId),
      ]);
      if (cancelled) return;
      const maxSeq = (periodRes.data ?? []).reduce(
        (m: number, r: any) => Math.max(m, Number(r.sequence_number ?? 0)),
        0,
      );
      const taken = new Set((allRes.data ?? []).map((r: any) => r.invoice_number));
      let seq = maxSeq + 1;
      let num = "";
      for (let i = 0; i <= 1000; i++) {
        num = fmt
          .replace(/\{YYYY\}/g, yyyy)
          .replace(/\{YY\}/g, yyyy.slice(2))
          .replace(/\{MM\}/g, mm)
          .replace(/\{N{2,4}\}/g, String(seq).padStart(pad, "0"));
        if (!taken.has(num)) break;
        seq += 1;
      }
      setPreview(num);
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId, format]);

  return (
    <p className="mt-2 text-xs text-muted-foreground">
      {t("Ďalšie číslo:")}{" "}
      <span className="font-mono font-semibold tabular-nums text-foreground">{preview ?? "…"}</span>
    </p>
  );
}
