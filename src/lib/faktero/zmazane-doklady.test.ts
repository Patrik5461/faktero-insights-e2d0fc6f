/**
 * Strážca mäkkého mazania. Faktúry, prijaté faktúry, ponuky, objednávky,
 * odberatelia, produkty a opakované faktúry sa nemažú, len dostanú
 * `deleted_at`. Dotaz, ktorý na to zabudne, počíta a ponúka aj doklady
 * z koša — takto svietila v prehľade eFaktúry „neúspešná validácia“ faktúry,
 * ktorú firma dávno zmazala, a API vracalo integrátorom zmazané faktúry.
 *
 * Test prejde všetky dotazy na tieto tabuľky. Každý musí buď filtrovať
 * `deleted_at`, alebo ísť na konkrétny doklad (`id`, token), alebo niesť
 * v okolí komentár `aj-zmazane: <dôvod>` — napríklad kontrola duplicitného
 * čísla, kde zmazaný doklad počítať treba.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const TABULKY = [
  "customers",
  "invoices",
  "price_actions",
  "price_groups",
  "products",
  "purchase_invoices",
  "quotes",
  "recurring_invoices",
  "sales_orders",
];

const KOREN = path.resolve(import.meta.dirname, "../../..");

function subory(adresar: string, out: string[] = []): string[] {
  for (const f of fs.readdirSync(adresar)) {
    const p = path.join(adresar, f);
    if (fs.statSync(p).isDirectory()) subory(p, out);
    else if (/\.(ts|tsx)$/.test(f) && !/\.test\.|routeTree|supabase\/types\.ts$|\/i18n\//.test(p))
      out.push(p);
  }
  return out;
}

/** Text dotazu od `.from(...)` po koniec výrazu, plus kúsok za ním (obaly ako `filtrujObdobie(...)`). */
function dotaz(s: string, od: number): string {
  let hlbka = 0;
  let i = od;
  for (; i < s.length && i < od + 2500; i++) {
    const c = s[i];
    if (c === "(" || c === "[" || c === "{") hlbka++;
    else if (c === ")" || c === "]" || c === "}") {
      if (hlbka === 0) break;
      hlbka--;
    } else if ((c === ";" || c === ",") && hlbka === 0) break;
  }
  const dalej = s.slice(i, i + 600);
  const koniec = dalej.search(/\.from\(|\n\s*\n|;\n/);
  return s.slice(od, i) + (koniec >= 0 ? dalej.slice(0, koniec) : dalej);
}

export function nefiltrovane(): string[] {
  const re = new RegExp(`\\.from\\(\\s*["'\`](${TABULKY.join("|")})["'\`]\\s*\\)`, "g");
  const out: string[] = [];
  for (const p of subory(path.join(KOREN, "src"))) {
    const s = fs.readFileSync(p, "utf8");
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      const d = dotaz(s, m.index);
      if (/\.(insert|upsert|update|delete)\(/.test(d)) continue;
      if (/deleted_at/.test(d)) continue;
      if (/\.(eq|in)\(\s*["'`]id["'`]/.test(d)) continue;
      if (/\.eq\(\s*["'`]\w*token["'`]/.test(d)) continue;
      const okolie = s
        .slice(Math.max(0, m.index - 400), m.index)
        .split("\n")
        .slice(-4)
        .join("\n");
      if (/aj-zmazane:/.test(okolie) || /aj-zmazane:/.test(d)) continue;
      out.push(`${path.relative(KOREN, p)}:${s.slice(0, m.index).split("\n").length} (${m[1]})`);
    }
  }
  return out;
}

describe("mäkké mazanie", () => {
  it("každý dotaz na tabuľku s košom vynecháva zmazané alebo hovorí prečo nie", () => {
    // Nový nález: pridaj `.is("deleted_at", null)`, alebo nad dotaz komentár
    // `// aj-zmazane: <prečo tu zmazané doklady patria>`.
    expect(nefiltrovane()).toEqual([]);
  });
});
