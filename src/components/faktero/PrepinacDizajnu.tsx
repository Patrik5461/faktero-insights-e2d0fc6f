import { useEffect, useState } from "react";
import { nacitajDizajn, ulozDizajn, type Dizajn } from "@/lib/faktero/dizajn";

const MOZNOSTI: { hodnota: Dizajn; popis: string; farba: string; pozadie: string; pas: boolean }[] = [
  { hodnota: "faktero", popis: "Klasické", farba: "#0F7A4D", pozadie: "#F4F3EF", pas: false },
  { hodnota: "kompaktny", popis: "Kompaktné", farba: "#0F7A4D", pozadie: "#F4F3EF", pas: true },
];

/**
 * Prepínač dizajnu celej aplikácie. `velky` je verzia do Nastavení s náhľadom
 * farieb, malá ide do ponuky pod menom.
 */
export function PrepinacDizajnu({ velky = false }: { velky?: boolean }) {
  const [volba, setVolba] = useState<Dizajn | null>(null);
  useEffect(() => {
    setVolba(nacitajDizajn());
    const zmena = (e: Event) => setVolba((e as CustomEvent<Dizajn>).detail);
    window.addEventListener("faktero:dizajn", zmena);
    return () => window.removeEventListener("faktero:dizajn", zmena);
  }, []);

  if (velky)
    return (
      <div role="group" aria-label="Rozloženie aplikácie" className="grid gap-3 sm:grid-cols-2">
        {MOZNOSTI.map((m) => {
          const aktivna = volba === m.hodnota;
          return (
            <button
              key={m.hodnota}
              type="button"
              aria-pressed={aktivna}
              onClick={() => {
                setVolba(m.hodnota);
                void ulozDizajn(m.hodnota);
              }}
              className={`rounded-xl border-2 p-3 text-left transition ${aktivna ? "border-primary" : "border-border hover:border-primary/40"}`}
            >
              {/* Malý náhľad: pozadie, karta, tlačidlo vo farbe dizajnu. */}
              <div className="h-20 overflow-hidden rounded-lg border border-black/5" style={{ background: m.pozadie }}>
                <div className="m-2 flex h-14 gap-2">
                  <div className={`${m.pas ? "w-3" : "w-8"} rounded-md bg-white/90`} />
                  <div className="flex flex-1 flex-col justify-between rounded-md bg-white p-1.5">
                    <div className="h-1.5 w-2/3 rounded bg-black/10" />
                    <div className="h-1.5 w-1/2 rounded bg-black/10" />
                    <div className="h-3 w-12 self-end rounded" style={{ background: m.farba }} />
                  </div>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm font-medium">
                {m.popis}
                {aktivna ? <span className="text-xs text-primary">Zapnutý</span> : null}
              </div>
            </button>
          );
        })}
      </div>
    );

  return (
    <div role="group" aria-label="Rozloženie aplikácie" className="flex gap-1 rounded-md border border-border p-0.5">
      {MOZNOSTI.map((m) => {
        const aktivna = volba === m.hodnota;
        return (
          <button
            key={m.hodnota}
            type="button"
            aria-pressed={aktivna}
            onClick={() => {
              setVolba(m.hodnota);
              void ulozDizajn(m.hodnota);
            }}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-[11px] transition ${aktivna ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.farba }} />
            {m.popis}
          </button>
        );
      })}
    </div>
  );
}
