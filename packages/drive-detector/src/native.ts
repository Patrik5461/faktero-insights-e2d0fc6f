import type { PluginListenerHandle } from "@capacitor/core";

import type {
  BufferedTrip,
  Classification,
  DriveDetectorConfig,
  DriveDetectorPermissions,
  DriveDetectorState,
} from "./definitions";

/**
 * Natívne rozhranie sa od toho, čo vidí aplikácia, líši v jednej veci:
 * `resolve` v Capacitore vždy vracia objekt, takže „žiadna jazda" nemôže byť
 * `null` — chodí ako `{ trip: null }` a rozbaľuje sa až v `index.ts`.
 */
export interface NativeDriveDetectorPlugin {
  configure(config: Partial<DriveDetectorConfig>): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  getState(): Promise<DriveDetectorState>;
  getBufferedTrip(): Promise<{ trip: BufferedTrip | null }>;
  confirmTrip(opts: { tripId: string; classification: Classification }): Promise<BufferedTrip>;
  discardTrip(opts: { tripId: string }): Promise<void>;
  startTrip(): Promise<BufferedTrip>;
  endTrip(): Promise<{ trip: BufferedTrip | null }>;
  checkPermissions(): Promise<DriveDetectorPermissions>;
  requestPermissions(): Promise<DriveDetectorPermissions>;
  requestBackgroundPermission(): Promise<DriveDetectorPermissions>;
  // Typované prekrytie je v `DriveDetectorPlugin`; tu musí sedieť s tým, čo
  // predpisuje `WebPlugin`.
  addListener(
    eventName: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listenerFunc: (...args: any[]) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}
