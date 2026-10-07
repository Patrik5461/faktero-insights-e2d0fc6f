import { useState } from "react";
import { toast } from "sonner";
import { Tag, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
}: {
  tabulka: "purchase_invoices" | "expense_documents";
  id: string;
  stitky: string[];
  zamknute?: boolean;
  onZmena?: (s: string[]) => void;
}) {
  const [zoznam, setZoznam] = useState<string[]>(stitky ?? []);
  const [novy, setNovy] = useState("");

  async function uloz(s: string[]) {
    const { error } = await supabase.from(tabulka).update({ stitky: s } as any).eq("id", id);
    if (error) return toast.error(error.message);
    setZoznam(s);
    onZmena?.(s);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <Tag className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      {zoznam.map((s) => (
        <span key={s} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5">
          {s}
          {!zamknute ? (
            <button
              type="button"
              aria-label={`Odstrániť štítok ${s}`}
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
            const t = novy.trim().slice(0, 40);
            if (!t || zoznam.includes(t)) return setNovy("");
            setNovy("");
            void uloz([...zoznam, t]);
          }}
        >
          <input
            aria-label="Nový štítok"
            value={novy}
            onChange={(e) => setNovy(e.target.value)}
            placeholder={zoznam.length ? "+ štítok" : "Pridať štítok"}
            className="w-28 rounded-full border border-dashed border-border bg-transparent px-2 py-0.5 text-xs"
          />
        </form>
      ) : null}
    </div>
  );
}
