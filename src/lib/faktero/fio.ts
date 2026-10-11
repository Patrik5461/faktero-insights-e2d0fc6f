/**
 * Prevod dát z Fio banky do podoby, akú drží Faktero.
 *
 * Fio sa pripája tokenom z internetbankingu (Nastavení → API) a jeden token
 * patrí **jednému účtu** — firma s korunovým aj eurovým účtom má dva tokeny,
 * teda dve pripojenia. Odpoveď (`transactions.json`) nesie naraz údaje účtu
 * aj pohyby, takže sa banka volá raz: Fio pustí na jeden token najviac jedno
 * volanie za 30 sekúnd (inak HTTP 409).
 *
 * Oddelené od siete naschvál — znamienko, dátum v pražskom čase a čo je
 * protistrana sa overuje testom, nie naostro.
 */

import type { PohybNaZapis, UcetNaZapis } from "./wise";

type Hodnota<T> = { value: T; name?: string; id?: number } | null | undefined;

export type FioInfo = {
  accountId?: string | null;
  bankId?: string | null;
  currency?: string | null;
  iban?: string | null;
  bic?: string | null;
  openingBalance?: number | null;
  closingBalance?: number | null;
};

export type FioPohyb = {
  column22?: Hodnota<number | string>; // ID pohybu
  column0?: Hodnota<number | string>; // Datum
  column1?: Hodnota<number | string>; // Objem
  column14?: Hodnota<string>; // Měna
  column2?: Hodnota<string>; // Protiúčet
  column3?: Hodnota<string>; // Kód banky
  column10?: Hodnota<string>; // Název protiúčtu
  column4?: Hodnota<string>; // KS
  column5?: Hodnota<string | number>; // VS
  column6?: Hodnota<string | number>; // SS
  column7?: Hodnota<string>; // Uživatelská identifikace
  column16?: Hodnota<string>; // Zpráva pro příjemce
  column8?: Hodnota<string>; // Typ
  column25?: Hodnota<string>; // Komentář
};

export type FioOdpoved = {
  accountStatement?: {
    info?: FioInfo | null;
    transactionList?: { transaction?: FioPohyb[] | null } | null;
  } | null;
};

/** Token z internetbankingu Fio — písmená a číslice (spravidla 64 znakov). */
export function jeTokenFio(token: string): boolean {
  return /^[A-Za-z0-9]{20,128}$/.test(String(token ?? "").trim());
}

const text = (h: Hodnota<unknown>): string => String(h?.value ?? "").trim();

/**
 * Dátum pohybu. JSON ho dáva ako milisekundy pražskej polnoci (22:00 alebo
 * 23:00 UTC predošlého dňa), XML ako „2012-07-27+02:00“. Obe treba čítať v
 * pražskom čase, inak by sa každý pohyb posunul o deň dozadu.
 */
export function datumFio(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" || /^\d{10,}$/.test(String(v))) {
    const t = Number(v);
    if (!Number.isFinite(t)) return null;
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Prague",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(t));
  }
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v));
  return m ? m[1] : null;
}

/** Účet Faktera z hlavičky výpisu. */
export function ucetZFio(info: FioInfo): UcetNaZapis {
  const cislo = String(info.accountId ?? "").trim();
  const banka = String(info.bankId ?? "2010").trim();
  return {
    external_account_id: cislo,
    iban:
      String(info.iban ?? "")
        .replace(/\s/g, "")
        .toUpperCase() || null,
    account_name: cislo ? `Fio ${cislo}/${banka}` : "Fio banka",
    currency: String(info.currency ?? "CZK").toUpperCase(),
    balance: Number(info.closingBalance ?? 0),
  };
}

/** Variabilný symbol — len číslice, najviac 10 (ako v českom platobnom styku). */
function vs(v: Hodnota<string | number>): string | null {
  const s = text(v).replace(/^0+(?=\d)/, "");
  return /^\d{1,10}$/.test(s) ? s : null;
}

/** Protistrana: názov protiúčtu, inak číslo účtu s kódom banky. */
export function protistranaZFio(p: FioPohyb): string | null {
  const nazov = text(p.column10);
  if (nazov) return nazov;
  const ucet = text(p.column2);
  if (!ucet) return null;
  const banka = text(p.column3);
  return banka ? `${ucet}/${banka}` : ucet;
}

/**
 * Pohyb Fio na pohyb Faktera; `null`, keď chýba dátum, suma alebo ID.
 * Suma ide so znamienkom ako vo Fio (odchod peňazí je záporný).
 */
export function pohybZFio(p: FioPohyb, cisloUctu: string): PohybNaZapis | null {
  const id = text(p.column22);
  const den = datumFio(p.column0?.value);
  const suma = Number(p.column1?.value);
  if (!id || !den || !Number.isFinite(suma)) return null;
  const popis =
    [text(p.column16), text(p.column7), text(p.column25)].find((x) => x) || text(p.column8) || null;
  return {
    // ID pohybu je vo Fio jedinečné; účet pred ním drží referencie oddelené.
    external_id: `fio:${cisloUctu}:${id}`,
    booking_date: den,
    amount: suma,
    currency: (text(p.column14) || "CZK").toUpperCase(),
    variable_symbol: vs(p.column5),
    counterparty: protistranaZFio(p),
    description: popis,
  };
}

/** Celá odpoveď na účet a pohyby. Nezapísateľné riadky sa vynechajú. */
export function vypisZFio(o: FioOdpoved): { ucet: UcetNaZapis; pohyby: PohybNaZapis[] } {
  const info = o?.accountStatement?.info ?? {};
  const ucet = ucetZFio(info);
  const pohyby = (o?.accountStatement?.transactionList?.transaction ?? [])
    .map((p) => pohybZFio(p, ucet.external_account_id))
    .filter((p): p is PohybNaZapis => p !== null);
  return { ucet, pohyby };
}

/**
 * Okno sťahovania. Bez dodatočnej autorizácie v internetbankingu dá Fio len
 * posledných 90 dní (staršie skončí chybou 422), tak sa berie 89 dní dozadu.
 */
export function oknoFio(teraz: Date = new Date(), dni = 89): { od: string; do: string } {
  const den = (d: Date) => d.toISOString().slice(0, 10);
  const od = new Date(teraz.getTime() - dni * 86_400_000);
  return { od: den(od), do: den(teraz) };
}

/** Zrozumiteľná hláška k stavovému kódu Fio API. */
export function chybaFio(stav: number): string {
  if (stav === 409)
    return "Fio pustí na jeden token len jedno stiahnutie za 30 sekúnd. Skúste to o chvíľu znova.";
  if (stav === 500)
    return "Fio token neprijal — skontrolujte, či je správne skopírovaný a v internetbankingu aktívny.";
  if (stav === 422)
    return "Fio vydá bez dodatočnej autorizácie len pohyby za posledných 90 dní. Staršie odomknite v internetbankingu (Nastavení → API, ikona zámku) a do 10 minút stiahnite.";
  if (stav === 413) return "Fio vracia priveľa pohybov naraz (limit 50 000) — skráťte obdobie.";
  if (stav === 404) return "Fio požiadavke nerozumelo (chybná adresa).";
  return `Fio odpovedalo ${stav}.`;
}
