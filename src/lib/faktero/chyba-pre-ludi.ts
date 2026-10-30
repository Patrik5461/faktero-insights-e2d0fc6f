/**
 * Technické chyby → veta, z ktorej sa dá konať.
 *
 * Pri výpadku siete sa ľuďom ukazovalo „TypeError: Failed to fetch“, pri
 * preťaženom serveri „upstream error“ a pri vypršanom prihlásení „JWT
 * expired“. Hlášky vznikajú na stovkách miest (`toast.error(e.message)`),
 * preto sa neprekladajú pri zdroji, ale tu — a `toast-chyby.ts` to spraví
 * pri každom `toast.error`.
 *
 * Neznáme hlášky sa vracajú ako `null`: vlastné vety aplikácie sú zrozumiteľné
 * a zakryť ich všeobecnou vetou by bolo horšie.
 */

export const HLASKA_SIET =
  "Nepodarilo sa spojiť so serverom. Skontrolujte pripojenie na internet a skúste to znova.";
export const HLASKA_CAS = "Server neodpovedal včas. Skúste to o chvíľu znova.";
export const HLASKA_PRIVELA = "Priveľa požiadaviek za sebou. Počkajte chvíľu a skúste to znova.";
export const HLASKA_RELACIA = "Prihlásenie vypršalo. Prihláste sa znova — rozpísané údaje ostanú.";
export const HLASKA_SERVER = "Server práve neodpovedá. Skúste to o chvíľu znova.";
export const HLASKA_CHYBA =
  "Niečo sa pokazilo. Skúste to znova; ak to nepomôže, napíšte nám cez Pomoc a podporu.";

/** Slovenská veta (kľúč prekladu) pre technickú hlášku, inak null. */
export function technickaChyba(surova: unknown): string | null {
  const text = String((surova as { message?: unknown } | null)?.message ?? surova ?? "").trim();
  if (!text) return null;

  // Poradie: najprv to, čo je najkonkrétnejšie.
  // Holé čísla (429, 500) len v technickom kontexte — „limit 500 riadkov“ je veta aplikácie.
  const kod = (k: string) =>
    new RegExp(`(?:^|status|http|code|error)\\W{0,3}(?:${k})\\b`, "i").test(text);
  if (kod("429") || /too many requests|rate.?limit/i.test(text)) return HLASKA_PRIVELA;
  if (/jwt expired|invalid jwt|PGRST30[0-3]|auth session missing|refresh token/i.test(text))
    return HLASKA_RELACIA;
  if (kod("504|408") || /timed? ?out|gateway time-?out/i.test(text)) return HLASKA_CAS;
  if (
    /failed to fetch|networkerror|load failed|fetch failed|network request failed|net::ERR_|ERR_NETWORK|AbortError|operation was aborted|ECONNRESET|ECONNREFUSED|socket hang up/i.test(
      text,
    )
  )
    return HLASKA_SIET;
  if (
    kod("50[0-3]") ||
    // Stránka chyby z nginx/servera namiesto JSON-u (do toastu išlo surové HTML).
    /<html|<!doctype|<body/i.test(text) ||
    /upstream|\bPGRST\d+|internal server error|HTTPError|bad gateway|service unavailable|unexpected end of json|is not valid json|unexpected token .* json/i.test(
      text,
    )
  )
    return HLASKA_SERVER;
  if (
    /^(TypeError|ReferenceError|SyntaxError|RangeError)\b|cannot read propert|undefined is not|is not a function|\[object Object\]/i.test(
      text,
    )
  )
    return HLASKA_CHYBA;
  return null;
}
