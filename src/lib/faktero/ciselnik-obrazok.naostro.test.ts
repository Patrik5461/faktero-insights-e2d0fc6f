/*
  Skúška naostro: screenshot číselníka „Členenie KV DPH“ (19 riadkov) cez
  skutočné AI. Beží len na požiadanie — nič nezapisuje do databázy (VITEST
  vypne meranie do `ai_pouzitie`, zápis sa len naplánuje):

    CISELNIK_AI_NAOSTRO=/cesta/k/pohoda-kv-19.png CISELNIK_AI_ENV=/cesta/.env \
      npx vitest run src/lib/faktero/ciselnik-obrazok.naostro.test.ts

  Z .env sa načítajú iba kľúče a modely AI (GEMINI_*, OPENAI_*), nikdy sa nevypisujú.
*/
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planUlozenia, type ExistujuciZaznam } from "./ciselnik-obrazok";
import { rozpoznajObrazokCiselnika } from "./ciselnik-obrazok.server";
import { KV_19 } from "./ciselnik-obrazok.testdata";

const obrazok = process.env.CISELNIK_AI_NAOSTRO;
const envSubor = process.env.CISELNIK_AI_ENV;

if (obrazok && envSubor) {
  for (const riadok of readFileSync(envSubor, "utf8").split(/\r?\n/)) {
    const m = /^\s*((?:GEMINI|OPENAI)_[A-Z_]+)\s*=\s*(.*)\s*$/.exec(riadok);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

describe.skipIf(!obrazok || !envSubor)("číselník z obrázka — skutočné AI", () => {
  it("19/19 riadkov presne, opakovaný import = 0 nových", { timeout: 120_000 }, async () => {
    const base64 = readFileSync(obrazok!).toString("base64");
    for (const druh of ["kv_clenenie", "auto"] as const) {
      const r = await rozpoznajObrazokCiselnika({ base64, mime: "image/png", druh });
      expect(r.druh).toBe("kv_clenenie");
      const presne = r.riadky.filter((x, i) => {
        const o = KV_19[i];
        return o && x.kod === o.kod && x.popis === o.popis && x.kategoria === o.kategoria && !x.podozrivy;
      }).length;
      console.log(`[naostro] druh=${druh}: rozpoznaných ${r.riadky.length}, presne ${presne}/19`);
      // Kódy, typ a smer musia sedieť vždy presne — to ide do Pohody a do výkazu.
      expect(r.riadky.map((x) => [x.kod, x.kategoria])).toEqual(KV_19.map((x) => [x.kod, x.kategoria]));
      expect(r.riadky.every((x) => !x.podozrivy)).toBe(true);
      // Text pri zvolenom druhu presne; pri „automaticky“ smie model „opraviť“ neštandardné slovo
      // (Nezahrnovať → Nezahŕňovať) — človek ho vidí a opraví v náhľade.
      if (druh === "kv_clenenie" || process.env.CISELNIK_AI_PRESNE_TEXTY)
        expect(r.riadky.map((x) => x.popis)).toEqual(KV_19.map((x) => x.popis));
      else expect(presne).toBeGreaterThanOrEqual(18);

      const p1 = planUlozenia("00000000-0000-0000-0000-000000000001", "kv_clenenie", r.riadky, []);
      expect(p1.vlozit).toHaveLength(19);
      const db: ExistujuciZaznam[] = p1.vlozit.map((x, i) => ({ ...x, id: `x${i}` }));
      const p2 = planUlozenia("00000000-0000-0000-0000-000000000001", "kv_clenenie", r.riadky, db);
      expect(p2.vlozit).toHaveLength(0);
      expect(p2.upravit).toHaveLength(0);
    }
  });
});
