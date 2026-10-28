import { useId, useState } from "react";
import { toast } from "sonner";
import { Tag, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n/useT";
import { useCiselnikyDokladov } from "@/hooks/useCiselnikyDokladov";

/**
 * Štítky dokladu (najviac 5) — vlastné značky na triedenie a filtrovanie,
 * napr. „auto BA-123", „projekt X". Do účtovníctva sa neprenášajú.
 */
export function StitkyDokladu({
  tabulka,
  id,
  stitky,
  zamknute,
  onZmena,
  companyId,
}: {
  tabulka: "purchase_invoices" | "expense_documents" | "invoices" | "other_documents";
  id: string;
  stitky: string[];
  zamknute?: boolean;
  onZmena?: (s: string[]) => void;
  /** S firmou ponúkne štítky z číselníka a nový doň zapíše. */
  companyId?: string | null;
}) {
  const { t } = useT();
  const zoznamId = useId();
  const ciselnik = useCiselnikyDokladov(companyId, null, false);
  const [zoznam, setZoznam] = useState<string[]>(stitky ?? []);
  const [novy, setNovy] = useState("");

  async function uloz(s: string[]) {
    const { error } = await supabase
      .from(tabulka)
      .update({ stitky: s } as any)
      .eq("id", id);
    if (error) return toast.error(error.message);
    // Nový štítok sa ponúkne aj pri ďalších dokladoch firmy.
    const novy = s.find((x) => !zoznam.includes(x));
    if (companyId && novy && !ciselnik.stitky.includes(novy)) {
      void supabase
        .from("stitky_firmy")
        .upsert(
          { company_id: companyId, nazov: novy },
          { onConflict: "company_id,nazov", ignoreDuplicates: true },
        )
        .then(() => ciselnik.pridajStitok(novy));
    }
    setZoznam(s);
    onZmena?.(s);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <Tag className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      {zoznam.map((s) => (
        <span
          key={s}
          className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5"
        >
          {s}
          {!zamknute ? (
            <button
              type="button"
              aria-label={t("Odstrániť štítok {stitok}", { stitok: s })}
              onClick={() => void uloz(zoznam.filter((x) => x !== s))}
              className="rounded-full hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </span>
      ))}
      {!zamknute && zoznam.length < 5 ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const stitok = novy.trim().slice(0, 40);
            if (!stitok || zoznam.includes(stitok)) return setNovy("");
            setNovy("");
            void uloz([...zoznam, stitok]);
          }}
        >
          <input
            list={companyId ? zoznamId : undefined}
            aria-label={t("Nový štítok")}
            value={novy}
            onChange={(e) => setNovy(e.target.value)}
            placeholder={zoznam.length ? t("+ štítok") : t("Pridať štítok")}
            className="w-28 rounded-full border border-dashed border-border bg-transparent px-2 py-0.5 text-xs"
          />
          {companyId ? (
            <datalist id={zoznamId}>
              {ciselnik.stitky
                .filter((x) => !zoznam.includes(x))
                .map((x) => (
                  <option key={x} value={x} />
                ))}
            </datalist>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
