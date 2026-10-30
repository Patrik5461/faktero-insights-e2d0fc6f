/**
 * Kanonická adresa verejnej stránky. Web beží na `www.faktero.sk` (mapa
 * stránok, robots.txt), no odpovedá aj na `faktero.sk` — bez kanonickej
 * adresy by vyhľadávač videl každú stránku dvakrát.
 */
export const WEB = "https://www.faktero.sk";

export function kanonicka(cesta: string) {
  return [{ rel: "canonical", href: WEB + (cesta.startsWith("/") ? cesta : `/${cesta}`) }];
}
