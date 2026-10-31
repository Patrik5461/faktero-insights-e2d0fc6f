/**
 * Jazyk v adrese (`?lang=de`) a odkazy hreflang pre vyhľadávače.
 *
 * Voľba jazyka je inak v cookie — robot Googlu však cookie nemá, takže by
 * nemeckú ani českú verziu webu nikdy nevidel. Preto má každá verejná stránka
 * aj adresu s `?lang=cs` / `?lang=de`: parameter prebije cookie, stránka sa
 * vykreslí v danom jazyku a prehliadač si voľbu zapamätá do cookie.
 *
 * Odkazy hreflang a kanonická adresa sa skladajú v hlavičke centrálne
 * (`upravZnackyHlavicky`) — z kanonickej adresy, ktorú má každá verejná
 * stránka. Stránka bez kanonickej adresy (aplikácia za prihlásením) žiadne
 * hreflang nedostane.
 */
import { JAZYKY, jeJazyk, type Jazyk } from "./jazyk";

export const PARAM_JAZYKA = "lang";

/** Jazyk z časti adresy za `?` (alebo z celej adresy), inak null. */
export function jazykZAdresy(adresa: string | null | undefined): Jazyk | null {
  if (!adresa) return null;
  const i = adresa.indexOf("?");
  const search = i >= 0 ? adresa.slice(i + 1).split("#")[0] : "";
  const v = new URLSearchParams(search).get(PARAM_JAZYKA);
  return jeJazyk(v) ? v : null;
}

/** Adresa stránky v danom jazyku — slovenčina je bez parametra. */
export function adresaVJazyku(kanonicka: string, jazyk: Jazyk): string {
  const u = new URL(kanonicka);
  if (jazyk === "sk") u.searchParams.delete(PARAM_JAZYKA);
  else u.searchParams.set(PARAM_JAZYKA, jazyk);
  return u.toString();
}

/** hreflang odkazy (sk, cs, de a x-default = slovenčina). */
export function odkazyJazykov(kanonicka: string): { hrefLang: string; href: string }[] {
  return [
    ...JAZYKY.map((j) => ({ hrefLang: j.kod, href: adresaVJazyku(kanonicka, j.kod) })),
    { hrefLang: "x-default", href: adresaVJazyku(kanonicka, "sk") },
  ];
}

type Znacka = { tag: string; attrs?: Record<string, unknown>; children?: unknown };

/**
 * Kanonická adresa ukazuje na seba v jazyku stránky (inak by Google bral
 * nemeckú verziu za kópiu slovenskej a hreflang zahodil) a hneď za ňou idú
 * odkazy na všetky jazykové verzie.
 */
export function upravZnackyHlavicky<T extends Znacka>(znacky: T[], jazyk: Jazyk): T[] {
  const von: T[] = [];
  for (const z of znacky) {
    const a = z.attrs;
    if (z.tag !== "link" || a?.rel !== "canonical" || typeof a.href !== "string") {
      von.push(z);
      continue;
    }
    let kanonicka: string;
    try {
      kanonicka = adresaVJazyku(a.href, "sk");
    } catch {
      von.push(z);
      continue;
    }
    von.push({ ...z, attrs: { ...a, href: adresaVJazyku(kanonicka, jazyk) } });
    for (const o of odkazyJazykov(kanonicka))
      von.push({ tag: "link", attrs: { rel: "alternate", ...o } } as unknown as T);
  }
  return von;
}
