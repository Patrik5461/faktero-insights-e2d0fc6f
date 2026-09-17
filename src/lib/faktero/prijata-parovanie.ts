import { normMeno, normVs } from "./parovanie";

/**
 * Párovanie prijatých faktúr s pohybmi na účte.
 *
 * Tretí druh párovania v aplikácii a zámerne nie je spoločný s ostatnými —
 * riadia ho iné pravidlá:
 *
 * - **Vydaná faktúra** čaká na peniaze, ktoré prídu. Znesie čiastočnú úhradu,
 *   lebo si vedie zoznam platieb a zvyšok.
 * - **Bloček** sa zúčtuje do pár dní od nákupu a variabilný symbol spravidla
 *   nemá; hľadá sa hlavne podľa mena obchodníka v úzkom okne.
 * - **Prijatá faktúra** je záväzok, ktorý firma platí sama. Má **variabilný
 *   symbol** — a to je najsilnejší údaj, aký v tomto párovaní existuje, lebo ho
 *   dodávateľ vypísal práve preto, aby platbu spoznal. Zaplatiť sa ale môže
 *   týždne po vystavení, niekedy dávno po splatnosti, takže okno musí byť
 *   široké.
 *
 * Čiastočná úhrada sa zámerne nepodporuje: prijatá faktúra si nevedie
 * zaplatenú časť, takže by sa nedalo povedať, koľko ešte ostáva. Suma preto
 * musí sedieť na cent — iná suma znamená inú faktúru.
 */

export type Pohyb = {
  id: string;
  booking_date: string;
  /** Záporná suma je odchádzajúca platba — a len tá môže uhradiť záväzok. */
  amount: number;
  currency: string;
  variable_symbol: string | null;
  counterparty: string | null;
  description: string | null;
};

export type PrijataFaktura = {
  id: string;
  supplier_name: string | null;
  invoice_number: string | null;
  variable_symbol: string | null;
  issue_date: string | null;
  due_date: string | null;
  amount_total: number | null;
  currency: string | null;
  payment_method: string | null;
  status: string | null;
};

export type ZhodaPrijatej = {
  transactionId: string;
  purchaseInvoiceId: string;
  skore: number;
  istota: "auto" | "navrh";
  dovody: string[];
};

/**
 * Dokedy po vystavení má zmysel platbu hľadať.
 *
 * Pol roka je veľkorysé a je to zámer: faktúra po splatnosti sa platí aj o
 * mesiace neskôr a práve tú človek hľadá najčastejšie. Strop tu je len preto,
 * aby sa suma náhodou nespárovala s platbou spred dvoch rokov.
 */
const OKNO_DNI = 190;

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
export function dodavatelSedi(p: Pohyb, f: PrijataFaktura): boolean {
  return menaSedia(p.counterparty, f.supplier_name) || menaSedia(p.description, f.supplier_name);
}

/**
 * Symbol, ktorým sa faktúra platí.
 *
 * Keď dodávateľ variabilný symbol neuviedol, býva ním číslo faktúry — tak to
 * beží v praxi aj pri platbe cez internetbanking.
 */
export function symbolFaktury(f: PrijataFaktura): string {
  const vs = normVs(f.variable_symbol);
  return vs.length >= 3 ? vs : normVs(f.invoice_number);
}

/**
 * Nakoľko pohyb sedí na prijatú faktúru. `null` znamená, že spolu súvisieť
 * nemôžu — vtedy sa dvojica ani neponúkne.
 */
