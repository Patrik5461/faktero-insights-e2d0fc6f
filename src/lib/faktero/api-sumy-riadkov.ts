/*
  Sumy riadkov faktúry z API, keď ich klient (e-shop) pošle sám.

  Pošle buď obe (`subtotal` aj `vat_amount`) pri všetkých riadkoch, alebo pri
  žiadnom — mix by dal faktúru, ktorej súčty sa počítajú dvoma spôsobmi.
  Prijmú sa len vtedy, keď sedia s cenou a sadzbou: základ najviac o cent
  od množstvo × cena, DPH najviac o dva centy od základ × sadzba (rozdiel
  zaokrúhlenia nezaokrúhleného a zaokrúhleného základu).
*/
type Riadok = {
  quantity: number;
  unit_price: number;
  vat_rate: number;
  subtotal?: number;
  vat_amount?: number;
};

type Sumy = {
  subtotal: number;
  vat_total: number;
  total: number;
  enriched: { subtotal: number; vat_amount: number; total: number }[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function sumyRiadkov(riadky: Riadok[]): { sumy: Sumy | null } | { chyba: string } {
  const s = riadky.filter((r) => r.subtotal !== undefined || r.vat_amount !== undefined).length;
  if (s === 0) return { sumy: null };
  if (
    s !== riadky.length ||
    riadky.some((r) => r.subtotal === undefined || r.vat_amount === undefined)
  ) {
    return {
      chyba: "subtotal a vat_amount treba poslať pri všetkých položkách, alebo pri žiadnej.",
    };
  }
  const enriched: Sumy["enriched"] = [];
  for (const [i, r] of riadky.entries()) {
    const zaklad = r2(r.subtotal!);
    const dan = r2(r.vat_amount!);
    // Cena sa ukladá na 5 desatinných miest; pri veľkom množstve sa jej
    // zaokrúhlenie násobí, preto tolerancia rastie s množstvom.
    if (Math.abs(zaklad - r.quantity * r.unit_price) > 0.011 + r.quantity * 0.000005) {
      return { chyba: `Položka ${i + 1}: subtotal ${zaklad} nesedí s množstvom × cenou.` };
    }
    if (Math.abs(dan - (zaklad * r.vat_rate) / 100) > 0.021) {
      return { chyba: `Položka ${i + 1}: vat_amount ${dan} nesedí so sadzbou ${r.vat_rate} %.` };
    }
    enriched.push({ subtotal: zaklad, vat_amount: dan, total: r2(zaklad + dan) });
  }
  const subtotal = r2(enriched.reduce((a, e) => a + e.subtotal, 0));
  const vat_total = r2(enriched.reduce((a, e) => a + e.vat_amount, 0));
  return { sumy: { subtotal, vat_total, total: r2(subtotal + vat_total), enriched } };
}
