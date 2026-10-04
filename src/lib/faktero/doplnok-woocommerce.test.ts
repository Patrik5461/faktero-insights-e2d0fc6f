/**
 * Doplnok pre WooCommerce sa sťahuje ako hotový ZIP z `public/doplnky/`.
 * Keď sa zmení zdroj a ZIP sa nezbalí znova (`npm run doplnok:woo`), ľudia by
 * dostávali starú verziu — tento test to zastaví.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import JSZip from "jszip";

const ZDROJ = "integracie/woocommerce/faktero-woocommerce";

function subory(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const c = join(dir, n);
    return statSync(c).isDirectory() ? subory(c) : [c];
  });
}

describe("doplnok pre WooCommerce", () => {
  it("ZIP na stiahnutie obsahuje presne aktuálny zdroj", async () => {
    const zip = await JSZip.loadAsync(readFileSync("public/doplnky/faktero-woocommerce.zip"));
    const vZipe = Object.keys(zip.files)
      .filter((n) => !zip.files[n].dir)
      .sort();
    const zdroj = subory(ZDROJ)
      .map((s) => join("faktero-woocommerce", relative(ZDROJ, s)))
      .sort();
    expect(vZipe).toEqual(zdroj);
    for (const s of subory(ZDROJ)) {
      const n = join("faktero-woocommerce", relative(ZDROJ, s));
      expect(await zip.file(n)!.async("string"), `${n} — spustite npm run doplnok:woo`).toBe(
        readFileSync(s, "utf8"),
      );
    }
  });

  it("verzia v hlavičke, konštante a readme sedí", () => {
    const php = readFileSync(join(ZDROJ, "faktero-woocommerce.php"), "utf8");
    const readme = readFileSync(join(ZDROJ, "readme.txt"), "utf8");
    const v = php.match(/\* Version:\s+(\S+)/)![1];
    expect(php).toContain(`define( 'FAKTERO_WC_VERSION', '${v}' );`);
    expect(readme).toContain(`Stable tag: ${v}`);
  });
});
