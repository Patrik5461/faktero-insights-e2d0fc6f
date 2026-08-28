import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Čo appka v telefóne naozaj vidí.
 *
 * Pri hľadaní príčiny offline problémov sa ukázalo, že z obrazovky sa nedá
 * rozlíšiť starý balíček od nefunkčnej pamäte a od chýbajúceho pripojenia.
 * Táto obrazovka to povie naraz — stačí snímka.
 */
type Riadok = { co: string; hodnota: string; zle?: boolean };

async function zisti(): Promise<Riadok[]> {
  const r: Riadok[] = [];

  r.push({
    co: "balíček",
    hodnota: typeof __PECIATKA__ === "string" ? __PECIATKA__ : "web (bez pečiatky)",
  });
  r.push({ co: "adresa", hodnota: location.origin });
  r.push({ co: "sieť podľa systému", hodnota: navigator.onLine ? "online" : "offline" });

  // Jednoduché úložisko — drží prihlásenie aj malé pamäte.
  try {
    localStorage.setItem("faktero.diag", "1");
    localStorage.removeItem("faktero.diag");
    r.push({ co: "jednoduché úložisko", hodnota: "funguje" });
  } catch (e: any) {
    r.push({ co: "jednoduché úložisko", hodnota: String(e?.message ?? e), zle: true });
  }

  // IndexedDB — tam sú jazdy a väčšie zoznamy.
  try {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("faktero-jazdy");
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error ?? new Error("neotvorilo sa"));
      req.onblocked = () => reject(new Error("blokované"));
      setTimeout(() => reject(new Error("neodpovedalo do 5 s")), 5000);
    });
    r.push({ co: "IndexedDB", hodnota: "funguje" });
  } catch (e: any) {
    r.push({ co: "IndexedDB", hodnota: String(e?.message ?? e), zle: true });
  }

  // Čo je v pamäti appky.
  try {
    const { zPamate } = await import("@/lib/mobile/jazdy-lokalne");
    const firmy = await zPamate<any[]>("firmy");
    r.push({
      co: "firmy v pamäti",
      hodnota: firmy?.hodnota?.length
        ? `${firmy.hodnota.length} (uložené ${new Date(firmy.kedy).toLocaleString("sk-SK")})`
        : "žiadne",
      zle: !firmy?.hodnota?.length,
    });
  } catch (e: any) {
    r.push({ co: "firmy v pamäti", hodnota: String(e?.message ?? e), zle: true });
  }

  // Natívne úložisko — jediné, o ktorom vieme, že reštart appky prežije.
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) {
      r.push({ co: "natívne úložisko", hodnota: "nie je (beží web)" });
    } else {
      const { Preferences } = await import("@capacitor/preferences");
      await Preferences.set({ key: "faktero.diag", value: "1" });
      const { value } = await Preferences.get({ key: "faktero.pamat.firmy" });
      await Preferences.remove({ key: "faktero.diag" });
      const pocet = value ? (JSON.parse(value)?.hodnota?.length ?? 0) : 0;
      r.push({
        co: "natívne úložisko",
        hodnota: value ? `funguje, firiem ${pocet}` : "funguje, firmy zatiaľ neuložené",
        zle: !value,
      });
    }
  } catch (e: any) {
    r.push({ co: "natívne úložisko", hodnota: String(e?.message ?? e), zle: true });
  }

  // Kde býva prihlásenie. Toto je tá vec, na ktorej offline stálo a padalo:
  // v prehliadačovom úložisku reštart neprežije a bez signálu sa prihlásiť nedá.
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) {
      r.push({ co: "prihlásenie prežije reštart", hodnota: "nie je (beží web)" });
    } else {
      const { Preferences } = await import("@capacitor/preferences");
      const { keys } = await Preferences.keys();

      /*
        Relácia sa hľadá na dvoch miestach a v tomto poradí.

        Prihlasovací token je citlivý, takže `trvale-ulozisko` ho presunie do
        Keychainu a z bežného natívneho úložiska ho **zmaže**. Táto kontrola
        dovtedy pozerala len do Preferences — a hlásila „NIE" práve vtedy, keď
        appka robila tú bezpečnejšiu vec. Falošný poplach na mieste, kde má
        človek hľadať pravdu.
      */
      let kde: string | null = null;
      try {
        const { SecureStorage } = await import("@aparajita/capacitor-secure-storage");
        const trezorKluce = (await SecureStorage.keys()) as string[];
        if (trezorKluce.some((k) => /^sb-.*-auth-token$/.test(k))) kde = "áno, v Keychaine";
      } catch {
        // Starší build bez pluginu — token vtedy ostáva v Preferences nižšie.
      }
      if (!kde && keys.some((k) => /^sb-.*-auth-token$/.test(k))) {
        kde = "áno, v natívnom úložisku";
      }
      r.push({
        co: "prihlásenie prežije reštart",
        hodnota: kde ?? "NIE — relácia nie je natívne",
        zle: !kde,
      });
      /*
        Pozeralo sa na `faktero.offline.queue.` — kľúč fronty, ktorá bola
        medzitým zrušená, lebo ju nikto nevolal. Riadok tak vždy hlásil to isté
        bez ohľadu na skutočnosť. Faktúry čakajúce na signál sú jediné, čo v
        natívnom úložisku naozaj leží; jazdy a doklady sú v IndexedDB.
      */
      let cakajuce = 0;
      for (const k of keys.filter((x) => /^faktero\.faktury\.fronta\./.test(x))) {
        const { value } = await Preferences.get({ key: k });
        try {
          cakajuce += value ? (JSON.parse(value)?.length ?? 0) : 0;
        } catch {
          /* pokazený záznam nemá zhodiť celú diagnostiku */
        }
      }
      /*
        Z relácií na serveri vidno, že token sa obnovil úspešne a appka aj tak
        pýtala heslo. Bez tohto riadku sa nedá rozoznať, ktorá vetva štartu to
        rozhodla — a všetky vyzerajú zvonku rovnako.
      */
      const { nacitajStopu, popisStopy } = await import("@/lib/mobile/stopa-prihlasenia");
      const stopa = nacitajStopu();
      r.push({
        co: "posledné rozhodnutie o prihlásení",
        hodnota: popisStopy(stopa),
        zle: stopa?.vysledok === "poslaná na prihlásenie",
      });
      r.push({
        co: "faktúry čakajúce na signál",
        hodnota: cakajuce ? `${cakajuce}` : "žiadne — všetko je odoslané",
      });
    }
  } catch (e: any) {
    r.push({ co: "prihlásenie prežije reštart", hodnota: String(e?.message ?? e), zle: true });
  }

  /*
    Detekcia jazdy. Keď notifikácia „Ide o služobnú cestu?" počas jazdy nepríde,
    príčina je takmer vždy v jednom z týchto štyroch riadkov — a zvonku sa
    nedá rozoznať ani jeden od druhého.
  */
  try {
    const { diagnostikaDetekcie } = await import("@/lib/mobile/auto-jazdy-sync");
    const d = await diagnostikaDetekcie();
    if (!d.dostupna) {
      r.push({ co: "detekcia jázd", hodnota: "nie je (beží web alebo starší build)" });
    } else {
      r.push({
        co: "detekcia jázd",
        hodnota: d.zapnuta
          ? d.aktivna
            ? "zapnutá, práve nahráva jazdu"
            : "zapnutá, čaká na jazdu"
          : "VYPNUTÁ — zapína sa na obrazovke Jazda",
        zle: !d.zapnuta,
      });

      const poloha = d.povolenia?.location;
      const pozadie = d.povolenia?.background;
      r.push({
        co: "poloha pre detekciu",
        hodnota:
          poloha !== "granted"
            ? "zakázaná — bez nej detekcia nefunguje"
            : pozadie === "granted"
              ? "Vždy — meria aj s telefónom vo vrecku"
              : "len „Počas používania“ — na pozadí sa nemeria",
        zle: poloha !== "granted" || pozadie !== "granted",
      });

      /*
        Znížená presnosť je jediná príčina, ktorú nevidno nikde inde: povolenia
        vyzerajú v poriadku, detekcia je zapnutá — a merania chodia s odchýlkou
        v kilometroch, takže sa všetky zahodia a jazda sa nepotvrdí nikdy.
      */
      const presna = d.povolenia?.precise;
      if (presna) {
        r.push({
          co: "presná poloha",
          hodnota:
            presna === "granted"
              ? "zapnutá"
              : "VYPNUTÁ — merania sú mimo o stovky metrov a jazda sa nerozpozná",
          zle: presna !== "granted",
        });
      }

      /*
        Obnovovanie na pozadí je tá istá trieda príčiny ako znížená presnosť:
        povolenia svietia zeleno, detekcia je zapnutá — a systém appku pri
        presune nespustí, takže sa nezačne ani overovať.
      */
      const obnovovanie = d.povolenia?.backgroundRefresh;
      if (obnovovanie) {
        r.push({
          co: "obnovovanie na pozadí",
          hodnota:
            obnovovanie === "granted"
              ? "zapnuté"
              : "VYPNUTÉ — systém appku pri presune nezobudí a jazda sa nezačne nahrávať",
          zle: obnovovanie !== "granted",
        });
      }

      const uspora = d.povolenia?.lowPower;
      if (uspora) {
        r.push({
          co: "režim nízkej spotreby",
          hodnota: uspora === "on" ? "ZAPNUTÝ — obmedzuje prácu na pozadí" : "vypnutý",
          zle: uspora === "on",
        });
      }

      r.push({
        co: "pohybové senzory",
        hodnota:
          d.povolenia?.motion === "granted"
            ? "povolené — jazda sa potvrdí rýchlejšie"
            : "nie sú — prah rýchlosti musí držať dlhšie",
      });

      r.push({
        co: "rozpoznané jazdy čakajúce v telefóne",
        hodnota: d.nevybavene ? `${d.nevybavene}` : "žiadne",
      });

      /*
        Denník detekcie. Bez neho sa „notifikácia neprišla" nedá posunúť ďalej:
        nevie sa, či systém detekciu vôbec zobudil, alebo zobudil a jazda
        neprešla prahom rýchlosti.
      */
      if (d.dennik) {
        const cas = (ms?: number) => (ms ? new Date(ms).toLocaleString("sk-SK") : null);
        r.push({
          co: "prebudenia detekcie",
          hodnota: d.dennik.prebudeni
            ? `${d.dennik.prebudeni}× , posledné ${cas(d.dennik.poslednePrebudenie) ?? "?"}`
            : "žiadne — systém detekciu ešte nezobudil",
          zle: d.zapnuta && d.dennik.prebudeni === 0,
        });
        /*
          Čím bola appka zobudená. Významná zmena polohy je na začiatok jazdy
          pririedka — za tri hodiny vrátane diaľnice zobudila appku štyrikrát.
          Pribudol kruh okolo posledného miesta a odchod z miesta; tento rozpad
          povie, ktorý z nich prácu naozaj robí.
        */
        r.push({
          co: "čím bola detekcia zobudená",
          hodnota: [
            `zmena polohy ${d.dennik.prebudeniVyznamna ?? 0}×`,
            `opustenie kruhu ${d.dennik.prebudeniKruh ?? 0}×`,
            `odchod z miesta ${d.dennik.prebudeniOdchod ?? 0}×`,
          ].join(", "),
        });
        /*
          Rýchlosť sa pri každom prebudení nuluje, takže vedľa počtu overovaní
          zvádzala čítať, že za sto pokusov detekcia nevidela nikdy nič. Číslo
          z posledného overovania a číslo za celý čas sú preto oddelené.
        */
        r.push({
          co: "overenia bez jazdy",
          hodnota: d.dennik.neuspesnychOvereni ? `${d.dennik.neuspesnychOvereni}×` : "žiadne",
        });
        r.push({
          co: "najvyššia videná rýchlosť",
          hodnota: `${Math.round(d.dennik.najvyssiaRychlost)} km/h pri poslednom overovaní, ${Math.round(
            d.dennik.najvyssiaRychlostVobec ?? 0,
          )} km/h za celý čas`,
        });
        /*
          Toto rozlíši tri príčiny, ktoré zvonku vyzerajú rovnako: systém po
          prebudení nedodá žiadne meranie, dodá len hrubé sieťové polohy
          (GPS sa nezapne), alebo dodá dobré merania a auto naozaj stálo.
        */
        if (d.dennik.fixovVOvereni != null) {
          const presnost =
            d.dennik.najlepsiaPresnost != null
              ? `, najlepšia presnosť ${Math.round(d.dennik.najlepsiaPresnost)} m`
              : "";
          /*
            Počítadlá sa nulujú pri každom prebudení a začínajú od nuly aj po
            aktualizácii. Nula preto sama osebe nič nehovorí — kým neprebehlo
            overovanie, nie je čo hodnotiť. Bez tohto rozlíšenia hlásila
            diagnostika problém aj vtedy, keď sa po aktualizácii ešte nejazdilo.
          */
          const nemerane = d.dennik.fixovVOvereni === 0;
          r.push({
            co: "merania pri poslednom overovaní",
            hodnota: nemerane
              ? "zatiaľ žiadne — číslo tu bude po najbližšej jazde"
              : `${d.dennik.fixovVOvereni} prišlo, ${d.dennik.pouzitelnychVOvereni} dosť presných${presnost}`,
            // Za problém sa berie len to, keď merania prišli a ani jedno
            // nebolo dosť presné — vtedy GPS naozaj nechytila.
            zle: !nemerane && d.dennik.pouzitelnychVOvereni === 0,
          });
        }
        if (d.dennik.spusteniProcesu != null) {
          r.push({
            co: "spustení appky na pozadí",
            hodnota: `${d.dennik.spusteniProcesu}×, meraní od posledného spustenia ${d.dennik.fixovOdSpustenia ?? 0}`,
          });
        }
        r.push({
          co: "naposledy rozpoznaná jazda",
          hodnota: cas(d.dennik.poslednaJazda) ?? "zatiaľ žiadna",
        });
        if (d.dennik.stav === "overuje") {
          r.push({
            co: "práve overuje",
            hodnota: `${Math.round(d.dennik.sekundyNadPrahom)} z ${Math.round(
              d.dennik.potrebnychSekund,
            )} s nad prahom rýchlosti`,
          });
        }
      }
    }
  } catch (e: any) {
    r.push({ co: "detekcia jázd", hodnota: String(e?.message ?? e), zle: true });
  }

  // Povolenie na notifikácie. Platí spoločne pre push zo servera aj pre
  // notifikáciu, ktorou sa detekcia pýta na zaradenie jazdy.
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const { receive } = await PushNotifications.checkPermissions();
      r.push({
        co: "notifikácie",
        hodnota: receive === "granted" ? "povolené" : `NIE — systém hlási „${receive}“`,
        zle: receive !== "granted",
      });
    }
  } catch (e: any) {
    r.push({ co: "notifikácie", hodnota: String(e?.message ?? e), zle: true });
  }

  /*
    Okno povolení pre knihu jázd. Bez tohto riadku sa nedá odlíšiť „appka sa
    nepýta, lebo je pokazená" od „appka sa nepýta, lebo je všetko povolené".
  */
  try {
    const { stavPovoleniJazd, uzSmeSaPytali } = await import("@/lib/mobile/povolenia-jazd");
    const chyba = await stavPovoleniJazd();
    if (chyba) {
      const pytane = (await uzSmeSaPytali()) ? " (už sa pýtalo)" : "";
      r.push({
        co: "okno povolení",
        hodnota: chyba.length ? `chýba: ${chyba.join(", ")}${pytane}` : `netreba nič${pytane}`,
      });
    }
  } catch {
    /* na iOS a na webe sa okno nepoužíva */
  }

  /*
    Posledný pád aplikácie.

    „Aplikácia sa opakovane zastavuje" nezanechá nič, čo by sa dalo poslať —
    výpis ostane v systémovom logu telefónu a bez počítača sa k nemu nedá
    dostať. Odteraz si ho appka zapamätá a pošle sa spolu s diagnostikou.
  */
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("DriveDetector")) {
      const { DriveDetector } = await import("@faktero/drive-detector");
      const pad = await DriveDetector.getLastCrash?.();
      if (pad?.crash) r.push({ co: "posledný pád aplikácie", hodnota: pad.crash, zle: true });
    }
  } catch {
    /* staršia binárka pády nezaznamenáva */
  }

  // Prihlásenie — a hlavne či sa naň vôbec dá spýtať.
  try {
    const odpoved = await Promise.race([
      supabase.auth.getSession().then(({ data }) => (data.session ? "je" : "žiadne")),
      new Promise<string>((res) => setTimeout(() => res("neodpovedalo do 5 s"), 5000)),
    ]);
    r.push({ co: "prihlásenie", hodnota: odpoved, zle: odpoved.includes("neodpoved") });
  } catch (e: any) {
    r.push({ co: "prihlásenie", hodnota: String(e?.message ?? e), zle: true });
  }

  // Spojenie so serverom — krátke, nech to offline netrvá.
  try {
    const riadenie = new AbortController();
    setTimeout(() => riadenie.abort(), 4000);
    const odp = await fetch("https://www.faktero.sk/api/mobil/nic", {
      method: "OPTIONS",
      signal: riadenie.signal,
    });
    r.push({ co: "server", hodnota: `odpovedal ${odp.status}` });
  } catch (e: any) {
    r.push({ co: "server", hodnota: String(e?.message ?? e).slice(0, 60) });
  }

  return r;
}

