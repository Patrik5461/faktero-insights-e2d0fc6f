/*
  Rozúčtovanie jedného dokladu na viac riadkov — každý s vlastnou
  predkontáciou, členením DPH, sadzbou a sumou. Napríklad faktúra za
  materiál aj réžiu, alebo bloček, kde je tankovanie aj občerstvenie.

  Súčty po sadzbách musia sedieť s rozpisom DPH dokladu na cent — inak by
  Pohoda zaúčtovala inú daň, než aká ide do priznania z Faktera.
*/

export type RiadokRozuctovania = {
  predkontacia: string | null;
  clenenie: string | null;
  sadzba: number;
  zaklad: number;
  dph: number;
  text?: string | null;
};

export type RozpisSadzby = { sadzba: number; zaklad: number; dph: number };

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function dphZoZakladu(zaklad: number, sadzba: number): number {
  return r2((Number(zaklad) || 0) * ((Number(sadzba) || 0) / 100));
}

/** Rozpis zlúčený po sadzbách (doklad môže mať tú istú sadzbu viackrát). */
function poSadzbach(r: RozpisSadzby[]): Map<number, { zaklad: number; dph: number }> {
  const m = new Map<number, { zaklad: number; dph: number }>();
  for (const x of r) {
    const k = Number(x.sadzba) || 0;
    const v = m.get(k) ?? { zaklad: 0, dph: 0 };
    v.zaklad = r2(v.zaklad + (Number(x.zaklad) || 0));
    v.dph = r2(v.dph + (Number(x.dph) || 0));
    m.set(k, v);
  }
  return m;
}

/** Čo ešte ostáva rozúčtovať v každej sadzbe dokladu (záporné = prečerpané). */
export function zostava(riadky: RiadokRozuctovania[], rozpis: RozpisSadzby[]): RozpisSadzby[] {
  const dokl = poSadzbach(rozpis);
  const roz = poSadzbach(riadky);
  const sadzby = [...new Set([...dokl.keys(), ...roz.keys()])].sort((a, b) => b - a);
  return sadzby.map((s) => ({
    sadzba: s,
    zaklad: r2((dokl.get(s)?.zaklad ?? 0) - (roz.get(s)?.zaklad ?? 0)),
    dph: r2((dokl.get(s)?.dph ?? 0) - (roz.get(s)?.dph ?? 0)),
  }));
}

/**
 * Prečo sa rozúčtovanie uložiť nedá, alebo `null`.
 * Prázdne rozúčtovanie je v poriadku — doklad sa zaúčtuje jedným kódom.
 */
export function chybaRozuctovania(riadky: RiadokRozuctovania[], rozpis: RozpisSadzby[]): string | null {
  if (!riadky.length) return null;
  if (riadky.length === 1) return "Rozúčtovanie potrebuje aspoň dva riadky — na jeden kód stačí zaúčtovanie.";
  if (riadky.length > 50) return "Najviac 50 riadkov.";
  const sadzbyDokladu = new Set(rozpis.map((x) => Number(x.sadzba) || 0));
  for (const [i, r] of riadky.entries()) {
    if (!String(r.predkontacia ?? "").trim() && !String(r.clenenie ?? "").trim())
      return `Riadok ${i + 1}: chýba predkontácia aj členenie DPH.`;
    if (!Number.isFinite(Number(r.zaklad)) || !Number.isFinite(Number(r.dph)))
      return `Riadok ${i + 1}: suma nie je číslo.`;
    if (rozpis.length && !sadzbyDokladu.has(Number(r.sadzba) || 0))
      return `Riadok ${i + 1}: sadzba ${r.sadzba} % na doklade nie je.`;
  }
  const rozdiel = zostava(riadky, rozpis).filter(
    (x) => Math.abs(x.zaklad) >= 0.005 || Math.abs(x.dph) >= 0.005,
  );
  if (rozdiel.length) {
    return (
      "Súčty nesedia s dokladom: " +
      rozdiel
        .map(
          (x) =>
            `${x.sadzba} % — ${x.zaklad > 0 ? "chýba" : "navyše"} základ ${Math.abs(x.zaklad).toFixed(2)}` +
            (Math.abs(x.dph) >= 0.005 ? `, DPH ${Math.abs(x.dph).toFixed(2)}` : ""),
        )
        .join("; ")
    );
  }
  return null;
}

