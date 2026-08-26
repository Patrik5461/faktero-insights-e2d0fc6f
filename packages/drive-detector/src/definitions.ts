import type { PermissionState, PluginListenerHandle } from "@capacitor/core";

/**
 * Typy sú zámerne bez akejkoľvek zmienky o iOS. Android má dnes len kostru,
 * ktorá všetko odmietne, a musí sa dať doplniť bez zásahu do tohto súboru.
 */

/** Služobná alebo súkromná jazda — do knihy jázd patrí len prvá. */
export type Classification = "business" | "private";

/** Texty notifikácie, ktorá sa vypáli natívne pri rozpoznaní jazdy. */
export interface DriveNotificationTexts {
  title: string;
  body: string;
  /** Popisky troch akcií notifikácie. */
  businessLabel: string;
  privateLabel: string;
  discardLabel: string;
}

export interface DriveDetectorConfig {
  /** Nad touto rýchlosťou sa pohyb považuje za jazdu autom. */
  speedThresholdKmh: number; // default 15
  /** Ako dlho musí rýchlosť súvisle držať nad prahom. */
  sustainedSeconds: number; // default 60
  /** Koľko platných meraní za sebou musí prísť, kým sa jazda potvrdí. */
  minConsecutiveFixes: number; // default 3
  /** Meranie s horšou presnosťou sa do trasy vôbec nedostane. */
  maxAccuracyMeters: number; // default 50
  /** Po zamietnutí jazdy sa detekcia toľko minút nespúšťa. */
  debounceMinutes: number; // default 30
  /** Pod touto rýchlosťou sa auto považuje za stojace. */
  stopSpeedKmh: number; // default 5
  /** Ako dlho musí stáť, aby sa jazda ukončila. */
  stopAfterSeconds: number; // default 300
  /** O koľko metrov sa musí telefón posunúť, kým príde ďalšie meranie. */
  distanceFilterMeters: number; // default 30
  /**
   * Texty notifikácie. Nie sú v natívnej vrstve zapečené, lebo jazyk patrí
   * aplikácii — Swift o slovenčine nemá čo vedieť. Bez nich sa notifikácia
   * pri rozpoznaní jazdy nevypáli.
   */
  notification?: DriveNotificationTexts;
}

export interface TripPoint {
  lat: number;
  lng: number;
  speedKmh: number;
  accuracy: number;
  altitude: number | null;
  timestamp: number;
}

export interface BufferedTrip {
  id: string;
  startedAt: number;
  endedAt: number | null;
  points: TripPoint[];
  distanceMeters: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  /**
   * Vyplnené až po `confirmTrip()`. Kým je `null`, jazdu ešte nikto nezaradil —
   * notifikácia mohla ostať nepovšimnutá.
   */
  classification: Classification | null;
  /** `true`, keď jazdu spustil človek tlačidlom, nie detekcia. */
  manual: boolean;
}

export interface DriveDetectorPermissions {
  /** Poloha počas používania aplikácie. */
  location: PermissionState;
  /** Poloha na pozadí (iOS „Vždy"). Bez nej detekcia beží len v popredí. */
  background: PermissionState;
  /** Pohybové senzory — len pomocné potvrdenie, detekcia beží aj bez nich. */
  motion: PermissionState;
  /**
   * Presná poloha (iOS „Precise Location"). Pri zníženej presnosti chodia
   * merania s odchýlkou v kilometroch a bez rýchlosti — detekcia z nich
   * nerozpozná nikdy nič. Chýba v starších binárkach.
   */
  precise?: PermissionState;
  /**
   * Obnovovanie obsahu na pozadí. Keď je vypnuté, systém appku pri väčšom
   * presune nezobudí a detekcia sa nemá ako spustiť — povolenia pritom
   * vyzerajú v poriadku. Chýba v starších binárkach.
   */
  backgroundRefresh?: PermissionState;
  /**
   * Režim nízkej spotreby. Nie je to povolenie, ale prácu na pozadí obmedzuje
   * rovnako účinne. Chýba v starších binárkach.
   */
  lowPower?: "on" | "off";
}

/**
 * Čo detekcia naozaj robila. Prežije zabitie appky — detekcia beží aj vtedy,
 * keď appka nebeží, takže bez uloženia by v Diagnostike nebolo nikdy nič.
 *
 * Časy sú v milisekundách.
 */