export function ohodnotPrijatu(
  p: Pohyb,
  f: PrijataFaktura,
): Omit<ZhodaPrijatej, "transactionId" | "purchaseInvoiceId"> | null {
  // Faktúra je záväzok: uhradí ju odchádzajúca platba, nie prichádzajúca.
  if (p.amount >= 0) return null;
  // Hotovosť a zrušená faktúra na účte nikdy neboli a nebudú.
  if (f.payment_method === "hotovost") return null;
  if (f.status === "cancelled") return null;
  if (f.amount_total == null || f.amount_total <= 0) return null;
  if ((p.currency || "EUR") !== (f.currency || "EUR")) return null;
  if (!f.issue_date) return null;

  // Suma na cent — čiastočnú úhradu prijatá faktúra neeviduje.
  if (Math.abs(zaokruhli(Math.abs(p.amount)) - zaokruhli(f.amount_total)) >= 0.005) return null;

  // Zaplatiť sa nedá skôr, než faktúra vznikla.
  const odVystavenia = dni(p.booking_date, f.issue_date);
  if (odVystavenia === null || odVystavenia < 0 || odVystavenia > OKNO_DNI) return null;

  const dovody: string[] = ["suma sedí na cent"];
  let skore = 0.4;
  let rozpoznany = false;

  const vsPohybu = normVs(p.variable_symbol);
  const vsFaktury = symbolFaktury(f);
  if (vsPohybu.length >= 3 && vsFaktury.length >= 3 && vsPohybu === vsFaktury) {
    skore += 0.45;
    rozpoznany = true;
    dovody.push(`variabilný symbol ${p.variable_symbol} sedí na faktúru`);
  } else if (dodavatelSedi(p, f)) {
    skore += 0.3;
    rozpoznany = true;
    dovody.push(`platba pre ${f.supplier_name}`);
  }

  /*
    Blízkosť k splatnosti je slabý, ale užitočný údaj: firma platí okolo
    splatnosti, nie náhodne. Keď splatnosť nepoznáme, ostane sa pri sume.
  */
  const odSplatnosti = f.due_date ? dni(p.booking_date, f.due_date) : null;
  if (odSplatnosti !== null) {
    const rozdiel = Math.abs(odSplatnosti);
    if (rozdiel <= 3) {
      skore += 0.15;
      dovody.push("zaplatené v čase splatnosti");
    } else if (odSplatnosti < 0) {
      skore += 0.1;
      dovody.push(`zaplatené ${rozdiel} dní pred splatnosťou`);
    } else {
      skore += 0.05;
      dovody.push(`zaplatené ${odSplatnosti} dní po splatnosti`);
    }
  }

  return {
    skore: zaokruhli(skore),
    /*
      Sama zhoda sumy na istotu nestačí. Faktúry od toho istého dodávateľa
      bývajú na rovnaké sumy (paušály, nájom) a vybrať za človeka tú nesprávnu
      je horšie než sa spýtať.
    */
    istota: rozpoznany && skore >= 0.8 ? "auto" : "navrh",
    dovody,
  };
}

/**
 * Pospája pohyby s faktúrami.
 *
 * Každý pohyb aj každá faktúra vystupuje najviac raz — najprv sa berú
 * najsilnejšie dvojice. Keď dve faktúry sedia na ten istý pohyb rovnako dobre,
 * ani jedna sa neoznačí za istú; nerozhoduje sa za človeka.
 */
export function sparujPrijate(pohyby: Pohyb[], faktury: PrijataFaktura[]): ZhodaPrijatej[] {
  const vsetky: ZhodaPrijatej[] = [];
  for (const p of pohyby) {
    for (const f of faktury) {
      const h = ohodnotPrijatu(p, f);
      if (h) vsetky.push({ transactionId: p.id, purchaseInvoiceId: f.id, ...h });
    }
  }

  vsetky.sort((a, b) => b.skore - a.skore);

  const pouzitePohyby = new Set<string>();
  const pouziteFaktury = new Set<string>();
  const vybrane: ZhodaPrijatej[] = [];

  for (const z of vsetky) {
    if (pouzitePohyby.has(z.transactionId) || pouziteFaktury.has(z.purchaseInvoiceId)) continue;

    // Rovnako silná druhá možnosť na ten istý pohyb → nech rozhodne človek.
    const remiza = vsetky.some(
      (iny) =>
        iny !== z &&
        iny.transactionId === z.transactionId &&
        iny.purchaseInvoiceId !== z.purchaseInvoiceId &&
        Math.abs(iny.skore - z.skore) < 0.005 &&
        !pouziteFaktury.has(iny.purchaseInvoiceId),
    );

    pouzitePohyby.add(z.transactionId);
    pouziteFaktury.add(z.purchaseInvoiceId);
    vybrane.push(
      remiza
        ? {
            ...z,
            istota: "navrh",
            dovody: [...z.dovody, "rovnako dobre sedí aj iná faktúra"],
          }
        : z,
    );
  }

  return vybrane;
}
