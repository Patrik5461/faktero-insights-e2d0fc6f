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
