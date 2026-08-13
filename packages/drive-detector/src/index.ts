import { registerPlugin } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";

import type {
  BufferedTrip,
  Classification,
  DriveDetectorConfig,
  DriveDetectorPermissions,
  DriveDetectorPlugin,
  DriveDetectorState,
} from "./definitions";
import type { NativeDriveDetectorPlugin } from "./native";

/**
 * Webová implementácia sa načíta až vtedy, keď kód beží v prehliadači —
 * natívna appka ju do pamäte nikdy nedostane.
 */
const nativny = registerPlugin<NativeDriveDetectorPlugin>("DriveDetector", {
  web: () => import("./web").then((m) => new m.DriveDetectorWeb()),
});

/**
 * Tenká obálka nad natívnym pluginom. Existuje kvôli jedinej veci: rozbaliť
 * `{ trip }` na `BufferedTrip | null`, lebo cez most sa `null` na najvyššej
 * úrovni preniesť nedá.
 */
const DriveDetector: DriveDetectorPlugin = {
  configure: (config: Partial<DriveDetectorConfig>) => nativny.configure(config),
  start: () => nativny.start(),
  stop: () => nativny.stop(),
  getState: (): Promise<DriveDetectorState> => nativny.getState(),
  getBufferedTrip: async (): Promise<BufferedTrip | null> =>
    (await nativny.getBufferedTrip()).trip ?? null,
  getUnresolvedTrips: async (): Promise<BufferedTrip[]> =>
    (await nativny.getUnresolvedTrips()).trips ?? [],
  markSynced: (opts: { tripId: string }) => nativny.markSynced(opts),
  confirmTrip: (opts: { tripId: string; classification: Classification }) =>
    nativny.confirmTrip(opts),
  discardTrip: (opts: { tripId: string }) => nativny.discardTrip(opts),
  startTrip: () => nativny.startTrip(),
  endTrip: async (): Promise<BufferedTrip | null> => (await nativny.endTrip()).trip ?? null,
  checkPermissions: (): Promise<DriveDetectorPermissions> => nativny.checkPermissions(),
  requestPermissions: (): Promise<DriveDetectorPermissions> => nativny.requestPermissions(),
  requestBackgroundPermission: (): Promise<DriveDetectorPermissions> =>
    nativny.requestBackgroundPermission(),
  addListener: ((
    eventName: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listener: (...args: any[]) => void,
  ): Promise<PluginListenerHandle> =>
    nativny.addListener(eventName, listener)) as DriveDetectorPlugin["addListener"],
  removeAllListeners: () => nativny.removeAllListeners(),
};

export * from "./definitions";
export { DriveDetector };
