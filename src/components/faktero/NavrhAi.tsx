import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles } from "lucide-react";
import { navrhZauctovaniaFn } from "@/lib/faktero/ai-predkontacia.functions";
import {
  nepotvrdeneAi,
  potvrdNavrhAi,
  zahodNavrhAi,
  type PoleNavrhu,
  type VysledokNavrhu,
  type ZdrojNavrhu,
} from "@/lib/faktero/ai-predkontacia";
import type { UdajeNespracovaneho } from "@/lib/faktero/nespracovane";
import { useT } from "@/lib/i18n/useT";

/** Pole formulára → zdroj predvyplnenej hodnoty (len kým ju človek nezmení). */
export type OznaceniaNavrhu = Partial<Record<PoleNavrhu, Extract<ZdrojNavrhu, "ai" | "navyk">>>;

/** Štítok pri poli: „Návrh AI" alebo „naučené". */
export function StitokNavrhu({ zdroj }: { zdroj: "ai" | "navyk" }) {
  const { t } = useT();
  return zdroj === "ai" ? (
    <span
      className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-violet-100 px-1.5 py-px text-[10px] font-medium text-violet-800 dark:bg-violet-500/20 dark:text-violet-200"
      title={t("Navrhla AI podľa dodávateľa a položiek — skontrolujte a potvrďte, alebo zmeňte.")}
    >
      <Sparkles className="h-2.5 w-2.5" /> {t("Návrh AI")}
    </span>
  ) : (
    <span
      className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary"
      title={t("Podľa predchádzajúcich dokladov od dodávateľa.")}
    >
      {t("naučené")}
    </span>
  );
}

/**
 * Návrh zaúčtovania pre doklad — počíta sa lenivo pri otvorení a server si
 * ho pamätá, takže ďalšie otvorenie AI nevolá. Výpadok AI = žiadny návrh.
 */
export function useNavrhZauctovania(
  typ: "prijata" | "nespracovany",
  id: string | null | undefined,
  aktivne: boolean,
  /** Nespracovaný doklad: druh zvolený vo formulári (nemusí byť ešte uložený). */
  druh?: "faktura" | "zalohova" | "dobropis" | "blocek" | null,
): VysledokNavrhu | null {
  const nacitaj = useServerFn(navrhZauctovaniaFn);
  const [v, setV] = useState<VysledokNavrhu | null>(null);
  useEffect(() => {
    setV(null);
    if (!id || !aktivne) return;
    let zrusene = false;
    nacitaj({ data: { typ, id, ...(druh ? { druh } : {}) } })
      .then((r) => {
        if (!zrusene) setV(r as VysledokNavrhu);
      })
      .catch(() => {});
    return () => {
      zrusene = true;
    };
  }, [typ, id, aktivne, druh, nacitaj]);
  return v;
}

/**
 * Riadok pod poliami zaúčtovania: zdôvodnenie návrhu AI a tlačidlá.
 * `onPotvrd` chýba tam, kde potvrdením je samotné „Zaúčtovať".
 */
export function NavrhAiInfo({
  dovod,
  onPotvrd,
  onZahod,
}: {
  dovod: string | null;
  onPotvrd?: () => void;
  onZahod: () => void;
}) {
  const { t } = useT();
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-100">
      <Sparkles className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 flex-1">
        <strong>{t("Návrh AI")}</strong>
        {dovod ? `: ${dovod}` : ""}.{" "}
        {onPotvrd
          ? t("Je to len návrh — potvrďte ho alebo kód zmeňte.")
          : t("Je to len návrh — potvrdíte ho tlačidlom Zaúčtovať, alebo kód zmeňte.")}
      </span>
      {onPotvrd && (
        <button
          type="button"
          onClick={onPotvrd}
          className="rounded-md bg-violet-600 px-2.5 py-1 font-medium text-white hover:opacity-90"
        >
          {t("Potvrdiť návrh")}
        </button>
      )}
      <button
        type="button"
        onClick={onZahod}
        className="rounded-md border border-violet-300 px-2.5 py-1 hover:bg-violet-100 dark:border-violet-500/40 dark:hover:bg-violet-500/20"
      >
        {t("Zahodiť návrh")}
      </button>
    </div>
  );
}

/** Firma nemá kódy, z ktorých by AI mohla vyberať. */
export function NavrhBezCiselnika() {
  const { t } = useT();
  return (
    <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
      <Sparkles className="h-3.5 w-3.5" />
      {t("Pre návrh si najprv nastavte číselník predkontácií")}{" "}
      <Link to="/uctovnictvo/predkontacie" className="underline">
        {t("v nastaveniach predkontácií")}
      </Link>
      .
    </p>
  );
}

/** Návrh v nespracovanom doklade: zdôvodnenie, Potvrdiť / Zahodiť, alebo odkaz na číselník. */
export function NavrhAiNespracovaneho({
  u,
  setU,
  stav,
}: {
  u: UdajeNespracovaneho;
  setU: (u: UdajeNespracovaneho) => void;
  stav: string | null | undefined;
}) {
  if (nepotvrdeneAi(u).length)
    return (
      <NavrhAiInfo
        dovod={u.navrhAiDovod ?? null}
        onPotvrd={() => setU(potvrdNavrhAi(u))}
        onZahod={() => setU(zahodNavrhAi(u))}
      />
    );
  if (stav === "bez_ciselnika") return <NavrhBezCiselnika />;
  return null;
}
