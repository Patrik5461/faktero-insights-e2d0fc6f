import { WebPlugin } from "@capacitor/core";

import type {
  BufferedTrip,
  Classification,
  DriveDetectorConfig,
  DriveDetectorPermissions,
  DriveDetectorState,
} from "./definitions";
import type { NativeDriveDetectorPlugin } from "./native";

/**
 * V prehliadači detekcia neexistuje a existovať nemôže — stránka sa nedá
 * prebudiť pri pohybe a po zavretí karty nič nebeží. Metódy preto zámerne
 * padajú namiesto toho, aby predstierali, že merajú.
 *
 * Aplikácia si ručné meranie na webe rieši sama cez `navigator.geolocation`
 * (`src/lib/mobile/gps-tracker.ts`), tento súbor je len poctivá odpoveď
 * volajúcemu, ktorý sa nepozrel, na akej platforme beží.
 */
export class DriveDetectorWeb extends WebPlugin implements NativeDriveDetectorPlugin {
  async configure(_config: Partial<DriveDetectorConfig>): Promise<void> {
    throw this.unimplemented("Detekcia jazdy je dostupná len v mobilnej aplikácii.");
  }

  async start(): Promise<void> {
    throw this.unimplemented("Detekcia jazdy je dostupná len v mobilnej aplikácii.");
  }

  async stop(): Promise<void> {
    throw this.unimplemented("Detekcia jazdy je dostupná len v mobilnej aplikácii.");
  }

  async getState(): Promise<DriveDetectorState> {
    throw this.unimplemented("Detekcia jazdy je dostupná len v mobilnej aplikácii.");
  }

  async getBufferedTrip(): Promise<{ trip: BufferedTrip | null }> {
    throw this.unimplemented("Detekcia jazdy je dostupná len v mobilnej aplikácii.");
  }

  async getUnresolvedTrips(): Promise<{ trips: BufferedTrip[] }> {
    throw this.unimplemented("Detekcia jazdy je dostupná len v mobilnej aplikácii.");
  }

  async markSynced(_opts: { tripId: string }): Promise<void> {
    throw this.unimplemented("Detekcia jazdy je dostupná len v mobilnej aplikácii.");
  }

  async confirmTrip(_opts: {
    tripId: string;
    classification: Classification;
  }): Promise<BufferedTrip> {
    throw this.unimplemented("Detekcia jazdy je dostupná len v mobilnej aplikácii.");
  }

  async discardTrip(_opts: { tripId: string }): Promise<void> {
    throw this.unimplemented("Detekcia jazdy je dostupná len v mobilnej aplikácii.");
  }

  async startTrip(): Promise<BufferedTrip> {
    throw this.unimplemented("Detekcia jazdy je dostupná len v mobilnej aplikácii.");
  }

  async endTrip(): Promise<{ trip: BufferedTrip | null }> {
    throw this.unimplemented("Detekcia jazdy je dostupná len v mobilnej aplikácii.");
  }

  async checkPermissions(): Promise<DriveDetectorPermissions> {
    throw this.unimplemented("Detekcia jazdy je dostupná len v mobilnej aplikácii.");
  }

  async requestPermissions(): Promise<DriveDetectorPermissions> {
    throw this.unimplemented("Detekcia jazdy je dostupná len v mobilnej aplikácii.");
  }

  async requestBackgroundPermission(): Promise<DriveDetectorPermissions> {
    throw this.unimplemented("Detekcia jazdy je dostupná len v mobilnej aplikácii.");
  }

  async requestPrecisePermission(): Promise<DriveDetectorPermissions> {
    throw this.unimplemented("Detekcia jazdy je dostupná len v mobilnej aplikácii.");
  }
}