export interface DriveDetectorDiagnostics {
  /** `caka` = nič nebeží, `overuje` = zapnutá presná poloha, `jazdi` = jazda beží. */
  stav: "caka" | "overuje" | "jazdi";
  /** Koľkokrát systém detekciu zobudil väčším presunom. */
  prebudeni: number;
  poslednePrebudenie?: number;
  /** Prebudenia, po ktorých sa jazda nepotvrdila. */
  neuspesnychOvereni: number;
  posledneNeuspesne?: number;
  poslednaJazda?: number;
  /** Najvyššia rýchlosť videná počas posledného overovania. */
  najvyssiaRychlost: number;
  /**
   * Najvyššia rýchlosť za celý čas. `najvyssiaRychlost` sa pri každom
   * prebudení nuluje, takže sama nepovie, či detekcia niekedy jazdu videla.
   */
  najvyssiaRychlostVobec?: number;
  /**
   * Merania počas posledného overovania: koľko ich prišlo a koľko z nich malo
   * dosť dobrú presnosť. Rozlíši „systém nedodal nič" od „dodal len hrubé
   * sieťové polohy" a od „merania boli dobré, auto stálo".
   */
  /**
   * Koľkokrát sa proces appky spustil a koľko meraní odvtedy prišlo.
   * Rozlíši „systém appku po každom prebudení spúšťa nanovo" od „len ju uspáva".
   */
  spusteniProcesu?: number;
  fixovOdSpustenia?: number;
  fixovVOvereni?: number;
  pouzitelnychVOvereni?: number;
  /** Najlepšia (najmenšia) presnosť v metroch počas posledného overovania. */
  najlepsiaPresnost?: number;
  poslednyFix?: number;
  /** Koľko sekúnd nad prahom už overovanie nazbieralo a koľko ich treba. */
  sekundyNadPrahom: number;
  potrebnychSekund: number;
}

export interface DriveDetectorState {
  monitoring: boolean;
  activeTrip: BufferedTrip | null;
  /** Chýba v starších binárkach — appka sa bez neho musí zaobísť. */
  diagnostika?: DriveDetectorDiagnostics;
}

export interface DriveDetectedEvent {
  tripId: string;
  startedAt: number;
}

export interface DriveDetectorPlugin {
  /** Nastavenia sa ukladajú natívne a prežijú reštart — po prebudení na pozadí
   * už žiadny JavaScript nebeží, ktorý by ich vedel dodať. */
  configure(config: Partial<DriveDetectorConfig>): Promise<void>;

  /** Zapne monitorovanie na pozadí (lacné prebúdzanie pri väčšom presune). */
  start(): Promise<void>;
  stop(): Promise<void>;

  getState(): Promise<DriveDetectorState>;

  /** Rozpracovaná jazda; keď žiadna nebeží, posledná nezaradená ukončená. */
  getBufferedTrip(): Promise<BufferedTrip | null>;

  /**
   * Ukončené jazdy, ktoré si aplikácia ešte neprevzala — od najstaršej.
   * Cez víkend ich môže byť aj desať a stratiť sa nesmie ani jedna.
   */
  getUnresolvedTrips(): Promise<BufferedTrip[]>;

  /** Jazda je uložená v knihe jázd, plugin ju už nemá komu ponúkať. */
  markSynced(opts: { tripId: string }): Promise<void>;

  confirmTrip(opts: { tripId: string; classification: Classification }): Promise<BufferedTrip>;
  discardTrip(opts: { tripId: string }): Promise<void>;

  /**
   * Ručné spustenie jazdy tlačidlom. Ide cez ten istý jeden správca polohy ako
   * detekcia — dve nezávislé inštancie by si prebíjali nastavenú presnosť.
   */
  startTrip(): Promise<BufferedTrip>;
  /** Ukončí ručne aj automaticky spustenú jazdu. */
  endTrip(): Promise<BufferedTrip | null>;

  checkPermissions(): Promise<DriveDetectorPermissions>;
  /**
   * Pýta len polohu „počas používania". Na „vždy" sa eskaluje až po prvom
   * skutočnom použití cez `requestBackgroundPermission()` — Apple žiadosť
   * o „vždy" hneď po štarte pri kontrole odmieta.
   */
  requestPermissions(): Promise<DriveDetectorPermissions>;
  requestBackgroundPermission(): Promise<DriveDetectorPermissions>;
  /**
   * Dočasne pýta presnú polohu. Trvalé zapnutie je len v Nastaveniach — iOS
   * appke povolí požiadať iba o výnimku na túto reláciu, a to len keď už má
   * polohu povolenú a zníženú presnosť. Inak sa nespýta nič a vráti sa
   * nezmenený stav.
   */
  requestPrecisePermission(): Promise<DriveDetectorPermissions>;

  addListener(
    eventName: "driveDetected",
    listener: (event: DriveDetectedEvent) => void,
  ): Promise<PluginListenerHandle>;
  /** Priebeh jazdy, natívne obmedzený na jedno oznámenie za 10 sekúnd. */
  addListener(
    eventName: "tripUpdated",
    listener: (trip: BufferedTrip) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "tripEnded",
    listener: (trip: BufferedTrip) => void,
  ): Promise<PluginListenerHandle>;
  /** Povolenie polohy zmizlo alebo kleslo na „počas používania". */
  addListener(eventName: "permissionRevoked", listener: () => void): Promise<PluginListenerHandle>;

  removeAllListeners(): Promise<void>;
}
