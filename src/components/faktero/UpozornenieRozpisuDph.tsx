/*
  Upozornenie v sekcii „Čiastka a DPH“: rozpis DPH nesedí so sumami dokladu,
  daň riadku nezodpovedá základu × sadzbe alebo sadzba v krajine neplatí
  (`rozpis-dph-kontrola.ts`). Doklad s takým rozpisom sa neuloží potichu —
  ide „na kontrolu“ a človek ho tu vidí ešte pred vytvorením.
*/
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { supabase } from "@/integrations/supabase/client";
import { potvrd } from "@/lib/potvrdenie";
import type { VysledokKontroly } from "@/lib/faktero/rozpis-dph-kontrola";

type Preklad = (s: string, p?: Record<string, string | number>) => string;

/**
  Pred uložením, zaúčtovaním či vytvorením dokladu s nesediacim rozpisom DPH
  (zlá sadzba, súčet nesedí so sumou dokladu): „Pokračovať aj tak“ vráti true,
  „Opraviť“ false. Pri sediacom rozpise sa nepýta.
*/
export async function potvrdNesuladRozpisu(k: VysledokKontroly | null | undefined, t: Preklad): Promise<boolean> {
  if (!k || k.ok) return true;
  return potvrd(
    t("Sadzba DPH alebo súčet nesedí s dokladom") +
      "\n" +
      k.chyby.map((c) => c.sprava).join("\n") +
      "\n" +
      t("Pokračovať aj tak? Nesúlad sa zapíše ako potvrdený a pri ďalšom otvorení sa už neukáže."),
    { potvrdit: t("Pokračovať aj tak"), zrusit: t("Opraviť") },
  );
}

/**
  Človek dal „Pokračovať aj tak“: podpis rozpisu ide do `rozpis_dph_potvrdeny`
  (formulár sa potom nepýta, kým sa rozpis či suma nezmení) a kontrola
  rozpisu „na kontrolu“ sa zruší — človek ju práve urobil. Zvlášť od zápisu
  dokladu: chýbajúci stĺpec (migrácia 20261106123913) uloženie nezastaví.
*/
export async function ulozPotvrdenieRozpisu(
  tabulka: "purchase_invoices" | "expense_documents",
  id: string,
  podpis: string,
  k: VysledokKontroly | null | undefined,
): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase
    .from(tabulka)
    .update({
      rozpis_dph_potvrdeny: {
        podpis,
        at: new Date().toISOString(),
        kto: u.user?.id ?? null,
        dovod: k && !k.ok ? k.chyby.map((c) => c.sprava).join(" ") : null,
      },
    } as never)
    .eq("id", id);
  if (error) console.warn("[rozpis DPH] potvrdenie sa nezapísalo:", error.message);
  const { error: e2 } = await supabase
    .from(tabulka)
    .update({ na_kontrolu_at: null, na_kontrolu_dovod: null } as never)
    .eq("id", id)
    .like("na_kontrolu_dovod", "Rozpis DPH%");
  if (e2) console.warn("[rozpis DPH] kontrola sa nezrušila:", e2.message);
}

export function UpozornenieRozpisuDph({
  kontrola,
  dovod,
  onPotvrd,
  potvrdene = false,
  poznamka,
  className = "",
}: {
  /** Živá kontrola rozpisu vo formulári. */
  kontrola?: VysledokKontroly | null;
  /** Uložený dôvod (napr. `na_kontrolu_dovod`), keď živá kontrola nie je. */
  dovod?: string | null;
  /** „Rozpis je správny“ — človek ho overil podľa dokladu. */
  onPotvrd?: (() => void) | null;
  /** Nesúlad človek už vedome potvrdil („Pokračovať aj tak“) — len tichý riadok. */
  potvrdene?: boolean;
  /** Veta pod zoznamom chýb; predvolene „pôjde na kontrolu“. */
  poznamka?: string;
  className?: string;
}) {
  const { t } = useT();
  if (potvrdene && kontrola && !kontrola.ok)
    return (
      <p
        data-testid="rozpis-dph-potvrdeny"
        className={`flex items-start gap-1.5 text-xs text-muted-foreground ${className}`}
        title={kontrola.chyby.map((c) => c.sprava).join(" ")}
      >
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {t("Nesúlad rozpisu DPH s dokladom ste potvrdili.")}
      </p>
    );
  const vety =
    kontrola && !kontrola.ok ? kontrola.chyby.map((c) => c.sprava) : dovod ? [dovod] : [];
  if (!vety.length) return null;
  return (
    <div
      role="alert"
      data-testid="upozornenie-rozpisu-dph"
      className={`dk-pozor flex items-start gap-2 rounded-lg border p-3 text-xs ${className}`}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 space-y-1">
        <div className="font-semibold">
          {t("Rozpis DPH nesedí — skontrolujte ho podľa dokladu")}
        </div>
        <ul className="list-disc space-y-0.5 pl-4">
          {vety.map((v, i) => (
            <li key={i} className="break-words">
              {v}
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground">
          {poznamka ??
            t(
              "Opravte sadzby, základ a DPH podľa tabuľky rozpisu DPH na doklade. Ak je doklad naozaj taký, pri uložení zvoľte „Pokračovať aj tak“ — nesúlad sa zapíše a znova sa nehlási.",
            )}
        </p>
        {onPotvrd ? (
          <button
            type="button"
            onClick={onPotvrd}
            className="mt-1 inline-flex h-8 items-center rounded-md border border-current/30 px-3 font-medium hover:bg-background/60"
          >
            {t("Rozpis je správny")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
