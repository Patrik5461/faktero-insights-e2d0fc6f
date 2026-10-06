import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarClock, Loader2 } from "lucide-react";
import { predlzSplatnostFn } from "@/lib/faktero/splatnost.functions";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";

/**
 * Tlačidlo a okno „Predĺžiť splatnosť“ pre vydanú aj prijatú faktúru.
 * Pôvodnú splatnosť si pamätá databáza; tu sa zadá nová a dohoda.
 */
export function PredlzitSplatnost({
  druh,
  faktura,
  onZmena,
}: {
  druh: "vydana" | "prijata";
  faktura: any;
  onZmena: () => void;
}) {
  const predlz = useServerFn(predlzSplatnostFn);
  const [otvorene, setOtvorene] = useState(false);
  const [nova, setNova] = useState("");
  const [poznamka, setPoznamka] = useState("");
  const [oznamit, setOznamit] = useState(Boolean(faktura?.customer_email));
  const [busy, setBusy] = useState(false);
  useZatvorNaEscape(otvorene ? () => setOtvorene(false) : null);

  if (!faktura || faktura.status === "draft" || faktura.status === "paid" || faktura.status === "cancelled") {
    return null;
  }

  async function ulozit() {
    setBusy(true);
    try {
      const r = await predlz({
        data: { druh, id: faktura.id, nova, poznamka: poznamka || undefined, oznamit: druh === "vydana" && oznamit },
      });
      toast.success(
        r.oznamene
          ? "Splatnosť je predĺžená a odberateľ dostal e-mail s potvrdením."
          : r.efaktura
            ? "Splatnosť je predĺžená. Faktúra odišla cez eFaktúru — tam sa nezmení, odberateľovi to oznámte."
            : "Splatnosť je predĺžená.",
      );
      setOtvorene(false);
      onZmena();
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setNova(faktura.due_date ?? "");
          setOtvorene(true);
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
      >
        <CalendarClock className="h-4 w-4" /> Predĺžiť splatnosť
      </button>
      {otvorene && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOtvorene(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Predĺžiť splatnosť"
            className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">Predĺžiť splatnosť</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Faktúra {faktura.invoice_number}, doteraz splatná {faktura.due_date}
              {faktura.povodna_splatnost && faktura.povodna_splatnost !== faktura.due_date
                ? ` (pôvodne ${faktura.povodna_splatnost})`
                : ""}
              .
            </p>
            <label className="mt-4 block">
              <span className="text-sm font-medium">Nová splatnosť</span>
              <input
                type="date"
                value={nova}
                min={faktura.issue_date}
                onChange={(e) => setNova(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="mt-3 block">
              <span className="text-sm font-medium">Dohoda (nepovinné)</span>
              <input
                value={poznamka}
                placeholder="napr. e-mail zo 6. 10. 2026, splátkový kalendár"
                onChange={(e) => setPoznamka(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            {druh === "vydana" && (
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={oznamit}
                  disabled={!faktura.customer_email}
                  onChange={(e) => setOznamit(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Poslať odberateľovi e-mail s potvrdením novej splatnosti
                  {faktura.customer_email ? ` (${faktura.customer_email})` : " — odberateľ nemá e-mail"}
                </span>
              </label>
            )}
            <p className="mt-3 rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
              Odoslaná eFaktúra sa v Peppole nezmení — predĺženie je dohoda, nie oprava faktúry. Lehoty
              DPH (§ 53b 101 dní, § 25a 150 dní) sa počítajú od pôvodnej splatnosti; upomienky a „po
              splatnosti“ sa riadia novou.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOtvorene(false)}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
              >
                Zrušiť
              </button>
              <button
                type="button"
                onClick={ulozit}
                disabled={busy || !nova || nova === faktura.due_date}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Uložiť
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
