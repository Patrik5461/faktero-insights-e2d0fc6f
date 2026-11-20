/**
 * Ten istý pohyb pod inou referenciou.
 *
 * Tatra banka pri účtoch z iných bánk (SLSP, ČSOB, VÚB… cez multibanking)
 * nemusí pri novom súhlase vrátiť to isté `transactionId`. U Tobify 19. 11.
 * 2026 prišli po obnove súhlasu tie isté pohyby s číselnou referenciou
 * (napr. `8532182`), hoci rovnaké pohyby už ležali v databáze s referenciou,
 * ktorú predtým dala pôvodná banka (`TRN14107400520`, 56-znakový hex). Strážca
 * podľa referencie ich teda nespoznal a výpisy ukázali platby dvakrát.
 *
 * Referencia preto nie je jediný dôkaz. Kandidát na „ten istý pohyb" je riadok
 * účtu, ktorého referenciu banka v tomto sťahovaní **nevrátila** (prišiel pod
 * inou schémou, z mailu alebo z nahratého výpisu). Pohyb z banky sa s ním
 * stotožní, keď sedí deň zaúčtovania, suma na cent a VS aj IBAN protistrany
 * si neprotirečia (rovnaké alebo jedno chýba). Párovanie je 1 : 1 — dve
 * rovnaké platby v ten istý deň sa tak nezlejú do jednej.
 */

export type PohybZBanky = {
  transaction_reference: string | null;
  booking_date: string;
  amount: number;
  variable_symbol: string | null;
  counterparty_iban: string | null;
  description?: string | null;
};

export type UlozenyPohyb = {
  id: string;
  transaction_reference: string | null;
  booking_date: string;
  amount: number | string;
  variable_symbol: string | null;
  counterparty_iban: string | null;
  description?: string | null;
  created_at?: string | null;
};

export type Povysenie = {
  /** Uložený riadok, ktorý ostáva (nesie párovanie, export). */
  id: string;
  /** Nová referencia od banky — ďalšie sťahovanie ho spozná rovno podľa nej. */
  transaction_reference: string;
  /** Doplní sa len to, čo starý riadok nemal. */
  doplnit: { counterparty_iban?: string; description?: string };
};

const centy = (v: number | string) => Math.round(Number(v) * 100);
const vs = (v: string | null | undefined) => {
  const s = String(v ?? "")
    .replace(/\D/g, "")
    .replace(/^0+/, "");
  return s || null;
};
const iban = (v: string | null | undefined) => {
  const s = String(v ?? "")
    .replace(/\s+/g, "")
    .toUpperCase();
  return s || null;
};
const kluc = (datum: string, suma: number | string) => `${datum.slice(0, 10)}|${centy(suma)}`;

/** Neprotirečia si? Chýbajúci údaj nevadí, rozdielny áno. Vráti počet zhôd, -1 = rozpor. */
function zhoda(b: PohybZBanky, u: UlozenyPohyb): number {
  let body = 0;
  const vb = vs(b.variable_symbol);
  const vu = vs(u.variable_symbol);
  if (vb && vu) {
    if (vb !== vu) return -1;
    body++;
  }
  const ib = iban(b.counterparty_iban);
  const iu = iban(u.counterparty_iban);
  if (ib && iu) {
    if (ib !== iu) return -1;
    body++;
  }
  return body;
}

/**
 * Rozdelí pohyby z banky, ktoré podľa referencie nepoznáme, na naozaj nové
 * a na tie, ktoré už ležia v databáze pod inou referenciou.
 *
 * @param fresh       pohyby z banky, ktorých referenciu ešte nemáme
 * @param ulozene     uložené riadky účtu v okne sťahovania
 * @param refZBanky   všetky referencie, ktoré banka v tomto sťahovaní vrátila
 */
export function rozdelPodlaOdtlacku<T extends PohybZBanky>(
  fresh: T[],
  ulozene: UlozenyPohyb[],
  refZBanky: Set<string>,
): { nove: T[]; povysenia: Povysenie[] } {
  // Riadok, ktorý banka práve vrátila pod jeho referenciou, je obsadený sám sebou.
  const kandidati = new Map<string, UlozenyPohyb[]>();
  for (const u of ulozene) {
    if (u.transaction_reference && refZBanky.has(u.transaction_reference)) continue;
    const k = kluc(u.booking_date, u.amount);
    const zoznam = kandidati.get(k) ?? [];
    zoznam.push(u);
    kandidati.set(k, zoznam);
  }
  // Najstarší riadok prvý — ten nesie párovanie a exporty.
  for (const zoznam of kandidati.values()) {
    zoznam.sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
  }

  const nove: T[] = [];
  const povysenia: Povysenie[] = [];
  /*
   * Najprv pohyby s najviac údajmi (VS aj IBAN), aby si presnú dvojicu
   * nezobral pohyb, ktorý by sa hodil aj inam.
   */
  const poradie = [...fresh].sort(
    (a, b) =>
      Number(!!vs(b.variable_symbol)) +
      Number(!!iban(b.counterparty_iban)) -
      (Number(!!vs(a.variable_symbol)) + Number(!!iban(a.counterparty_iban))),
  );
  for (const b of poradie) {
    const zoznam = kandidati.get(kluc(b.booking_date, b.amount));
    let najlepsi = -1;
    let skore = -1;
    for (let i = 0; i < (zoznam?.length ?? 0); i++) {
      const s = zhoda(b, zoznam![i]);
      if (s > skore) {
        skore = s;
        najlepsi = i;
      }
    }
    if (najlepsi < 0) {
      nove.push(b);
      continue;
    }
    const [u] = zoznam!.splice(najlepsi, 1);
    if (b.transaction_reference) {
      const doplnit: Povysenie["doplnit"] = {};
      if (!iban(u.counterparty_iban) && iban(b.counterparty_iban)) {
        doplnit.counterparty_iban = iban(b.counterparty_iban)!;
      }
      if (!String(u.description ?? "").trim() && String(b.description ?? "").trim()) {
        doplnit.description = String(b.description);
      }
      povysenia.push({ id: u.id, transaction_reference: b.transaction_reference, doplnit });
    }
  }
  // Pôvodné poradie (podľa banky) pre vkladanie.
  const noveSet = new Set(nove);
  return { nove: fresh.filter((t) => noveSet.has(t)), povysenia };
}
