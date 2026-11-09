/*
  Odpočet zálohy z vyťaženia prijatej faktúry (AI).

  Faktúra, ktorá zúčtováva zaplatenú zálohu, má pod súčtom riadok
  „Predplatba (Záloh. fak. č. …) −900,00“, „Odpočet zálohy“, „Uhradené
  zálohou“ a pod. Predtým ho čítanie zahodilo: faktúra chcela na úhradu celú
  sumu (929,70 namiesto 29,70) a nespárovala sa s platbou.

  Dva prípady — rovnako ako eFaktúra (`efaktura/prijata-z-ubl.ts`):

  - **Nezdanená záloha** (zaplatená zálohová faktúra, nie je daňový doklad):
    rozpis DPH aj suma dokladu ostávajú celé, odpočet ide do `zaloha`
    (→ `advance_amount`), na úhradu je zvyšok.
  - **Zdanená záloha** (dodávateľ k nej vystavil daňový doklad k prijatej
    platbe, daň z nej sa už odpočítala): záporný riadok so základom a DPH je
    skutočnou položkou — zníži rozpis DPH aj sumu dokladu. Do `zaloha` sa
    nepočíta, inak by sa odpočítal dvakrát.

  Čisté funkcie bez databázy — testy v `odpocet-zalohy-vytazenie.test.ts`.
*/

export type OdpocetZalohyAi = {
  /** Odpočítaná suma s DPH, kladne. */
  suma: number;
  /** Číslo zálohovej faktúry (alebo dokladu k platbe), ako je na doklade. */
  cislo: string;
  /** Záloha bola zdanená (daňový doklad k prijatej platbe) — má základ a DPH. */
  zdanena: boolean;
  /** Pri zdanenej: základ a DPH odpočtu (kladne) a sadzba. */
  zaklad: number;
  dph: number;
  sadzba: number | null;
};

const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const TOL = 0.02;
const blizko = (a: number | null | undefined, b: number | null | undefined, tol = TOL) =>
  a != null && b != null && Math.abs(a - b) <= tol + 1e-9;

/** Text riadku, ktorý je odpočtom zálohy (nie zľavou ani vrátením obalu). */
export const TEXT_ODPOCTU_ZALOHY =
  /(z[aá]loh|predplat|preddavok|preddavk|advance|prepaid|deposit|uhraden[eéáa]? z[aá]loh|z[aá]lohov)/i;

const OBAL = /(obal|f[ľl]a[šs]|vratn|prepravk|palet|sud|keg)/i;

/** Je položka z čítania odpočtom zálohy (záporná suma s textom o zálohe)? */
export function jePolozkaOdpoctuZalohy(p: { name?: unknown; total?: unknown; unit_price?: unknown } | null | undefined): boolean {
  if (!p) return false;
  const suma = num(p.total) ?? num(p.unit_price);
  const text = String(p.name ?? "");
  // Záloha na obal (vratné fľaše, prepravky, palety) je vrátenie obalu, nie odpočet zálohy.
  return suma != null && suma < 0 && TEXT_ODPOCTU_ZALOHY.test(text) && !OBAL.test(text);
}

/**
 * Odpočet zálohy z výstupu AI (`advance_deduction` — objekt alebo pole, keď
 * faktúra zúčtováva viac záloh). Viac záloh sa spojí do jednej (čísla
 * oddelené čiarkou); zdanená a nezdanená naraz sa nespájajú — vtedy vyhrá
 * prvá a zvyšok ostane na človeka.
 */
