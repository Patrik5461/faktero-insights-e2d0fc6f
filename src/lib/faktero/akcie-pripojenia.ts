/*
  Ktoré tlačidlá patria pripojeniu banky, ktoré nemá vlastnú vetvu na stránke
  Bankové účty (Tatra banka a nahratý výpis).

  Nahratý výpis (provider `import`) je len obal pre účty z nahratého súboru —
  nemá token ani súhlas. „Načítať účty“ by siahlo do Tatra banky a „Obnoviť
  súhlas“ by poslalo človeka prihlasovať sa do banky, s ktorou nič nemá.
*/
export type AkciePripojenia = {
  nacitatUcty: boolean;
  obnovitSuhlas: boolean;
  nahratVypis: boolean;
};

export function akciePripojenia(provider: string | null | undefined): AkciePripojenia {
  const import_ = provider === "import";
  return { nacitatUcty: !import_, obnovitSuhlas: !import_, nahratVypis: import_ };
}
