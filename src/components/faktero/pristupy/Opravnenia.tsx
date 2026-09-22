import { Info } from "lucide-react";
import { OBLASTI, POPIS_ROLI, UROVNE, uroven, type Opravnenia, type Uroven } from "@/lib/faktero/opravnenia";

/** Čo ktorá rola smie — rozbaľovacie vysvetlenie nad pozvánkou. */
export function VysvetlenieRoli() {
  return (
    <details className="mt-4 rounded-md border border-border bg-muted/30 p-3 text-sm">
      <summary className="flex cursor-pointer items-center gap-2 font-medium">
        <Info className="h-4 w-4 text-primary" /> Čo ktorá rola umožňuje
      </summary>
      <dl className="mt-3 space-y-2">
        {POPIS_ROLI.map((r) => (
          <div key={r.rola} className="grid gap-1 sm:grid-cols-[10rem_1fr]">
            <dt className="font-medium">{r.nazov}</dt>
            <dd className="text-muted-foreground">{r.text}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">
        Prístup stráži aj databáza — čo človek nesmie, to sa mu nezobrazí ani cez priamy odkaz.
      </p>
    </details>
  );
}

/**
 * Výber oblastí pri roli „Vlastný prístup“: pri každej Bez prístupu / Len
 * čítať / Upravovať.
 */
export function EditorOpravneni({
  hodnota,
  onZmena,
}: {
  hodnota: Opravnenia;
  onZmena: (o: Opravnenia) => void;
}) {
  function nastav(oblast: (typeof OBLASTI)[number]["kluc"], u: Uroven) {
    const nove = { ...hodnota };
    if (u === "none") delete nove[oblast];
    else nove[oblast] = u;
    onZmena(nove);
  }
  return (
    <div className="mt-3 divide-y divide-border rounded-md border border-border">
      {OBLASTI.map((o) => (
        <div key={o.kluc} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{o.nazov}</div>
            <div className="text-xs text-muted-foreground">{o.popis}</div>
          </div>
          <div role="radiogroup" aria-label={o.nazov} className="inline-flex rounded-md border border-border p-0.5">
            {UROVNE.map((u) => {
              const zvolene = uroven(hodnota, o.kluc) === u.kluc;
              return (
                <button
                  key={u.kluc}
                  type="button"
                  role="radio"
                  aria-checked={zvolene}
                  onClick={() => nastav(o.kluc, u.kluc)}
                  className={`rounded px-2.5 py-1 text-xs ${
                    zvolene
                      ? u.kluc === "none"
                        ? "bg-secondary font-medium"
                        : "bg-primary font-medium text-primary-foreground"
                      : "text-muted-foreground hover:bg-secondary/60"
                  }`}
                >
                  {u.nazov}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