export function odpocetZalohyZAi(ai: Record<string, unknown> | null | undefined): OdpocetZalohyAi | null {
  if (!ai) return null;
  const surove = ai.advance_deduction ?? ai.advance_deductions;
  const zoznam = (Array.isArray(surove) ? surove : surove && typeof surove === "object" ? [surove] : []) as Record<
    string,
    unknown
  >[];
  const out: OdpocetZalohyAi[] = [];
  for (const x of zoznam) {
    if (!x || typeof x !== "object") continue;
    const zaklad = num(x.base);
    const dph = num(x.vat);
    let suma = num(x.amount ?? x.total);
    if (suma == null && zaklad != null) suma = zaklad + (dph ?? 0);
    if (suma == null || !Math.abs(suma)) continue;
    const s = Math.abs(suma);
    const zdanena = x.taxed === true || Math.abs(dph ?? 0) > 0.004;
    const d = zdanena ? Math.abs(dph ?? 0) : 0;
    const z = zdanena ? (zaklad != null ? Math.abs(zaklad) : r2(s - d)) : 0;
    out.push({
      suma: r2(s),
      cislo: String(x.advance_invoice_number ?? x.number ?? "").trim().slice(0, 60),
      zdanena,
      zaklad: r2(z),
      dph: r2(d),
      sadzba: zdanena ? num(x.rate) : null,
    });
  }
  if (!out.length) return null;
  const prvy = out[0]!;
  const rovnake = out.filter(
    (o) => o.zdanena === prvy.zdanena && (!prvy.zdanena || o.sadzba === prvy.sadzba),
  );
  return {
    suma: r2(rovnake.reduce((a, o) => a + o.suma, 0)),
    cislo: rovnake.map((o) => o.cislo).filter(Boolean).join(", ").slice(0, 120),
    zdanena: prvy.zdanena,
    zaklad: r2(rovnake.reduce((a, o) => a + o.zaklad, 0)),
    dph: r2(rovnake.reduce((a, o) => a + o.dph, 0)),
    sadzba: prvy.sadzba,
  };
}

/** Súčet rozpisu z AI (so znamienkom riadkov). */
function suctyRozpisu(ai: Record<string, unknown>): { zaklad: number; dph: number } | null {
  const pole = Array.isArray(ai.vat_breakdown) ? (ai.vat_breakdown as any[]) : [];
  if (!pole.length) return null;
  let zaklad = 0;
  let dph = 0;
  for (const x of pole) {
    zaklad += num(x?.base ?? x?.zaklad) ?? 0;
    dph += num(x?.vat ?? x?.dph) ?? 0;
  }
  return { zaklad: r2(zaklad), dph: r2(dph) };
}

/**
 * Výstup AI upravený o odpočet zálohy tak, aby ďalšie spracovanie
 * (`udajeZAi`, `rozpisZVytazenia`) dostalo sumy dokladu správne:
 *
 * - riadok odpočtu sa z položiek vyberie (AI ho tam niekedy dá aj tak),
 * - nezdanená: `amount_total` je celková fakturovaná suma — keď AI vrátila
 *   sumu na úhradu, vráti sa celá; rozpis sa nemení,
 * - zdanená: rozpis, súčty aj `amount_total` sa znížia o základ a DPH zálohy
 *   (ak ich AI vrátila celé) a medzi položky pribudne záporný riadok
 *   „Odpočet zálohy …“ — súčet položiek tak sedí so sumou dokladu.
 */
