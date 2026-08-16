/**
 * Súčty bankových pohybov za vybrané obdobie — čistá časť.
 *
 * Sčítava sa **po menách**. Jedno pripojenie do Tatra banky sprístupňuje aj
 * účty vedené inde a medzi nimi býva korunový; spočítať eurá s korunami by dalo
 * číslo, ktoré nič neznamená. Znamienko rozhoduje o smere: banka posiela
 * odchádzajúce platby ako záporné sumy.
 */

export type PohybNaSucet = { amount: number | string | null; currency?: string | null };

export type SucetMeny = {
  currency: string;
  prijate: number;
  odoslane: number;
  pocetPrijatych: number;
  pocetOdoslanych: number;
  /** Prijaté mínus odoslané — o koľko účet za obdobie narástol. */
  rozdiel: number;
};

function centy(n: number): number {
  return Math.round(n * 100) / 100;
}

export function spocitajPohyby(riadky: PohybNaSucet[]): SucetMeny[] {
  const podlaMeny = new Map<string, SucetMeny>();
  for (const r of riadky) {
    const suma = Number(r.amount);
    if (!Number.isFinite(suma) || suma === 0) continue;
    const mena = (r.currency ?? "EUR") || "EUR";
    let s = podlaMeny.get(mena);
    if (!s) {
      s = {
        currency: mena,
        prijate: 0,
        odoslane: 0,
        pocetPrijatych: 0,
        pocetOdoslanych: 0,
        rozdiel: 0,
      };
      podlaMeny.set(mena, s);
    }
    if (suma > 0) {
      s.prijate += suma;
      s.pocetPrijatych += 1;
    } else {
      // Odoslané sa držia ako kladné číslo — v súhrne sa ukazuje objem, nie znamienko.
      s.odoslane += -suma;
      s.pocetOdoslanych += 1;
    }
  }
  return [...podlaMeny.values()]
    .map((s) => ({
      ...s,
      prijate: centy(s.prijate),
      odoslane: centy(s.odoslane),
      rozdiel: centy(s.prijate - s.odoslane),
    }))
    .sort((a, b) => b.prijate + b.odoslane - (a.prijate + a.odoslane));
}
