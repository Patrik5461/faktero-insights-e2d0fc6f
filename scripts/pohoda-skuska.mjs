/*
  Skúšobný balík pre Pohodu — XML všetkých druhov dokladov, ktoré Faktero do
  Pohody posiela, na import do skúšobnej účtovnej jednotky.

    node scripts/pohoda-skuska.mjs [výstup.zip] [--bez-kodov] [--ico-sk=… --ico-cz=…]

  Doklady sú tie isté, ktoré overuje `pohoda-spatny-chod.test.ts` (export →
  schéma Stormware → import späť na cent); skript ich vyrobí cez ten test,
  každý ešte raz overí proti celej schéme (data.xsd) a zbalí do ZIP:
    SK/  — slovenská POHODA (firma Test, IČO 86179504)
    CZ/  — česká POHODA (QA Česká, IČO 25097563)
    NAVOD.md — docs/pohoda-skuska.md

  `--bez-kodov` vynechá skratky predkontácií, účtu, strediska a činnosti,
  ktoré skúšobná jednotka nemusí mať (členenie DPH a KV ostanú — tie sa
  skúšajú). Odpoveď Pohody potom vyhodnotí `scripts/pohoda-odpoved.ts`.
*/
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync, strToU8 } from "fflate";
import { overXsd, SCHEMY } from "../e2e/lib/xml.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const volba = (k) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const dnes = new Date().toISOString().slice(0, 10);
const vystup = path.resolve(args.find((a) => !a.startsWith("--")) ?? `pohoda-skuska-${dnes}.zip`);

const docasny = mkdtempSync(path.join(tmpdir(), "pohoda-skuska-"));
try {
  execFileSync(
    "npx",
    ["vitest", "run", "src/lib/faktero/pohoda-spatny-chod.test.ts", "--reporter=dot"],
    {
      cwd: REPO,
      stdio: ["ignore", "inherit", "inherit"],
      env: {
        ...process.env,
        POHODA_SKUSKA: docasny,
        POHODA_SKUSKA_BEH: `${dnes.replace(/-/g, "")}${String(Date.now()).slice(-4)}`,
        ...(args.includes("--bez-kodov") ? { POHODA_SKUSKA_BEZ_KODOV: "1" } : {}),
        ...(volba("ico-sk") ? { POHODA_SKUSKA_ICO_SK: volba("ico-sk") } : {}),
        ...(volba("ico-cz") ? { POHODA_SKUSKA_ICO_CZ: volba("ico-cz") } : {}),
      },
    },
  );

  const subory = {};
  let chyby = 0;
  for (const verzia of ["SK", "CZ"]) {
    for (const meno of readdirSync(path.join(docasny, verzia)).sort()) {
      const obsah = readFileSync(path.join(docasny, verzia, meno));
      const chyba = await overXsd(obsah, SCHEMY.pohoda);
      if (chyba) {
        chyby++;
        console.error(`✗ ${verzia}/${meno}: ${chyba}`);
      }
      subory[`${verzia}/${meno}`] = new Uint8Array(obsah);
    }
  }
  if (chyby) {
    console.error(`${chyby} súborov neprešlo schémou — balík sa nevyrobil.`);
    process.exit(1);
  }
  subory["NAVOD.md"] = strToU8(readFileSync(path.join(REPO, "docs/pohoda-skuska.md"), "utf8"));
  writeFileSync(vystup, zipSync(subory, { level: 9 }));
  const n = Object.keys(subory).length - 1;
  console.log(`Skúšobný balík: ${vystup} (${n} XML, všetky prešli schémou Stormware data.xsd)`);
} finally {
  rmSync(docasny, { recursive: true, force: true });
}
