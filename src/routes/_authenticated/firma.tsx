import { MENY } from "@/lib/faktero/mena";
import { VlastnySmtp } from "@/components/faktero/VlastnySmtp";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { toast } from "sonner";
import { IcoLookupButton } from "@/components/faktero/IcoLookupButton";
import { CompanyNameAutocomplete } from "@/components/faktero/CompanyNameAutocomplete";
import { mergeCompanyAutofill } from "@/lib/faktero/company-autofill";

import { VyberKrajiny } from "@/components/faktero/VyberKrajiny";
import { VyberRezimuDph } from "@/components/faktero/VyberRezimuDph";
import { zosuladSchemu } from "@/lib/faktero/dph-rezim";
import { krajinaDane } from "@/lib/faktero/vat-rates";
import { zabudniKrajinuDane, zabudniRezimDph } from "@/lib/faktero/krajina-firmy";
import { BankoveUctyFirmy } from "@/components/faktero/banka/BankoveUctyFirmy";
import { EditorOpravneni, VysvetlenieRoli } from "@/components/faktero/pristupy/Opravnenia";
import { suhrnOpravneni, type Opravnenia } from "@/lib/faktero/opravnenia";
import { potvrd } from "@/lib/potvrdenie";
import { domacaMena } from "@/lib/faktero/kurzy";
import { preloz } from "@/lib/i18n/jazyk";
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
    const { id, created_at, updated_at, created_by, iban: _iban, swift: _swift, ...patch } = c;
    const { error } = await supabase.from("companies").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    // Krajina určuje sadzby DPH a formuláre si ju pamätajú — po zmene sa musí
    // zabudnúť, inak by faktúra ďalej ponúkala sadzby predchádzajúcej krajiny.
    zabudniKrajinuDane(id);
    zabudniRezimDph(id);
    toast.success(t("Uložené"));
  }

  const f = (k: string) => (v: string) => setC({ ...c, [k]: v });
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
          <label className="block">
            <span className="text-sm font-medium">{t("IČO")}</span>
            <div className="mt-1 flex -space-x-px items-start">
              <input
                value={c.ico ?? ""}
                onChange={(e) => f("ico")(e.target.value)}
                className="w-full rounded-l-md border border-input bg-background px-3 py-2 text-sm focus:z-10"
              />
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
            </div>
          </label>
          <In label="DIČ" value={c.dic ?? ""} onChange={f("dic")} />
          <In label="IČ DPH" value={c.ic_dph ?? ""} onChange={f("ic_dph")} />
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
          {Boolean(c.vat_payer) && (
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
                  {m.code} {m.symbol} — {m.name}
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
            <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
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
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("E-mail")}
            </h3>
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
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("Automatické upomienky po splatnosti")}
            </h3>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={c.reminders_enabled ?? true}
                onChange={(e) => setC({ ...c, reminders_enabled: e.target.checked })}
              />
              {t("Zapnúť automatické upomienky")}
            </label>
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
  const datum = (d: string) => new Date(d).toLocaleDateString(jazyk === "de" ? "de-DE" : "sk-SK");
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
                <th className="p-3">{t("Od")}</th>
                <th className="p-3"></th>
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
                    <select
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
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invs.map((r) => {
                const expired = new Date(r.expires_at) < new Date();
                const status = r.accepted_at ? "pozvanka::Prijaté" : expired ? "Expirované" : "Čaká sa";
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
          .from("invoices")
          .select("sequence_number")
          .eq("company_id", companyId)
          .gte("issue_date", start)
          .lt("issue_date", end),
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
