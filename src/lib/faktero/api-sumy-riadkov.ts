/*
  Sumy riadkov faktúry z API, keď ich klient (e-shop) pošle sám.

  Pošle buď obe (`subtotal` aj `vat_amount`) pri všetkých riadkoch, alebo pri
  žiadnom — mix by dal faktúru, ktorej súčty sa počítajú dvoma spôsobmi.
  Prijmú sa len vtedy, keď sedia s cenou a sadzbou: základ najviac o cent
  od množstvo × cena, DPH najviac o dva centy od základ × sadzba (rozdiel
  zaokrúhlenia nezaokrúhleného a zaokrúhleného základu).
*/
import { koeficientZlavy, percentoZlavy, sumaZlavyDokladu, zakladRiadku } from "./zlavy";

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

/* ---------------- súčty faktúry z API so zľavou a prenesením ---------------- */

export type PolozkaApi = Riadok & {
  /** Zľava riadku v % — jednotková cena ostáva pôvodná, zľava je v základe riadku. */
  discount_percent?: number;
  /** Prenesenie daňovej povinnosti len pri tejto položke (napr. stavebné práce). */
  prenesenie?: boolean;
};

export type NastaveniaApi = {
  reverse_charge?: boolean;
  discount_type?: "percent" | "amount" | null;
  discount_value?: number;
};

export type RiadokNaZapisApi = {
  unit_price: number;
  discount_percent: number;
  vat_rate: number;
  prenesenie: boolean;
  subtotal: number;
  vat_amount: number;
  total: number;
};

export type SumyFakturyApi = {
  subtotal: number;
  vat_total: number;
  total: number;
  discount_type: "percent" | "amount" | null;
  discount_value: number;
  discount_total: number;
  riadky: RiadokNaZapisApi[];
};

/**
 * Súčty a riadky faktúry z verejného API tak, ako ich počíta formulár na webe
 * (`faktura-formular-sumy.ts`): zľava riadku je v jeho základe, zľava na celý
 * doklad len v hlavičke (pomerne cez všetky sadzby) a pri prenesení daňovej
 * povinnosti je DPH nula — databázový spúšťač by inak faktúru odmietol.
 *
 * Presné sumy z obchodu (`subtotal` + `vat_amount`) sa s riadkovou zľavou,
 * zľavou na doklad ani nenulovou DPH pri prenesení nekombinujú — obchod ich
 * už má započítané po svojom a dvojitý prepočet by dal iný cent.
 */
export function sumyFakturyApi(
  polozky: PolozkaApi[],
  n: NastaveniaApi = {},
): { sumy: SumyFakturyApi } | { chyba: string } {
  const rc = n.reverse_charge === true;
  const presne = sumyRiadkov(polozky);
  if ("chyba" in presne) return presne;
  const maZlavuDokladu = !!n.discount_type && Number(n.discount_value ?? 0) > 0;
  if (presne.sumy) {
    if (maZlavuDokladu || polozky.some((p) => Number(p.discount_percent ?? 0) > 0))
      return {
        chyba:
          "S presnými sumami (subtotal, vat_amount) nepošlite zľavu — započítajte ju do súm položiek.",
      };
    const i = polozky.findIndex(
      (p, k) => (rc || p.prenesenie) && presne.sumy!.enriched[k].vat_amount !== 0,
    );
    if (i >= 0)
      return {
        chyba: `Položka ${i + 1}: pri prenesení daňovej povinnosti musí byť vat_amount 0.`,
      };
    return {
      sumy: {
        subtotal: presne.sumy.subtotal,
        vat_total: presne.sumy.vat_total,
        total: presne.sumy.total,
        discount_type: null,
        discount_value: 0,
        discount_total: 0,
        riadky: polozky.map((p, k) => ({
          unit_price: p.unit_price,
          discount_percent: 0,
          vat_rate: rc || p.prenesenie ? 0 : p.vat_rate,
          prenesenie: !rc && !!p.prenesenie,
          ...presne.sumy!.enriched[k],
        })),
      },
    };
  }
  // Rovnaký výpočet ako formulár webu so zaokrúhlením po položkách.
  const riadky = polozky.map((p) => {
    const z = zakladRiadku(p.quantity, p.unit_price, p.discount_percent);
    const sadzba = rc || p.prenesenie ? 0 : Number(p.vat_rate);
    const zaklad = r2(z);
    const dan = r2((z * sadzba) / 100);
    return {
      unit_price: p.unit_price,
      discount_percent: percentoZlavy(p.discount_percent),
      vat_rate: sadzba,
      prenesenie: !rc && !!p.prenesenie,
      subtotal: zaklad,
      vat_amount: dan,
      total: r2(zaklad + dan),
    };
  });
  let sub = riadky.reduce((a, x) => a + x.subtotal, 0);
  let dph = riadky.reduce((a, x) => a + x.vat_amount, 0);
  const zlava = sumaZlavyDokladu(sub, {
    typ: n.discount_type ?? null,
    hodnota: Number(n.discount_value ?? 0),
  });
  if (zlava > 0) {
    const k = koeficientZlavy(sub, zlava);
    sub *= k;
    dph *= k;
  }
  const subtotal = r2(sub);
  const vat_total = r2(dph);
  return {
    sumy: {
      subtotal,
      vat_total,
      // Hlavička musí sedieť sama so sebou: celkom = základ + DPH na cent.
      total: r2(subtotal + vat_total),
      discount_type: zlava > 0 ? (n.discount_type ?? "percent") : null,
      discount_value: zlava > 0 ? Number(n.discount_value) : 0,
      discount_total: zlava,
      riadky,
    },
  };
}