export function aiSOdpoctomZalohy(ai: Record<string, unknown>): {
  ai: Record<string, unknown>;
  odpocet: OdpocetZalohyAi | null;
} {
  const items = Array.isArray(ai.items) ? (ai.items as any[]) : [];
  const zPoloziek = items.filter((p) => jePolozkaOdpoctuZalohy(p));
  let odpocet = odpocetZalohyZAi(ai);
  // AI dala odpočet len medzi položky — vezme sa odtiaľ (nezdanený, ak riadok nemá sadzbu).
  if (!odpocet && zPoloziek.length) {
    const suma = r2(zPoloziek.reduce((a, p) => a + Math.abs(num(p.total) ?? num(p.unit_price) ?? 0), 0));
    const sadzba = num(zPoloziek[0]?.vat_rate);
    // Položka so sadzbou > 0 môže byť zdanená záloha — bez rozpisu základ/DPH ju nehádame, ostane položkou.
    if (suma > 0 && !(sadzba && sadzba > 0))
      odpocet = { suma, cislo: "", zdanena: false, zaklad: 0, dph: 0, sadzba: null };
  }
  /*
    Staršie čítania (a doplnok polôh) vracajú len „prepaid_amount“ — berie sa
    ako nezdanená záloha, keď sumy dokladu nie sú už znížené o ňu (to by
    bola zdanená záloha, ktorú bez základu a DPH nehádame).
  */
  if (!odpocet) {
    const pred = num(ai.prepaid_amount);
    if (pred && pred > 0) {
      const z0 = num(ai.amount_without_vat);
      const d0 = num(ai.vat_amount);
      const t0 = num(ai.amount_total);
      const pl = z0 != null && d0 != null ? r2(z0 + d0) : null;
      const znizene = pl != null && t0 != null && !blizko(pl, t0) && blizko(pl, t0 - pred);
      if (!znizene) odpocet = { suma: r2(pred), cislo: "", zdanena: false, zaklad: 0, dph: 0, sadzba: null };
    }
  }
  if (!odpocet) return { ai, odpocet: null };
  const out: Record<string, unknown> = { ...ai };
  const ine = items.filter((p) => !jePolozkaOdpoctuZalohy(p));
  if (ine.length !== items.length) out.items = ine;

  const zaklad = num(ai.amount_without_vat);
  const dph = num(ai.vat_amount);
  const rozpis = suctyRozpisu(ai);
  const plnenie =
    zaklad != null && dph != null ? r2(zaklad + dph) : rozpis ? r2(rozpis.zaklad + rozpis.dph) : null;
  let spolu = num(ai.amount_total);
  const naUhradu = num(ai.amount_due);
  const A = odpocet.suma;

  if (!odpocet.zdanena) {
    /*
      Suma dokladu je celé plnenie. Keď AI do `amount_total` dala sumu na
      úhradu (929,70 − 900 = 29,70), plnenie podľa súčtov je o zálohu vyššie.
    */
    if (spolu == null) spolu = plnenie ?? (naUhradu != null ? r2(naUhradu + A) : null);
    else if (plnenie != null && !blizko(spolu, plnenie) && blizko(spolu + A, plnenie)) spolu = r2(spolu + A);
    else if (plnenie == null && naUhradu != null && blizko(spolu, naUhradu)) spolu = r2(spolu + A);
    if (spolu != null) out.amount_total = spolu;
    // Odpočet nemôže byť väčší ako doklad.
    if (spolu != null && A > spolu + 0.004) odpocet = { ...odpocet, suma: r2(spolu) };
    return { ai: out, odpocet };
  }

  /* Zdanená záloha — sumy dokladu po odpočte. */
  const zA = odpocet.zaklad;
  const dA = odpocet.dph;
  /*
    Celé plnenie (pred odpočtom). Pokyn chce sumy celé, no AI občas vráti
    `amount_total` alebo súčty už po odpočte — rozhodne suma na úhradu, inak
    vzájomný vzťah súm.
  */
  let cele: number | null;
  if (spolu != null && naUhradu != null && blizko(spolu - A, naUhradu)) cele = spolu;
  else if (spolu != null && naUhradu != null && blizko(spolu, naUhradu)) cele = r2(spolu + A);
  else if (spolu != null && plnenie != null && blizko(spolu + A, plnenie)) cele = plnenie;
  else cele = spolu ?? plnenie;
  // Súčty hlavičky: celé → znížiť; už po odpočte → nechať.
  if (zaklad != null && dph != null && cele != null && blizko(zaklad + dph, cele)) {
    out.amount_without_vat = r2(zaklad - zA);
    out.vat_amount = r2(dph - dA);
  }
  // Rozpis: celý (bez záporného riadku) → odpočet do riadku sadzby zálohy.
  const pole = Array.isArray(ai.vat_breakdown) ? (ai.vat_breakdown as any[]) : [];
  const sadzbaRiadku = (x: any) => num(x?.rate ?? x?.sadzba);
  const sDanou = pole.filter((x) => (sadzbaRiadku(x) ?? 0) > 0);
  const sadzba = odpocet.sadzba ?? (sDanou.length === 1 ? sadzbaRiadku(sDanou[0]) : null);
  const maZaporny = pole.some((x) => (num(x?.base ?? x?.zaklad) ?? 0) < 0);
  const rozpisPoOdpocte = rozpis != null && cele != null && blizko(rozpis.zaklad + rozpis.dph, cele - A);
  if (pole.length && !maZaporny && !rozpisPoOdpocte) {
    const i = sadzba != null ? pole.findIndex((x) => sadzbaRiadku(x) === sadzba) : -1;
    if (i >= 0) {
      const x = pole[i];
      out.vat_breakdown = pole.map((y, j) =>
        j === i
          ? { ...x, base: r2((num(x?.base ?? x?.zaklad) ?? 0) - zA), vat: r2((num(x?.vat ?? x?.dph) ?? 0) - dA) }
          : y,
      );
    } else if (sadzba != null) {
      out.vat_breakdown = [...pole, { rate: sadzba, base: -zA, vat: -dA, vat_category: "standard" }];
    }
  }
  if (cele != null) out.amount_total = r2(cele - A);
  // Záporný riadok medzi položky — v stĺpci, v akom sú ostatné (bez DPH / s DPH).
  if (ine.length) {
    const sucet = r2(ine.reduce((a, p) => a + (num(p?.total) ?? 0), 0));
    const sDph =
      ai.items_total_with_vat === true ||
      (ai.items_total_with_vat !== false && cele != null && blizko(sucet, cele) && !(zaklad != null && blizko(sucet, zaklad)));
    const x = sDph ? A : zA;
    out.items = [
      ...ine,
      {
        name: `Odpočet zálohy${odpocet.cislo ? ` č. ${odpocet.cislo}` : ""}`,
        quantity: 1,
        unit: null,
        unit_price: -x,
        vat_rate: sadzba,
        total: -x,
      },
    ];
  }
  return { ai: out, odpocet: sadzba != null && odpocet.sadzba == null ? { ...odpocet, sadzba } : odpocet };
}

