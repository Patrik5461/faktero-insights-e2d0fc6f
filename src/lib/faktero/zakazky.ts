/**
 * Zákazky — vyhodnotenie nákladov a výnosov.
 *
 * Celý výpočet je zámerne čistý: vstupom sú riadky tak, ako prídu z databázy,
 * výstupom sú čísla. Vďaka tomu sa dá otestovať bez databázy a tie testy sú
 * jediné miesto, kde sa dá zachytiť tichý omyl typu „zálohová faktúra sa
 * započítala do výnosov dvakrát".
 */

export type StavZakazky = "active" | "closed" | "cancelled";

export const STAV_ZAKAZKY_POPIS: Record<StavZakazky, string> = {
  active: "Otvorená",
  closed: "Uzavretá",
  cancelled: "Zrušená",
};

export function cislo(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Peniaze držíme na centoch; bez toho sa v súčtoch objaví 1234.5600000000001. */
export function centy(n: number): number {
  return Math.round(cislo(n) * 100) / 100;
}

export type FakturaRiadok = {
  type?: string | null;
  status?: string | null;
  subtotal?: unknown;
  deleted_at?: string | null;
};

export type PrijataFakturaRiadok = {
  amount_without_vat?: unknown;
  deleted_at?: string | null;
};

export type PohybRiadok = {
  type?: string | null;
  quantity?: unknown;
  unit_cost?: unknown;
  total_value?: unknown;
};

export type JazdaRiadok = {
  fuel_consumption?: unknown;
  fuel_price?: unknown;
};

/**
 * Výnos zo zákazky. Zálohová (proforma) faktúra sa nezapočítava — je to výzva
 * na zaplatenie preddavku, nie plnenie, a po vystavení vyúčtovacej faktúry by
 * sa tá istá suma objavila vo výnosoch dvakrát. Dobropis výnos znižuje.
 */
export function vynosZFaktury(f: FakturaRiadok): number {
  if (f.deleted_at) return 0;
  if (f.status === "cancelled" || f.status === "draft") return 0;
  if (f.type === "proforma") return 0;
  const suma = cislo(f.subtotal);
  return f.type === "credit_note" ? -Math.abs(suma) : suma;
}

/**
 * Náklad z jedného skladového pohybu, ocenený váženou nákupnou cenou
 * (`unit_cost`). Predajná cena sem nepatrí — tá je vo faktúre na strane výnosov
 * a keby sa použila aj tu, zisk zákazky by vyšiel vždy nula.
 *
 * Pohyb dovnútra skladu pripnutý na zákazku je vrátenie nespotrebovaného
 * materiálu, takže náklad znižuje.
 */
export function nakladZPohybu(p: PohybRiadok): number {
  const mnozstvo = Math.abs(cislo(p.quantity));
  const jednotkova = cislo(p.unit_cost);
  // `total_value` je uložené v predajnej cene pri výdaji cez faktúru, takže je
  // to naozaj len záchrana pre pohyby spred oceňovania, kde `unit_cost` chýba.
  const hodnota = jednotkova > 0 ? jednotkova * mnozstvo : Math.abs(cislo(p.total_value));

  switch (p.type) {
    case "vydaj":
    case "faktura":
      return hodnota;
    case "prijem":
    case "dobropis":
      return -hodnota;
    default:
      // `oprava` a `inventura` sú opravy stavu skladu, nie spotreba na zákazke.
      return 0;
  }
}

/**
 * Náklad na jazdu.
 *
 * `trips.fuel_consumption` NIE JE spotreba na 100 km, hoci to tak znie — je to
 * počet litrov spotrebovaných na tej jazde. Formuláre aj API ho počítajú ako
 * `km × spotreba vozidla / 100` a až tento súčin ukladajú. Cena za jazdu je
 * preto litre × cena paliva; deliť stovkou znova by náklad podstrelilo stokrát.
 */
export function nakladZJazdy(j: JazdaRiadok): number {
  const litre = cislo(j.fuel_consumption);
  const cenaPaliva = cislo(j.fuel_price);
  if (litre <= 0 || cenaPaliva <= 0) return 0;
  return litre * cenaPaliva;
}

export type VyhodnotenieVstup = {
  faktury?: FakturaRiadok[];
  prijateFaktury?: PrijataFakturaRiadok[];
  pohyby?: PohybRiadok[];
  jazdy?: JazdaRiadok[];
  planovanyVynos?: unknown;
  planovanyNaklad?: unknown;
};

export type Vyhodnotenie = {
  vynosy: number;
  naklady: number;
  naklad_material: number;
  naklad_sluzby: number;
  naklad_doprava: number;
  zisk: number;
  /** Marža v percentách z výnosov; `null`, keď zatiaľ nie je z čoho počítať. */
  marza: number | null;
  planovany_vynos: number | null;
  planovany_naklad: number | null;
  planovany_zisk: number | null;
  /** Koľko percent plánovaného výnosu je už vyfakturované. */
  plnenie_vynosu: number | null;
  /** Koľko percent plánovaného nákladu je už vyčerpané. */
  cerpanie_nakladu: number | null;
};

function plan(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function vyhodnotZakazku(vstup: VyhodnotenieVstup): Vyhodnotenie {
  const vynosy = centy((vstup.faktury ?? []).reduce((s, f) => s + vynosZFaktury(f), 0));

  const naklad_material = centy((vstup.pohyby ?? []).reduce((s, p) => s + nakladZPohybu(p), 0));
  const naklad_sluzby = centy(
    (vstup.prijateFaktury ?? []).reduce(
      (s, f) => s + (f.deleted_at ? 0 : cislo(f.amount_without_vat)),
      0,
    ),
  );
  const naklad_doprava = centy((vstup.jazdy ?? []).reduce((s, j) => s + nakladZJazdy(j), 0));

  const naklady = centy(naklad_material + naklad_sluzby + naklad_doprava);
  const zisk = centy(vynosy - naklady);

  const planovany_vynos = plan(vstup.planovanyVynos);
  const planovany_naklad = plan(vstup.planovanyNaklad);

  return {
    vynosy,
    naklady,
    naklad_material,
    naklad_sluzby,
    naklad_doprava,
    zisk,
    // Marža zo záporných výnosov (samý dobropis) nedáva zmysel a vyšla by
    // s obráteným znamienkom, čo by v prehľade vyzeralo ako zisk.
    marza: vynosy > 0 ? Math.round((zisk / vynosy) * 1000) / 10 : null,
    planovany_vynos,
    planovany_naklad,
    planovany_zisk:
      planovany_vynos != null && planovany_naklad != null
        ? centy(planovany_vynos - planovany_naklad)
        : null,
    plnenie_vynosu:
      planovany_vynos != null && planovany_vynos > 0
        ? Math.round((vynosy / planovany_vynos) * 1000) / 10
        : null,
    cerpanie_nakladu:
      planovany_naklad != null && planovany_naklad > 0
        ? Math.round((naklady / planovany_naklad) * 1000) / 10
        : null,
  };
}

/** Prekročený rozpočet je to, čo chce mať človek na zozname zvýraznené. */
export function prekrocenyRozpocet(v: Vyhodnotenie): boolean {
  return v.planovany_naklad != null && v.planovany_naklad > 0 && v.naklady > v.planovany_naklad;
}
