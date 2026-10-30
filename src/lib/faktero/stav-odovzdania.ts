/*
  Stav odovzdania dokladu do účtovníctva (Pohoda) — z histórie, ktorú drží
  spúšťač `faktero_historia_odovzdania` (prvy_export_at, pocet_exportov,
  export_cesta, vratene_z_pohody_at, oprava_zauctovania_*).

  Doklad, ktorý raz odišiel z Faktera, ostáva v Pohode, aj keď ho niekto vráti
  na opravu — Faktero ho tam zmazať nevie (P-1008). Odznak sa preto po vrátení
  nestratí, len zmení význam: „odovzdané, vrátené na opravu — treba znova
  odovzdať“.

  Pohoda doklad z XML neprepíše: agenda faktúr (`inv:invoice`, kam patria aj
  prijaté faktúry a bločky) nemá v schéme Stormware `actionType` — overené
  proti XSD, `<inv:actionType><inv:update>` validácia odmietne. Konektor aj
  súbor teda vedia doklad len založiť, nie opraviť ani zmazať (P-1009).
*/

export type CestaOdovzdania = "konektor" | "subor" | "prenos" | "ine";

export type DruhOdovzdania =
  /** Do účtovníctva ešte neodišiel. */
  | "nie"
  /** Je v Pohode (prvýkrát). */
  | "odovzdane"
  /** Je v Pohode znova — po vrátení odišiel ešte raz. */
  | "odovzdane_znova"
  /** Bol v Pohode, vrátili ho na opravu — treba ho znova odovzdať (a starý v Pohode zmazať). */
  | "vratene"
  /** Je v Pohode, zaúčtovanie sa opravilo vo Fakteri — v Pohode ho treba prepísať ručne. */
  | "oprava_zauctovania";

export type RiadokOdovzdania = {
  exported_at?: string | null;
  prvy_export_at?: string | null;
  pocet_exportov?: number | null;
  export_cesta?: string | null;
  vratene_z_pohody_at?: string | null;
  oprava_zauctovania_at?: string | null;
  oprava_zauctovania_povodne?: unknown;
};

export type StavOdovzdania = {
  druh: DruhOdovzdania;
  /** Kedy odišiel prvýkrát (aj keď je teraz vrátený). */
  prvy: string | null;
  /** Kedy odišiel naposledy (len keď je teraz odovzdaný). */
  posledny: string | null;
  pocet: number;
  cesta: CestaOdovzdania | null;
  vratene: string | null;
  /** Doklad v Pohode je (alebo bol a nikto ho tam nezmazal). */
  vPohode: boolean;
};

export function stavOdovzdania(r: RiadokOdovzdania | null | undefined): StavOdovzdania {
  const exp = r?.exported_at ?? null;
  // Staršie riadky bez histórie: odovzdaný doklad sa ráta aspoň raz.
  const pocet = Math.max(Number(r?.pocet_exportov ?? 0) || 0, exp ? 1 : 0);
  const cesta = (
    ["konektor", "subor", "prenos", "ine"].includes(String(r?.export_cesta))
      ? r?.export_cesta
      : null
  ) as CestaOdovzdania | null;
  const prvy = r?.prvy_export_at ?? exp;
  const zaklad = {
    prvy: prvy ?? null,
    posledny: exp,
    pocet,
    cesta,
    vratene: null as string | null,
  };
  if (exp) {
    if (r?.oprava_zauctovania_at) return { ...zaklad, druh: "oprava_zauctovania", vPohode: true };
    return { ...zaklad, druh: pocet > 1 ? "odovzdane_znova" : "odovzdane", vPohode: true };
  }
  if (pocet > 0 || r?.vratene_z_pohody_at)
    return {
      ...zaklad,
      pocet: Math.max(pocet, 1),
      druh: "vratene",
      vratene: r?.vratene_z_pohody_at ?? null,
      vPohode: true,
    };
  return { ...zaklad, druh: "nie", vPohode: false };
}

/** Krátky text odznaku (slovenský kľúč pre `t()`). */
export function textOdznaku(s: StavOdovzdania): string | null {
  switch (s.druh) {
    case "odovzdane":
      return "V Pohode";
    case "odovzdane_znova":
      return "V Pohode (odovzdané znova)";
    case "vratene":
      return "Odovzdané, vrátené na opravu";
    case "oprava_zauctovania":
      return "V Pohode — prepísať zaúčtovanie";
    default:
      return null;
  }
}

/** Ako doklad odišiel — slovenský kľúč pre `t()`. */
export function textCesty(c: CestaOdovzdania | null): string | null {
  switch (c) {
    case "konektor":
      return "konektorom";
    case "subor":
      return "XML súborom (stiahnutie, balík alebo e-mail)";
    case "prenos":
      return "prenosom z iného programu";
    default:
      return null;
  }
}

export type DruhDokladuOdovzdania = "faktura" | "prijata" | "doklad";

/**
 * Varovanie pred „Vrátiť z Pohody“ — povie pravdu podľa toho, ako doklad
 * odišiel. Faktero doklad v Pohode nezmaže nikdy (ani konektor), takže pri
 * oprave len zaúčtovania odporučí „Opraviť zaúčtovanie“.
 */
