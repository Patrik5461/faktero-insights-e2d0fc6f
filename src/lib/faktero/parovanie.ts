/**
 * Párovanie bankových platieb s faktúrami.
 *
 * Z banky chodia pohyby, ktoré o faktúre nevedia nič — majú len variabilný
 * symbol, sumu, dátum, protistranu a popis. Táto časť z nich odvodí, ku ktorej
 * faktúre platba patrí, a povie, nakoľko si je istá.
 *
 * Rozdelenie na dve úrovne je zámerné:
 *
 * - **auto** — variabilný symbol sedí, suma sedí do haliera, mena sedí a
 *   faktúra je jediná taká. Vtedy sa dá úhrada zapísať bez pýtania.
 * - **návrh** — čokoľvek slabšie (chýbajúci VS, čiastočná platba, sedí len
 *   meno a suma). Takú platbu ukážeme a rozhodne človek.
 *
 * Nikdy sa nepáruje odchádzajúca platba — tá patrí k prijatej faktúre, a to je
 * iná agenda.
 */

export type Pohyb = {
  id: string;
  booking_date: string;
  amount: number;
  currency: string;
  variable_symbol: string | null;
  counterparty: string | null;
  description: string | null;
};

export type Doklad = {
  id: string;
  invoice_number: string;
  variable_symbol: string | null;
  total: number;
  /** Koľko už je na faktúre zaplatené (súčet úhrad). */
  uhradene: number;
  currency: string;
  status: string;
  issue_date: string;
  customer_name: string | null;
};

export type Zhoda = {
  transactionId: string;
  invoiceId: string;
  /** Koľko sa z pohybu zapíše ako úhrada — nikdy viac, než faktúre chýba. */
  suma: number;
  skore: number;
  istota: "auto" | "navrh";
  dovody: string[];
  /** Platba nepokryje faktúru celú. */
  ciastocna: boolean;
};

/** Faktúra, ktorá sa už neuhrádza. */
const UZAVRETE = new Set(["paid", "cancelled", "draft"]);

/** Zostatok na faktúre. Záporný nemá zmysel — preplatok nie je dlh. */
export function zostatok(d: Doklad): number {
  return Math.max(0, zaokruhli(d.total - d.uhradene));
}

