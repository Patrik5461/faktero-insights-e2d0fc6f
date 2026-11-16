/**
 * Krížové kontroly údajov prečítaných z dokladu — poistka proti halucinácii.
 *
 * RHJ, METRO (16. 11. 2026): náhradný model prečítal z fotky dátum
 * 1. 10. 2023 (na doklade 13. 10. 2026), IČO 35725664 a DIČ SK2020273893
 * (METRO má 45952671 / 2023150701), základ 386,15 a DPH 81,43 (380,15 / 87,43)
 * — súčet sedel, takže nič nevyzeralo podozrivo. Tieto kontroly sa dajú
 * urobiť bez siete a nič neprepisujú: výsledok sú vety pre človeka
 * (upozornenia v detaile nespracovaného dokladu).
 *
 * Čistá logika bez I/O.
 */

const cislice = (v: unknown) => String(v ?? "").replace(/\s/g, "");

/**
 * Kontrolná číslica slovenského / českého IČO (8 číslic, váhy 8…2, mod 11).
 * Kratšie IČO sa doplní nulami zľava (staré „00 151 700“). `null` = nevieme
 * posúdiť (nie je to 6–8 číslic).
 */
export function icoMaPlatnuKontrolnuCislicu(ico: unknown): boolean | null {
  const c = cislice(ico);
  if (!/^\d{6,8}$/.test(c)) return null;
  const p = c.padStart(8, "0");
  let sucet = 0;
  for (let i = 0; i < 7; i++) sucet += Number(p[i]) * (8 - i);
  const z = sucet % 11;
  const kontrolna = z === 0 ? 1 : z === 1 ? 0 : 11 - z;
  return kontrolna === Number(p[7]);
}

/** IČ DPH bez prefixu štátu (SK2020310578 → 2020310578). */
const bezPrefixu = (v: unknown) => cislice(v).toUpperCase().replace(/^[A-Z]{2}/, "");

/** IČ DPH a DIČ toho istého slovenského dodávateľa sa líšia len prefixom „SK“. */
export function dicSediSIcDph(dic: unknown, icDph: unknown): boolean | null {
  const d = bezPrefixu(dic);
  const i = cislice(icDph).toUpperCase();
  if (!d || !i || !i.startsWith("SK")) return null;
  return i.slice(2) === d;
}

const den = (v: unknown): number | null => {
  const s = typeof v === "string" ? v.slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) ? t : null;
};
const DEN_MS = 86_400_000;

export type UdajeNaKontrolu = {
  dodavatel?: { ico?: string | null; dic?: string | null; icDph?: string | null; krajina?: string | null } | null;
  datumVystavenia?: string | null;
  datumDodania?: string | null;
  datumPrijatia?: string | null;
};

/**
 * Upozornenia na údaje, ktoré si model mohol vymyslieť. `dnes` a
 * `nahrane` (deň nahratia / prijatia) sú YYYY-MM-DD. `ai` je výsledok čítania
 * (príznak náhradného modelu).
 */
export function upozorneniaUdajov(
  u: UdajeNaKontrolu,
  kontext: { dnes: string; nahrane?: string | null; ai?: Record<string, unknown> | null },
): string[] {
  const out: string[] = [];
  if (kontext.ai && kontext.ai.citane_nahradou)
    out.push(
      "Doklad prečítal náhradný model (hlavný model AI nebol dostupný) — údaje majú nižšiu istotu, skontrolujte ich podľa dokladu.",
    );
  const d = u.dodavatel ?? {};
  const domaci = !d.krajina || /^(SK|CZ)$/i.test(String(d.krajina));
  if (domaci && d.ico && icoMaPlatnuKontrolnuCislicu(d.ico) === false)
    out.push(`IČO dodávateľa ${cislice(d.ico)} nemá platnú kontrolnú číslicu — skontrolujte ho podľa dokladu.`);
  if (dicSediSIcDph(d.dic, d.icDph) === false)
    out.push(`DIČ ${cislice(d.dic)} a IČ DPH ${cislice(d.icDph)} dodávateľa k sebe nesedia — skontrolujte ich podľa dokladu.`);

  const dnes = den(kontext.dnes);
  const nahrane = den(kontext.nahrane) ?? dnes;
  for (const [nazov, v] of [
    ["Dátum vystavenia", u.datumVystavenia],
    ["Dátum dodania", u.datumDodania],
  ] as const) {
    const t = den(v);
    if (t == null || dnes == null) continue;
    if (t > dnes + DEN_MS) out.push(`${nazov} ${String(v)} je v budúcnosti — skontrolujte ho podľa dokladu.`);
    else if (nahrane != null && nahrane - t > 365 * DEN_MS)
      out.push(
        `${nazov} ${String(v)} je o viac ako rok starší ako prijatie dokladu — skontrolujte ho (sadzby DPH sa ponúkajú podľa neho).`,
      );
  }
  return [...new Set(out)];
}
