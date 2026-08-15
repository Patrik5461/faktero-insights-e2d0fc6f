import { normMeno, normVs } from "./parovanie";
import { zaokruhli } from "./financovanie";

/**
 * Párovanie odchádzajúcich platieb so splátkami leasingov a úverov.
 *
 * Prečo zvlášť a nie v `parovanie.ts`: to páruje **prichádzajúce** platby s
 * vystavenými faktúrami a zámerne odchádzajúce ignoruje. Tu je to presne
 * naopak a aj pravidlá sú iné.
 *
 * Kľúčová pasca celej agendy: **suma sama nestačí**. Splátky sú každý mesiac
 * rovnaké, takže dva leasingy s podobnou splátkou by sa miešali a peniaze by
 * sedeli na cudzej zmluve. Preto sa automaticky páruje len vtedy, keď platbu
 * niečo **identifikuje** — variabilný symbol alebo meno protistrany. Samotná
 * zhoda sumy a dátumu vždy končí ako návrh pre človeka.
 */

export type OdchadzajuciPohyb = {
  id: string;
  booking_date: string;
  /** Záporná suma; porovnáva sa jej absolútna hodnota. */
  amount: number;
  currency: string;
  variable_symbol: string | null;
  counterparty: string | null;
  description: string | null;
};

export type SplatkaNaSparovanie = {
  id: string;
  contract_id: string;
  number: number;
  due_date: string;
  amount: number;
  currency: string;
  /** Z hlavičky zmluvy — podľa čoho sa platba dá spoznať. */
  variable_symbol: string | null;
  counterparty_hint: string | null;
  provider_name: string | null;
  contract_name: string;
};

export type ZhodaSplatky = {
  transactionId: string;
  installmentId: string;
  contractId: string;
  suma: number;
  skore: number;
  istota: "auto" | "navrh";
  dovody: string[];
};

/** O koľko dní sa smie platba minúť s dátumom splatnosti a ešte to sedí. */
const BLIZKO_DNI = 10;
const Este_DNI = 45;

