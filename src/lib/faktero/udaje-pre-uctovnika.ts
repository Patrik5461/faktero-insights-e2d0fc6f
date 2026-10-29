/**
 * Údaje pre účtovníka — čo z dokladu potrebuje vidieť na prvý pohľad
 * (karta vedľa náhľadu PDF). Tu sú len čisté funkcie: z riadku faktúry
 * vyberú režim DPH a stav zaúčtovania. Texty sú slovenské kľúče pre t().
 */

const OSOBITNA_UPRAVA: Record<string, string> = {
  "65": "Osobitná úprava — cestovná služba",
  "66_tovar": "Osobitná úprava — použitý tovar",
  "66_umenie": "Osobitná úprava — umelecké diela",
  "66_starozitnosti": "Osobitná úprava — zberateľské predmety a starožitnosti",
};

function osobitna(kod: unknown): string[] {
  const k = String(kod ?? "").trim();
  if (!k) return [];
  return [OSOBITNA_UPRAVA[k] ?? "Osobitná úprava"];
}

/**
 * Režim DPH vystavenej faktúry. Bežná tuzemská faktúra vráti prázdny
 * zoznam — účtovník vidí riadok len vtedy, keď je na doklade niečo iné.
 * `castPoloziekPdp` — prenesenie len pri niektorých položkách.
 */
export function rezimDphVystavenej(inv: any, castPoloziekPdp = false): string[] {
  const out: string[] = [];
  if (inv?.reverse_charge) {
    const typ = String(inv.reverse_charge_type ?? "");
    if (typ === "eu_b2b") {
      const plnenie = String(inv.eu_plnenie ?? "tovar");
      out.push(
        plnenie === "sluzba"
          ? "Služba do EÚ (prenesenie daňovej povinnosti)"
          : plnenie === "trojstranny"
            ? "Trojstranný obchod v EÚ"
            : "Dodanie tovaru do EÚ (oslobodené)",
      );
    } else if (typ === "export") {
      out.push("Vývoz mimo EÚ (oslobodené)");
    } else {
      out.push("Prenesenie daňovej povinnosti (PDP)");
    }
  } else if (castPoloziekPdp) {
    out.push("Prenesenie daňovej povinnosti pri časti položiek");
  }
  if (inv?.oss) out.push(inv.oss_country ? `OSS (${inv.oss_country})` : "OSS");
  out.push(...osobitna(inv?.osobitna_uprava));
  return out;
}

/** Režim DPH prijatej faktúry — podľa `dph_rezim`, prenesenia a odpočtu. */
export function rezimDphPrijatej(row: any): string[] {
  const out: string[] = [];
  const rezim = String(row?.dph_rezim ?? "");
  if (rezim === "samozdanenie" || (row?.reverse_charge && !rezim)) {
    out.push(
      row?.eu_plnenie === "sluzba"
        ? "Služba z EÚ (prenesenie daňovej povinnosti)"
        : "Prenesenie daňovej povinnosti (PDP)",
    );
  } else if (rezim === "nadobudnutie") out.push("Nadobudnutie tovaru z EÚ");
  else if (rezim === "dovoz") out.push("Dovoz — daň zaplatená colnému úradu");
  else if (rezim === "bez_dane") out.push("Bez dane / od neplatiteľa");
  out.push(...osobitna(row?.osobitna_uprava));
  // `odpocet: false` — DPH sa neodpočítava (napr. reprezentácia); účtovník to musí vidieť.
  if (row?.odpocet === false && Number(row?.vat_amount ?? 0) !== 0) out.push("Bez odpočtu DPH");
  return out;
}

export type StavZauctovania = {
  /** Kľúč pre t(): „Nezaúčtovaná“, „Zaúčtovaná“, „Odovzdaná do účtovníctva“. */
  text: string;
  odovzdane: boolean;
  zamknute: boolean;
  /** Dátum odovzdania alebo zaúčtovania (ISO), ak je. */
  kedy: string | null;
};

/** Ako ďaleko je doklad v účtovníctve: nezaúčtovaný → zaúčtovaný → odovzdaný. */
export function stavZauctovania(row: any): StavZauctovania {
  const odovzdane = Boolean(row?.exported_at);
  const zamknute = odovzdane || Boolean(row?.locked_at);
  if (odovzdane)
    return { text: "Odovzdaná do účtovníctva", odovzdane, zamknute, kedy: row.exported_at };
  if (row?.zauctovane_at)
    return { text: "Zaúčtovaná", odovzdane, zamknute, kedy: row.zauctovane_at };
  return { text: "Nezaúčtovaná", odovzdane, zamknute, kedy: null };
}
