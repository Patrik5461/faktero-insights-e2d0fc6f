/*
  Vyťaženie nespracovaných dokladov, ktoré AI nikdy nečítala (2026-11-16).

  Prenos z Doklada (`scripts/migrate-doklado`, zdroj „import“) zakladal
  nespracované doklady len s tým, čo dal Doklado (dodávateľ, suma, dátum) —
  `ai` ostalo prázdne, druh tiež, a v Nespracovaných sa nič nerozpoznalo.
  Tento skript ich prečíta tou istou cestou ako nahratie (`vytazNespracovany`):
    - doplní LEN prázdne polia (`doplnUdaje`), nič z Doklada ani od človeka
      neprepíše, druh nastaví len keď je prázdny,
    - spotrebu AI zapíše do `ai_pouzitie` (účel „nespracovane“),
    - nič nevytvára ani nemaže.

  POUŽITIE (z koreňa repa):
    JITI_ALIAS='{"@/":"'$PWD'/src/"}' npx jiti scripts/vytazit-nespracovane.ts            # nanečisto — len počty
    ... --apply                     # ostrý beh
    ... --firma <uuid>              # len jedna firma
    ... --paralelne 2               # koľko naraz (predvolene 2)
    ... --vsetky-zdroje             # nielen „import“, ale každý riadok so súborom a bez `ai`
*/
import { createRequire } from "node:module";

type Riadok = { id: string; company_id: string; file_name: string | null; zdroj: string };

function nacitajProstredie() {
  try {
    const eco = createRequire(import.meta.url)("/home/patrik/ecosystem.config.cjs").apps[0].env ?? {};
    for (const [k, v] of Object.entries(eco)) if (process.env[k] === undefined) process.env[k] = String(v);
  } catch {
    /* mimo servera stačí prostredie */
  }
  if (!process.env.SUPABASE_URL && process.env.VITE_SUPABASE_URL) process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL;
}

/** Vyťaží riadky po `paralelne` naraz; vráti výsledok po riadkoch. */
export async function vytazNespracovanePoRade(
  ids: string[],
  paralelne = 2,
  hlas: (t: string) => void = console.log,
): Promise<{ id: string; ok: boolean; chyba?: string }[]> {
  nacitajProstredie();
  const { vytazNespracovany } = await import("../src/lib/faktero/nespracovane.server");
  const { supabaseAdmin } = await import("../src/integrations/supabase/client.server");
  const vysledky: { id: string; ok: boolean; chyba?: string }[] = [];
  let i = 0;
  const pracuj = async () => {
    while (i < ids.length) {
      const id = ids[i++]!;
      const zacalo = Date.now();
      try {
        await vytazNespracovany(id);
        const { data } = await supabaseAdmin
          .from("nespracovane_doklady")
          .select("ai, druh, stav, chyba")
          .eq("id", id)
          .maybeSingle();
        const ok = Boolean((data as any)?.ai);
        vysledky.push({ id, ok, chyba: ok ? undefined : ((data as any)?.chyba ?? "AI nič neprečítala") });
        hlas(`  ${id} → ${ok ? (data as any)?.druh ?? "?" : "NEPREČÍTANÉ"} (${Math.round((Date.now() - zacalo) / 1000)} s)`);
      } catch (e) {
        vysledky.push({ id, ok: false, chyba: (e as Error).message });
        hlas(`  ${id} → CHYBA ${(e as Error).message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, paralelne) }, pracuj));
  return vysledky;
}

async function main() {
  const argv = process.argv.slice(2);
  const hodnota = (k: string) => {
    const i = argv.indexOf(k);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const apply = argv.includes("--apply");
  const firma = hodnota("--firma");
  const paralelne = Number(hodnota("--paralelne") ?? 2) || 2;
  nacitajProstredie();
  const { supabaseAdmin } = await import("../src/integrations/supabase/client.server");
  let q = supabaseAdmin
    .from("nespracovane_doklady")
    .select("id, company_id, file_name, zdroj")
    .is("ai", null)
    .not("file_path", "is", null)
    .order("created_at", { ascending: true })
    .limit(1000);
  if (!argv.includes("--vsetky-zdroje")) q = q.eq("zdroj", "import");
  if (firma) q = q.eq("company_id", firma);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const riadky = (data ?? []) as Riadok[];
  const podlaFirmy = new Map<string, Riadok[]>();
  for (const r of riadky) podlaFirmy.set(r.company_id, [...(podlaFirmy.get(r.company_id) ?? []), r]);
  console.log(`Nevyťažených so súborom: ${riadky.length} v ${podlaFirmy.size} firmách`);
  for (const [cid, rr] of podlaFirmy) console.log(`  ${cid}: ${rr.length}`);
  if (!apply) {
    console.log("Nanečisto — nič sa nečítalo. Ostrý beh: --apply");
    return;
  }
  const vysledky = await vytazNespracovanePoRade(
    riadky.map((r) => r.id),
    paralelne,
  );
  const zle = vysledky.filter((v) => !v.ok);
  console.log(`Hotovo: ${vysledky.length - zle.length} prečítaných, ${zle.length} bez výsledku.`);
  for (const z of zle) console.log(`  ${z.id}: ${z.chyba}`);
  // Zápis do ai_pouzitie je „fire and forget“ — chvíľu počkať, nech dobehne.
  await new Promise((r) => setTimeout(r, 3000));
}

if (process.argv[1] && /vytazit-nespracovane\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
