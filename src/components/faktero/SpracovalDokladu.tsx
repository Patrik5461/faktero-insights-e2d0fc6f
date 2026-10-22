import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { UserCheck } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { lokalJazyka } from "@/lib/i18n/jazyk";
import { menaClenovFirmy } from "@/lib/faktero/invitations.functions";
import { menoSpracovatela, spracovanieDokladu } from "@/lib/faktero/spracoval";

/**
 * Kto doklad spracoval a kedy — pri prijatej faktúre ten, kto ju vytvoril
 * z Nespracovaných dokladov, pri bločku ten, kto ho spracoval. Bez údaja
 * (doklad zapísaný ručne, starší doklad) sa nezobrazí nič.
 */
export function SpracovalDokladu({
  companyId,
  agenda,
  row,
}: {
  companyId: string | null | undefined;
  agenda: "prijata" | "doklad";
  row: Record<string, any> | null | undefined;
}) {
  const { t, jazyk } = useT();
  const nacitajMena = useServerFn(menaClenovFirmy);
  const [mena, setMena] = useState<Record<string, string>>({});
  const s = spracovanieDokladu(row, agenda);
  useEffect(() => {
    if (!companyId || !s?.kto) return;
    nacitajMena({ data: { company_id: companyId } })
      .then((m) => setMena(m as Record<string, string>))
      .catch(() => setMena({}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, s?.kto]);
  if (!s) return null;
  const kto = menoSpracovatela(s, mena) ?? (s.kto ? t("kolega") : null);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-border bg-card px-5 py-3 text-sm">
      <UserCheck className="h-4 w-4 text-muted-foreground" />
      <span className="text-muted-foreground">{t("Spracoval")}:</span>
      <span className="font-medium">{kto ?? "—"}</span>
      {s.kedy ? (
        <span className="text-muted-foreground">
          {new Date(s.kedy).toLocaleString(lokalJazyka(jazyk), {
            dateStyle: "short",
            timeStyle: "short",
          })}
        </span>
      ) : null}
    </div>
  );
}