function rozdielDni(a: string, b: string): number {
  const ms = Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`);
  return Math.abs(Math.round(ms / 86_400_000));
}

/** Sedí meno protistrany na zmluvu? Stačí, keď sa jedno v druhom nachádza. */
export function protistranaSedi(p: OdchadzajuciPohyb, s: SplatkaNaSparovanie): boolean {
  const text = normMeno(`${p.counterparty ?? ""} ${p.description ?? ""}`);
  if (!text) return false;
  for (const kandidat of [s.counterparty_hint, s.provider_name]) {
    const meno = normMeno(kandidat);
    // Kratšie než štyri znaky by sedelo na hocičo — „ČSOB" ešte prejde, „SB" nie.
    if (meno.length >= 4 && text.includes(meno)) return true;
  }
  return false;
}

export type OhodnotenieSplatky = {
  skore: number;
  dovody: string[];
  /** Platbu niečo identifikuje — bez toho sa nikdy nepáruje automaticky. */
  rozpoznana: boolean;
  sumaSedi: boolean;
};

export function ohodnotSplatku(
  p: OdchadzajuciPohyb,
  s: SplatkaNaSparovanie,
): OhodnotenieSplatky | null {
  // Splátka je odchádzajúca platba. Prichádzajúca k nej patriť nemôže.
  if (p.amount >= 0) return null;
  if ((p.currency || "EUR") !== (s.currency || "EUR")) return null;
  if (s.amount <= 0) return null;

  const suma = zaokruhli(Math.abs(p.amount));
  const dovody: string[] = [];
  let skore = 0;
  let rozpoznana = false;

  const vs = normVs(p.variable_symbol);
  const vsZmluvy = normVs(s.variable_symbol);
  if (vs.length >= 3 && vsZmluvy.length >= 3 && vs === vsZmluvy) {
    skore += 0.5;
    rozpoznana = true;
    dovody.push(`variabilný symbol ${p.variable_symbol} sedí na zmluvu`);
  } else if (protistranaSedi(p, s)) {
    skore += 0.3;
    rozpoznana = true;
    dovody.push(`platba je od ${s.provider_name || s.counterparty_hint}`);
  }

  const rozdielSumy = zaokruhli(Math.abs(suma - s.amount));
  const sumaSedi = rozdielSumy < 0.005;
  if (sumaSedi) {
    skore += 0.35;
    dovody.push("suma sedí presne");
  } else if (rozdielSumy <= Math.max(1, s.amount * 0.01)) {
    skore += 0.12;
    dovody.push(`suma sa líši o ${rozdielSumy.toFixed(2)}`);
  } else {
    // Iná suma než splátka — to už nie je táto splátka.
    return null;
  }

  const dni = rozdielDni(p.booking_date, s.due_date);
  if (dni <= BLIZKO_DNI) {
    skore += 0.15;
    dovody.push(dni === 0 ? "zaplatené v deň splatnosti" : `zaplatené ${dni} dní od splatnosti`);
  } else if (dni <= Este_DNI) {
    skore += 0.05;
    dovody.push(`zaplatené ${dni} dní od splatnosti`);
  } else {
    return null;
  }

  return { skore: zaokruhli(skore), dovody, rozpoznana, sumaSedi };
}

/**
 * Rozdelí pohyby na isté a sporné.
 *
 * Jeden pohyb zaplatí najviac jednu splátku a jedna splátka sa zaplatí najviac
 * raz. Keď sú dve rovnako dobré možnosti, nerozhoduje sa za človeka — obe idú
 * do návrhov.
 */
export function sparujSplatky(
  pohyby: OdchadzajuciPohyb[],
  splatky: SplatkaNaSparovanie[],
  prah = 0.5,
): { auto: ZhodaSplatky[]; navrhy: ZhodaSplatky[] } {
  type Kandidat = { p: OdchadzajuciPohyb; s: SplatkaNaSparovanie; o: OhodnotenieSplatky };
  const kandidati: Kandidat[] = [];
  for (const p of pohyby) {
    for (const s of splatky) {
      const o = ohodnotSplatku(p, s);
      if (o && o.skore >= prah) kandidati.push({ p, s, o });
    }
  }
  kandidati.sort((a, b) => b.o.skore - a.o.skore || a.p.id.localeCompare(b.p.id));

  // Rovnako dobré druhé miesto = nedá sa rozhodnúť. Presne to sa stane pri
  // dvoch leasingoch s rovnakou splátkou od tej istej leasingovky.
  const najlepsie = new Map<string, number>();
  const sporne = new Set<string>();
  for (const k of kandidati) {
    const doteraz = najlepsie.get(k.p.id);
    if (doteraz == null) najlepsie.set(k.p.id, k.o.skore);
    else if (Math.abs(doteraz - k.o.skore) < 0.001) sporne.add(k.p.id);
  }

  const pouzitePohyby = new Set<string>();
  const pouziteSplatky = new Set<string>();
  const auto: ZhodaSplatky[] = [];
  const navrhy: ZhodaSplatky[] = [];

  for (const k of kandidati) {
    if (pouzitePohyby.has(k.p.id) || pouziteSplatky.has(k.s.id)) continue;

    const zhoda: ZhodaSplatky = {
      transactionId: k.p.id,
      installmentId: k.s.id,
      contractId: k.s.contract_id,
      suma: zaokruhli(Math.abs(k.p.amount)),
      skore: k.o.skore,
      istota: "navrh",
      dovody: k.o.dovody,
    };

    const iste = k.o.rozpoznana && k.o.sumaSedi && !sporne.has(k.p.id);
    if (iste) {
      zhoda.istota = "auto";
      auto.push(zhoda);
    } else {
      navrhy.push(zhoda);
    }
    pouzitePohyby.add(k.p.id);
    pouziteSplatky.add(k.s.id);
  }

  return { auto, navrhy };
}
