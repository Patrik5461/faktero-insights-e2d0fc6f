/*
  Export zoznamu do Excelu (ako v Doklado): hárok s dokladmi a hárok s ich
  položkami. Robí sa v prehliadači z toho, čo zoznam práve ukazuje — teda
  s filtrami aj zoradením, ktoré si človek nastavil.
*/

export type StlpecExcelu<T> = {
  nazov: string;
  hodnota: (r: T) => string | number | null | undefined;
};

export function tabulka<T>(riadky: T[], stlpce: StlpecExcelu<T>[]): (string | number)[][] {
  return [
    stlpce.map((s) => s.nazov),
    ...riadky.map((r) =>
      stlpce.map((s) => {
        const v = s.hodnota(r);
        return v == null ? "" : typeof v === "number" ? Math.round(v * 100) / 100 : String(v);
      }),
    ),
  ];
}

/** Stiahne XLSX s viacerými hárkami. Knižnica sa načíta až pri kliknutí. */
export async function stiahniExcel(
  nazovSuboru: string,
  harky: { nazov: string; data: (string | number)[][] }[],
) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const h of harky) {
    const ws = XLSX.utils.aoa_to_sheet(h.data);
    // Šírka stĺpcov podľa najdlhšej hodnoty, nech sa dá čítať bez rozťahovania.
    ws["!cols"] = (h.data[0] ?? []).map((_, i) => ({
      wch: Math.min(50, Math.max(8, ...h.data.map((r) => String(r[i] ?? "").length + 2))),
    }));
    XLSX.utils.book_append_sheet(wb, ws, h.nazov.slice(0, 31));
  }
  XLSX.writeFile(wb, nazovSuboru);
}
