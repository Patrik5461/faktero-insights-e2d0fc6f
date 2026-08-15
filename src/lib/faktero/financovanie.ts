/**
 * Splátkový kalendár leasingu a úveru.
 *
 * Zmyslom nie je vedieť, kedy odišli peniaze — to firma vidí na výpise. Zmyslom
 * je **rozpad splátky na istinu, úrok a DPH**. Bez neho je z toho tabuľka v
 * Exceli; s ním je z toho podklad na zaúčtovanie, na výkaz záväzkov a na
 * odpočet DPH.
 *
 * Počíta sa anuita: splátka je po celý čas rovnaká, ale mení sa jej zloženie —
 * na začiatku je v nej najviac úroku, na konci najviac istiny. Presne tak to
 * robia banky aj leasingovky, takže kalendár sa dá porovnať so zmluvou.
 *
 * Zaokrúhľovanie je tu tá zradná časť. Keby sa každý riadok počítal nezávisle,
 * súčet istín by sa o pár centov rozišiel s financovanou sumou a v účtovníctve
 * by ostal navždy visieť zvyšok. Preto sa **posledná splátka dorovnáva**: dostane
 * presne toľko istiny, koľko zvýšilo.
 */

export type Zmluva = {
  /** Financovaná istina — pri leasingu obstarávacia cena mínus akontácia. */
  principal: number;
  /** Ročná úroková sadzba v percentách. Nula je platná. */
  interest_rate: number;
  term_months: number;
  first_due_date: string;
  /** Pevná splátka zo zmluvy. Keď chýba, dopočíta sa anuita. */
  payment_amount?: number | null;
  /** DPH v splátke, ak ju splátka obsahuje. Pri úvere nula. */
  vat_rate?: number | null;
  /** Zostatková cena splatná na konci — pripočíta sa k poslednej splátke. */
  residual_value?: number | null;
};

export type Splatka = {
  number: number;
  due_date: string;
  amount: number;
  principal_part: number;
  interest_part: number;
  vat_amount: number;
  remaining_principal: number;
};

export function zaokruhli(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Mesačná anuita.
 *
 * Pri nulovom úroku by vzorec delil nulou, preto sa istina jednoducho rozdelí
 * na rovnaké diely — bezúročné splátky sú u predajcov bežné.
 */
export function anuita(istina: number, rocnaSadzba: number, mesiacov: number): number {
  if (mesiacov <= 0) return 0;
  const i = rocnaSadzba / 100 / 12;
  if (i <= 0) return zaokruhli(istina / mesiacov);
  return zaokruhli((istina * i) / (1 - Math.pow(1 + i, -mesiacov)));
}

/**
 * Dátum splatnosti n-tej splátky.
 *
 * Deň sa berie z prvej splátky. Keď v mesiaci nie je (31. v novembri, 30. vo
 * februári), použije sa posledný deň mesiaca — to isté robia banky, a bez tohto
 * by JavaScript ticho preskočil do ďalšieho mesiaca.
 */
export function datumSplatky(prva: string, poradie: number): string {
  const [r, m, d] = prva.split("-").map(Number);
  const cielovyMesiac = m - 1 + poradie;
  const rok = r + Math.floor(cielovyMesiac / 12);
  const mesiac = ((cielovyMesiac % 12) + 12) % 12;
  const poslednyDen = new Date(Date.UTC(rok, mesiac + 1, 0)).getUTCDate();
  const den = Math.min(d, poslednyDen);
  return `${rok}-${String(mesiac + 1).padStart(2, "0")}-${String(den).padStart(2, "0")}`;
}

/**
 * Celý kalendár.
 *
 * Vracia riadky pripravené na zápis. Nič sa neukladá — o to sa stará serverová
 * funkcia, aby sa výpočet dal testovať bez databázy.
 */
export function kalendar(z: Zmluva): Splatka[] {
  const mesiacov = Math.max(1, Math.floor(z.term_months));
  const istina = zaokruhli(z.principal);
  const sadzbaDph = Math.max(0, z.vat_rate ?? 0);
  const zostatkova = zaokruhli(Math.max(0, z.residual_value ?? 0));

  /* Zostatková cena sa nesplácala v priebehu — spláca sa istina bez nej a
     zvyšok dobehne na konci. Inak by vyšla splátka vyššia, než je v zmluve. */
  const splacana = zaokruhli(istina - zostatkova);
  const splatka =
    z.payment_amount && z.payment_amount > 0
      ? zaokruhli(z.payment_amount)
      : anuita(splacana, z.interest_rate, mesiacov);

  const i = z.interest_rate / 100 / 12;
  const riadky: Splatka[] = [];
  let zostava = splacana;

  for (let n = 1; n <= mesiacov; n++) {
    const posledna = n === mesiacov;
    let urok = i > 0 ? zaokruhli(zostava * i) : 0;
    let castIstiny = zaokruhli(splatka - urok);
    let suma = splatka;

    if (posledna) {
      // Dorovnanie: posledná splátka berie celý zvyšok istiny aj zostatkovú
      // cenu. Vďaka tomu súčet istín sedí s financovanou sumou na cent.
      castIstiny = zaokruhli(zostava + zostatkova);
      suma = zaokruhli(castIstiny + urok);
    } else if (castIstiny > zostava) {
      // Pevná splátka zo zmluvy môže byť vyššia, než treba — vtedy sa kalendár
      // skráti tým, že posledné riadky vyjdú nulové.
      castIstiny = zostava;
      suma = zaokruhli(castIstiny + urok);
    }

    if (castIstiny <= 0 && !posledna && zostava <= 0) {
      urok = 0;
      castIstiny = 0;
      suma = 0;
    }

    zostava = zaokruhli(zostava - (posledna ? zostava : castIstiny));

    riadky.push({
      number: n,
      due_date: datumSplatky(z.first_due_date, n - 1),
      amount: suma,
      principal_part: castIstiny,
      interest_part: urok,
      // DPH je dopočítaná zo splátky ako z ceny s daňou — leasingové splátky
      // sú v zmluvách uvádzané vrátane DPH.
      vat_amount: sadzbaDph > 0 ? zaokruhli(suma - suma / (1 + sadzbaDph / 100)) : 0,
      remaining_principal: posledna ? 0 : zostava,
    });
  }

  return riadky;
}

/** Súhrn pre hlavičku zmluvy — čo firma zaplatí a čo z toho je navyše. */
export function suhrn(riadky: Splatka[], zmluva: Zmluva) {
  const zaplatiSpolu = zaokruhli(riadky.reduce((s, r) => s + r.amount, 0));
  const urokSpolu = zaokruhli(riadky.reduce((s, r) => s + r.interest_part, 0));
  const dphSpolu = zaokruhli(riadky.reduce((s, r) => s + r.vat_amount, 0));
  return {
    zaplatiSpolu,
    urokSpolu,
    dphSpolu,
    /** Koľko firma zaplatí nad rámec istiny — úrok plus prípadné zaokrúhlenie. */
    prepatok: zaokruhli(zaplatiSpolu - zmluva.principal - dphSpolu),
    splatok: riadky.length,
  };
}
