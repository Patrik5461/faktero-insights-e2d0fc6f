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
  speedThresholdKmh: number; // default 32
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
}

export interface DriveDetectorState {
  monitoring: boolean;
  activeTrip: BufferedTrip | null;
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
