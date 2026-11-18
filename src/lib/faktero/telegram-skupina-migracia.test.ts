import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
  Migrácia režimu skupiny: tabuľky číta len platform admin, zapisuje len
  server. Pri novej tabuľke sa ľahko zabudne na GRANT (alebo na PUBLIC —
  `revoke … from anon` sám nič neurobí).
*/
const subor = readdirSync("supabase/migrations").find((f) => f.endsWith("_telegram_skupina.sql"));
const sql = subor ? readFileSync(`supabase/migrations/${subor}`, "utf-8") : "";
const bezKomentarov = sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");

describe("migrácia telegram_skupiny", () => {
  it("existuje a zakladá obe tabuľky", () => {
    expect(subor).toBeTruthy();
    expect(bezKomentarov).toMatch(/create table if not exists public\.telegram_skupiny \(/);
    expect(bezKomentarov).toMatch(/create table if not exists public\.telegram_skupiny_spravy \(/);
    expect(bezKomentarov).toMatch(/unique \(chat_id, message_id\)/);
  });

  it("obe tabuľky majú RLS, čítanie len pre platform admina a práva odobraté PUBLIC aj anon", () => {
    expect(bezKomentarov).toMatch(/array\['telegram_skupiny', 'telegram_skupiny_spravy'\]/);
    expect(bezKomentarov).toContain("enable row level security");
    expect(bezKomentarov).toMatch(
      /for select to authenticated using \(\(select public\.is_platform_admin\(\(select auth\.uid\(\)\)\)\)\)/,
    );
    expect(bezKomentarov).toContain("as restrictive for all to authenticated");
    expect(bezKomentarov).toContain("revoke all on public.%I from public, anon, authenticated");
    expect(bezKomentarov).toContain("grant select on public.%I to authenticated");
    expect(bezKomentarov).toContain("grant all on public.%I to service_role");
    // Žiadna politika na zápis pre klienta — píše len servisný kľúč.
    expect(bezKomentarov).not.toMatch(
      /for (insert|update|delete|all) to authenticated using \(\(select public\.is_platform_admin/,
    );
    expect(bezKomentarov).not.toMatch(
      /grant (insert|update|delete|all)[^;]*to (anon|authenticated)/,
    );
  });

  it("párovací kód pozná účel skupina", () => {
    expect(bezKomentarov).toMatch(/telegram_kody_ucel_check[\s\S]*'admin', 'zakaznik', 'skupina'/);
  });
});
