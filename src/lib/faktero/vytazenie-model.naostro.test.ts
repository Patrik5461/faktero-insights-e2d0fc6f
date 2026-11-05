/*
  Meranie naostro: vyťaženie dvoch fixtures (RISS 0 % + 23 %, registračný
  poplatok mimo DPH + 23 %) rôznymi modelmi Gemini — správnosť rozpisu DPH
  a čas odpovede. Beží len na požiadanie, kľúč sa nikdy nevypisuje:

    VYTAZENIE_NAOSTRO=/dir/s/pdf GEMINI_API_KEY=… npx vitest run src/lib/faktero/vytazenie-model.naostro.test.ts

  V priečinku musia byť `riss.pdf` a `registracia.pdf`.
*/
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";
import { rozpisZVytazenia } from "./rozpis-dph-vytazeny";
import { OCAKAVANY_REGISTRACIA, OCAKAVANY_RISS } from "./__fixtures__/rozpis-dph/vystupy";

const dir = process.env.VYTAZENIE_NAOSTRO;
const MODELY = (
  process.env.VYTAZENIE_MODELY ??
  "gemini-3.5-flash,gemini-3.1-pro-preview,gemini-pro-latest,gemini-2.5-pro"
).split(",");
const SUBORY = [
  { subor: "riss.pdf", ocakavany: OCAKAVANY_RISS },
  { subor: "registracia.pdf", ocakavany: OCAKAVANY_REGISTRACIA },
];

describe.skipIf(!dir || !process.env.GEMINI_API_KEY)("vyťaženie dokladov — modely naostro", () => {
  it("správnosť a čas", { timeout: 900_000 }, async () => {
    const { precitajDoklad } = await import("./mail-prijem.server");
    const vysledky: string[] = [];
    for (const model of MODELY) {
      process.env.GEMINI_MODEL = model;
      process.env.GEMINI_MODEL_VYTAZENIE = model;
      for (const { subor, ocakavany } of SUBORY) {
        const b64 = readFileSync(`${dir}/${subor}`).toString("base64");
        const t0 = Date.now();
        let ai: Record<string, unknown> | null = null;
        let chyba = "";
        try {
          ai = await precitajDoklad(b64, "application/pdf", null, { ucel: "meranie" });
        } catch (e: any) {
          chyba = String(e?.message ?? e).slice(0, 120);
        }
        const ms = Date.now() - t0;
        const v = ai ? rozpisZVytazenia(ai, { krajina: "SK" }) : null;
        const sedi = v ? JSON.stringify(v.rozpis) === JSON.stringify(ocakavany) : false;
        const surovy =
          ai && Array.isArray(ai.vat_breakdown) ? JSON.stringify(ai.vat_breakdown) : "-";
        vysledky.push(
          `${model} | ${subor} | ${(ms / 1000).toFixed(1)} s | ${sedi ? "SEDÍ" : "NESEDÍ"} | zdroj ${v?.zdroj ?? "-"} | kontrola ${v?.kontrola.ok ?? "-"} | rozpis ${JSON.stringify(v?.rozpis ?? null)} | AI vat_breakdown ${surovy} ${chyba}`,
        );
      }
    }
    const { appendFileSync } = await import("node:fs");
    appendFileSync(`${dir}/vysledky.txt`, vysledky.join("\n") + "\n");
  });
});
