import { useState } from "react";
import { Loader2, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatujIban, upravIban } from "@/lib/faktero/platobny-ucet";
import { MENY } from "@/lib/faktero/mena";
import { useUctyFirmy } from "./VyberUctu";

/**
 * Bankové účty firmy, na ktoré môžu prísť peniaze za faktúry. Predvolený sa
 * dáva na nové faktúry a drží ho aj `companies.iban` (číta ho množstvo
 * starších miest). Na faktúre sa dá vybrať iný.
 */
export function BankoveUctyFirmy({ companyId }: { companyId: string }) {
  const { ucty, obnov } = useUctyFirmy(companyId);
  const [novy, setNovy] = useState({ name: "", iban: "", swift: "", bank_name: "", currency: "EUR" });
  const [pridavam, setPridavam] = useState(false);
  const [pracujem, setPracujem] = useState(false);

  async function pridaj(e: React.FormEvent) {
    e.preventDefault();
    const iban = upravIban(novy.iban);
    if (!iban) return toast.error("IBAN nie je platný — skontrolujte ho, prosím.");
    setPracujem(true);
    const { error } = await supabase.from("company_bank_accounts").insert({
      company_id: companyId,
      name: novy.name.trim() || null,
      iban,
      swift: novy.swift.trim().toUpperCase() || null,
      bank_name: novy.bank_name.trim() || null,
      currency: novy.currency,
      // Prvý účet je predvolený — inak by faktúry nemali kam ukázať.
      is_default: !ucty?.length,
      position: ucty?.length ?? 0,
    });
    setPracujem(false);
    if (error) {
      return toast.error(
        error.message.includes("company_bank_accounts_iban_uq") ? "Tento účet už je pridaný." : error.message,
      );
    }
    setNovy({ name: "", iban: "", swift: "", bank_name: "", currency: "EUR" });
    setPridavam(false);
    toast.success("Účet pridaný.");
    obnov();
  }

  async function nastavPredvoleny(id: string) {
    setPracujem(true);
    // Najprv zrušiť starý predvolený — jedinečný index nepustí dva naraz.
    const e1 = await supabase
      .from("company_bank_accounts")
      .update({ is_default: false })
      .eq("company_id", companyId)
      .eq("is_default", true);
    const e2 = e1.error
      ? e1
      : await supabase.from("company_bank_accounts").update({ is_default: true }).eq("id", id);
    setPracujem(false);
    if (e2.error) return toast.error(e2.error.message);
    toast.success("Predvolený účet zmenený. Nové faktúry ho dostanú automaticky.");
    obnov();
  }

  async function zmaz(id: string, predvoleny: boolean) {
    if (predvoleny && (ucty?.length ?? 0) > 1) {
      return toast.error("Najprv nastavte ako predvolený iný účet.");
    }
    if (!confirm("Odstrániť účet? Vystavené faktúry si ho ponechajú.")) return;
    const { error } = await supabase.from("company_bank_accounts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Účet odstránený.");
    obnov();
  }

  const pole = "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <h2 className="text-base font-semibold">Bankové účty</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Na ktorý účet majú odberatelia platiť. Predvolený dostane každá nová faktúra; pri vystavení
        aj na hotovej faktúre sa dá zvoliť iný.
      </p>

      {ucty === null ? (
        <p className="mt-4 text-sm text-muted-foreground">Načítavam…</p>
      ) : ucty.length === 0 ? (
        <p className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-400">
          Zatiaľ žiadny účet — faktúry nebudú mať číslo účtu ani QR platbu.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
          {ucty.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {u.name || u.bank_name || "Účet"}
                  {u.currency !== "EUR" && <span className="ml-2 text-xs text-muted-foreground">{u.currency}</span>}
                  {u.is_default && (
                    <span className="ml-2 rounded-full bg-emerald-600/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      predvolený
                    </span>
                  )}
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  {formatujIban(u.iban)}
                  {u.swift ? ` · ${u.swift}` : ""}
                </div>
              </div>
              {!u.is_default && (
                <button
                  onClick={() => nastavPredvoleny(u.id)}
                  disabled={pracujem}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary disabled:opacity-50"
                >
                  <Star className="h-3.5 w-3.5" /> Nastaviť ako predvolený
                </button>
              )}
              <button
                onClick={() => zmaz(u.id, u.is_default)}
                aria-label={`Odstrániť účet ${u.iban}`}
                className="rounded-md p-1.5 hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {pridavam ? (
        <form onSubmit={pridaj} className="mt-4 grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium">Názov (napr. „Tatra banka EUR“)</span>
            <input value={novy.name} onChange={(e) => setNovy({ ...novy, name: e.target.value })} className={pole} />
          </label>
          <label className="block text-sm">
            <span className="font-medium">IBAN *</span>
            <input required value={novy.iban} onChange={(e) => setNovy({ ...novy, iban: e.target.value })} className={`${pole} font-mono`} />
          </label>
          <label className="block text-sm">
            <span className="font-medium">SWIFT/BIC</span>
            <input value={novy.swift} onChange={(e) => setNovy({ ...novy, swift: e.target.value })} className={`${pole} font-mono`} />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Banka</span>
            <input value={novy.bank_name} onChange={(e) => setNovy({ ...novy, bank_name: e.target.value })} className={pole} />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Mena účtu</span>
            <select value={novy.currency} onChange={(e) => setNovy({ ...novy, currency: e.target.value })} className={pole}>
              {MENY.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.code}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              disabled={pracujem}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {pracujem && <Loader2 className="h-4 w-4 animate-spin" />} Pridať účet
            </button>
            <button type="button" onClick={() => setPridavam(false)} className="rounded-md border border-border px-3 py-2 text-sm">
              Zrušiť
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setPridavam(true)}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
        >
          <Plus className="h-4 w-4" /> Pridať účet
        </button>
      )}
    </section>
  );
}
