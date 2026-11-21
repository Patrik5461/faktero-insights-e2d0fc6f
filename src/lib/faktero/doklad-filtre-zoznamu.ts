/*
  Filtre zoznamu bločkov (Doklady → Bločky, Fakturácia → Prijaté bločky),
  ktoré idú priamo do dotazu na `expense_documents` — nie len v pamäti, aby
  sedeli aj pri veľkých firmách (strop 1 000 riadkov na jednu požiadavku).

  V adrese rovnako ako pri prijatých faktúrach:
    ?f[export]=ano|nie   — odovzdané do účtovníctva (`exported_at`)
    ?f[zauct]=ano|nie    — zaúčtované (`zauctovane_at`)

  Odovzdaný bloček má stav `exported` — je to spracovaný bloček, ktorý už
  odišiel do účtovníctva. Záložka Spracované (= Fakturácia → Prijaté bločky)
  preto ukazuje aj odovzdané, so šípkou exportu, rovnako ako zoznam prijatých
  faktúr (Patrik 21. 11.). Záložka Odovzdané ostáva len odovzdané.
*/

export type AnoNie = "" | "ano" | "nie";

export type FiltreBlockov = {
  /** Stav zo záložky (`ZALOZKY_DOKLADOV[].stav`). */
  stav: "new" | "processed" | "exported" | "all" | string | null | undefined;
  export: AnoNie | string | null | undefined;
  zauct: AnoNie | string | null | undefined;
};

export type PodmienkaBlockov =
  | { op: "eq"; stlpec: string; hodnota: string }
  | { op: "in"; stlpec: string; hodnoty: string[] }
  | { op: "jePrazdne"; stlpec: string }
  | { op: "niePrazdne"; stlpec: string };

const anoNie = (v: unknown): AnoNie => (v === "ano" || v === "nie" ? v : "");

/** Podmienky dotazu pre stav záložky a filtre Zaúčtovanie / Export. */
export function podmienkyBlockov(f: FiltreBlockov): PodmienkaBlockov[] {
  const out: PodmienkaBlockov[] = [];
  const exp = anoNie(f.export);
  const zauct = anoNie(f.zauct);
  if (f.stav && f.stav !== "all") {
    if (f.stav === "processed")
      out.push({ op: "in", stlpec: "status", hodnoty: ["processed", "exported"] });
    else out.push({ op: "eq", stlpec: "status", hodnota: f.stav });
  }
  if (exp === "ano") out.push({ op: "niePrazdne", stlpec: "exported_at" });
  if (exp === "nie") out.push({ op: "jePrazdne", stlpec: "exported_at" });
  if (zauct === "ano") out.push({ op: "niePrazdne", stlpec: "zauctovane_at" });
  if (zauct === "nie") out.push({ op: "jePrazdne", stlpec: "zauctovane_at" });
  return out;
}

/** Premietne podmienky do dotazu Supabase (PostgREST builder). */
export function pouziFiltreBlockov<Q>(q: Q, f: FiltreBlockov): Q {
  let d: any = q;
  for (const p of podmienkyBlockov(f)) {
    if (p.op === "eq") d = d.eq(p.stlpec, p.hodnota);
    else if (p.op === "in") d = d.in(p.stlpec, p.hodnoty);
    else if (p.op === "jePrazdne") d = d.is(p.stlpec, null);
    else d = d.not(p.stlpec, "is", null);
  }
  return d as Q;
}

/*
  Filter „Obdobie“ (ako pri prijatých faktúrach), v adrese:
    ?f[obdobie_od]=RRRR-MM-DD&f[obdobie_do]=RRRR-MM-DD&f[podla]=vystavenie|nahratie

  Bloček nemá DUZP ani dátum prijatia — vyberá sa podľa dátumu vystavenia
  (nákupu) alebo podľa toho, kedy bol nahratý. Bloček bez dátumu vystavenia
  (neprečítaný) padne do obdobia podľa vzniku, inak by vypadol zo všetkých
  (rovnako ako `vMesiaci`). Staré doklady nemajú `nahrane_at` — berie sa
  `created_at`.
*/
export type DatumObdobiaBlockov = "vystavenie" | "nahratie";

/** Deň `RRRR-MM-DD` → okamih začiatku dňa v miestnom čase (ISO, UTC). */
function zaciatokDna(den: string, posun = 0): string {
  const [y, m, d] = den.split("-").map(Number);
  return new Date(y!, m! - 1, d! + posun).toISOString();
}

const jeDen = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Podmienka `or` pre PostgREST, alebo null keď obdobie nie je zadané. */
export function podmienkaObdobiaBlockov(
  podla: DatumObdobiaBlockov | string | null | undefined,
  od?: string | null,
  doDna?: string | null,
): string | null {
  const o = jeDen(od) ? od : null;
  const d = jeDen(doDna) ? doDna : null;
  if (!o && !d) return null;
  const casy = (stlpec: string) =>
    [
      o ? `${stlpec}.gte.${zaciatokDna(o)}` : null,
      d ? `${stlpec}.lt.${zaciatokDna(d, 1)}` : null,
    ].filter(Boolean);
  if (podla === "nahratie")
    return (
      `and(${casy("nahrane_at").join(",")}),` +
      `and(nahrane_at.is.null,${casy("created_at").join(",")})`
    );
  const dni = [o ? `issue_date.gte.${o}` : null, d ? `issue_date.lte.${d}` : null].filter(Boolean);
  return `and(${dni.join(",")}),and(issue_date.is.null,${casy("created_at").join(",")})`;
}

export function filtrujObdobieBlockov<Q>(
  q: Q,
  podla: DatumObdobiaBlockov | string | null | undefined,
  od?: string | null,
  doDna?: string | null,
): Q {
  const p = podmienkaObdobiaBlockov(podla, od, doDna);
  return p ? ((q as any).or(p) as Q) : q;
}

/** Prvý a posledný deň mesiaca `RRRR-MM` — `?mesiac=` z odkazu a staré uložené filtre. */
export function hraniceMesiacaBlockov(mesiac: unknown): { od: string; do: string } | null {
  const m = typeof mesiac === "string" ? /^(\d{4})-(\d{2})$/.exec(mesiac) : null;
  if (!m) return null;
  const posledny = new Date(Number(m[1]), Number(m[2]), 0).getDate();
  return { od: `${m[1]}-${m[2]}-01`, do: `${m[1]}-${m[2]}-${String(posledny).padStart(2, "0")}` };
}
