/**
 * Práca s pluginom a databázou pre automaticky rozpoznané jazdy. Čistá logika
 * je vedľa v `auto-jazdy.ts`, aby sa dala testovať bez telefónu.
 */
import type { BufferedTrip, Classification } from "@faktero/drive-detector";
import { supabase } from "@/integrations/supabase/client";
import { poslednaCenaPaliva } from "@/lib/faktero/cena-paliva";
import { jePrikratka, riadokZJazdy } from "./auto-jazdy";

/**
 * Texty notifikácie patria sem, nie do Swiftu — plugin o slovenčine nemá čo
 * vedieť a preklad by sa inak menil len s novou verziou appky.
 */
const NASTAVENIE = {
  speedThresholdKmh: 32,
  sustainedSeconds: 60,
  minConsecutiveFixes: 3,
  maxAccuracyMeters: 50,
  debounceMinutes: 30,
  stopSpeedKmh: 5,
  stopAfterSeconds: 300,
  distanceFilterMeters: 30,
  notification: {
    title: "Zaznamenávam jazdu",
    body: "Ide o služobnú cestu?",
    businessLabel: "Služobná",
    privateLabel: "Súkromná",
    discardLabel: "Zrušiť",
  },
};

async function plugin() {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return null;
  // Appka načítava živý web, takže nová stránka sa môže stretnúť so staršou
  // binárkou, ktorá plugin ešte nemá.
  if (!Capacitor.isPluginAvailable("DriveDetector")) return null;
  const { DriveDetector } = await import("@faktero/drive-detector");
  return DriveDetector;
}

export async function stavDetekcie(): Promise<{ dostupna: boolean; zapnuta: boolean }> {
  const p = await plugin();
  if (!p) return { dostupna: false, zapnuta: false };
  try {
    const stav = await p.getState();
    return { dostupna: true, zapnuta: stav.monitoring };
  } catch {
    return { dostupna: false, zapnuta: false };
  }
}

/**
 * Zapnutie žiada polohu „počas používania"; na „vždy" sa eskaluje až potom,
 * lebo Apple žiadosť o „vždy" pri prvom otvorení pri kontrole odmieta.
 */
export async function prepniDetekciu(
  zapnut: boolean,
): Promise<{ zapnuta: boolean; chyba?: string }> {
  const p = await plugin();
  if (!p) return { zapnuta: false, chyba: "Detekcia jázd je len v mobilnej aplikácii." };

  try {
    if (!zapnut) {
      await p.stop();
      return { zapnuta: false };
    }
    await p.configure(NASTAVENIE);
    const povolenie = await p.requestPermissions();
    if (povolenie.location !== "granted") {
      return { zapnuta: false, chyba: "Bez povolenia polohy detekcia nefunguje." };
    }
    await p.start();
    if (povolenie.background !== "granted") {
      // Bez „vždy" beží detekcia len v popredí, čo je na knihu jázd málo.
      await p.requestBackgroundPermission();
    }
    return { zapnuta: true };
  } catch (e: any) {
    return { zapnuta: false, chyba: e?.message ?? "Detekciu sa nepodarilo prepnúť." };
  }
}

/**
 * Jazdy, ktoré čakajú na prevzatie. Príliš krátke záznamy sa tu ticho vybavia
 * — do knihy jázd nepatrí popojdenie na parkovisku.
 */
export async function nacitajRozpoznaneJazdy(): Promise<BufferedTrip[]> {
  const p = await plugin();
  if (!p) return [];
  try {
    const jazdy = await p.getUnresolvedTrips();
    const pouzitelne: BufferedTrip[] = [];
    for (const jazda of jazdy) {
      if (jePrikratka(jazda)) {
        await p.markSynced({ tripId: jazda.id });
        continue;
      }
      pouzitelne.push(jazda);
    }
    return pouzitelne;
  } catch {
    return [];
  }
}

/**
 * Uloží rozpoznanú jazdu do knihy jázd a v pluginu ju označí za vybavenú.
 *
 * Poradie je zámerné: najprv databáza, až potom plugin. Keby sa to prehodilo
 * a zápis zlyhal, jazda by zmizla — takto sa nanajvýš ponúkne druhýkrát
 * a jedinečný index duplicitu nepustí.
 */
export async function ulozRozpoznanuJazdu(args: {
  jazda: BufferedTrip;
  companyId: string;
  vehicleId: string;
  classification: Classification;
}): Promise<{ ok: boolean; chyba?: string }> {
  const p = await plugin();
  if (!p) return { ok: false, chyba: "Detekcia jázd je len v mobilnej aplikácii." };

  try {
    const [{ data: vozidlo }, cena, { data: session }] = await Promise.all([
      supabase
        .from("vehicles")
        .select("consumption_l_100km")
        .eq("id", args.vehicleId)
        .maybeSingle(),
      poslednaCenaPaliva(args.companyId, args.vehicleId),
      supabase.auth.getSession(),
    ]);

    const riadok = riadokZJazdy({
      jazda: args.jazda,
      companyId: args.companyId,
      vehicleId: args.vehicleId,
      classification: args.classification,
      spotrebaL100: vozidlo?.consumption_l_100km ?? null,
      cenaPaliva: cena,
      userId: session.session?.user?.id ?? null,
    });

    const { error } = await supabase.from("trips").insert(riadok);
    // 23505 = jazda tam už je z predchádzajúceho pokusu, to nie je chyba.
    if (error && error.code !== "23505") return { ok: false, chyba: error.message };

    await p.markSynced({ tripId: args.jazda.id });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, chyba: e?.message ?? "Jazdu sa nepodarilo uložiť." };
  }
}

/** Človek povedal, že táto jazda do knihy nepatrí. */
export async function zahodRozpoznanuJazdu(tripId: string): Promise<void> {
  const p = await plugin();
  if (!p) return;
  try {
    await p.discardTrip({ tripId });
  } catch {
    /* zahodenie je konečné aj tak — netreba kvôli nemu hlásiť chybu */
  }
}
