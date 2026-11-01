import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { kopirujNastaveniaFn } from "@/lib/faktero/predkontacie.functions";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { useT } from "@/lib/i18n/useT";

/** Okno: skopírovať číselník predkontácií a predvolené kódy do ďalších firiem. */
export function KopirovatNastaveniaOkno({
  companyId,
  onClose,
}: {
  companyId: string;
  onClose: () => void;
}) {
  const { t } = useT();
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Kopírovať nastavenia do iných firiem")}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-popover p-5 shadow-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">{t("Kopírovať nastavenia do iných firiem")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("Rovnaký kód v cieľovej firme sa prepíše, nič sa nemaže. Najviac 10 firiem naraz.")}
        </p>
        <div className="mt-4 space-y-2 text-sm">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1 shrink-0"
              checked={ciselnik}
              onChange={(e) => setCiselnik(e.target.checked)}
            />
            {t(
              "Číselník — predkontácie s účtami a pomermi, členenia, strediská, činnosti, rady, pokladne",
            )}
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1 shrink-0"
              checked={predvolene}
              onChange={(e) => setPredvolene(e.target.checked)}
            />
            {t("Predvolené kódy podľa druhu dokladu a účtovný program")}
          </label>
        </div>
        <div className="mt-4 max-h-64 space-y-0.5 overflow-auto rounded-lg border border-border bg-background p-1.5 text-sm">
          {firmy.length === 0 ? (
            <p className="p-2 text-muted-foreground">
              {t("Nemáte inú firmu, do ktorej by sa dalo kopírovať.")}
            </p>
          ) : (
            firmy.map((f) => (
              <label
                key={f.id}
                className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
              >
                <input
                  type="checkbox"
                  checked={!!vyber[f.id]}
                  disabled={!vyber[f.id] && ciele.length >= 10}
                  onChange={(e) => setVyber({ ...vyber, [f.id]: e.target.checked })}
                />
                <span className="min-w-0 truncate">{f.name}</span>
              </label>
            ))
          )}
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-input bg-card px-3 py-2 text-sm font-semibold hover:bg-secondary"
          >
            {t("Zavrieť")}
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
                    t("Nepodarilo sa: {zoznam}", {
                      zoznam: zle.map((v) => `${meno(v.firma)} (${v.chyba})`).join(", "),
                    }),
                    {
                      duration: 10000,
                    },
                  );
                const ok = r.vysledok.length - zle.length;
                if (ok) toast.success(t(ok === 1 ? "Skopírované do {n} firmy" : "Skopírované do {n} firiem", { n: ok }));
                if (!zle.length) onClose();
              } catch (e: any) {
                toast.error(e?.message ?? t("Nepodarilo sa"));
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
          >
            {t("Kopírovať ({n})", { n: ciele.length })}
          </button>
        </div>
      </div>
    </div>
  );
}
