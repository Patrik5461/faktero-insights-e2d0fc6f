import { nazovStavu } from "@/lib/faktero/podpora";

const FARBA: Record<string, string> = {
  nova: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  otvorena: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  caka_na_zakaznika: "bg-primary/10 text-primary",
  vyriesena: "bg-muted text-muted-foreground",
};

/** Štítok stavu požiadavky — rovnaký v Pomoc a podpora aj v administrácii. */
export function PodporaStav({ stav, nazov }: { stav: string; nazov?: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${FARBA[stav] ?? ""}`}>
      {nazov ?? nazovStavu(stav)}
    </span>
  );
}
