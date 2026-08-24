/**
 * Práca s pluginom a databázou pre automaticky rozpoznané jazdy. Čistá logika
 * je vedľa v `auto-jazdy.ts`, aby sa dala testovať bez telefónu.
 */
import type {
  BufferedTrip,
  Classification,
  DriveDetectorDiagnostics,
} from "@faktero/drive-detector";
import { supabase } from "@/integrations/supabase/client";
import { poslednaCenaPaliva } from "@/lib/faktero/cena-paliva";
import { TEXT_PREKAZKY, jePrikratka, prekazkaDetekcie, riadokZJazdy } from "./auto-jazdy";
import { vozidloPreRozpoznanuJazdu } from "./moje-vozidlo";

/**
 * Texty notifikácie patria sem, nie do Swiftu — plugin o slovenčine nemá čo
 * vedieť a preklad by sa inak menil len s novou verziou appky.
 */
function nastavenie(vozidlo?: string | null) {
  return {
    ...ZAKLAD,
    notification: {
      ...ZAKLAD.notification,
      // Z uzamknutej obrazovky musí byť jasné, kam jazda pôjde — inak sa človek
      // dozvie o zle zaradenej jazde až v knihe jázd.
      body: vozidlo ? `Ide o služobnú cestu? (${vozidlo})` : ZAKLAD.notification.body,
    },
  };
}

