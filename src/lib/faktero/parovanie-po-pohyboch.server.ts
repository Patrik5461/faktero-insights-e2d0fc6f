/*
  Automatické párovanie po tom, čo na účty firmy pribudli nové pohyby.

  Volá ho synchronizácia s bankou (TB, Wise…) aj nahratie výpisu (provider
  `import`), aby sa pohyby z oboch ciest správali rovnako. Zapíše sa len isté
  — sporné dvojice ostávajú návrhmi v párovaní.

  Tri samostatné prechody: faktúry (prichádzajúce platby), splátky leasingov
  a úverov (odchádzajúce), úroky a poplatky z kontokorentu. Každý je
  nadstavba — keď jeden zlyhá, ostatné aj zapísané pohyby ostávajú.
*/

export type VysledokParovania = {
  faktur: number;
  splatok: number;
  kontokorent: number;
};

export async function sparujNovePohybyFirmy(
  companyId: string,
  zdroj = "bank-sync",
): Promise<VysledokParovania> {
  const vysledok: VysledokParovania = { faktur: 0, splatok: 0, kontokorent: 0 };

  /*
   * Nové pohyby hneď spárujeme. Zapíše sa len isté (sedí variabilný symbol
   * aj suma) — sporné ostávajú návrhmi, presne ako pri ručnom párovaní.
   * Bez tohto kroku by peniaze na účte ležali nespárované až dovtedy, kým
   * si niekto otvorí párovanie, a upozornenie o úhrade by nemalo vzniknúť.
   */
  try {
    const { sparujFirmuAutomaticky } = await import("./parovanie.functions");
    const { zapisanych, uhradene } = await sparujFirmuAutomaticky(companyId);
    vysledok.faktur = zapisanych;
    if (uhradene.length) {
      const { oznamUhradu } = await import("./push-uhrada.server");
      await oznamUhradu(companyId, uhradene);
    }
  } catch (e: any) {
    console.error(`[${zdroj}] párovanie firmy ${companyId} zlyhalo:`, e?.message ?? e);
  }

  /*
    To isté pre splátky leasingov a úverov. Je to samostatný prechod:
    faktúry sa párujú z prichádzajúcich platieb, splátky z odchádzajúcich,
    a pravidlá sú iné — pri splátkach nestačí suma, lebo sú každý mesiac
    rovnaké.
  */
  try {
    const { sparujSplatkyFirmyAutomaticky } = await import("./financovanie.functions");
    const { zapisanych } = await sparujSplatkyFirmyAutomaticky(companyId);
    vysledok.splatok = zapisanych;
    if (zapisanych > 0) {
      console.log(`[${zdroj}] firma ${companyId}: spárovaných splátok ${zapisanych}`);
    }
  } catch (e: any) {
    console.error(`[${zdroj}] párovanie splátok firmy ${companyId} zlyhalo:`, e?.message ?? e);
  }

  /*
    Úroky a poplatky z kontokorentu. Až po splátkach: čo si vzala splátka
    úveru, sem už neprejde. Párujú sa len pohyby z účtu, na ktorom rámec
    je, a len tie, ktoré o kontokorente výslovne hovoria.
  */
  try {
    const { sparujKontokorentyFirmyAutomaticky } = await import("./kontokorent.server");
    const { zapisanych } = await sparujKontokorentyFirmyAutomaticky(companyId);
    vysledok.kontokorent = zapisanych;
    if (zapisanych > 0) {
      console.log(
        `[${zdroj}] firma ${companyId}: spárovaných úrokov a poplatkov z kontokorentu ${zapisanych}`,
      );
    }
  } catch (e: any) {
    console.error(`[${zdroj}] párovanie kontokorentu firmy ${companyId} zlyhalo:`, e?.message ?? e);
  }

  return vysledok;
}
