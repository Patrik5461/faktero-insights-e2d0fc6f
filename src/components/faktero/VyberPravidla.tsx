import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plus, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { pravidloSedi, type Pravidlo } from "@/lib/faktero/pravidla-uctovania";

/** Hodnoty, z ktorých sa dá založiť nové pravidlo („Vytvoriť automatické účtovanie"). */
export type ZakladPravidla = {
  predkontacia?: string | null;
  clenenie?: string | null;
  kv?: string | null;
  kategoria?: string | null;
};

/**
 * Pravidlá účtovania pri doklade (ako „Aplikovať automatické účtovanie"
 * v Doklado). Spúšťač v databáze doplní prvé zhodné pravidlo sám; keď ich
 * dodávateľ má viac, tu si človek vyberie iné. Hviezdička ukazuje, že kódy
 * doplnilo pravidlo.
 */
export function VyberPravidla({
  companyId,
  doklad,
  druh = "blocek",
  typ,
  zaklad,
  onPouzi,
}: {
  companyId: string;
  doklad: {
    supplier_ico?: string | null;
    supplier_name?: string | null;
    payment_method?: string | null;
    pravidlo_id?: string | null;
  };
  druh?: "blocek" | "prijata" | "vystavena";
  typ?: string | null;
  /** Súčasné kódy dokladu — predvyplnia nové pravidlo. */
  zaklad?: ZakladPravidla;
  onPouzi: (p: Pravidlo) => void;
}) {
  const [pravidla, setPravidla] = useState<(Pravidlo & { id: string })[]>([]);
  const [vybrane, setVybrane] = useState("");

  useEffect(() => {
    // Tabuľka nie je v generovaných typoch — pravidlá číta aj stránka pravidiel takto.
    supabase
      .from("pravidla_uctovania")
      .select("*")
      .eq("company_id", companyId)
      .eq("aktivne", true)
      .order("poradie")
      .then(({ data }: { data: unknown[] | null }) => setPravidla((data ?? []) as any));
  }, [companyId]);

  const zhodne = pravidla.filter((p) =>
    pravidloSedi(p, {
      supplier_ico: doklad.supplier_ico ?? null,
      supplier_name: doklad.supplier_name ?? null,
      payment_method: doklad.payment_method ?? null,
      druh,
      typ: typ ?? null,
    }),
  );
  const pouzite = pravidla.find((p) => p.id === doklad.pravidlo_id);

  const partner = String(doklad.supplier_name ?? "").trim();
  const ico = String(doklad.supplier_ico ?? "").replace(/\D/g, "");
  const novePravidlo = (partner || ico) && !pouzite && !zhodne.length;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      {pouzite ? (
        <span
          className="inline-flex items-center gap-1 text-amber-700"
          title="Kódy doplnilo pravidlo účtovania"
        >
          <Star className="h-3.5 w-3.5 fill-current" /> Pravidlo „{pouzite.nazov}“
        </span>
      ) : null}
      {zhodne.some((p) => p.id !== pouzite?.id) ? (
        <>
          <select
            aria-label="Pravidlo účtovania"
            value={vybrane}
            onChange={(e) => setVybrane(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
          >
            <option value="">{pouzite ? "Iné pravidlo…" : "Použiť pravidlo…"}</option>
            {zhodne
              .filter((p) => p.id !== pouzite?.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nazov}
                  {p.predkontacia ? ` — ${p.predkontacia}` : ""}
                  {p.clenenie_dph ? ` / ${p.clenenie_dph}` : ""}
                </option>
              ))}
          </select>
          <button
            type="button"
            disabled={!vybrane}
            onClick={() => {
              const p = zhodne.find((x) => x.id === vybrane);
              if (p) onPouzi(p);
              setVybrane("");
            }}
            className="rounded-md border border-border px-2 py-1 hover:bg-secondary disabled:opacity-50"
          >
            Použiť
          </button>
        </>
      ) : null}
      {novePravidlo ? (
        /* Ako „Vytvoriť automatické účtovanie" v Doklado — ďalší doklad od
           tohto partnera dostane tie isté kódy sám. */
        <Link
          to="/uctovnictvo/pravidla"
          search={{
            novy: druh,
            nazov: partner || undefined,
            ico: ico.length >= 6 ? ico : undefined,
            predkontacia: zaklad?.predkontacia || undefined,
            clenenie: zaklad?.clenenie || undefined,
            kv: zaklad?.kv || undefined,
            kategoria: zaklad?.kategoria || undefined,
          }}
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          <Plus className="h-3.5 w-3.5" /> Vytvoriť pravidlo pre {partner || `IČO ${ico}`}
        </Link>
      ) : (
        <Link to="/uctovnictvo/pravidla" className="text-primary hover:underline">
          pravidlá
        </Link>
      )}
    </div>
  );
}
