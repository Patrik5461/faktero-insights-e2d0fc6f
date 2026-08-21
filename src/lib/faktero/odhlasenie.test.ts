import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Odhlásenie sa smie týkať len zariadenia, na ktorom človek klikol.
 *
 * `supabase.auth.signOut()` má bez parametra `scope: "global"` — odvolá **všetky**
 * tokeny účtu. Odhlásenie na webe potom vyhodilo Patrika aj z appky v telefóne,
 * ktorej sa ani nedotkol. Test stráži, aby sa `scope` znovu nezabudol; overiť sa
 * to inak dá až na dvoch zariadeniach naraz, čo v testoch nikto neurobí.
 */
const MIESTA = [
  "src/components/faktero/AppShell.tsx",
  "src/components/faktero/mobil/MobilApp.tsx",
];

describe("odhlásenie", () => {
  it("nikde neodvoláva reláciu na ostatných zariadeniach", () => {
    for (const cesta of MIESTA) {
      const zdroj = readFileSync(cesta, "utf8");
      const volania = [...zdroj.matchAll(/auth\.signOut\(([^)]*)\)/g)].map((m) => m[1]!.trim());
      expect(volania.length, `${cesta}: čakalo sa odhlásenie`).toBeGreaterThan(0);
      for (const argument of volania) {
        expect(argument, `${cesta}: signOut(${argument || "…"}) bez scope`).toContain(
          'scope: "local"',
        );
      }
    }
  });
});
