/**
 * Denný beh bánk mimo odpovede.
 *
 * Sťahovanie trvalo 21 sekúnd pri piatich pripojeniach Tatra banky a jednom
 * Wise. Nginx požiadavku po **30 sekundách** preruší, takže pri ďalších
 * pripojeniach by beh spadol — a spadol by ticho: cron by dostal chybu
 * spojenia, hoci server ťahá ďalej, a v logu by ostala polovica práce. To isté
 * sme už raz riešili pri notifikáciách z banky.
 *
 * Preto sa práca spúšťa a odpoveď odchádza hneď. Výsledok si beh odloží sem a
 * dá sa naň doptať — inak by sa po ňom nedalo pozrieť inak než v logu.
 */

export type StavBehu = {
  bezi: boolean;
  zacalo: string | null;
  skoncilo: string | null;
  vysledok: unknown | null;
  chyba: string | null;
};

const stav: StavBehu = {
  bezi: false,
  zacalo: null,
  skoncilo: null,
  vysledok: null,
  chyba: null,
};

/** Kópia, nech sa do stavu nedá zvonku zapísať. */
export function stavBehu(): StavBehu {
  return { ...stav };
}

/**
 * Spustí denný beh na pozadí. Vráti `false`, ak už jeden beží.
 *
 * Dva súbežné behy nie sú chyba dát — vkladanie pohybov zniesie opakovanie —
 * ale zbytočne dvakrát ťahajú z banky a druhý beh by prepísal výsledok toho
 * prvého. Cron púšťa raz denne, toto je poistka pre ručné spustenie navrch.
 */
export function spustiDennyBeh(daysBack: number): boolean {
  if (stav.bezi) return false;

  stav.bezi = true;
  stav.zacalo = new Date().toISOString();
  stav.skoncilo = null;
  stav.vysledok = null;
  stav.chyba = null;

  void (async () => {
    try {
      const { runDailyBankSync } = await import("./bank-sync.server");
      const tb = await runDailyBankSync(daysBack);

      /*
        Ostatné banky sa počítajú zvlášť a ich zlyhanie nesmie zahodiť už
        stiahnutú Tatra banku — to je tá, ktorou firmy naozaj platia.
      */
      let ostatne: unknown = null;
      let chybaOstatnych: string | null = null;
      try {
        const { runDailySyncOstatnych } = await import("./bank-sync-ostatne.server");
        ostatne = await runDailySyncOstatnych();
      } catch (e: any) {
        chybaOstatnych = e?.message ?? "sync_failed";
        console.error("[bank-sync] ostatné banky zlyhali:", chybaOstatnych);
      }

      stav.vysledok = { ...tb, ostatne, ...(chybaOstatnych ? { chybaOstatnych } : {}) };
    } catch (e: any) {
      stav.chyba = e?.message ?? "sync_failed";
      console.error("[bank-sync] denný beh zlyhal:", stav.chyba);
    } finally {
      stav.bezi = false;
      stav.skoncilo = new Date().toISOString();
    }
  })();

  return true;
}
