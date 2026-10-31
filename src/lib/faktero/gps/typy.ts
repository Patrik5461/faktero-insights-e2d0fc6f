// Spoločné rozhranie adaptérov GPS / flotila / doprava.
// Každý poskytovateľ má súbor `src/lib/faktero/gps/<id>.server.ts` s exportom `adapter: GpsAdapter`,
// zapojený v `register.ts`. Prihlasovacie údaje (`p`) prichádzajú už dešifrované zo `gps_pripojenia`.

/** Pole prihlasovacieho formulára; kľúč je kľúčom v `p`. */
export type GpsPole = {
  kluc: string;
  nazov: string;
  typ: "text" | "heslo" | "url";
  povinne: boolean;
  pomoc?: string;
};

export type GpsVozidlo = {
  externeId: string;
  spz: string | null;
  nazov: string | null;
  vin?: string | null;
  tachometerKm?: number | null;
};

export type GpsJazda = {
  externeId: string;
  vozidloExterneId: string;
  zaciatok: string /*ISO*/;
  koniec: string;
  odAdresa?: string | null;
  doAdresa?: string | null;
  odLat?: number | null;
  odLng?: number | null;
  doLat?: number | null;
  doLng?: number | null;
  km: number;
  tachometerZaciatok?: number | null;
  tachometerKoniec?: number | null;
  vodic?: string | null;
  /** true = súkromná, false = služobná, null = poskytovateľ nerozlišuje */
  sukromna: boolean | null;
  ucel?: string | null;
  spotrebaL?: number | null;
  surove?: unknown;
};

export type GpsTankovanie = {
  externeId: string;
  vozidloExterneId?: string | null;
  spz?: string | null;
  cas: string;
  litre: number;
  suma?: number | null;
  mena?: string | null;
  palivo?: string | null;
  miesto?: string | null;
  tachometerKm?: number | null;
  surove?: unknown;
};

export interface GpsAdapter {
  id: string;
  nazov: string;
  web: string;
  dokumentacia: string;
  polia: GpsPole[];
  /**
   * Koľko vozidiel smie ísť do jedného volania `jazdy` — pre API, ktoré sa pýtajú
   * po vozidlách (inak by prvé stiahnutie veľkej flotily trvalo dlhšie ako beh).
   * Bez hodnoty idú všetky vozidlá s rovnakým oknom naraz (Webfleet: 1 volanie/min).
   */
  vozidielNaVolanie?: number;
  /** Overí prihlásenie; pri chybe hodí GpsChyba s ľudskou hláškou. */
  test(p: Record<string, string>): Promise<void>;
  vozidla(p: Record<string, string>): Promise<GpsVozidlo[]>;
  jazdy(p: Record<string, string>, od: Date, do_: Date, vozidla?: string[]): Promise<GpsJazda[]>;
  tankovania?(p: Record<string, string>, od: Date, do_: Date): Promise<GpsTankovanie[]>;
  /** Zápis späť, ak API vie. */
  oznacSukromnu?(
    p: Record<string, string>,
    jazdaExterneId: string,
    sukromna: boolean,
  ): Promise<void>;
}

export class GpsChyba extends Error {
  constructor(
    public druh: "prihlasenie" | "limit" | "siet" | "api",
    msg: string,
  ) {
    super(msg);
    this.name = "GpsChyba";
  }
}
