/*
  Vyhľadávanie pri prepínaní firiem. Účtovník môže mať stovky firiem — hľadá
  sa v názve aj v IČO, bez ohľadu na diakritiku a veľké písmená.
*/

type FirmaNaHladanie = { id: string; name: string; ico?: string | null };

function bezDiakritiky(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Od koľkých firiem sa ukáže pole na hľadanie. */
export const HLADANIE_OD = 6;

/**
 * Firmy zodpovedajúce dotazu, abecedne; aktívna firma ide na začiatok.
 * Každé slovo dotazu musí sedieť — „novak bra“ nájde „Novák s.r.o., Bratislava“.
 */
export function filtrujFirmy<F extends FirmaNaHladanie>(firmy: F[], dotaz: string, aktivnaId?: string | null): F[] {
  const slova = bezDiakritiky(dotaz).split(/\s+/).filter(Boolean);
  const zodpovedaju = slova.length
    ? firmy.filter((f) => {
        const text = `${bezDiakritiky(f.name ?? "")} ${(f.ico ?? "").replace(/\s/g, "")}`;
        return slova.every((s) => text.includes(s));
      })
    : firmy;
  return [...zodpovedaju].sort((a, b) => {
    if (a.id === aktivnaId) return -1;
    if (b.id === aktivnaId) return 1;
    return (a.name ?? "").localeCompare(b.name ?? "", "sk");
  });
}
