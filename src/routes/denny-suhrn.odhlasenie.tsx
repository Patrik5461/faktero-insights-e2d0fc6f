import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2 } from "lucide-react";
import { odhlasDennySuhrnFn } from "@/lib/faktero/denny-suhrn.functions";

/**
 * Odhlásenie z denného súhrnu úloh — odkaz z pätičky e-mailu, bez prihlásenia.
 *
 * Odhlasuje sa až tlačidlom, nie otvorením stránky: odkazy v pošte otvárajú
 * aj antivírusové skenery a tie by človeka odhlásili bez jeho vedomia.
 * Znova zapnúť sa súhrn dá v Nastaveniach účtu.
 */
export const Route = createFileRoute("/denny-suhrn/odhlasenie")({
  validateSearch: (s: Record<string, unknown>) => ({
    t: typeof s.t === "string" ? s.t : "",
  }),
  head: () => ({
    meta: [
      { title: "Odhlásenie z denného súhrnu — Faktero" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: Odhlasenie,
});

function Odhlasenie() {
  const { t } = Route.useSearch();
  const odhlas = useServerFn(odhlasDennySuhrnFn);
  const [stav, setStav] = useState<"caka" | "posiela" | "hotovo">("caka");
  const [chyba, setChyba] = useState<string | null>(null);

  async function potvrd() {
    setStav("posiela");
    setChyba(null);
    try {
      await odhlas({ data: { token: t } });
      setStav("hotovo");
    } catch (e: any) {
      setChyba(e?.message ?? "Odhlásenie sa nepodarilo.");
      setStav("caka");
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-lg rounded-xl border border-border bg-card p-6">
        <h1 className="text-xl font-semibold">Denný súhrn úloh</h1>
        {stav === "hotovo" ? (
          <>
            <p className="mt-3 flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-primary" /> Hotovo — denný súhrn vám už chodiť
              nebude.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Znova ho zapnete v{" "}
              <Link to="/nastavenia" className="underline">
                Nastaveniach účtu
              </Link>
              .
            </p>
          </>
        ) : !t ? (
          <p className="mt-3 text-sm text-destructive">Odkaz je neúplný — chýba v ňom token.</p>
        ) : (
          <>
            <p className="mt-3 text-sm text-muted-foreground">
              Každé ráno vám posielame e-mail, keď na vás vo Fakteri niečo čaká — doklady na
              schválenie, komentáre, nespracované doklady a faktúry po splatnosti. Chcete ho prestať
              dostávať?
            </p>
            {chyba && <p className="mt-3 text-sm text-destructive">{chyba}</p>}
            <button
              type="button"
              onClick={() => void potvrd()}
              disabled={stav === "posiela"}
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {stav === "posiela" && <Loader2 className="h-4 w-4 animate-spin" />}
              Odhlásiť sa z denného súhrnu
            </button>
          </>
        )}
      </div>
    </div>
  );
}
