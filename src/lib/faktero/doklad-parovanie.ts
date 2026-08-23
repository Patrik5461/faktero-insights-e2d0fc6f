import { normMeno, normVs } from "./parovanie";

/**
 * Párovanie naskenovaných dokladov s pohybmi na účte.
 *
 * Iná úloha než párovanie faktúr, hoci vyzerá rovnako. Rozdiely, ktoré ju
 * riadia:
 *
 * - **Doklad platený hotovosťou sa nepáruje nikdy.** V banke sa neobjaví, tak
 *   preň niet čo hľadať. Vie sa to už pri skenovaní z prepínača úhrady.
 * - **Suma musí sedieť na cent.** Bloček sa neplatí po častiach; iná suma
 *   znamená iný nákup, nie čiastočnú úhradu.
 * - **Pohyb príde neskôr než doklad.** Platba kartou sa zúčtuje spravidla o deň
 *   až tri, preto sa hľadá v okne *po* dátume dokladu. Skorší pohyb to byť
 *   nemôže.
 * - Sama suma nestačí. Bločky sú malé opakujúce sa čiastky a za týždeň ich
 *   sedí na seba niekoľko — istota je len vtedy, keď sedí aj meno obchodníka
 *   alebo variabilný symbol.
 *
 * Nič sa nepáruje potichu: isté dvojice sa ponúknu ako hotové, ostatné ako
 * návrhy, a keď dve možnosti sedia rovnako dobre, nerozhoduje sa za človeka.
 */

export type Pohyb = {
  id: string;
  booking_date: string;
  /** Záporná suma je odchádzajúca platba. */
  amount: number;
  currency: string;
  variable_symbol: string | null;
  counterparty: string | null;
  description: string | null;
};

export type Vydavok = {
  id: string;
  supplier_name: string | null;
  document_number: string | null;
  issue_date: string | null;
  total_amount: number | null;
  currency: string | null;
  payment_method: string | null;
};

export type ZhodaDokladu = {
  transactionId: string;
  expenseId: string;
  skore: number;
  istota: "auto" | "navrh";
  dovody: string[];
};

/** Karta sa zúčtuje spravidla do troch dní; päť je strop aj pre víkend. */
const OKNO_DNI = 5;
/** Prevod odchádza v deň zadania alebo hneď nasledujúci pracovný deň. */
const OKNO_DNI_PREVOD = 3;

function zaokruhli(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function dni(neskorsi: string, skorsi: string): number | null {
  const a = Date.parse(neskorsi);
  const b = Date.parse(skorsi);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((a - b) / 86400000);
}

function menaSedia(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normMeno(a);
  const y = normMeno(b);
  if (!x || !y || x.length < 3 || y.length < 3) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/** Sedí meno dodávateľa na protistranu alebo na popis pohybu? */
export function dodavatelSedi(p: Pohyb, v: Vydavok): boolean {
  return menaSedia(p.counterparty, v.supplier_name) || menaSedia(p.description, v.supplier_name);
}

/**
 * Nakoľko pohyb sedí na doklad. `null` znamená, že spolu súvisieť nemôžu —
 * vtedy sa dvojica ani neponúka.
 */
export function ohodnotDoklad(
  p: Pohyb,
  v: Vydavok,
): Omit<ZhodaDokladu, "transactionId" | "expenseId"> | null {
  // Doklad je náklad, teda odchádzajúca platba. Prichádzajúca k nemu nepatrí.
  if (p.amount >= 0) return null;
  if (v.payment_method === "hotovost") return null;
  if (v.total_amount == null || v.total_amount <= 0) return null;
  if ((p.currency || "EUR") !== (v.currency || "EUR")) return null;
  if (!v.issue_date) return null;

  // Suma na cent, inak je to iný nákup.
  if (Math.abs(zaokruhli(Math.abs(p.amount)) - zaokruhli(v.total_amount)) >= 0.005) return null;

  const odstup = dni(p.booking_date, v.issue_date);
  if (odstup === null || odstup < 0) return null;
  const okno = v.payment_method === "prevod" ? OKNO_DNI_PREVOD : OKNO_DNI;
  if (odstup > okno) return null;

  const dovody: string[] = ["suma sedí na cent"];
  let skore = 0.4;
  let rozpoznany = false;

  const vs = normVs(p.variable_symbol);
  const cislo = normVs(v.document_number);
  if (vs.length >= 3 && cislo.length >= 3 && vs === cislo) {
    skore += 0.4;
    rozpoznany = true;
    dovody.push(`variabilný symbol ${p.variable_symbol} sedí na doklad`);
  } else if (dodavatelSedi(p, v)) {
    skore += 0.35;
    rozpoznany = true;
    dovody.push(`platba pre ${v.supplier_name}`);
  }

  if (odstup === 0) {
    skore += 0.15;
    dovody.push("zúčtované v deň dokladu");
  } else {
    skore += odstup <= 3 ? 0.1 : 0.05;
    dovody.push(`zúčtované o ${odstup} ${odstup === 1 ? "deň" : "dni"} neskôr`);
  }

  return {
    skore: zaokruhli(skore),
    // Bez mena aj bez symbolu je to len zhoda sumy — na to sa spoliehať nedá.
    istota: rozpoznany ? "auto" : "navrh",
    dovody,
  };
}

/**
 * Rozdelí pohyby a doklady na dvojice.
 *
 * Jeden pohyb uhradí najviac jeden doklad a jeden doklad je uhradený najviac
 * raz. Keď na doklad sedia dva rovnako dobré pohyby, ani jeden sa neoznačí za
 * istý — obidva idú do návrhov a rozhodne človek.
 */
export function sparujDoklady(pohyby: Pohyb[], vydavky: Vydavok[]): ZhodaDokladu[] {
  const vsetky: ZhodaDokladu[] = [];
  for (const p of pohyby) {
    for (const v of vydavky) {
      const o = ohodnotDoklad(p, v);
      if (o) vsetky.push({ transactionId: p.id, expenseId: v.id, ...o });
    }
  }

  // Najsilnejšie dvojice ako prvé; pri rovnakom skóre rozhoduje bližší dátum,
  // ktorý je už v skóre, takže poradie je stabilné.
  vsetky.sort((a, b) => b.skore - a.skore);

  const pouzitePohyby = new Set<string>();
  const pouziteDoklady = new Set<string>();
  const vysledok: ZhodaDokladu[] = [];

  for (const z of vsetky) {
    if (pouzitePohyby.has(z.transactionId) || pouziteDoklady.has(z.expenseId)) continue;

    // Sedí na ten istý doklad ešte niečo rovnako dobré? Potom to nie je istota.
    const rovnakoDobra = vsetky.some(
      (i) =>
        i !== z &&
        i.expenseId === z.expenseId &&
        !pouzitePohyby.has(i.transactionId) &&
        Math.abs(i.skore - z.skore) < 0.001,
    );

    pouzitePohyby.add(z.transactionId);
    pouziteDoklady.add(z.expenseId);
    vysledok.push(
      rovnakoDobra
        ? {
            ...z,
            istota: "navrh",
            dovody: [...z.dovody, "rovnako dobre sedí aj iný pohyb — rozhodnite ručne"],
          }
        : z,
    );
  }

  return vysledok;
}
