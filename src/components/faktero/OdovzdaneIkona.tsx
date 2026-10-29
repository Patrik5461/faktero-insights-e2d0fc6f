import { ArrowUpRight, PencilLine, Undo2 } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { stavOdovzdania, textCesty, type RiadokOdovzdania } from "@/lib/faktero/stav-odovzdania";

/**
 * Šípka pri doklade, ktorý už odišiel do účtovníctva (Pohoda) — ako v Doklado.
 *
 * S `doklad` (celý riadok) ukáže aj históriu: vrátený doklad šípku nestratí,
 * len zmení farbu — v Pohode ostal a treba ho znova odovzdať (P-1008).
 * Doklad s opravou zaúčtovania čaká, kým ju účtovník prepíše v Pohode.
 */
export function OdovzdaneIkona({
  kedy,
  doklad,
}: {
  kedy: string | null | undefined;
  doklad?: RiadokOdovzdania | null;
}) {
  const { t } = useT();
  const s = stavOdovzdania(doklad ?? { exported_at: kedy ?? null });
  if (s.druh === "nie") return null;
  const datum = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("sk-SK") : "");
  const cesta = textCesty(s.cesta);
  const dopln = [cesta ? t(cesta) : null, s.pocet > 1 ? t("odovzdané {n}×", { n: s.pocet }) : null]
    .filter(Boolean)
    .join(" · ");
  const popis =
    s.druh === "vratene"
      ? t("Odovzdané {datum}, vrátené na opravu — treba znova odovzdať", {
          datum: datum(s.prvy),
        })
      : s.druh === "oprava_zauctovania"
        ? t("V Pohode — zaúčtovanie opravené, treba ho prepísať aj v Pohode")
        : t("Odovzdané do účtovníctva {datum}", { datum: datum(s.posledny) });
  const plny = dopln ? `${popis} (${dopln})` : popis;
  const farba =
    s.druh === "odovzdane" || s.druh === "odovzdane_znova"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
      : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300";
  const Ikona =
    s.druh === "vratene" ? Undo2 : s.druh === "oprava_zauctovania" ? PencilLine : ArrowUpRight;
  return (
    <span
      title={plny}
      aria-label={plny}
      role="img"
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${farba}`}
    >
      <Ikona className="h-3.5 w-3.5" />
    </span>
  );
}
