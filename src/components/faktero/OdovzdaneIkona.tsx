import { ArrowUpRight } from "lucide-react";
import { useT } from "@/lib/i18n/useT";

/**
 * Šípka pri doklade, ktorý už odišiel do účtovníctva (Pohoda) — ako v Doklado.
 * Vrátený alebo Pohodou odmietnutý doklad ju stratí a ide znova do fronty.
 */
export function OdovzdaneIkona({ kedy }: { kedy: string | null | undefined }) {
  const { t } = useT();
  if (!kedy) return null;
  const datum = new Date(kedy).toLocaleDateString("sk-SK");
  const popis = t("Odovzdané do účtovníctva {datum}", { datum });
  return (
    <span
      title={popis}
      aria-label={popis}
      role="img"
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
    >
      <ArrowUpRight className="h-3.5 w-3.5" />
    </span>
  );
}
