/**
 * Zostatky bankových účtov po menách.
 *
 * Firma môže mať účty vo viacerých menách (MaxiTicket má EUR, CZK aj HUF).
 * Sčítať ich do jedného čísla nemá zmysel — 14 927 Kč nie je 14 927 € — preto
 * sa súčty držia oddelene po menách a kurzom sa nič neprepočítava; kurz by bol
 * odhad a účtovník potrebuje to, čo je naozaj na účte.
 */

export type UcetSoZostatkom = {
  currency?: string | null;
  balance?: unknown;
};

export type ZostatokVMene = { mena: string; suma: number };

function cislo(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function normalizujMenu(mena: string | null | undefined): string {
  const m = (mena ?? "").trim().toUpperCase();
  return m || "EUR";
}

/**
 * Súčty zostatkov po menách. EUR ide vždy prvé (domáca mena), zvyšok podľa
 * abecedy, aby sa poradie nemenilo podľa toho, ktorý účet sa načítal skôr.
 */
export function zostatkyPodlaMien(ucty: UcetSoZostatkom[] | null | undefined): ZostatokVMene[] {
  const mapa = new Map<string, number>();
  for (const u of ucty ?? []) {
    const mena = normalizujMenu(u.currency);
    mapa.set(mena, (mapa.get(mena) ?? 0) + cislo(u.balance));
  }
  return [...mapa.entries()]
    .map(([mena, suma]) => ({ mena, suma: Math.round(suma * 100) / 100 }))
    .sort((a, b) => {
      if (a.mena === b.mena) return 0;
      if (a.mena === "EUR") return -1;
      if (b.mena === "EUR") return 1;
      return a.mena.localeCompare(b.mena);
    });
}

/** Formátovanie sumy v mene účtu. Neznámu menu Intl odmieta, preto poistka. */
export function formatujSumu(suma: number, mena: string | null | undefined): string {
  const m = normalizujMenu(mena);
  try {
    return new Intl.NumberFormat("sk-SK", { style: "currency", currency: m }).format(suma);
  } catch {
    return `${new Intl.NumberFormat("sk-SK", { minimumFractionDigits: 2 }).format(suma)} ${m}`;
  }
}

/**
 * Zaúčtovaný zostatok sa ukazuje len vtedy, keď sa od disponibilného líši —
 * inak by bolo na obrazovke dvakrát to isté číslo.
 */
export function zobrazitZauctovany(
  balance: unknown,
  booked: unknown,
): { zobrazit: boolean; suma: number } {
  if (booked === null || booked === undefined || booked === "") return { zobrazit: false, suma: 0 };
  const b = Number(booked);
  if (!Number.isFinite(b)) return { zobrazit: false, suma: 0 };
  const rozdiel = Math.abs(b - cislo(balance)) >= 0.005;
  return { zobrazit: rozdiel, suma: b };
}
