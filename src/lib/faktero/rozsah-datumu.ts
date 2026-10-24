/** Predvoľby rozsahu dátumu vo filtroch zoznamov. */
export type PredvolbaRozsahu = "tento_mesiac" | "minuly_mesiac" | "tento_stvrtrok" | "tento_rok";

export const PREDVOLBY_ROZSAHU: { kod: PredvolbaRozsahu; nazov: string }[] = [
  { kod: "tento_mesiac", nazov: "Tento mesiac" },
  { kod: "minuly_mesiac", nazov: "Minulý mesiac" },
  { kod: "tento_stvrtrok", nazov: "Tento štvrťrok" },
  { kod: "tento_rok", nazov: "Tento rok" },
];

const iso = (r: number, m: number, d: number) =>
  `${r}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
/** Posledný deň mesiaca `m` (0–11). */
const posledny = (r: number, m: number) => new Date(Date.UTC(r, m + 1, 0)).getUTCDate();

/** Rozsah YYYY-MM-DD pre predvoľbu, počítaný od dátumu `dnes` (miestny čas). */
export function rozsahPredvolby(p: PredvolbaRozsahu, dnes: Date): { od: string; do: string } {
  const r = dnes.getFullYear();
  const m = dnes.getMonth();
  switch (p) {
    case "tento_mesiac":
      return { od: iso(r, m, 1), do: iso(r, m, posledny(r, m)) };
    case "minuly_mesiac": {
      const rr = m === 0 ? r - 1 : r;
      const mm = m === 0 ? 11 : m - 1;
      return { od: iso(rr, mm, 1), do: iso(rr, mm, posledny(rr, mm)) };
    }
    case "tento_stvrtrok": {
      const z = Math.floor(m / 3) * 3;
      return { od: iso(r, z, 1), do: iso(r, z + 2, posledny(r, z + 2)) };
    }
    case "tento_rok":
      return { od: iso(r, 0, 1), do: iso(r, 11, 31) };
  }
}