/**
 * Odošle diagnostiku na podporu.
 *
 * Chodilo to na verejný kontaktný endpoint, ktorý **len pošle e-mail a nikam
 * nič neuloží**. Odoslaná diagnostika tak skončila v schránke a pri hľadaní
 * príčiny sa k nej nedalo dostať inak než preposlaním. Ide preto cez tú istú
 * cestu ako nahlásenie chyby (`spatna-vazba`): zapíše sa do `feedback`
 * a e-mail odíde tiež.
 */
async function posli(riadky: Riadok[]): Promise<void> {
  const { volajOperaciu } = await import("@/lib/mobile/server-most-volanie");
  const { getActiveCompanyId } = await import("@/lib/faktero/active-company");

  const sprava = [
    "Diagnostika z mobilnej aplikácie:",
    "",
    ...riadky.map((r) => `${r.co}: ${r.hodnota}${r.zle ? "  <-- problém" : ""}`),
  ].join("\n");

  await volajOperaciu("spatna-vazba", {
    kind: "chyba",
    message: sprava.slice(0, 4000),
    url: "app://diagnostika",
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 400) : undefined,
    company_id: getActiveCompanyId() ?? undefined,
  });
}

export function Diagnostika({ onSpat }: { onSpat: () => void }) {
  const [riadky, setRiadky] = useState<Riadok[] | null>(null);
  const [odosielam, setOdosielam] = useState(false);
  const [odoslane, setOdoslane] = useState(false);

  useEffect(() => {
    zisti().then(setRiadky);
  }, []);

  return (
    <div className="min-h-[100dvh] bg-app-pozadie p-5">
      <h1 className="text-base font-semibold">Diagnostika</h1>
      <p className="mt-1 text-[13px] text-app-text-2">
        Pošlite ju tlačidlom dole, alebo odfoťte — je v nej všetko podstatné.
      </p>

      <div className="mt-4 space-y-2">
        {riadky === null ? (
          <p className="text-sm text-app-text-2">Zisťujem…</p>
        ) : (
          riadky.map((r) => (
            <div key={r.co} className="rounded-app-sm border border-app-ramik p-3">
              <div className="text-[12px] uppercase tracking-wide text-app-text-2">{r.co}</div>
              <div className={`text-[15px] ${r.zle ? "text-app-chyba" : ""}`}>{r.hodnota}</div>
            </div>
          ))
        )}
      </div>

      <button
        disabled={!riadky || odosielam || odoslane}
        onClick={async () => {
          if (!riadky) return;
          setOdosielam(true);
          try {
            await posli(riadky);
            setOdoslane(true);
          } catch (e: any) {
            alert(`Odoslať sa to nepodarilo (${e?.message ?? "chyba"}). Odfoťte obrazovku.`);
          } finally {
            setOdosielam(false);
          }
        }}
        className="mt-6 w-full rounded-app-sm bg-app-zelena px-4 py-3 text-[15px] font-medium text-white disabled:opacity-50"
      >
        {odoslane ? "Odoslané, ďakujeme" : odosielam ? "Odosielam…" : "Poslať diagnostiku podpore"}
      </button>

      <button
        onClick={onSpat}
        className="mt-2 w-full rounded-app-sm border border-app-ramik px-4 py-3 text-[15px]"
      >
        Späť
      </button>
    </div>
  );
}