function zaokruhli(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Variabilný symbol na porovnanie. VS je zo zákona číslo, takže z čísla faktúry
 * ostávajú len číslice — „ZAL12026001" a VS „12026001" je tá istá faktúra.
 * Vedúce nuly sa škrtajú, banky ich rady dopĺňajú aj odoberajú.
 */
export function normVs(v: string | null | undefined): string {
  return String(v ?? "")
    .replace(/\D/g, "")
    .replace(/^0+/, "");
}

/** Symboly, pod ktorými môže faktúra prísť zaplatená. */
function symboly(d: Doklad): string[] {
  return [normVs(d.variable_symbol), normVs(d.invoice_number)].filter((s) => s.length >= 3);
}

/** Meno bez diakritiky, právnej formy a interpunkcie — na hrubé porovnanie. */
export function normMeno(v: string | null | undefined): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(
      /\b(s\s*\.?\s*r\s*\.?\s*o|a\s*\.?\s*s|spol|k\s*\.?\s*s|n\s*\.?\s*o|o\s*\.?\s*z|ltd|sro)\b/g,
      " ",
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function menaSedia(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normMeno(a);
  const y = normMeno(b);
  if (!x || !y || x.length < 3 || y.length < 3) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/** Objaví sa číslo faktúry v texte platby ako samostatné slovo? */
function cisloVTexte(d: Doklad, text: string): boolean {
  const cislo = normVs(d.invoice_number);
  if (cislo.length < 4) return false;
  const cislice = text.replace(/\D+/g, " ");
  return cislice.split(" ").some((c) => c.replace(/^0+/, "") === cislo);
}

function dni(a: string, b: string): number {
  const x = Date.parse(a);
  const y = Date.parse(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
  return Math.round((x - y) / 86400000);
}

export type Ohodnotenie = { skore: number; dovody: string[]; vsSedi: boolean; sumaSedi: boolean };

/**
 * Nakoľko pohyb sedí na faktúru. `null` znamená, že spolu nemôžu súvisieť
 * vôbec — inou menou sa faktúra uhradiť nedá a už uzavretý doklad nemá čo
 * prijímať.
 */
export function ohodnot(p: Pohyb, d: Doklad): Ohodnotenie | null {
  if (p.amount <= 0) return null;
  if (UZAVRETE.has(d.status)) return null;
  if ((p.currency || "EUR") !== (d.currency || "EUR")) return null;
  const chyba = zostatok(d);
  if (chyba <= 0) return null;

  const dovody: string[] = [];
  let skore = 0;

  const vs = normVs(p.variable_symbol);
  const vsSedi = vs.length >= 3 && symboly(d).includes(vs);
  if (vsSedi) {
    skore += 0.55;
    dovody.push(`variabilný symbol ${p.variable_symbol} sedí`);
  }

  const text = `${p.description ?? ""} ${p.counterparty ?? ""}`;
  if (!vsSedi && cisloVTexte(d, text)) {
    skore += 0.2;
    dovody.push(`číslo faktúry je v popise platby`);
  }

  const suma = zaokruhli(p.amount);
  const sumaSedi = Math.abs(suma - chyba) < 0.005;
  if (sumaSedi) {
    skore += 0.35;
    dovody.push("suma sedí presne");
  } else if (suma < chyba) {
    skore += 0.1;
    dovody.push(`čiastočná úhrada — z ${chyba.toFixed(2)} prišlo ${suma.toFixed(2)}`);
  } else {
    // Prišlo viac, než faktúre chýba. Býva to platba za viac faktúr naraz;
    // sama o sebe to nie je zhoda, ale s variabilným symbolom stojí za pozretie.
    skore -= 0.15;
    dovody.push(`prišlo viac, než faktúre chýba (${suma.toFixed(2)} / ${chyba.toFixed(2)})`);
  }

  if (menaSedia(p.counterparty, d.customer_name)) {
    skore += 0.15;
    dovody.push(`protistrana sedí na odberateľa ${d.customer_name}`);
  }

  /*
   * Platba pred vystavením faktúry je podozrivá. Pár dní tolerujeme — banka
   * zaúčtuje inokedy, než sa doklad vystaví — ale zálohu zaplatenú mesiac
   * vopred takto páriť nechceme.
   */
  const predstih = dni(d.issue_date, p.booking_date);
  if (predstih > 5) {
    skore -= 0.4;
    dovody.push(`platba prišla ${predstih} dní pred vystavením faktúry`);
  }

  return { skore: zaokruhli(skore), dovody, vsSedi, sumaSedi };
}

/**
 * Priradí pohyby k faktúram. Ide sa od najistejšej dvojice — nie po poradí, v
 * akom pohyby prišli — inak by o výsledku rozhodovalo, ktorý riadok je v
 * zozname prvý.
 *
 * Jeden pohyb pokryje jednu faktúru; faktúra vie prijať viac čiastočných úhrad.
 */
export function sparuj(
  pohyby: Pohyb[],
  doklady: Doklad[],
  prah = 0.5,
): { auto: Zhoda[]; navrhy: Zhoda[] } {
  type Kandidat = { p: Pohyb; d: Doklad; o: Ohodnotenie };
  const kandidati: Kandidat[] = [];
  for (const p of pohyby) {
    for (const d of doklady) {
      const o = ohodnot(p, d);
      if (o && o.skore >= prah) kandidati.push({ p, d, o });
    }
  }
  kandidati.sort((a, b) => b.o.skore - a.o.skore || a.p.id.localeCompare(b.p.id));

  // Rovnako dobré druhé miesto znamená, že sa nedá rozhodnúť za používateľa.
  const najlepsieProPohyb = new Map<string, number>();
  const sporne = new Set<string>();
  for (const k of kandidati) {
    const doteraz = najlepsieProPohyb.get(k.p.id);
    if (doteraz == null) najlepsieProPohyb.set(k.p.id, k.o.skore);
    else if (Math.abs(doteraz - k.o.skore) < 0.001) sporne.add(k.p.id);
  }

  const zostatky = new Map(doklady.map((d) => [d.id, zostatok(d)]));
  const pouzite = new Set<string>();
  const auto: Zhoda[] = [];
  const navrhy: Zhoda[] = [];

  for (const k of kandidati) {
    if (pouzite.has(k.p.id)) continue;
    const chyba = zostatky.get(k.d.id) ?? 0;
    if (chyba <= 0) continue;

    const suma = Math.min(zaokruhli(k.p.amount), chyba);
    const ciastocna = suma < chyba - 0.005;
    const jeSporny = sporne.has(k.p.id);
    const dovody = jeSporny
      ? [...k.o.dovody, "rovnako dobre sedí aj iná faktúra — rozhodnite ručne"]
      : k.o.dovody;

    const zhoda: Zhoda = {
      transactionId: k.p.id,
      invoiceId: k.d.id,
      suma,
      skore: k.o.skore,
      istota: k.o.vsSedi && k.o.sumaSedi && !jeSporny ? "auto" : "navrh",
      dovody,
      ciastocna,
    };

    pouzite.add(k.p.id);
    zostatky.set(k.d.id, zaokruhli(chyba - suma));
    (zhoda.istota === "auto" ? auto : navrhy).push(zhoda);
  }

  return { auto, navrhy };
}
