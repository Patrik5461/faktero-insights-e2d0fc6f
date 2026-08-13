import { useEffect, useMemo, useRef, useState } from "react";
import { dekoduj } from "@/lib/faktero/polyline";

/**
 * Prejdená trasa na mape.
 *
 * Leaflet aj jeho štýly sa načítavajú až v efekte, teda výhradne v prehliadači.
 * Statický import by ich pretiahol aj do serverového vykreslenia, kde niet
 * `window` a stránka by spadla ešte pred prvým bodom trasy.
 *
 * Dlaždice sú z OpenStreetMap. Znamená to dve veci: bez internetu mapa
 * nenabehne (trasa je vtedy stále uložená, len ju nie je na čom ukázať)
 * a uvedenie autora je povinné — rieši ho `attribution` nižšie.
 */
export function MapaTrasy({
  route,
  vyska = 320,
}: {
  route: string | null | undefined;
  vyska?: number;
}) {
  const kam = useRef<HTMLDivElement>(null);
  const [chyba, setChyba] = useState(false);
  const body = useMemo(() => dekoduj(route), [route]);

  useEffect(() => {
    if (body.length < 2) return;
    let zrusene = false;
    let mapa: { remove: () => void } | null = null;

    (async () => {
      try {
        await import("leaflet/dist/leaflet.css");
        const L = await import("leaflet");
        if (zrusene || !kam.current) return;

        const m = L.map(kam.current, {
          // Koliesko myši patrí stránke, nie mape — inak sa pri skrolovaní
          // zoznamu jázd zrazu prihliada trasa.
          scrollWheelZoom: false,
        });
        mapa = m;

        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution:
            '© <a href="https://www.openstreetmap.org/copyright">prispievatelia OpenStreetMap</a>',
        }).addTo(m);

        const suradnice = body.map((b) => [b.lat, b.lng] as [number, number]);
        const ciara = L.polyline(suradnice, { color: "#007e46", weight: 4, opacity: 0.9 }).addTo(m);

        L.circleMarker(suradnice[0]!, {
          radius: 6,
          color: "#ffffff",
          weight: 2,
          fillColor: "#16a34a",
          fillOpacity: 1,
        })
          .addTo(m)
          .bindTooltip("Štart");

        L.circleMarker(suradnice[suradnice.length - 1]!, {
          radius: 6,
          color: "#ffffff",
          weight: 2,
          fillColor: "#dc2626",
          fillOpacity: 1,
        })
          .addTo(m)
          .bindTooltip("Cieľ");

        m.fitBounds(ciara.getBounds(), { padding: [24, 24] });
      } catch {
        setChyba(true);
      }
    })();

    return () => {
      zrusene = true;
      mapa?.remove();
    };
  }, [body]);

  if (body.length < 2) {
    return (
      <div
        className="grid place-items-center rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground"
        style={{ minHeight: 120 }}
      >
        Táto jazda trasu nemá — bola zapísaná ručne alebo vznikla ešte predtým, ako sa trasy začali
        ukladať.
      </div>
    );
  }

  if (chyba) {
    return (
      <div
        className="grid place-items-center rounded-xl border border-border p-6 text-center text-sm text-muted-foreground"
        style={{ minHeight: 120 }}
      >
        Mapu sa nepodarilo načítať. Trasa je uložená, skúste to znova s pripojením na internet.
      </div>
    );
  }

  return (
    <div
      ref={kam}
      className="w-full overflow-hidden rounded-xl border border-border"
      style={{ height: vyska }}
    />
  );
}
