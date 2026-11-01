/*
  Pre ktoré firmy sa stiahne balíček konektora Pohody. Kľúč smie vydať len
  majiteľ alebo admin firmy (server `pripravKonektorFn` to stráži).

  - E-08: bez takej firmy tlačidlo nemá zmysel — stránka povie prečo.
  - E-09: keď je jediná admin firma iná než otvorená, zoznam sa ukáže aj pri
    jednej firme, aby bolo vidieť, pre ktorú sa balíček stiahne.
*/
export type FirmaKonektora = { id: string; name?: string | null; role?: string | null };

export function vyberKonektora(
  vsetky: readonly FirmaKonektora[],
  otvorena: string,
): { firmy: FirmaKonektora[]; vybrane: string[]; ukazZoznam: boolean; nesmie: boolean } {
  const firmy = vsetky.filter((f) => f.role === "owner" || f.role === "admin");
  return {
    firmy,
    // Kto vedie viac firiem, dostane ich v jednom balíčku (jeden kľúč).
    vybrane: firmy.map((f) => f.id),
    ukazZoznam: firmy.length > 1 || (firmy.length === 1 && firmy[0]!.id !== otvorena),
    nesmie: firmy.length === 0,
  };
}
