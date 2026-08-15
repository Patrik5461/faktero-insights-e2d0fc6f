/**
 * Ktorá verzia appky je v obchode.
 *
 * Prečo endpoint a nie statický súbor: appka beží na `capacitor://localhost`,
 * takže každé volanie na `www.faktero.sk` je cudzí pôvod. Statický súbor
 * hlavičky CORS neposiela a prehliadač vo WebView ho odmietne — kontrola verzie
 * by v telefóne nikdy neprebehla a nikto by sa to nedozvedel, lebo zlyhanie sa
 * ticho prehltne.
 *
 * Hodnoty sú v `public/mobil-verzia.json`; pečiatku tam zapisuje
 * `npm run build:mobile`, prepínač `zverejnene` sa prepína ručne po schválení.
 */
import { createFileRoute } from "@tanstack/react-router";
import verzia from "../../../../../public/mobil-verzia.json";

const HLAVICKY = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "GET,OPTIONS",
  // Appka sa pýta pri každom štarte; minúta stačí, aby to nešlo zakaždým až do
  // súboru, a zároveň sa nová verzia rozniesla rýchlo.
  "cache-control": "public, max-age=60",
};

export const Route = createFileRoute("/api/public/mobil/verzia")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: HLAVICKY }),
      GET: async () =>
        new Response(
          JSON.stringify({
            peciatka: verzia.peciatka ?? "",
            zverejnene: verzia.zverejnene === true,
            odkaz: verzia.odkaz ?? "",
          }),
          { status: 200, headers: HLAVICKY },
        ),
    },
  },
});