/**
 * Prvé rozúčtovanie: jeden riadok na každú sadzbu dokladu, s kódmi, ktoré
 * doklad má. Človek potom riadok rozdelí alebo pridá ďalší.
 */
export function zaciatokRozuctovania(
  rozpis: RozpisSadzby[],
  kody: { predkontacia: string | null; clenenie: string | null },
): RiadokRozuctovania[] {
  const riadky = [...poSadzbach(rozpis).entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([sadzba, v]) => ({ ...kody, sadzba, zaklad: v.zaklad, dph: v.dph, text: "" }));
  // Jedna sadzba → rozdelí sa na dva riadky, nech je čo upravovať.
  if (riadky.length === 1) {
    const r = riadky[0];
    const pol = r2(r.zaklad / 2);
    const dph1 = dphZoZakladu(pol, r.sadzba);
    return [
      { ...r, zaklad: pol, dph: dph1 },
      { ...r, predkontacia: "", clenenie: r.clenenie, zaklad: r2(r.zaklad - pol), dph: r2(r.dph - dph1) },
    ];
  }
  return riadky;
}

/** Zvyšok sadzby doplní do riadku `i` — na dorovnanie centov po ručnom delení. */
export function dorovnaj(
  riadky: RiadokRozuctovania[],
  rozpis: RozpisSadzby[],
  i: number,
): RiadokRozuctovania[] {
  const r = riadky[i];
  if (!r) return riadky;
  const z = zostava(riadky, rozpis).find((x) => x.sadzba === (Number(r.sadzba) || 0));
  if (!z) return riadky;
  return riadky.map((x, j) =>
    j === i ? { ...x, zaklad: r2(x.zaklad + z.zaklad), dph: r2(x.dph + z.dph) } : x,
  );
}

/** Uloženie: čísla zaokrúhlené, kódy orezané, prázdne texty preč. */
export function ocisti(riadky: RiadokRozuctovania[]): RiadokRozuctovania[] {
  return riadky.map((r) => ({
    predkontacia: String(r.predkontacia ?? "").trim().slice(0, 30) || null,
    clenenie: String(r.clenenie ?? "").trim().slice(0, 30) || null,
    sadzba: Number(r.sadzba) || 0,
    zaklad: r2(Number(r.zaklad) || 0),
    dph: r2(Number(r.dph) || 0),
    text: String(r.text ?? "").trim().slice(0, 90) || null,
  }));
}

/** Rozúčtovanie z JSON stĺpca — čokoľvek iné ako pole riadkov je „žiadne". */
export function nacitajRozuctovanie(v: unknown): RiadokRozuctovania[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x) => x && typeof x === "object")
    .map((x: any) => ({
      predkontacia: x.predkontacia ?? null,
      clenenie: x.clenenie ?? null,
      sadzba: Number(x.sadzba) || 0,
      zaklad: Number(x.zaklad) || 0,
      dph: Number(x.dph) || 0,
      text: x.text ?? null,
    }));
}

/**
 * Rozpis DPH bločku či výdavkového dokladu — ten istý, z ktorého píše súhrn
 * export do Pohody. Starší doklad má len jednu sadzbu v hlavičke.
 */
export function rozpisBlocku(d: any): RozpisSadzby[] {
  const r = Array.isArray(d?.vat_breakdown) ? d.vat_breakdown : null;
  if (r?.length) {
    return (r as Record<string, unknown>[])
      .map((x) => ({
        sadzba: Number(x?.sadzba ?? 0),
        zaklad: Number(x?.zaklad ?? 0),
        dph: Number(x?.dph ?? 0),
      }))
      .filter((x) => x.zaklad || x.dph);
  }
  const zaklad = Number(d?.net_amount ?? 0);
  const dph = Number(d?.vat_amount ?? 0);
  if (!zaklad && !dph) return [];
  return [{ sadzba: Number(d?.vat_rate ?? 0), zaklad, dph }];
}
