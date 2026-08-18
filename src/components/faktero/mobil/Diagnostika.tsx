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
 * Dovtedy sa dala poslať len ako snímka obrazovky — čo znamená, že sa väčšinou
 * neposlala vôbec. Ide to cez ten istý kontaktný endpoint ako formulár na webe,
 * takže netreba novú tabuľku ani obrazovku v admine.
 */
async function posli(riadky: Riadok[]): Promise<void> {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data } = await supabase.auth
    .getSession()
    .catch(() => ({ data: { session: null } }) as any);
  const email = data?.session?.user?.email ?? "appka@faktero.sk";

  const sprava = [
    "Diagnostika z mobilnej aplikácie:",
    "",
    ...riadky.map((r) => `${r.co}: ${r.hodnota}${r.zle ? "  <-- problém" : ""}`),
  ].join("\n");

  const odpoved = await fetch("https://www.faktero.sk/api/public/kontakt", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Diagnostika z appky", email, message: sprava }),
  });
  if (!odpoved.ok) throw new Error(`server odpovedal ${odpoved.status}`);
}

export function Diagnostika({ onSpat }: { onSpat: () => void }) {
  const [riadky, setRiadky] = useState<Riadok[] | null>(null);
  const [odosielam, setOdosielam] = useState(false);
  const [odoslane, setOdoslane] = useState(false);

  useEffect(() => {
    zisti().then(setRiadky);
  }, []);

  return (
    <div className="min-h-[100dvh] bg-background p-5">
      <h1 className="text-base font-semibold">Diagnostika</h1>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Pošlite ju tlačidlom dole, alebo odfoťte — je v nej všetko podstatné.
      </p>

      <div className="mt-4 space-y-2">
        {riadky === null ? (
          <p className="text-sm text-muted-foreground">Zisťujem…</p>
        ) : (
          riadky.map((r) => (
            <div key={r.co} className="rounded-xl border border-border/70 p-3">
              <div className="text-[12px] uppercase tracking-wide text-muted-foreground">
                {r.co}
              </div>
              <div className={`text-[15px] ${r.zle ? "text-destructive" : ""}`}>{r.hodnota}</div>
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
        className="mt-6 w-full rounded-xl bg-primary px-4 py-3 text-[15px] font-medium text-primary-foreground disabled:opacity-50"
      >
        {odoslane ? "Odoslané, ďakujeme" : odosielam ? "Odosielam…" : "Poslať diagnostiku podpore"}
      </button>

      <button
        onClick={onSpat}
        className="mt-2 w-full rounded-xl border border-border px-4 py-3 text-[15px]"
      >
        Späť
      </button>
    </div>
  );
}
