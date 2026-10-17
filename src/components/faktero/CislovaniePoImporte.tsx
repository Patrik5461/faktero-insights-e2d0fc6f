import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Hash } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { pokracujVRaduFn } from "@/lib/faktero/ciselne-rady.functions";
import type { RadZImportu } from "@/lib/faktero/ciselne-rady-import.server";

/**
 * Výsledok importu: v akom číslovaní budú pokračovať ďalšie doklady.
 * Nastavené rady len oznámi; pri firme, ktorá už vo Fakteri vystavuje,
 * ponúkne pokračovanie tlačidlom.
 */
export function CislovaniePoImporte({
  rady,
  onZmena,
}: {
  rady?: RadZImportu[];
  onZmena?: () => void;
}) {
  const { t } = useT();
  const pokracuj = useServerFn(pokracujVRaduFn);
  const [hotove, setHotove] = useState<Record<string, boolean>>({});
  if (!rady?.length) return null;

  async function potvrd(r: RadZImportu) {
    const cid = getActiveCompanyId();
    if (!cid || !r.datum) return;
    try {
      await pokracuj({
        data: {
          company_id: cid,
          kind: r.druh as any,
          cislo: r.cislo,
          datum: r.datum,
          start_from: r.startFrom,
        },
      });
      setHotove((h) => ({ ...h, [r.druh]: true }));
      onZmena?.();
      toast.success(t("{nazov}: ďalšie číslo bude {dalsie}.", { nazov: t(r.nazov), dalsie: r.dalsie }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="mt-5 rounded-lg border border-border bg-muted/30 p-4 text-left text-sm">
      <div className="mb-2 flex items-center gap-2 font-medium">
        <Hash className="h-4 w-4 text-primary" /> {t("Číslovanie")}
      </div>
      <ul className="space-y-2">
        {rady.map((r) => (
          <li key={r.druh} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong>{t(r.nazov)}</strong>: {t("posledná naimportovaná")}{" "}
              <span className="font-mono">{r.cislo}</span>
              {r.nastavene || hotove[r.druh] ? (
                <>
                  {" "}
                  — {t("ďalšia bude")} <span className="font-mono font-medium">{r.dalsie}</span>.
                </>
              ) : onZmena ? null : (
                <span className="block text-xs text-muted-foreground">
                  {t("Vo Fakteri už máte vlastné doklady tohto druhu, preto sme číslovanie nemenili.")}
                </span>
              )}
            </span>
            {!r.nastavene && !hotove[r.druh] && r.datum && (
              <button
                onClick={() => potvrd(r)}
                className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-secondary"
              >
                {t("Pokračovať od {dalsie}", { dalsie: r.dalsie })}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