const ZAKLAD = {
  /*
    Prah je zámerne nízky. Pri 32 km/h sa jazda po meste nepotvrdila prakticky
    nikdy — v kolóne, na svetlách a v obytnej zóne sa toľko nejde a minúta nad
    prahom sa nenazbierala. Proti chodcovi a poskočeniu na parkovisku chráni
    `sustainedSeconds` a `minConsecutiveFixes`, nie výška prahu.
  */
  speedThresholdKmh: 15,
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

export async function stavDetekcie(): Promise<{
  dostupna: boolean;
  zapnuta: boolean;
  /** Čo detekcii bráni, hoci je zapnutá — `null`, keď je všetko v poriadku. */
  prekazka?: string | null;
}> {
  const p = await plugin();
  if (!p) return { dostupna: false, zapnuta: false, prekazka: null };
  try {
    const [stav, povolenia] = await Promise.all([p.getState(), p.checkPermissions()]);
    // Prekážka sa hlási len pri zapnutej detekcii. Pri vypnutej je „chýba
    // povolenie" zbytočné strašenie — nič sa o ňu ešte ani nepokúšalo.
    const prekazka = stav.monitoring ? prekazkaDetekcie(povolenia) : null;
    return {
      dostupna: true,
      zapnuta: stav.monitoring,
      prekazka: prekazka ? TEXT_PREKAZKY[prekazka] : null,
    };
  } catch {
    return { dostupna: false, zapnuta: false, prekazka: null };
  }
}

/**
 * Čo o detekcii vie telefón — pre obrazovku Diagnostika.
 *
 * Bez tohto sa „notifikácia počas jazdy neprišla" nedá odlíšiť od štyroch
 * rôznych príčin: vypnutá detekcia, poloha len „počas používania" (na pozadí
 * sa vtedy nemeria vôbec), zakázané notifikácie, alebo jazda rozpoznaná bola
 * a nepodarilo sa len upozorniť.
 */
export async function diagnostikaDetekcie(): Promise<{
  dostupna: boolean;
  zapnuta: boolean;
  /** `precise` chýba v starších binárkach — obrazovka ho vtedy vynechá. */
  povolenia: { location: string; background: string; motion: string; precise?: string } | null;
  aktivna: boolean;
  nevybavene: number;
  dennik: DriveDetectorDiagnostics | null;
}> {
  const p = await plugin();
  if (!p) {
    return {
      dostupna: false,
      zapnuta: false,
      povolenia: null,
      aktivna: false,
      nevybavene: 0,
      dennik: null,
    };
  }
  try {
    const [stav, povolenia, jazdy] = await Promise.all([
      p.getState(),
      p.checkPermissions(),
      // Nevybavené jazdy sa čítajú priamo z pluginu, nie cez
      // `nacitajRozpoznaneJazdy` — tá príliš krátke ticho odbaví a v
      // diagnostike by po nej ostal nulový počet bez vysvetlenia.
      p.getUnresolvedTrips(),
    ]);
    return {
      dostupna: true,
      zapnuta: stav.monitoring,
      povolenia,
      aktivna: Boolean(stav.activeTrip),
      nevybavene: jazdy.length,
      // V staršej binárke denník nie je — obrazovka ho vtedy vynechá.
      dennik: stav.diagnostika ?? null,
    };
  } catch {
    return {
      dostupna: true,
      zapnuta: false,
      povolenia: null,
      aktivna: false,
      nevybavene: 0,
      dennik: null,
    };
  }
}

/**
 * Zapnutie žiada polohu „počas používania"; na „vždy" sa eskaluje až potom,
 * lebo Apple žiadosť o „vždy" pri prvom otvorení pri kontrole odmieta.
 */
export async function prepniDetekciu(
  zapnut: boolean,
  vozidlo?: string | null,
): Promise<{ zapnuta: boolean; chyba?: string; prekazka?: string | null }> {
  const p = await plugin();
  if (!p) return { zapnuta: false, chyba: "Detekcia jázd je len v mobilnej aplikácii." };

  try {
    if (!zapnut) {
      await p.stop();
      return { zapnuta: false, prekazka: null };
    }
    await p.configure(nastavenie(vozidlo));
    const povolenie = await p.requestPermissions();
    if (povolenie.location !== "granted") {
      return { zapnuta: false, chyba: "Bez povolenia polohy detekcia nefunguje." };
    }
    await p.start();
    if (povolenie.background !== "granted") {
      // Bez „vždy" beží detekcia len v popredí, čo je na knihu jázd málo.
      await p.requestBackgroundPermission();
    }
    /*
      Výsledok sa musí prečítať znova a povedať nahlas. iOS žiadosť o „Vždy"
      hneď po „Počas používania" spravidla nezobrazí a odloží ju — appka
      dovtedy hlásila „Detekcia je zapnutá", pritom systém ju na pozadí nemal
      ako zobudiť a nerozpoznala sa ani jedna jazda.
    */
    const konecne = await p.checkPermissions();
    const prekazka = prekazkaDetekcie(konecne);
    return { zapnuta: true, prekazka: prekazka ? TEXT_PREKAZKY[prekazka] : null };
  } catch (e: any) {
    return { zapnuta: false, chyba: e?.message ?? "Detekciu sa nepodarilo prepnúť." };
  }
}

/**
 * Jazdy, ktoré čakajú na prevzatie. Príliš krátke záznamy sa tu ticho vybavia
 * — do knihy jázd nepatrí popojdenie na parkovisku.
 */
/**
 * Prepíše text notifikácie, keď sa zmení auto, ktorým sa z telefónu jazdí.
 * Posiela sa celé nastavenie — plugin si prahy nepamätá zvlášť od textov.
 */
/**
 * Pošle bežiacej detekcii aktuálne prahy.
 *
 * Plugin si nastavenie pamätá vo vlastnej databáze a po reštarte ho načíta
 * spred appky. Zmena prahu v tomto súbore by sa preto k zapnutej detekcii
 * nedostala, kým ju človek ručne nevypne a nezapne — a nikto by nevedel, že
 * v telefóne stále platí staré číslo. Pri vypnutej detekcii sa neposiela nič,
 * tá si nastavenie prevezme pri zapnutí.
 */
export async function zosuladNastavenie(vozidlo?: string | null): Promise<void> {
  const p = await plugin();
  if (!p) return;
  try {
    const stav = await p.getState();
    if (!stav.monitoring) return;
    await p.configure(nastavenie(vozidlo));
  } catch {
    /* nastavenie prahov nie je nič, kvôli čomu by mala appka hlásiť chybu */
  }
}

export async function nastavVozidloVNotifikacii(vozidlo: string | null): Promise<void> {
  const p = await plugin();
  if (!p) return;
  try {
    await p.configure(nastavenie(vozidlo));
  } catch {
    /* text notifikácie nie je nič, kvôli čomu by mala appka hlásiť chybu */
  }
}

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

/**
 * Vozidlá, ktorých jazdy ťahá Commander. Telefón ich merať nemá — tie isté
 * jazdy by prišli druhýkrát a v knihe jázd by boli dvakrát.
 */
export async function vozidlaSCommanderom(companyId: string): Promise<Set<string>> {
  const { ulozDoPamate, zPamate } = await import("./jazdy-lokalne");
  const kluc = `commander:${companyId}`;

  // Bez siete dotaz vyhodí — vtedy sa vezme posledný známy stav, nech odznak
  // pri aute nezmizne a človek nezačne merať jazdu, ktorú ťahá Commander.
  const { data, error } = await supabase
    .from("commander_vehicle_links")
    .select("faktero_vehicle_id")
    .eq("company_id", companyId)
    .then(
      (r) => r,
      (e) => ({ data: null, error: e as any }),
    );

  if (error || !data) {
    const zapamatane = await zPamate<string[]>(kluc);
    return new Set(zapamatane?.hodnota ?? []);
  }

  const idcka = data.map((r: any) => r.faktero_vehicle_id).filter(Boolean);
  void ulozDoPamate(kluc, idcka);
  return new Set(idcka);
}

/**
 * Odošle jazdy, ktoré telefón nahral, kým bola appka zavretá. Volá sa hneď po
 * otvorení appky, nielen na obrazovke Jazda — inak jazda čaká v telefóne dovtedy,
 * kým sa človek náhodou preklikne na tú správnu obrazovku.
 *
 * Uloží len tie, pri ktorých sa niet čoho pýtať: zaradenie prišlo z notifikácie
 * a auto je jednoznačné. Zvyšok nechá čakať — na obrazovke Jazda sa dorieši.
 */
export async function odosliCakajuceJazdy(
  companyId: string,
): Promise<{ ulozene: number; cakajuce: number }> {
  const jazdy = await nacitajRozpoznaneJazdy();
  if (!jazdy.length) return { ulozene: 0, cakajuce: 0 };

  const [{ data: vozidla }, commander] = await Promise.all([
    supabase.from("vehicles").select("id").eq("company_id", companyId).eq("active", true),
    vozidlaSCommanderom(companyId),
  ]);

  // Auto pripojené na Commander sa neponúka — jeho jazdy prídu odtiaľ.
  const dostupne = (vozidla ?? []).map((v: any) => v.id).filter((id: string) => !commander.has(id));

  let ulozene = 0;
  let cakajuce = 0;
  for (const jazda of jazdy) {
    const vehicleId = vozidloPreRozpoznanuJazdu({ companyId, dostupne });
    if (!jazda.classification || !vehicleId) {
      cakajuce++;
      continue;
    }
    const r = await ulozRozpoznanuJazdu({
      jazda,
      companyId,
      vehicleId,
      classification: jazda.classification,
    });
    if (r.ok) ulozene++;
    else cakajuce++;
  }
  return { ulozene, cakajuce };
}

/** Čo appka potrebuje vedieť o jazde, ktorá práve beží. */
export type BeziacaJazda = {
  id: string;
  /** Kedy sa začala, v milisekundách. */
  zaciatok: number;
  km: number;
  /** `true`, keď ju spustil človek tlačidlom — nie detekcia. */
  rucna: boolean;
};

/**
 * Jazda, ktorá práve beží. `null`, keď nič nebeží alebo appka nie je v telefóne.
 *
 * Detekcia si o jazde povie notifikáciou raz, v momente rozpoznania. Kto ju
 * prehliadne — telefón vo vrecku, režim sústredenia počas šoférovania —
 * nemá sa už ako dozvedieť, či sa jazda vôbec nahráva. Odtiaľto to appka vie
 * povedať kedykoľvek.
 */
export async function beziacaJazda(): Promise<BeziacaJazda | null> {
  const p = await plugin();
  if (!p) return null;
  try {
    const stav = await p.getState();
    const j = stav.activeTrip;
    // `activeTrip` ostáva vyplnené aj po skončení, kým si ho appka neprevezme.
    if (!j || j.endedAt != null) return null;
    return {
      id: j.id,
      zaciatok: j.startedAt,
      km: j.distanceMeters / 1000,
      rucna: Boolean(j.manual),
    };
  } catch {
    return null;
  }
}
