/*
  Strážca povinného 2FA adminov (audit 31. 10. 2026): serverová funkcia, ktorá
  overuje admina čítaním `platform_admins` cez servisný kľúč, obchádza aal2
  kontrolu v `is_platform_admin()` — musí preto volať `vyzadujAal2Admina()`.
  Výnimky sú cesty bez prihlásenej relácie (Telegram, help desk, auto-oprava),
  tie majú vlastný druhý faktor (spárovaný chat, overený e-mail).
*/
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const KOREN = join(__dirname, "..", "..");
const VYNIMKY = new Set([
  "lib/faktero/telegram-webhook.server.ts",
  "lib/faktero/telegram.server.ts",
  "lib/faktero/podpora.server.ts",
  "lib/faktero/podpora-pristup.server.ts",
  "lib/faktero/auto-oprava-rozhodnutie.server.ts",
]);

function subory(adr: string): string[] {
  const out: string[] = [];
  for (const m of readdirSync(adr)) {
    const p = join(adr, m);
    if (statSync(p).isDirectory()) out.push(...subory(p));
    else if (/\.(ts|tsx)$/.test(m) && !/\.test\.tsx?$/.test(m) && !m.endsWith("types.ts"))
      out.push(p);
  }
  return out;
}

describe("2FA adminov — kontroly cez servisný kľúč", () => {
  it("každá kontrola platform_admins cez supabaseAdmin volá vyzadujAal2Admina", () => {
    const chyba: string[] = [];
    for (const p of [...subory(join(KOREN, "lib")), ...subory(join(KOREN, "routes"))]) {
      const rel = p.slice(KOREN.length + 1);
      if (VYNIMKY.has(rel)) continue;
      const s = readFileSync(p, "utf8");
      // supabaseAdmin (priamo) a hneď za ním čítanie platform_admins
      if (!/supabaseAdmin[\s\S]{0,80}\.from\("platform_admins"\)/.test(s)) continue;
      if (!s.includes("vyzadujAal2Admina")) chyba.push(rel);
    }
    expect(chyba).toEqual([]);
  });
});
