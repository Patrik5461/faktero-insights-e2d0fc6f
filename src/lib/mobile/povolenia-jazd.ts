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

/**
 * Kľúč, pod ktorým si appka pamätá, že sa už raz pýtala.
 *
 * Bez neho by okno vyskočilo pri každom otvorení: polohu „vždy" Android
 * oknom povoliť nedá, takže „niečo chýba" ostane pravda aj po tom, čo
 * človek klepol na Povoliť — a appka by ho otravovala donekonečna.
 */
const KLUC_PYTANE = "faktero.povolenia.pytaneSa";

async function preferencie() {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return null;
  const { Preferences } = await import("@capacitor/preferences");
  // Plugin je proxy, ktorá z prístupu k `then` robí natívne volanie — vrátiť
  // sa smie len zabalený v obyčajnom objekte.
  return {
    get: (key: string) => Preferences.get({ key }),
    set: (key: string, value: string) => Preferences.set({ key, value }),
  };
}

/** Pýtali sme sa už na tomto telefóne? */
export async function uzSmeSaPytali(): Promise<boolean> {
  try {
    const p = await preferencie();
    return Boolean((await p?.get(KLUC_PYTANE))?.value);
  } catch {
    return false;
  }
}

export async function zapamatajZePytane(): Promise<void> {
  try {
    const p = await preferencie();
    await p?.set(KLUC_PYTANE, "1");
  } catch {
    /* keď sa to nezapíše, spýtame sa raz navyše — to je menšie zlo */
  }
}

/** Otvorí nastavenia aplikácie; tam sa prepína poloha „vždy". */
export async function otvorNastaveniaAppky(): Promise<void> {
  const p = await pluginAndroid();
  await p?.openAppSettings?.().catch(() => {});
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
  const detektor = await pluginAndroid();
  if (!detektor) return [];
  const p = detektor;

  /*
    Každý krok zvlášť a s vlastným zotavením.

    Reťaz bola predtým jedno `try` — keď ktorékoľvek volanie zlyhalo (staršia
    binárka metódu nemá, systém žiadosť zamietol), zvyšok sa preskočil a
    navonok to vyzeralo tak, že sa appka po povolení polohy prestala pýtať.
  */
  async function skus(praca: () => Promise<unknown>): Promise<void> {
    try {
      await praca();
    } catch {
      /* jedno zamietnutie nesmie zhodiť zvyšok reťaze */
    }
    // Android zahodí žiadosť podanú vo chvíli, keď sa predchádzajúce okno
    // ešte zatvára. Navonok to vyzerá, že sa appka nespýtala.
    await new Promise((hotovo) => setTimeout(hotovo, 400));
  }

  async function stav(): Promise<Partial<DriveDetectorPermissions> | null> {
    try {
      return await p.checkPermissions();
    } catch {
      return null;
    }
  }

  if ((await stav())?.location !== "granted") {
    await skus(() => p.requestPermissions());
  }
  // Bez polohy je zvyšok bezpredmetný — notifikácia o jazde, ktorá sa nemá
  // ako zmerať, je len otravovanie.
  if ((await stav())?.location !== "granted") return chybajucePovolenia(await stav());

  const chyba = chybajucePovolenia(await stav());
  if (chyba.includes("notifikacie") || chyba.includes("pohyb")) {
    if (p.requestExtraPermissions) {
      await skus(() => p.requestExtraPermissions!());
    } else {
      // Staršia binárka vie len po jednom.
      if (chyba.includes("notifikacie")) await skus(() => p.requestNotificationPermission!());
      if (chyba.includes("pohyb")) await skus(() => p.requestMotionPermission!());
    }
  }

  if (chybajucePovolenia(await stav()).includes("vzdy")) {
    await skus(() => p.requestBackgroundPermission());
  }
  return chybajucePovolenia(await stav());
}
