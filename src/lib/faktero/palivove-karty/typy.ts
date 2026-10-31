/*
  Palivové karty — spoločné rozhranie poskytovateľov (Shell, DKV, Eurowag, OMV…).

  Každý poskytovateľ má adaptér `<id>.server.ts`, ktorý vie:
    - overiť prihlásenie (`test`),
    - stiahnuť transakcie za obdobie (`transakcie`) — jedna položka = jeden
      riadok nákupu (palivo, AdBlue, umytie, poplatok…),
    - voliteľne stiahnuť faktúry (`faktury`) a transakcie jednej faktúry.

  Zvyšok (párovanie vozidiel, tankovania, prijaté faktúry, ochrana pred
  dvojitým zaúčtovaním) je spoločný v `spracovanie.ts` a `sync.server.ts`.

  Tento súbor sa smie dostať do prehliadača — nič serverové sem nepatrí.
*/

export type KartaPole = {
  kluc: string;
  nazov: string;
  typ: "text" | "heslo" | "vyber";
  povinne: boolean;
  /** Tajný údaj — ukladá sa len zašifrovaný a späť sa ukáže ako „••••“. */
  tajne: boolean;
  pomoc?: string;
  moznosti?: { hodnota: string; nazov: string }[];
  predvolene?: string;
};

export type KartaTransakcia = {
  /** Jedinečné v rámci pripojenia — opakovaný import nič nezdvojí. */
  externeId: string;
  /** Jeden nákup na pumpe môže mať viac riadkov (nafta + AdBlue) — spája ich na bloček. */
  nakupId: string | null;
  /** Čas nákupu (ISO s časovou zónou). */
  cas: string;
  /** Deň nákupu (YYYY-MM-DD) tak, ako ho uvádza poskytovateľ. */
  datum: string;
  /** Číslo karty len maskované (posledných 6 číslic) — celé číslo sa nikde neukladá. */
  karta: string | null;
  spz: string | null;
  vodic: string | null;
  produkt: string | null;
  produktKod: string | null;
  jePalivo: boolean;
  mnozstvo: number | null;
  /** Jednotka množstva tak, ako ju posiela poskytovateľ (L, KWH, PCS…). */
  jednotka: string | null;
  /** Suma bez DPH v mene faktúry; pri dobropise záporná. */
  zaklad: number;
  dph: number;
  sadzbaDph: number | null;
  spolu: number;
  mena: string;
  /** Krajina nákupu (ISO 2). */
  krajina: string | null;
  /** Krajina, ktorej DPH je v cene (ISO 2) — zahraničná DPH sa v SR neodpočíta. */
  krajinaDph: string | null;
  miesto: string | null;
  tachometerKm: number | null;
  fakturaCislo: string | null;
  fakturaDatum: string | null;
  dobropis: boolean;
  /** Pôvodný záznam bez čísla karty — na dohľadanie, nie na zobrazenie. */
  surove?: unknown;
};

export type KartaFaktura = {
  externeId: string;
  cislo: string;
  datum: string;
  splatnost: string | null;
  dodavatel: { nazov: string; krajina?: string | null };
  mena: string;
  zaklad: number;
  dph: number;
  spolu: number;
  /** Original | Reversal | Replacement — opravné doklady idú na kontrolu. */
  typ: string | null;
  dobropis: boolean;
  /** Faktúra za nákupy v zahraničí (International). */
  zahranicna: boolean;
  surove?: unknown;
};

export interface KartaAdapter {
  id: string;
  test(p: Record<string, string>): Promise<void>;
  transakcie(p: Record<string, string>, od: Date, do_: Date): Promise<KartaTransakcia[]>;
  /** Faktúry vystavené v období (podľa dátumu faktúry). */
  faktury?(p: Record<string, string>, od: Date, do_: Date): Promise<KartaFaktura[]>;
  /** Transakcie jednej faktúry, keď ich v okne transakcií nebolo (staršie nákupy). */
  transakcieFaktury?(p: Record<string, string>, f: KartaFaktura): Promise<KartaTransakcia[]>;
}

export class KartaChyba extends Error {
  constructor(
    public druh: "prihlasenie" | "limit" | "siet" | "api",
    msg: string,
  ) {
    super(msg);
    this.name = "KartaChyba";
  }
}

export type KartaPoskytovatel = {
  id: string;
  nazov: string;
  web: string;
  dokumentacia: string;
  /** Adaptér je hotový a dá sa pripojiť. */
  dostupne: boolean;
  /** Vie poskytovateľ cez API dať faktúry (inak len tankovania). */
  faktury: boolean;
  /** Ako sa zákazník dostane k prístupu do API. */
  pristup: string;
  polia: KartaPole[];
};
