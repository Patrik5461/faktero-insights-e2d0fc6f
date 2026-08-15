import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { pripravKonektorFn, stavKonektoraFn } from "@/lib/faktero/pohoda-konektor.functions";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { toast } from "sonner";
import { IcoLookupButton } from "@/components/faktero/IcoLookupButton";
import { CompanyNameAutocomplete } from "@/components/faktero/CompanyNameAutocomplete";
import { mergeCompanyAutofill } from "@/lib/faktero/company-autofill";

export const Route = createFileRoute("/_authenticated/firma")({
  head: () => ({ meta: [{ title: "Firma — Faktero" }] }),
  component: CompanyPage,
});

function CompanyPage() {
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
  if (!c) return <PageBody>Načítavam…</PageBody>;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { id, created_at, updated_at, created_by, ...patch } = c;
    const { error } = await supabase.from("companies").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Uložené");
  }

  const f = (k: string) => (v: string) => setC({ ...c, [k]: v });
  return (
    <>
      <PageHeader title="Firma" description="Údaje, ktoré sa zobrazia na faktúrach." />
      <PageBody>
        <form
          onSubmit={save}
          className="grid gap-4 rounded-xl border border-border bg-card p-6 sm:grid-cols-2"
        >
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium">Názov *</span>
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
            <span className="text-sm font-medium">IČO</span>
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
          <In label="Krajina" value={c.country ?? ""} onChange={f("country")} />
          <In label="Telefón" value={c.phone ?? ""} onChange={f("phone")} />
          <In label="Web" value={c.website ?? ""} onChange={f("website")} />
          <In label="IBAN" value={c.iban ?? ""} onChange={f("iban")} />
          <In label="SWIFT/BIC" value={c.swift ?? ""} onChange={f("swift")} />
          <In label="Mena" value={c.default_currency ?? "EUR"} onChange={f("default_currency")} />
          <div>
            <In
              label="Formát čísla faktúry"
              value={c.invoice_number_format ?? ""}
              onChange={f("invoice_number_format")}
            />
            <NumberingPreview companyId={c.id} format={c.invoice_number_format ?? ""} />
            <p className="mt-1 text-xs text-muted-foreground">
              Tokeny: {"{YYYY}"} rok, {"{YY}"} rok 2-cif., {"{MM}"} mesiac, {"{NN}"}–{"{NNNN}"}{" "}
              poradie (počet N = počet číslic). Ak formát obsahuje {"{MM}"}, poradie sa resetuje
              mesačne, inak ročne.
            </p>
            <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              Pozor: zmena šablóny uprostred roka rozdelí číselný rad — nové faktúry budú číslované
              podľa novej šablóny, staré zostanú nezmenené. Ak by nové číslo kolidovalo s
              existujúcim, poradie sa automaticky posunie na najbližšie voľné.
            </p>
          </div>

          <label className="block">
            <span className="text-sm font-medium">Preferovaný účtovný systém</span>
            <select
              value={c.preferred_accounting_system ?? "pohoda"}
              onChange={(e) => setC({ ...c, preferred_accounting_system: e.target.value })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="pohoda">Pohoda</option>
              <option value="omega">Omega</option>
              <option value="money">Money</option>
              <option value="alfa_plus">Alfa Plus</option>
              <option value="other">Iný</option>
            </select>
          </label>
          <div className="sm:col-span-2 mt-2 border-t border-border pt-4">
            <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Pohoda — účtovanie
            </h3>
            <p className="mb-3 text-xs text-muted-foreground">
              Skratky z Pohody vašej účtovníčky. Keď ich vyplníte, doklady sa po importe rovno
              zaúčtujú a nemusí ich preklikávať. Nechajte prázdne, ak neviete — export bude fungovať
              aj tak.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <In
                label="E-mail účtovníčky"
                value={c.uctovnik_email ?? ""}
                onChange={f("uctovnik_email")}
                placeholder="kam chodí mesačné odovzdanie"
              />
              <label className="flex items-start gap-3 rounded-md border border-border p-3">
                <input
                  type="checkbox"
                  checked={!!c.odovzdanie_automaticky}
                  onChange={(e) => setC({ ...c, odovzdanie_automaticky: e.target.checked })}
                  className="mt-0.5 h-4 w-4"
                />
                <span className="text-sm">
                  Posielať automaticky
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Podklady za minulý mesiac odídu 5. v mesiaci samy. Posiela sa len to, čo ešte
                    neodišlo.
                  </span>
                </span>
              </label>
              <In
                label="Predkontácia — faktúra"
                value={c.pohoda_predkontacia ?? ""}
                onChange={f("pohoda_predkontacia")}
                placeholder="napr. 3Fv"
              />
              <In
                label="Predkontácia — zálohová faktúra"
                value={c.pohoda_predkontacia_zaloha ?? ""}
                onChange={f("pohoda_predkontacia_zaloha")}
              />
              <In
                label="Predkontácia — dobropis"
                value={c.pohoda_predkontacia_dobropis ?? ""}
                onChange={f("pohoda_predkontacia_dobropis")}
              />
              <In
                label="Členenie DPH"
                value={c.pohoda_clenenie_dph ?? ""}
                onChange={f("pohoda_clenenie_dph")}
                placeholder="napr. UD"
              />
              <In
                label="Členenie DPH — prenesenie daňovej povinnosti"
                value={c.pohoda_clenenie_dph_pdp ?? ""}
                onChange={f("pohoda_clenenie_dph_pdp")}
              />
              <In
                label="Predkontácia — prijatý doklad"
                value={c.pohoda_predkontacia_prijata ?? ""}
                onChange={f("pohoda_predkontacia_prijata")}
                placeholder="napr. 5Fp"
              />
              <In
                label="Členenie DPH — prijatý doklad"
                value={c.pohoda_clenenie_dph_prijata ?? ""}
                onChange={f("pohoda_clenenie_dph_prijata")}
              />
              <In
                label="Pokladňa v Pohode"
                value={c.pohoda_pokladna ?? ""}
                onChange={f("pohoda_pokladna")}
                placeholder="napr. HOT"
              />
              <In
                label="Predkontácia — pokladničný doklad"
                value={c.pohoda_predkontacia_pokladna ?? ""}
                onChange={f("pohoda_predkontacia_pokladna")}
              />
              <label className="flex items-start gap-3 rounded-md border border-border p-3 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={c.pohoda_odkaz_na_pdf !== false}
                  onChange={(e) => setC({ ...c, pohoda_odkaz_na_pdf: e.target.checked })}
                  className="mt-0.5 h-4 w-4"
                />
                <span className="text-sm">
                  Prikladať odkaz na PDF faktúry
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Doklad má v Pohode v záložke Dokumenty odkaz, ktorým sa otvorí PDF. Odkaz je
                    dlhý náhodný reťazec a otvorí ho každý, kto ho má — rovnako ako faktúra poslaná
                    mailom.
                  </span>
                </span>
              </label>
            </div>
            <KonektorPohody companyId={c.id} />
          </div>
          <label className="sm:col-span-2 block">
            <span className="text-sm font-medium">Pätička faktúry</span>
            <textarea
              rows={3}
              value={c.invoice_footer ?? ""}
              onChange={(e) => setC({ ...c, invoice_footer: e.target.value })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <div className="sm:col-span-2 mt-2 border-t border-border pt-4">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              E-mail
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
            <span className="text-sm font-medium">Predvolená správa e-mailu</span>
            <textarea
              rows={5}
              value={c.email_default_message ?? ""}
              onChange={(e) => setC({ ...c, email_default_message: e.target.value })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              Premenné: {"{invoice_number}"}, {"{due_date}"}, {"{total}"}, {"{company_name}"}
            </span>
          </label>
          <div className="sm:col-span-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">Email šablóny</div>
                <div className="text-xs text-muted-foreground">
                  Editor pre odoslanie faktúry, upomienky a žiadosti o schválenie.
                </div>
              </div>
              <Link
                to="/nastavenia/email-sablony"
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
              >
                Otvoriť editor
              </Link>
            </div>
          </div>
          <div className="sm:col-span-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">Vzhľad faktúry</div>
                <div className="text-xs text-muted-foreground">
                  Logo, farba akcentu a pätička na PDF faktúrach.
                </div>
              </div>
              <Link
                to="/nastavenia/vzhlad-faktury"
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
              >
                Otvoriť editor
              </Link>
            </div>
          </div>

          <div className="sm:col-span-2 mt-2 border-t border-border pt-4">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Automatické upomienky po splatnosti
            </h3>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={c.reminders_enabled ?? true}
                onChange={(e) => setC({ ...c, reminders_enabled: e.target.checked })}
              />
              Zapnúť automatické upomienky
            </label>
          </div>
          <label className="block">
            <span className="text-sm font-medium">Dní po splatnosti — 1. upomienka</span>
            <input
              type="number"
              min={1}
              value={c.reminder_days_1 ?? 3}
              onChange={(e) => setC({ ...c, reminder_days_1: Number(e.target.value) })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Dní po splatnosti — 2. upomienka</span>
            <input
              type="number"
              min={1}
              value={c.reminder_days_2 ?? 7}
              onChange={(e) => setC({ ...c, reminder_days_2: Number(e.target.value) })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Dní po splatnosti — 3. upomienka</span>
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
                {n}. upomienka — e-mail
              </div>
              <input
                placeholder={`Predmet (napr. Upomienka: Faktúra {invoice_number})`}
                value={c[`reminder_subject_${n}`] ?? ""}
                onChange={(e) => setC({ ...c, [`reminder_subject_${n}`]: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <textarea
                rows={4}
                placeholder="Text upomienky (premenné: {invoice_number}, {due_date}, {total}, {company_name}, {iban}, {variable_symbol})"
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
              Uložiť zmeny
            </button>
          </div>
        </form>

        <TeamSection companyId={c.id} />
      </PageBody>
    </>
  );
}

const ROLA_POPIS: Record<string, string> = {
  owner: "Majiteľ",
  admin: "Administrátor",
  accountant: "Účtovník (len na čítanie)",
  employee: "Používateľ",
};

function TeamSection({ companyId }: { companyId: string }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "accountant" | "employee">("employee");
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

  async function zmenRolu(userId: string, novaRola: string) {
    const { changeMemberRoleFn } = await import("@/lib/faktero/invitations.functions");
    try {
      await changeMemberRoleFn({
        data: { company_id: companyId, user_id: userId, role: novaRola as any },
      });
      toast.success("Rola zmenená");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Rolu sa nepodarilo zmeniť");
    }
  }

  async function odober(userId: string, popis: string) {
    if (!confirm(`Odobrať prístup do firmy používateľovi ${popis}?`)) return;
    const { removeMemberFn } = await import("@/lib/faktero/invitations.functions");
    try {
      await removeMemberFn({ data: { company_id: companyId, user_id: userId } });
      toast.success("Prístup odobratý");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Prístup sa nepodarilo odobrať");
    }
  }
  useEffect(() => {
    load();
  }, [companyId]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { createInvitationFn } = await import("@/lib/faktero/invitations.functions");
      const r: any = await createInvitationFn({ data: { company_id: companyId, email, role } });
      if (r?.emailOdoslany) {
        toast.success(`Pozvánka odoslaná na ${email}`);
        setOdkaz(null);
      } else {
        // Pozvánka platí aj tak — treba len poslať odkaz ručne.
        toast.warning(
          `Pozvánka je vytvorená, ale e-mail neodišiel. ${r?.chybaEmailu ?? ""} Pošlite kolegovi odkaz nižšie.`,
        );
        setOdkaz(r?.odkaz ?? null);
      }
      setEmail("");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba pri pozývaní");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Zrušiť pozvánku?")) return;
    const { revokeInvitationFn } = await import("@/lib/faktero/invitations.functions");
    await revokeInvitationFn({ data: { id } });
    load();
  }

  return (
    <div className="mt-8 rounded-xl border border-border bg-card p-6">
      <h2 className="text-lg font-semibold">Používatelia a pozvánky</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Pozvite kolegu alebo účtovníka na e-mail. Prijatie pozvánky ich pripojí k tejto firme.
      </p>

      {clenovia && clenovia.length > 0 && (
        <div className="mt-5 overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">Kto má prístup</th>
                <th className="p-3">Rola</th>
                <th className="p-3">Od</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {clenovia.map((m) => (
                <tr key={m.user_id}>
                  <td className="p-3">
                    {m.full_name ? `${m.full_name} · ` : ""}
                    {m.email ?? m.user_id.slice(0, 8)}
                    {m.je_to_ja && <span className="ml-2 text-xs text-muted-foreground">(vy)</span>}
                  </td>
                  <td className="p-3">
                    <select
                      value={m.role}
                      onChange={(e) => zmenRolu(m.user_id, e.target.value)}
                      className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                    >
                      <option value="owner">Majiteľ</option>
                      <option value="admin">Administrátor</option>
                      <option value="accountant">Účtovník (len na čítanie)</option>
                      <option value="employee">Používateľ</option>
                    </select>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {new Date(m.created_at).toLocaleDateString("sk-SK")}
                  </td>
                  <td className="p-3 text-right">
                    <button
                      type="button"
                      onClick={() => odober(m.user_id, m.email ?? "tento účet")}
                      className="text-xs text-rose-600 hover:underline"
                    >
                      Odobrať prístup
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
          <span className="text-sm font-medium">Email</span>
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
          <span className="text-sm font-medium">Rola</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as any)}
            className="mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="employee">Používateľ</option>
            <option value="accountant">Účtovník (read-only)</option>
            <option value="admin">Administrátor</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Odosielam…" : "Pozvať používateľa"}
        </button>
      </form>

      {odkaz && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="font-medium">Odkaz na pozvánku</div>
          <div className="mt-1 break-all font-mono text-xs">{odkaz}</div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(odkaz);
              toast.success("Odkaz skopírovaný");
            }}
            className="mt-2 rounded-md border border-amber-300 px-2 py-1 text-xs hover:bg-amber-100"
          >
            Skopírovať
          </button>
        </div>
      )}

      {invs.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">Email</th>
                <th className="p-3">Rola</th>
                <th className="p-3">Stav</th>
                <th className="p-3">Vytvorené</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invs.map((r) => {
                const expired = new Date(r.expires_at) < new Date();
                const status = r.accepted_at ? "Prijaté" : expired ? "Expirované" : "Čaká sa";
                return (
                  <tr key={r.id}>
                    <td className="p-3">{r.email}</td>
                    <td className="p-3">{ROLA_POPIS[r.role] ?? r.role}</td>
                    <td className="p-3">{status}</td>
                    <td className="p-3 text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("sk-SK")}
                    </td>
                    <td className="p-3 text-right">
                      {!r.accepted_at && (
                        <button
                          onClick={() => revoke(r.id)}
                          className="text-xs text-rose-600 hover:underline"
                        >
                          Zrušiť
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

/**
 * Priame prepojenie s Pohodou.
 *
 * Účtovníčka si nič neinštaluje — POHODA vie XML import spustiť z príkazového
 * riadku, takže balíček je dávkový súbor a naplánovaná úloha Windows. Kľúč sa
 * vyrába až pri stiahnutí a vloží sa rovno do súboru, aby sa nikde nezobrazoval.
 */
type PotvrdenyDoklad = {
  invoice_number: string | null;
  pohoda_cislo: string | null;
  pohoda_stav: string | null;
  error: string | null;
};
type StavKonektora = { kluce: number; naposledy: string | null; potvrdene: PotvrdenyDoklad[] };

function KonektorPohody({ companyId }: { companyId: string }) {
  const [stav, setStav] = useState<StavKonektora | null>(null);
  const [pracuje, setPracuje] = useState(false);
  const fnPriprav = useServerFn(pripravKonektorFn);
  const fnStav = useServerFn(stavKonektoraFn);

  useEffect(() => {
    fnStav({ data: { companyId } })
      .then((r) => setStav(r as StavKonektora))
      .catch(() => setStav(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  async function stiahni() {
    setPracuje(true);
    try {
      const r = await fnPriprav({ data: { companyId } });
      const bin = atob(r.base64);
      const bajty = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bajty[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bajty], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = r.fileName;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Balíček stiahnutý — pošlite ho účtovníčke.");
      fnStav({ data: { companyId } }).then((r) => setStav(r as StavKonektora));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Balíček sa nepodarilo pripraviť.");
    } finally {
      setPracuje(false);
    }
  }

  return (
    <div className="mt-4 rounded-md border border-border p-4">
      <h4 className="text-sm font-semibold">Priame prepojenie s Pohodou</h4>
      <p className="mt-1 text-xs text-muted-foreground">
        Namiesto posielania súborov mailom si Pohoda vezme doklady sama — raz denne v noci a späť
        nám povie, aké čísla im pridelila. Účtovníčka nič neinštaluje: stiahnutý priečinok skopíruje
        k Pohode, vyplní v ňom cestu a názov databázy a spustí druhý súbor, ktorý založí naplánovanú
        úlohu.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={stiahni}
          disabled={pracuje}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {pracuje ? "Pripravujem…" : "Stiahnuť balíček pre účtovníčku"}
        </button>
        {stav?.naposledy ? (
          <span className="text-xs text-muted-foreground">
            Naposledy sa ozval {new Date(stav.naposledy).toLocaleString("sk-SK")}
          </span>
        ) : stav?.kluce ? (
          <span className="text-xs text-muted-foreground">
            Balíček je vydaný, zatiaľ sa neozval.
          </span>
        ) : null}
      </div>
      {stav?.potvrdene?.length ? (
        <div className="mt-3 text-xs">
          <div className="mb-1 font-medium">Naposledy potvrdené Pohodou</div>
          <ul className="space-y-0.5 text-muted-foreground">
            {stav.potvrdene.map((r: PotvrdenyDoklad, i: number) => (
              <li key={i}>
                {r.invoice_number}
                {r.pohoda_cislo ? ` → ${r.pohoda_cislo}` : ""}
                {r.pohoda_stav === "error" ? ` — chyba: ${r.error ?? "neznáma"}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-3 text-xs text-muted-foreground">
        Každé stiahnutie vyrobí nový kľúč; staré ostávajú platné a zrušiť sa dajú v{" "}
        <Link to="/api-kluce" className="underline">
          API kľúčoch
        </Link>
        .
      </p>
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
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="text-sm font-medium">{label}</span>
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
      Ďalšie číslo:{" "}
      <span className="font-mono font-semibold tabular-nums text-foreground">{preview ?? "…"}</span>
    </p>
  );
}