/** Na úhradu: celková suma mínus odpočet nezdanenej zálohy (nie viac ako suma). */
export function naUhraduSOdpoctom(celkom: number, zaloha: number | null | undefined): number {
  const c = Math.abs(Number(celkom) || 0);
  const z = Math.min(Math.abs(Number(zaloha) || 0), c);
  return r2(c - z);
}

/** Normalizované číslo dokladu na porovnanie (bez medzier, pomlčiek, lomiek, veľké písmená). */
export function normCisloZalohy(c: unknown): string {
  return String(c ?? "").replace(/[\s\-/.]/g, "").toUpperCase();
}

/**
 * Prijatá zálohová faktúra, ktorú odpočet zúčtováva: rovnaké číslo (alebo VS)
 * od toho istého dodávateľa. Viac čísel (viac záloh) — berie sa prvá, ktorá
 * sa nájde; väzba je na jednu zálohovú (`advance_invoice_id`).
 */
export function najdiZalohovuPodlaCisla<
  T extends { id: string; invoice_number?: string | null; variable_symbol?: string | null },
>(cislo: string, kandidati: T[]): T | null {
  const cisla = cislo.split(/[,;]/).map(normCisloZalohy).filter((c) => c.length >= 3);
  for (const c of cisla) {
    const presne = kandidati.find((k) => normCisloZalohy(k.invoice_number) === c);
    if (presne) return presne;
    const podlaVs = kandidati.find((k) => normCisloZalohy(k.variable_symbol) === c);
    if (podlaVs) return podlaVs;
  }
  return null;
}

const normNazov = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/(sro|spolsro|as|akcionarskaspolocnost)$/, "");

/**
 * Je zálohová faktúra od toho istého dodávateľa? IČO, inak IČ DPH, inak
 * názov — zálohové faktúry často IČO nemajú vytlačené (JŠ servis: „IČO/DIČ:“
 * prázdne, len IČ DPH), tak ho nemá ani uložený doklad.
 */
export function dodavatelZalohySedi(
  zaloha: { supplier_ico?: string | null; supplier_ic_dph?: string | null; supplier_name?: string | null },
  dodavatel: { ico?: string | null; icDph?: string | null; nazov?: string | null },
): boolean {
  const ico = (v: unknown) => String(v ?? "").replace(/\s/g, "");
  const icDph = (v: unknown) => String(v ?? "").replace(/\s/g, "").toUpperCase();
  if (ico(zaloha.supplier_ico) && ico(dodavatel.ico)) return ico(zaloha.supplier_ico) === ico(dodavatel.ico);
  if (icDph(zaloha.supplier_ic_dph) && icDph(dodavatel.icDph))
    return icDph(zaloha.supplier_ic_dph) === icDph(dodavatel.icDph);
  const a = normNazov(zaloha.supplier_name);
  return a.length >= 3 && a === normNazov(dodavatel.nazov);
}
