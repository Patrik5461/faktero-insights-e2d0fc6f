/**
 * Povolenia pre knihu jázd — vypýtané naraz, na začiatku a s vysvetlením.
 *
 * Doteraz sa o ne appka hlásila až v okamihu, keď človek zapol prepínač
 * detekcie. Na Androide to nestačilo: notifikácie a pohybové senzory si od
 * verzie 13 musí appka vypýtať sama, a keď to neurobí, meranie síce beží, ale
 * otázka „bola táto jazda služobná?" nikdy nepríde. Zvonku to vyzerá tak, že
 * appka nerobí nič — a človek zisťuje po týždni, že nemá ani jednu jazdu.
 *
 * Poradie nie je náhodné. Najprv poloha (bez nej nemá zmysel pýtať zvyšok),
 * potom notifikácie a senzory, a **poloha „vždy" až na koniec**: Android na
 * ňu neotvára okno, ale rovno systémové nastavenia, takže je poctivé pustiť
 * tam človeka až vtedy, keď už povedal áno všetkému ostatnému.
 *
 * Na iOS sa nič z toho nevolá — tam si o notifikácie hovorí push a o pohyb
 * systém pri prvom čítaní senzora, a Apple žiadosť o „Vždy" hneď po štarte
 * aj tak odmieta.
 */
import type { DriveDetectorPermissions } from "@faktero/drive-detector";

export type ChybajucePovolenie = "poloha" | "notifikacie" | "pohyb" | "vzdy";

/**
 * Čo z povolení chýba. Čistá funkcia — to, čo sa dá overiť bez telefónu.
 *
 * `notifications` a `motion` chýbajú v starších binárkach a na iOS; čo appka
 * nevie zistiť, o to nemá ani pýtať.
 */
export function chybajucePovolenia(
  p: Partial<DriveDetectorPermissions> | null | undefined,
): ChybajucePovolenie[] {
  if (!p) return [];
  const chyba: ChybajucePovolenie[] = [];
  if (p.location !== "granted") chyba.push("poloha");
  if (p.notifications != null && p.notifications !== "granted") chyba.push("notifikacie");
  if (p.motion != null && p.motion !== "granted") chyba.push("pohyb");
  if (p.background !== "granted") chyba.push("vzdy");
  return chyba;
}

async function pluginAndroid() {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return null;
  // Appka načítava živý web, takže nová stránka sa môže stretnúť so staršou
  // binárkou, ktorá plugin ešte nemá.
  if (!Capacitor.isPluginAvailable("DriveDetector")) return null;
  const { DriveDetector } = await import("@faktero/drive-detector");
  return DriveDetector;
}

/** Čo chýba práve teraz. `null` znamená, že sa niet koho pýtať (web, iOS). */
export async function stavPovoleniJazd(): Promise<ChybajucePovolenie[] | null> {
  const p = await pluginAndroid();
  if (!p) return null;
  try {
    return chybajucePovolenia(await p.checkPermissions());
  } catch {
    return null;
  }
}

/**
 * Vypýta všetko, čo chýba, a vráti, čo z toho ostalo nepovolené.
 *
 * Odmietnutie nič nezastavuje — appka funguje ďalej, len horšie, a povedať to
 * treba na obrazovke, nie výnimkou.
 */
export async function dopytajPovoleniaJazd(): Promise<ChybajucePovolenie[]> {
  const p = await pluginAndroid();
  if (!p) return [];
  try {
    let stav = await p.checkPermissions();
    if (stav.location !== "granted") stav = await p.requestPermissions();
    // Bez polohy je zvyšok bezpredmetný — notifikácia o jazde, ktorá sa
    // nemôže zmerať, je len otravovanie.
    if (stav.location !== "granted") return chybajucePovolenia(stav);

    if (stav.notifications != null && stav.notifications !== "granted") {
      stav = (await p.requestNotificationPermission?.()) ?? stav;
    }
    if (stav.motion != null && stav.motion !== "granted") {
      stav = (await p.requestMotionPermission?.()) ?? stav;
    }
    if (stav.background !== "granted") stav = await p.requestBackgroundPermission();
    return chybajucePovolenia(stav);
  } catch {
    return [];
  }
}
