import { citaj, klucePamate, zapis, zmaz } from "./trvale-ulozisko";

/**
 * Faktúry vystavené bez signálu.
 *
 * Číslo faktúry bežne prideľuje server až pri vystavení a je to tak správne —
 * dvaja ľudia naraz tak nikdy nedostanú to isté. Bez signálu to ale znamená, že
 * sa fakturovať nedá vôbec, a to je v teréne problém.
 *
 * Sú na to dve cesty a appka vie obe:
 *
 * **Rozpracovaná faktúra** — údaje sa odložia sem a faktúra sa vystaví, len čo
 * je signál. Číslo pridelí server ako vždy. Zákazníkovi sa na mieste
 * neodovzdáva nič.
 *
 * **Rezervované číslo** — appka si v signáli vypýta zopár čísel dopredu a bez
 * signálu z nich vydáva. Faktúra má číslo hneď, dá sa nadiktovať alebo napísať
 * na papier. Nepoužité rezervované číslo po vypršaní prestane blokovať a vráti
 * sa do rady, takže trvalé diery v číselnom rade z toho nevznikajú.
 *
 * Prečo trvalé úložisko a nie IndexedDB ako pri dokladoch: faktúra je pár
 * kilobajtov textu, kým fotka bločku má megabajty. Zato musí prežiť aj zavretie
 * appky, a to v telefóne spoľahlivo vie len natívne úložisko.
 */

const FRONTA = "faktero.faktury.fronta.";
const REZERVACIE = "faktero.faktury.cisla.";
const NASTAVENIE = "faktero.faktury.cislaDopredu.";

/** Vstup pre operáciu `faktura-vystav` — odkladá sa presne tak, ako sa pošle. */
export type VstupFaktury = {
  company_id: string;
  customer_id: string;
  issue_date: string;
  due_date: string;
  payment_method: "bank_transfer" | "cash" | "card";
  currency: string;
  notes: string | null;
  items: {
    name: string;
    quantity: number;
    unit: string;
    unit_price: number;
    vat_rate: number;
    product_id: string | null;
  }[];
};

export type OdlozenaFaktura = {
  /** Zároveň `external_id` — server podľa neho pozná, že už raz prišla. */
  id: string;
  company_id: string;
  vstup: VstupFaktury;
  /** Rezervované číslo, ak sa použilo. Bez neho ho pridelí server. */
  cislo: string | null;
  /** Meno odberateľa a suma — nech sa dá zoznam ukázať bez pripojenia. */
  odberatel: string;
  spolu: number;
  ts: number;
  pokusy: number;
  chyba: string | null;
};

export type Rezervacia = {
  invoice_number: string;
  sequence_number: number;
  issue_date: string;
  expires_at: string;
  /** Kedy si ho vzala odložená faktúra. Nepoužité sa dajú vrátiť serveru. */
  pouzite_na?: string | null;
};

function novyId(): string {
  // `crypto.randomUUID` nie je v starších WebView; náhrada nemusí byť dokonalá,
  // stačí, aby sa dve faktúry z jedného telefónu netrafili.
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* nižšie */
  }
  const n = () => Math.random().toString(16).slice(2, 10);
  return `${n()}-${n().slice(0, 4)}-4${n().slice(0, 3)}-a${n().slice(0, 3)}-${n()}${n().slice(0, 4)}`;
}

function citajJson<T>(kluc: string, nahrada: T): T {
  try {
    const s = citaj(kluc);
    return s ? (JSON.parse(s) as T) : nahrada;
  } catch {
    return nahrada;
  }
}

/* ------------------------------------------------------------------ fronta */

export function cakajuceFaktury(companyId: string): OdlozenaFaktura[] {
  return citajJson<OdlozenaFaktura[]>(FRONTA + companyId, []);
}

export function pocetCakajucichFaktur(companyId: string): number {
  return cakajuceFaktury(companyId).length;
}

function zapisFrontu(companyId: string, zoznam: OdlozenaFaktura[]): void {
  if (zoznam.length === 0) zmaz(FRONTA + companyId);
  else zapis(FRONTA + companyId, JSON.stringify(zoznam));
}

/**
 * Odloží faktúru na neskôr a — ak je zapnuté vydávanie s číslom — rovno jej
 * pridelí najbližšie rezervované číslo.
 */
export function zaradFakturu(
  companyId: string,
  vstup: VstupFaktury,
  popis: { odberatel: string; spolu: number },
): OdlozenaFaktura {
  const cislo = jeCislovanieDopredu(companyId) ? vezmiRezervaciu(companyId) : null;
  const zaznam: OdlozenaFaktura = {
    id: novyId(),
    company_id: companyId,
    vstup,
    cislo,
    odberatel: popis.odberatel,
    spolu: popis.spolu,
    ts: Date.now(),
    pokusy: 0,
    chyba: null,
  };
  zapisFrontu(companyId, [...cakajuceFaktury(companyId), zaznam]);
  return zaznam;
}

