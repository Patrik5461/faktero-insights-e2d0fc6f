/**
 * Podklady pre offline obrazovku.
 *
 * Obrazovka, ktorú Capacitor ukáže bez pripojenia, nemá ako zistiť, aké má
 * firma vozidlá — beží na inom pôvode a sieť práve nie je. Appka jej ich preto
 * odloží dopredu, kým je online, do `Preferences` (natívne úložisko, ktoré
 * vidia obe strany).
 *
 * Odkladá sa len to nutné: názov firmy a zoznam áut. Žiadne doklady ani sumy —
 * to by bola kópia dát mimo databázy bez toho, aby ju niekto potreboval.
 */

const KLUC = "faktero.offline.podklady";

export type OfflinePodklady = {
  companyId: string;
  companyName: string;
  vozidla: Array<{ id: string; name: string; license_plate?: string | null }>;
  /** Auto, ktorým sa z tohto telefónu jazdí — predvolí sa v ponuke. */
  mojeVozidloId?: string | null;
  ulozene: number;
};

async function preferences() {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return null;
  const { Preferences } = await import("@capacitor/preferences");
  return Preferences;
}

export async function ulozOfflinePodklady(
  podklady: Omit<OfflinePodklady, "ulozene">,
): Promise<void> {
  const p = await preferences();
  if (!p) return;
  try {
    await p.set({
      key: KLUC,
      value: JSON.stringify({ ...podklady, ulozene: Date.now() } satisfies OfflinePodklady),
    });
  } catch {
    /* keď sa nepodarí, offline obrazovka ponúkne jazdu bez výberu auta */
  }
}

export async function nacitajOfflinePodklady(): Promise<OfflinePodklady | null> {
  const p = await preferences();
  if (!p) return null;
  try {
    const { value } = await p.get({ key: KLUC });
    return value ? (JSON.parse(value) as OfflinePodklady) : null;
  } catch {
    return null;
  }
}

const KLUC_JAZD = "faktero.offline.jazdy";

/**
 * Autá, ktoré človek priradil jazdám na offline obrazovke. Plugin o vozidlách
 * nič nevie, takže sa priradenie odkladá vedľa neho a appka ho pri odosielaní
 * uprednostní pred tým, čo by si domyslela sama.
 */
export async function autaKOfflineJazdam(): Promise<Record<string, string>> {
  const p = await preferences();
  if (!p) return {};
  try {
    const { value } = await p.get({ key: KLUC_JAZD });
    const mapa = JSON.parse(value ?? "{}");
    return mapa && typeof mapa === "object" ? mapa : {};
  } catch {
    return {};
  }
}

/** Po odoslaní jazdy sa priradenie zahodí, nech mapa nerastie donekonečna. */
export async function zabudniAutoKJazde(tripId: string): Promise<void> {
  const p = await preferences();
  if (!p) return;
  try {
    const mapa = await autaKOfflineJazdam();
    if (!(tripId in mapa)) return;
    delete mapa[tripId];
    await p.set({ key: KLUC_JAZD, value: JSON.stringify(mapa) });
  } catch {
    /* nepodstatné — pri ďalšom pokuse sa to podarí */
  }
}
