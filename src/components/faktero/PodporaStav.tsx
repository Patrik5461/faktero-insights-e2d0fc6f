import { nazovStavu } from "@/lib/faktero/podpora";
import { useT } from "@/lib/i18n/useT";
import { StavOdznak, type TonStavu } from "@/components/faktero/web/Stav";

const FARBA: Record<string, string> = {
  nova: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  otvorena: "bg-amber-500/10 text-amber-800 dark:text-amber-300",
  caka_na_zakaznika: "bg-primary/10 text-primary-hover",
  vyriesena: "bg-muted text-muted-foreground",
};

/** Štítok stavu požiadavky — rovnaký v Pomoc a podpora aj v administrácii. */
export function PodporaStav({ stav, nazov }: { stav: string; nazov?: string }) {
  const { t } = useT();
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${FARBA[stav] ?? ""}`}>
      {t(nazov ?? nazovStavu(stav))}
    </span>
  );
}

/*
 * Webová varianta (redizajn 2026-11) — jednotný stavový odznak s bodkou.
 * Text je ten istý ako pri `PodporaStav`; pôvodný štítok ostáva pre administráciu,
 * ktorá do redizajnu nepatrí.
 */
const TON_POZIADAVKY: Record<string, TonStavu> = {
  nova: "informacia",
  otvorena: "priebeh",
  caka_na_zakaznika: "pozor",
  vyriesena: "uspech",
};

export function PodporaStavWeb({ stav, nazov }: { stav: string; nazov?: string }) {
  const { t } = useT();
  return (
    <StavOdznak ton={TON_POZIADAVKY[stav] ?? "neutralny"}>{t(nazov ?? nazovStavu(stav))}</StavOdznak>
  );
}
