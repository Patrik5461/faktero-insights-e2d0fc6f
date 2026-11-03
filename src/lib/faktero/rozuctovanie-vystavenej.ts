/*
  Rozúčtovanie vystavenej faktúry (dobropisu, zálohovej) na viac riadkov —
  každý so svojou predkontáciou, členením DPH, KV, strediskom a činnosťou.
  Rovnaký tvar ako pri prijatých faktúrach a bločkoch (`rozuctovanie.ts`),
  len rozpis po sadzbách sa skladá z položiek faktúry.

  Sumy riadkov sú vždy kladné (dobropis uložený záporne sa otočí) — človek
  rozúčtováva „koľko“, smer nesie druh dokladu. Export ich potom vynásobí
  tým istým znamienkom ako položky.
*/
import {
  chybaRozuctovania,
  nacitajRozuctovanie,
  type RiadokRozuctovania,
  type RozpisSadzby,
} from "./rozuctovanie";
import { riadkySoZlavou } from "./zlavy";
import { porovnajSadzby } from "./vat-rates";

type Riadok = Record<string, any>;

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Znamienko, ktorým sú uložené položky: -1 pri dobropise uloženom záporne.
 * Rozhoduje súčet položiek (nie hlavička) — starší import mal hlavičku kladnú.
 */
export function znamienkoPoloziekVystavenej(items: Riadok[] | null | undefined): 1 | -1 {
  const spolu = (items ?? []).reduce(
    (a, it) => a + (Number(it?.subtotal ?? 0) || 0) + (Number(it?.vat_amount ?? 0) || 0),
    0,
  );
  return spolu < 0 ? -1 : 1;
}

/** Rozpis po sadzbách z položiek (po zľave na doklad), kladne. */
export function rozpisVystavenej(
  inv: Riadok | null | undefined,
  items: Riadok[] | null | undefined,
): RozpisSadzby[] {
  const riadky = riadkySoZlavou((items ?? []) as Riadok[], inv?.discount_total);
  const zn = znamienkoPoloziekVystavenej(items);
  const m = new Map<number, { zaklad: number; dph: number }>();
  for (const it of riadky) {
    const s = Number(it?.vat_rate ?? 0) || 0;
    const v = m.get(s) ?? { zaklad: 0, dph: 0 };
    v.zaklad = r2(v.zaklad + zn * (Number(it?.subtotal ?? 0) || 0));
    v.dph = r2(v.dph + zn * (Number(it?.vat_amount ?? 0) || 0));
    m.set(s, v);
  }
  return [...m.entries()]
    .map(([sadzba, v]) => ({ sadzba, zaklad: v.zaklad, dph: v.dph }))
    .filter((x) => Math.abs(x.zaklad) >= 0.005 || Math.abs(x.dph) >= 0.005)
    .sort((a, b) => porovnajSadzby(a.sadzba, b.sadzba));
}

/**
 * Prečo sa faktúra nedá rozúčtovať sumou (kódy pri položkách idú vždy), alebo `null`.
 *
 * - Prenesenie len pri niektorých položkách: riadok rozúčtovania nevie, či je
 *   v prenesení (príznak PDP a KV A.2 sú na položke) — rozúčtovanie by ho stratilo.
 * - Colné údaje (Intrastat, kód tovaru pre KV): idú do Pohody s položkou,
 *   riadok rozúčtovania ich nemá.
 */
export function prekazkaRozuctovaniaVystavenej(
  inv: Riadok | null | undefined,
  items: Riadok[] | null | undefined,
): string | null {
  const zoznam = items ?? [];
  if (!zoznam.length) return "Faktúra nemá položky.";
  if (!inv?.reverse_charge && zoznam.some((it) => Boolean(it?.prenesenie)))
    return "Faktúra má prenesenie daňovej povinnosti len pri niektorých položkách — rozúčtujte ju kódmi pri položkách.";
  if (zoznam.some((it) => String(it?.colny_kod ?? "").replace(/\D/g, "")))
    return "Položky majú colné údaje (Intrastat) — rozúčtujte faktúru kódmi pri položkách, aby sa colné údaje nestratili.";
  return null;
}

/**
 * Uložené rozúčtovanie, ktoré sa dá použiť — inak prázdne pole (žiadne,
 * nesedí so sumami faktúry, alebo ho faktúra mať nemôže).
 */
export function platneRozuctovanieVystavenej(
  inv: Riadok | null | undefined,
  items: Riadok[] | null | undefined,
): RiadokRozuctovania[] {
  const riadky = nacitajRozuctovanie(inv?.rozuctovanie);
  if (!riadky.length) return [];
  if (prekazkaRozuctovaniaVystavenej(inv, items)) return [];
  if (chybaRozuctovania(riadky, rozpisVystavenej(inv, items))) return [];
  return riadky;
}

/**
 * Uložené rozúčtovanie, ktoré už nesedí (faktúra sa medzitým upravila) —
 * dôvod pre kontrolu pred exportom, alebo `null`.
 */
export function chybaUlozenehoRozuctovaniaVystavenej(
  inv: Riadok | null | undefined,
  items: Riadok[] | null | undefined,
): string | null {
  const riadky = nacitajRozuctovanie(inv?.rozuctovanie);
  if (!riadky.length) return null;
  return (
    prekazkaRozuctovaniaVystavenej(inv, items) ??
    chybaRozuctovania(riadky, rozpisVystavenej(inv, items))
  );
}
