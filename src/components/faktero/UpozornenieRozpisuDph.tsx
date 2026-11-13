/*
  Upozornenie v sekcii „Čiastka a DPH“: rozpis DPH nesedí so sumami dokladu,
  daň riadku nezodpovedá základu × sadzbe alebo sadzba v krajine neplatí
  (`rozpis-dph-kontrola.ts`). Doklad s takým rozpisom sa neuloží potichu —
  ide „na kontrolu“ a človek ho tu vidí ešte pred vytvorením.
*/
import { AlertTriangle } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { supabase } from "@/integrations/supabase/client";
import { potvrd } from "@/lib/potvrdenie";
import type { VysledokKontroly } from "@/lib/faktero/rozpis-dph-kontrola";

type Preklad = (s: string, p?: Record<string, string | number>) => string;

/**
  Pred uložením, zaúčtovaním či vytvorením dokladu s nesediacim rozpisom DPH
  (sadzba mimo zákonných, DPH nezodpovedá základu, súčet nesedí s dokladom).
  Od 13. 11. (Patrik: „nedovoľ prepisovať zákonné sadzby DPH“) sa taký doklad
  neuloží vôbec — okno len povie, čo nesedí. „Opraviť rozpis DPH“ zavolá
  `naOpravu` (napr. otvorí opravu rozpisu). Vráti true len pri sediacom rozpise.
*/
export async function potvrdNesuladRozpisu(
  k: VysledokKontroly | null | undefined,
  t: Preklad,
  naOpravu?: (() => void) | null,
): Promise<boolean> {
  if (!k || k.ok) return true;
  const opravit = await potvrd(
    t("Rozpis DPH nesedí — doklad sa neuloží") +
      "\n" +
      k.chyby.map((c) => c.sprava).join("\n") +
      "\n" +
      t("Sadzba musí byť zákonná a DPH riadku sa počíta zo základu (doladiť sa dá len o zaokrúhlenie). Opravte rozpis podľa dokladu."),
    { potvrdit: naOpravu ? t("Opraviť rozpis DPH") : t("Rozumiem"), zrusit: t("Späť") },
  );
  if (opravit && naOpravu) naOpravu();
  return false;
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
  onOprava,
  poznamka,
  className = "",
}: {
  /** Živá kontrola rozpisu vo formulári. */
  kontrola?: VysledokKontroly | null;
  /** Uložený dôvod (napr. `na_kontrolu_dovod`), keď živá kontrola nie je. */
  dovod?: string | null;
  /**
   * Zastarané: „Rozpis je správny“ sa už neponúka — nesediaci rozpis treba
   * opraviť (Patrik 13. 11.). Ostáva kvôli volajúcim.
   */
  onPotvrd?: (() => void) | null;
  /**
   * Zastarané: kedysi potvrdený nesúlad („Pokračovať aj tak“) sa už neschováva —
   * zlá DPH je chyba, kým sa neopraví.
   */
  potvrdene?: boolean;
  /** Tlačidlo „Opraviť rozpis DPH“ (uložený doklad so zlou DPH). */
  onOprava?: (() => void) | null;
  /** Veta pod zoznamom chýb; predvolene „pôjde na kontrolu“. */
  poznamka?: string;
  className?: string;
}) {
  const { t } = useT();
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
              "Opravte sadzby, základ a DPH podľa tabuľky rozpisu DPH na doklade. Sadzba musí byť zákonná a DPH sa počíta zo základu — kým rozpis nesedí, doklad sa neuloží.",
            )}
        </p>
        {onOprava ? (
          <button
            type="button"
            onClick={onOprava}
            className="mt-1 inline-flex h-8 items-center rounded-md border border-current/30 px-3 font-medium hover:bg-background/60"
          >
            {t("Opraviť rozpis DPH")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
