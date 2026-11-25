import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeftRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n/useT";
import { lokalJazyka } from "@/lib/i18n/jazyk";

type Vysledok = {
  faktur?: number;
  sparovanych?: number;
  novychUhrad?: number;
  uhradenych?: number;
  rozdiely?: string[];
  kedy?: string;
};

/**
 * Spätný smer mosta (25. 11.): úhrady z Pohody do Faktera. Konektor sa
 * najviac raz za 6 hodín spýta Pohody na zmenené faktúry s likvidáciami.
 */
export function UhradyZPohody({ firma }: { firma: any }) {
  const { t, jazyk } = useT();
  const loc = lokalJazyka(jazyk);
  const [zapnute, setZapnute] = useState<boolean>(firma?.pohoda_uhrady_zapnute !== false);
  const v: Vysledok | null = firma?.pohoda_uhrady_vysledok ?? null;
  const sync = firma?.pohoda_uhrady_sync_at as string | null;

  async function prepni(hodnota: boolean) {
    setZapnute(hodnota);
    const { error } = await supabase
      .from("companies")
      .update({ pohoda_uhrady_zapnute: hodnota } as never)
      .eq("id", firma.id);
    if (error) {
      setZapnute(!hodnota);
      toast.error(error.message);
    } else toast.success(hodnota ? t("Úhrady z Pohody zapnuté.") : t("Úhrady z Pohody vypnuté."));
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-start gap-3">
        <ArrowLeftRight className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">{t("Úhrady z Pohody do Faktera")}</h2>
          <p className="mt-1 text-muted-foreground">
            {t(
              "Most ide obojsmerne: doklady posiela do Pohody a z Pohody si berie úhrady. Keď účtovníčka v Pohode spáruje platbu s faktúrou, Faktero ju pri ďalšom behu konektora (najviac raz za 6 hodín) označí ako uhradenú. Faktúru, ktorú má Faktero zaplatenú inak (banka, ručne), druhýkrát nezaplatí — len upozorní.",
            )}
          </p>
          <label className="mt-3 flex items-center gap-2">
            <input type="checkbox" checked={zapnute} onChange={(e) => void prepni(e.target.checked)} />
            {t("Brať úhrady z Pohody")}
          </label>
          <p className="mt-2 text-xs text-muted-foreground">
            {sync
              ? t("Naposledy synchronizované: {kedy}", { kedy: new Date(sync).toLocaleString(loc) })
              : t("Zatiaľ nesynchronizované — prvý beh konektora načíta zmeny za posledných 90 dní.")}
            {v
              ? ` · ${t("posledný beh: {f} faktúr z Pohody, {u} nových úhrad, {h} uhradených", {
                  f: v.faktur ?? 0,
                  u: v.novychUhrad ?? 0,
                  h: v.uhradenych ?? 0,
                })}`
              : ""}
          </p>
          {v?.rozdiely?.length ? (
            <details className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
              <summary className="cursor-pointer font-medium">
                {t("Rozdiely oproti Pohode ({n})", { n: v.rozdiely.length })}
              </summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {v.rozdiely.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  );
}