export function textVarovaniaVratenia(
  druh: DruhDokladuOdovzdania,
  cesta: CestaOdovzdania | null,
  /**
   * Iný program než Pohoda (`nazovProgramuExportu`) — text má zástupný znak
   * `{program}`, volajúci ho dosadí v `t()`. Null/prázdne = Pohoda.
   */
  program?: string | null,
): string {
  const doklad = druh === "doklad";
  if (program)
    return doklad
      ? "Vrátiť doklad z účtovníctva ({program})? Vráti sa medzi nespracované a po oprave ho môžete exportovať znova. Faktero doklad v programe {program} nezmaže — zmažte ho tam ručne, inak tam po ďalšom exporte bude dvakrát. Ak treba opraviť len predkontáciu, členenie alebo stredisko, použite radšej „Opraviť zaúčtovanie“."
      : "Vrátiť faktúru z účtovníctva ({program})? Zaúčtovanie sa zruší a po oprave ju môžete exportovať znova. Faktero doklad v programe {program} nezmaže — zmažte ho tam ručne, inak tam po ďalšom exporte bude dvakrát. Ak treba opraviť len predkontáciu, členenie alebo stredisko, použite radšej „Opraviť zaúčtovanie“.";
  const uvod = doklad
    ? "Vrátiť doklad z Pohody? Vráti sa medzi nespracované a po oprave pri ďalšom odovzdaní pôjde do Pohody znova."
    : "Vrátiť faktúru z Pohody? Zaúčtovanie sa zruší a po oprave pri ďalšom odovzdaní pôjde do Pohody znova.";
  const zmaz =
    cesta === "konektor"
      ? "Konektor doklad v Pohode nezmaže — Pohoda cez XML mazať ani prepisovať doklady nedovolí. Konektor ho po oprave pošle znova sám pri najbližšom behu, preto ho v Pohode zmažte ručne ešte predtým, inak tam bude dvakrát."
      : "Faktero doklad v Pohode nezmaže — Pohoda cez XML mazať ani prepisovať doklady nedovolí. V Pohode ho zmažte ručne, inak tam po ďalšom odovzdaní bude dvakrát.";
  return `${uvod} ${zmaz} Ak treba opraviť len predkontáciu, členenie alebo stredisko, použite radšej „Opraviť zaúčtovanie“ — doklad ostane v Pohode a nič sa nemaže.`;
}

/** Polia, ktoré „Opraviť zaúčtovanie“ odomkne — rovnaké v migrácii (`_polia_opravy`). */
export const POLIA_OPRAVY = [
  "pohoda_predkontacia",
  "pohoda_clenenie_dph",
  "kv_clenenie",
  "stredisko",
  "cinnost",
  "int_poznamka",
] as const;
export type PoleOpravy = (typeof POLIA_OPRAVY)[number];

/** Názov poľa pre ľudí (slovenský kľúč pre `t()`). */
export const NAZVY_POLI_OPRAVY: Record<PoleOpravy, string> = {
  pohoda_predkontacia: "Predkontácia",
  pohoda_clenenie_dph: "Členenie DPH",
  kv_clenenie: "Členenie KV DPH",
  stredisko: "Stredisko",
  cinnost: "Činnosť",
  int_poznamka: "Účtovná poznámka",
};

export type HodnotyOpravy = Partial<Record<PoleOpravy, string | null>>;

/** Zaúčtovanie z riadku dokladu — prázdne reťazce ako null. */
export function zauctovanieZRiadku(r: Record<string, unknown>): Record<PoleOpravy, string | null> {
  const o = {} as Record<PoleOpravy, string | null>;
  for (const p of POLIA_OPRAVY) {
    const v = r?.[p];
    o[p] = v == null || String(v).trim() === "" ? null : String(v).trim();
  }
  return o;
}

/**
 * Zápis opravy: len zaúčtovacie polia, nič iné. Neznáme kľúče sa zahodia —
 * sumy, dátumy ani strany sa cez opravu zaúčtovania zmeniť nedajú.
 */
export function zapisOpravy(vstup: Record<string, unknown>): HodnotyOpravy {
  const o: HodnotyOpravy = {};
  for (const p of POLIA_OPRAVY) {
    if (!(p in (vstup ?? {}))) continue;
    const v = vstup[p];
    o[p] =
      v == null || String(v).trim() === ""
        ? null
        : String(v)
            .trim()
            .slice(0, p === "int_poznamka" ? 200 : 40);
  }
  return o;
}

export type ZmenaOpravy = { pole: PoleOpravy; v_pohode: string | null; teraz: string | null };

/** Čo treba v Pohode prepísať: rozdiel medzi pôvodným (v Pohode) a súčasným zaúčtovaním. */
export function zmenyOpravy(povodne: unknown, riadok: Record<string, unknown>): ZmenaOpravy[] {
  if (!povodne || typeof povodne !== "object") return [];
  const p = povodne as Record<string, unknown>;
  const teraz = zauctovanieZRiadku(riadok);
  const out: ZmenaOpravy[] = [];
  for (const pole of POLIA_OPRAVY) {
    const a = p[pole] == null || String(p[pole]).trim() === "" ? null : String(p[pole]).trim();
    if (a !== teraz[pole]) out.push({ pole, v_pohode: a, teraz: teraz[pole] });
  }
  return out;
}
