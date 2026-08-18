/**
 * Hlavičky CORS pre volania zo zabalenej appky.
 *
 * Appka beží na vlastnom pôvode (`capacitor://localhost`, na Androide
 * `https://localhost`), takže každé volanie na `www.faktero.sk` je cudzí pôvod.
 * Bez týchto hlavičiek prehliadač vo WebView požiadavku ani neodošle a appka
 * dostane len holé „Load failed" — z ktorého sa príčina uhádnuť nedá.
 *
 * Býva to na jednom mieste preto, že endpointov, ktoré appka volá, pribúda a
 * kópia pravidiel v každom z nich znamená, že na jednom sa raz zabudne.
 */

/**
 * Púšťajú sa len pôvody našej appky a lokálneho vývoja. Cookies sa neposielajú —
 * prihlásenie ide tokenom v hlavičke, takže cudzia stránka by z adresy nič
 * nezískala.
 */
export function povolenyPovod(origin: string | null): string | null {
  if (!origin) return null;
  if (/^(capacitor|ionic):\/\/localhost$/.test(origin)) return origin;
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return origin;
  if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return origin;
  return null;
}

export function sCors(odpoved: Response, origin: string | null): Response {
  const povoleny = povolenyPovod(origin);
  if (!povoleny) return odpoved;
  const h = new Headers(odpoved.headers);
  h.set("access-control-allow-origin", povoleny);
  h.set("vary", "origin");
  h.set("access-control-allow-headers", "authorization, content-type");
  h.set("access-control-allow-methods", "POST, OPTIONS");
  h.set("access-control-max-age", "86400");
  return new Response(odpoved.body, { status: odpoved.status, headers: h });
}