export function odstranFakturu(companyId: string, id: string): void {
  zapisFrontu(
    companyId,
    cakajuceFaktury(companyId).filter((f) => f.id !== id),
  );
}

/**
 * Pošle, čo čaká. Vracia, koľko sa podarilo.
 *
 * Zo fronty sa záznam vyhadzuje až po úspechu. Keď sa odpoveď stratí cestou,
 * ďalší pokus pošle to isté `external_id` a server vráti už založenú faktúru
 * namiesto toho, aby vyrobil druhú.
 */
export async function odosliCakajuceFaktury(
  companyId: string,
  posli: (
    vstup: VstupFaktury & { external_id: string; reserved_number: string | null },
  ) => Promise<{
    invoice_number?: string;
  }>,
): Promise<{ odoslane: number; zlyhane: number }> {
  let odoslane = 0;
  let zlyhane = 0;

  for (const f of cakajuceFaktury(companyId)) {
    try {
      await posli({ ...f.vstup, external_id: f.id, reserved_number: f.cislo });
      odstranFakturu(companyId, f.id);
      if (f.cislo) oznacRezervaciuZaMinutu(companyId, f.cislo);
      odoslane++;
    } catch (e) {
      zlyhane++;
      const sprava = e instanceof Error ? e.message : String(e);
      // Chyba sa zapíše k faktúre, nech človek vidí prečo — a nech sa pri
      // ďalšom pokuse nezačína od nuly.
      zapisFrontu(
        companyId,
        cakajuceFaktury(companyId).map((x) =>
          x.id === f.id ? { ...x, pokusy: x.pokusy + 1, chyba: sprava } : x,
        ),
      );
    }
  }
  return { odoslane, zlyhane };
}

/* ------------------------------------------------------------- rezervácie */

export function rezervacie(companyId: string): Rezervacia[] {
  const teraz = Date.now();
  return citajJson<Rezervacia[]>(REZERVACIE + companyId, []).filter(
    (r) => new Date(r.expires_at).getTime() > teraz,
  );
}

/** Koľko čísel je ešte k dispozícii na prácu bez signálu. */
export function volnychCisel(companyId: string): number {
  return rezervacie(companyId).filter((r) => !r.pouzite_na).length;
}

export function ulozRezervacie(companyId: string, nove: Rezervacia[]): void {
  const uz = rezervacie(companyId);
  const kluce = new Set(uz.map((r) => r.invoice_number));
  const spolu = [...uz, ...nove.filter((r) => !kluce.has(r.invoice_number))].sort(
    (a, b) => a.sequence_number - b.sequence_number,
  );
  zapis(REZERVACIE + companyId, JSON.stringify(spolu));
}

/** Vezme najnižšie voľné rezervované číslo. `null`, keď žiadne nie je. */
export function vezmiRezervaciu(companyId: string): string | null {
  const zoznam = rezervacie(companyId);
  const volna = zoznam.find((r) => !r.pouzite_na);
  if (!volna) return null;
  zapis(
    REZERVACIE + companyId,
    JSON.stringify(
      zoznam.map((r) =>
        r.invoice_number === volna.invoice_number
          ? { ...r, pouzite_na: new Date().toISOString() }
          : r,
      ),
    ),
  );
  return volna.invoice_number;
}

/** Faktúra s týmto číslom je na serveri — rezerváciu už netreba držať. */
function oznacRezervaciuZaMinutu(companyId: string, cislo: string): void {
  const zvysok = rezervacie(companyId).filter((r) => r.invoice_number !== cislo);
  if (zvysok.length === 0) zmaz(REZERVACIE + companyId);
  else zapis(REZERVACIE + companyId, JSON.stringify(zvysok));
}

/** Nepoužité čísla — tie sa dajú vrátiť serveru, keď sa funkcia vypne. */
export function nepouziteCisla(companyId: string): string[] {
  return rezervacie(companyId)
    .filter((r) => !r.pouzite_na)
    .map((r) => r.invoice_number);
}

export function zabudniRezervacie(companyId: string): void {
  zmaz(REZERVACIE + companyId);
}

/* -------------------------------------------------------------- nastavenie */

/** Vydávať bez signálu rovno s číslom? Predvolene nie — je to voľba navyše. */
export function jeCislovanieDopredu(companyId: string): boolean {
  return citaj(NASTAVENIE + companyId) === "1";
}

export function nastavCislovanieDopredu(companyId: string, zapnute: boolean): void {
  if (zapnute) zapis(NASTAVENIE + companyId, "1");
  else zmaz(NASTAVENIE + companyId);
}

/** Po odhlásení nesmie v telefóne ostať ani fronta, ani cudzie čísla. */
export function vycistiFaktury(): void {
  for (const k of klucePamate()) {
    if (k.startsWith(FRONTA) || k.startsWith(REZERVACIE) || k.startsWith(NASTAVENIE)) zmaz(k);
  }
}
