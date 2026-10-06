import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { kopirujNastaveniaFn } from "@/lib/faktero/predkontacie.functions";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";

/** Okno: skopírovať číselník predkontácií a predvolené kódy do ďalších firiem. */
export function KopirovatNastaveniaOkno({
  companyId,
  onClose,
}: {
  companyId: string;
  onClose: () => void;
}) {
  useZatvorNaEscape(onClose);
  const kopiruj = useServerFn(kopirujNastaveniaFn);
  const [firmy, setFirmy] = useState<{ id: string; name: string }[]>([]);
  const [vyber, setVyber] = useState<Record<string, boolean>>({});
  const [ciselnik, setCiselnik] = useState(true);
  const [predvolene, setPredvolene] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const ja = auth.user?.id;
      if (!ja) return;
      // Len vlastné členstvá — inak by RLS vrátil aj kolegov a firmy by sa zdvojili.
      const { data } = await supabase
        .from("company_users")
        .select("company_id, role, companies(id, name)")
        .eq("user_id", ja);
      setFirmy(
        (data ?? [])
          .filter((r: any) => r.companies && r.company_id !== companyId && r.role !== "employee")
          .map((r: any) => ({ id: r.companies.id, name: r.companies.name }))
          .sort((a, b) => a.name.localeCompare(b.name, "sk")),
      );
    })();
  }, [companyId]);

  const ciele = Object.keys(vyber).filter((k) => vyber[k]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Kopírovať nastavenia do iných firiem"
        className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Kopírovať nastavenia do iných firiem</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Rovnaký kód v cieľovej firme sa prepíše, nič sa nemaže. Najviac 10 firiem naraz.
        </p>
        <div className="mt-4 space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={ciselnik}
              onChange={(e) => setCiselnik(e.target.checked)}
            />
            Číselník — predkontácie s účtami a pomermi, členenia, strediská, činnosti, rady,
            pokladne
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={predvolene}
              onChange={(e) => setPredvolene(e.target.checked)}
            />
            Predvolené kódy podľa druhu dokladu a účtovný program
          </label>
        </div>
        <div className="mt-4 max-h-64 space-y-1 overflow-auto rounded-md border border-border p-2 text-sm">
          {firmy.length === 0 ? (
            <p className="p-2 text-muted-foreground">
              Nemáte inú firmu, do ktorej by sa dalo kopírovať.
            </p>
          ) : (
            firmy.map((f) => (
              <label
                key={f.id}
                className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/40"
              >
                <input
                  type="checkbox"
                  checked={!!vyber[f.id]}
                  disabled={!vyber[f.id] && ciele.length >= 10}
                  onChange={(e) => setVyber({ ...vyber, [f.id]: e.target.checked })}
                />
                {f.name}
              </label>
            ))
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-2 text-sm"
          >
            Zavrieť
          </button>
          <button
            type="button"
            disabled={busy || !ciele.length || (!ciselnik && !predvolene)}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await kopiruj({
                  data: { company_id: companyId, ciele, ciselnik, predvolene },
                });
                const zle = r.vysledok.filter((v) => !v.ok);
                const meno = (id: string) => firmy.find((f) => f.id === id)?.name ?? id;
                if (zle.length)
                  toast.error(
                    `Nepodarilo sa: ${zle.map((v) => `${meno(v.firma)} (${v.chyba})`).join(", ")}`,
                    {
                      duration: 10000,
                    },
                  );
                const ok = r.vysledok.length - zle.length;
                if (ok) toast.success(`Skopírované do ${ok} ${ok === 1 ? "firmy" : "firiem"}`);
                if (!zle.length) onClose();
              } catch (e: any) {
                toast.error(e?.message ?? "Nepodarilo sa");
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            Kopírovať ({ciele.length})
          </button>
        </div>
      </div>
    </div>
  );
}
