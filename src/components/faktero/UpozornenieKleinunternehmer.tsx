import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { rezimFirmy, type FirmaDph } from "@/lib/faktero/dph-rezim";
import { stavKleinunternehmer } from "@/lib/faktero/kleinunternehmer";
import { vsetkyRiadky } from "@/lib/faktero/strankovanie";
import { formatujMenu } from "@/lib/faktero/mena";
import { useT } from "@/lib/i18n/useT";

/**
 * Upozornenie pre nemeckú firmu v režime Kleinunternehmer (§ 19 UStG), keď sa
 * obrat z vystavených faktúr blíži k hranici 25 000 € / 100 000 € alebo ju
 * prekročil. Pre ostatné firmy sa nič nenačítava ani nekreslí.
 */
export function UpozornenieKleinunternehmer({
  firma,
}: {
  firma: (FirmaDph & { id?: string | null }) | null | undefined;
}) {
  const { t } = useT();
  const ku = Boolean(firma?.id) && rezimFirmy(firma).schema === "de_kleinunternehmer";
  const dnes = new Date().toISOString().slice(0, 10);
  const od = `${Number(dnes.slice(0, 4)) - 1}-01-01`;
  const { data: stav } = useQuery({
    queryKey: ["kleinunternehmer-obrat", firma?.id, od],
    enabled: ku,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // Dátum dodania môže byť skôr než vystavenie — berie sa aj december predminulého roka.
      const odVystavenia = `${Number(od.slice(0, 4)) - 1}-12-01`;
      const doklady = await vsetkyRiadky<any>((z, po) =>
        supabase
          .from("invoices")
          .select(
            "id, type, status, deleted_at, issue_date, delivery_date, subtotal, subtotal_eur, currency, total",
          )
          .eq("company_id", firma!.id!)
          .gte("issue_date", odVystavenia)
          .order("id")
          .range(z, po),
      );
      return stavKleinunternehmer(doklady, dnes, (n) => formatujMenu(n, "EUR"));
    },
  });
  if (!ku || !stav?.upozornenia.length) return null;
  const koniec = stav.upozornenia.some((u) => u.zavaznost === "koniec");
  return (
    <div
      role="status"
      className={`flex gap-3 rounded-lg border px-4 py-3 text-sm ${
        koniec
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
      }`}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 space-y-1">
        <div className="font-medium">{t("Kleinunternehmer (§ 19 UStG) — hranica obratu")}</div>
        {stav.upozornenia.map((u) => (
          <p key={u.sprava}>{t(u.sprava, u.parametre)}</p>
        ))}
      </div>
    </div>
  );
}
