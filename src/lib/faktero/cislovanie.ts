/**
 * Číslovanie dokladov s pevnou predponou (`Q2026`, `OBJ2026`).
 *
 * Pozor na pascu, do ktorej sa dá ľahko spadnúť: z čísla `OBJ20260001` vyzerá
 * `/(\d+)$/` ako rozumný spôsob, ako vytiahnuť poradie — lenže vytiahne
 * `20260001` aj s rokom. Ďalšie číslo potom vyjde `OBJ202620260002`. Poradie sa
 * preto musí čítať **až za predponou**.
 *
 * Maximum sa hľadá číselne, nie abecedne. Reťazcové porovnanie by pri rôzne
 * dlhých číslach zoradilo `OBJ202610000` pred `OBJ20269999`.
 */

export function poradieZCisla(cislo: string, prefix: string, sirka = 4): number | null {
  if (!cislo.startsWith(prefix)) return null;
  const zvysok = cislo.slice(prefix.length);
  if (!/^\d+$/.test(zvysok)) return null;
  // Doklad pokazený starým výpočtom (OBJ202620260002) je stále číselný, takže
  // by sa tváril ako poradie dvadsať miliónov a zabetónoval by chybu do
  // všetkých ďalších čísel. Poradie dlhšie než pár rádov nad zvolenú šírku
  // preto neberieme — pri šírke 4 to necháva priestor do 999 999 dokladov.
  if (zvysok.length > sirka + 2) return null;
  return parseInt(zvysok, 10);
}

export function dalsieCisloDokladu(
  prefix: string,
  existujuce: Array<string | null | undefined>,
  sirka = 4,
): string {
  let max = 0;
  for (const c of existujuce) {
    if (!c) continue;
    const n = poradieZCisla(String(c), prefix, sirka);
    if (n !== null && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(sirka, "0")}`;
}
