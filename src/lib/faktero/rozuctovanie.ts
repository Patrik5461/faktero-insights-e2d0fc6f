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
  /** Členenie kontrolného výkazu riadku; prázdne = z dokladu. */
  kv?: string | null;
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
    kv: String(r.kv ?? "").trim().slice(0, 5) || null,
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
      kv: x.kv ?? null,
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

/* ------------------------------------------------- účtovanie pomerom */

export type PomerPredkontacie =
  | {
      typ: "pomer";
      casti: { podiel: number; predkontacia: string; odpocet?: boolean }[];
      clenenieBezOdpoctu?: string | null;
    }
  | {
      typ: "dph5050";
      /** Podiel nákladu na podnikanie v % (napr. 80). DPH sa odpočíta najviac 50 %. */
      zaklad: number;
      zdanitelna: string;
      lenZaklad: string;
      nezdanitelna: string;
      clenenieBezOdpoctu?: string | null;
    };

/** Pomer z JSON stĺpca, alebo `null`, keď nedáva zmysel. */
export function nacitajPomer(v: unknown): PomerPredkontacie | null {
  const x = v as any;
  if (!x || typeof x !== "object") return null;
  if (x.typ === "pomer" && Array.isArray(x.casti)) {
    const casti = x.casti
      .map((c: any) => ({
        podiel: Number(c?.podiel) || 0,
        predkontacia: String(c?.predkontacia ?? "").trim(),
        odpocet: c?.odpocet !== false,
      }))
      .filter((c: any) => c.podiel > 0 && c.predkontacia);
    const spolu = casti.reduce((a: number, c: any) => a + c.podiel, 0);
    if (casti.length < 2 || Math.abs(spolu - 100) > 0.001) return null;
    return { typ: "pomer", casti, clenenieBezOdpoctu: x.clenenieBezOdpoctu ?? null };
  }
  if (x.typ === "dph5050") {
    const zaklad = Math.min(100, Math.max(0, Number(x.zaklad) || 0));
    if (!x.zdanitelna) return null;
    return {
      typ: "dph5050",
      zaklad,
      zdanitelna: String(x.zdanitelna),
      lenZaklad: String(x.lenZaklad ?? x.zdanitelna),
      nezdanitelna: String(x.nezdanitelna ?? x.zdanitelna),
      clenenieBezOdpoctu: x.clenenieBezOdpoctu ?? null,
    };
  }
  return null;
}

/** Časti pomeru v percentách s kódom a tým, či sa z nich odpočíta DPH. */
function castiPomeru(p: PomerPredkontacie): { podiel: number; predkontacia: string; odpocet: boolean }[] {
  if (p.typ === "pomer") return p.casti.map((c) => ({ ...c, odpocet: c.odpocet !== false }));
  const odpocet = Math.min(50, p.zaklad);
  const lenZaklad = Math.max(0, p.zaklad - odpocet);
  return [
    { podiel: odpocet, predkontacia: p.zdanitelna, odpocet: true },
    { podiel: lenZaklad, predkontacia: p.lenZaklad, odpocet: false },
    { podiel: 100 - odpocet - lenZaklad, predkontacia: p.nezdanitelna, odpocet: false },
  ].filter((c) => c.podiel > 0);
}

/** Aký podiel DPH dokladu sa odpočíta (1 = celá). */
export function podielOdpoctu(p: PomerPredkontacie | null): number {
  if (!p) return 1;
  return castiPomeru(p).reduce((a, c) => a + (c.odpocet ? c.podiel : 0), 0) / 100;
}

/**
 * Rozúčtovanie dokladu podľa pomeru predkontácie — po sadzbách, posledná
 * časť dorovná centy, aby súčty sedeli s dokladom.
 */
export function rozuctovaniePodlaPomeru(
  p: PomerPredkontacie,
  rozpis: RozpisSadzby[],
  clenenie: string | null,
): RiadokRozuctovania[] {
  const casti = castiPomeru(p);
  const out: RiadokRozuctovania[] = [];
  for (const s of rozpis) {
    let zvysokZ = r2(s.zaklad);
    let zvysokD = r2(s.dph);
    casti.forEach((c, i) => {
      const posledna = i === casti.length - 1;
      const z = posledna ? zvysokZ : r2((s.zaklad * c.podiel) / 100);
      const d = posledna ? zvysokD : r2((s.dph * c.podiel) / 100);
      zvysokZ = r2(zvysokZ - z);
      zvysokD = r2(zvysokD - d);
      out.push({
        predkontacia: c.predkontacia,
        clenenie: c.odpocet ? clenenie : (p.clenenieBezOdpoctu ?? clenenie),
        sadzba: s.sadzba,
        zaklad: z,
        dph: d,
        text: `${c.podiel} %`,
      });
    });
  }
  return out;
}
