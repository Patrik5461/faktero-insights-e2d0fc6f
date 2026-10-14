/** Názov roly v firme, ako ho vidí človek — v databáze sú anglické kľúče. */
export const ROLA_POPIS: Record<string, string> = {
  owner: "Majiteľ",
  admin: "Administrátor",
  accountant: "Účtovník",
  employee: "Používateľ",
  custom: "Vlastný prístup",
};

export const popisRoly = (rola: string | null | undefined) =>
  (rola && ROLA_POPIS[rola]) || rola || "—";
