import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Automatické zaúčtovanie — serverové funkcie pre prehliadač. Čítanie aj
  zápis dokladov ide klientom prihláseného (RLS); servisný kľúč len na
  nastavenie firmy (po overení správcu).
*/

const Typ = z.enum(["prijata", "blocek", "vystavena"]);

export const nastavenieAutoUctovaniaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { overPristup } = await import("./over-pristup");
    const rola = await overPristup(context as any, data.company_id);
    const { data: c } = await (context.supabase as any)
      .from("companies")
      .select("auto_uctovanie_rezim, auto_uctovanie_limit, country")
      .eq("id", data.company_id)
      .maybeSingle();
    return {
      rezim: (c?.auto_uctovanie_rezim ?? "bezpecny") as "vypnuty" | "bezpecny" | "plny",
      limit: c?.auto_uctovanie_limit != null ? Number(c.auto_uctovanie_limit) : 5000,
      mena: String(c?.country ?? "SK").toUpperCase() === "CZ" ? "CZK" : "EUR",
      mozemMenit: rola === "owner" || rola === "admin",
    };
  });

export const ulozNastavenieAutoUctovaniaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        rezim: z.enum(["vypnuty", "bezpecny", "plny"]),
        limit: z.number().min(0).max(100_000_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { overPristup } = await import("./over-pristup");
    await overPristup(context as any, data.company_id, { spravca: true });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: f } = await supabaseAdmin
      .from("companies")
      .select("auto_uctovanie_rezim")
      .eq("id", data.company_id)
      .single();
    const { error } = await supabaseAdmin
      .from("companies")
      .update({
        auto_uctovanie_rezim: data.rezim,
        auto_uctovanie_limit: data.limit,
        // Po zapnutí platí len pre nové doklady — staré sa samé nezaúčtujú.
        ...(f?.auto_uctovanie_rezim === "vypnuty" && data.rezim !== "vypnuty"
          ? { auto_uctovanie_od: new Date().toISOString() }
          : {}),
      })
      .eq("id", data.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type RiadokNaKontrolu = {
  typ: "prijata" | "blocek" | "vystavena";
  id: string;
  cislo: string | null;
  partner: string | null;
  datum: string | null;
  suma: number | null;
  mena: string | null;
  predkontacia: string | null;
  clenenie: string | null;
  navrh: any | null;
};

/** Doklady bez zaúčtovania (s návrhom aj bez) — stránka Na kontrolu. */
export const naKontroluFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { overPristup } = await import("./over-pristup");
    await overPristup(context as any, data.company_id, { oblast: "doklady" });
    const sb = context.supabase as any;
    const { TABULKY } = await import("./auto-uctovanie.server");
    const out: RiadokNaKontrolu[] = [];
    let skratene = false;
    for (const typ of ["prijata", "blocek", "vystavena"] as const) {
      const m = TABULKY[typ];
      let q = sb
        .from(m.tabulka)
        .select(
          `id, ${m.cislo}, ${m.meno}, ${m.datum}, ${m.suma}, currency, pohoda_predkontacia, pohoda_clenenie_dph, auto_uctovanie_navrh, status${typ !== "blocek" ? ", type" : ""}`,
        )
        .eq("company_id", data.company_id)
        .is("zauctovane_at", null)
        .is("exported_at", null)
        .order(m.datum, { ascending: false })
        .limit(500);
      if (typ !== "blocek") q = q.is("deleted_at", null);
      if (typ === "prijata") q = q.in("status", ["received", "paid"]).neq("type", "proforma");
      if (typ === "vystavena")
        q = q.not("status", "in", "(draft,cancelled)").neq("type", "proforma");
      if (typ === "blocek") q = q.eq("status", "processed");
      const { data: riadky, error } = await q;
      if (error) throw new Error(error.message);
      if ((riadky ?? []).length >= 500) skratene = true;
      for (const r of riadky ?? [])
        out.push({
          typ,
          id: r.id,
          cislo: r[m.cislo] ?? null,
          partner: r[m.meno] ?? null,
          datum: r[m.datum] ?? null,
          suma: r[m.suma] != null ? Number(r[m.suma]) : null,
          mena: r.currency ?? null,
          predkontacia: r.pohoda_predkontacia ?? null,
          clenenie: r.pohoda_clenenie_dph ?? null,
          navrh: r.auto_uctovanie_navrh ?? null,
        });
    }
    out.sort((a, b) => String(b.datum ?? "").localeCompare(String(a.datum ?? "")));
    return { riadky: out, skratene };
  });

/** Potvrdí návrhy vybraných dokladov (človek — zdroj „manual“). */
export const potvrdNavrhyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        polozky: z
          .array(z.object({ typ: Typ, id: z.string().uuid() }))
          .min(1)
          .max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { overPristup } = await import("./over-pristup");
    await overPristup(context as any, data.company_id, { oblast: "doklady", zapis: true });
    const sb = context.supabase as any;
    const srv = await import("./auto-uctovanie.server");
    const firma = await srv.nacitajFirmu(sb, data.company_id);
    let zauctovanych = 0;
    const preskocene: string[] = [];
    for (const p of data.polozky) {
      const m = srv.TABULKY[p.typ];
      const { data: row } = await sb
        .from(m.tabulka)
        .select("*")
        .eq("id", p.id)
        .eq("company_id", data.company_id)
        .maybeSingle();
      const meno = row?.[m.cislo] ?? p.id.slice(0, 8);
      if (!row || !(await srv.smieSaZauctovat(p.typ, row))) {
        preskocene.push(`${meno}: nedá sa zaúčtovať (stav dokladu)`);
        continue;
      }
      const n =
        row.auto_uctovanie_navrh ??
        (await srv.navrhPreRiadok(sb, p.typ, row, { firma, ai: false }));
      if (!n?.predkontacia && !row.pohoda_predkontacia) {
        preskocene.push(`${meno}: chýba predkontácia`);
        continue;
      }
      if (await srv.potvrdNavrh(sb, p.typ, row, n, { automat: false, userId: context.userId }))
        zauctovanych++;
      else preskocene.push(`${meno}: medzitým sa zmenil`);
    }
    return { zauctovanych, preskocene };
  });

/** „Navrhnúť zaúčtovanie pre nezaúčtované“ — po dávkach, len návrhy. */
export const navrhniNezauctovaneFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { overPristup } = await import("./over-pristup");
    await overPristup(context as any, data.company_id, { oblast: "doklady", zapis: true });
    const { navrhniPreNezauctovane } = await import("./auto-uctovanie.server");
    return navrhniPreNezauctovane(context.supabase as any, data.company_id, { rozpocetMs: 18_000 });
  });

/** Návrh pre jeden doklad znova (aj s AI) — tlačidlo na detaile. */
export const prepocitajNavrhFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ company_id: z.string().uuid(), typ: Typ, id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { overPristup } = await import("./over-pristup");
    await overPristup(context as any, data.company_id, { oblast: "doklady", zapis: true });
    const sb = context.supabase as any;
    const srv = await import("./auto-uctovanie.server");
    const { data: row } = await sb
      .from(srv.TABULKY[data.typ].tabulka)
      .select("*")
      .eq("id", data.id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!row) throw new Error("Doklad sa nenašiel.");
    const n = await srv.navrhPreRiadok(sb, data.typ, row, { ai: true });
    if (!row.zauctovane_at && !n.neprepisovat) await srv.ulozNavrh(sb, data.typ, row.id, n);
    return n;
  });

/** „Zmeniť“ na štítku automatického zaúčtovania — zruší zaúčtovanie, kódy ostanú. */
export const zrusAutoZauctovanieFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ company_id: z.string().uuid(), typ: Typ, id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { overPristup } = await import("./over-pristup");
    await overPristup(context as any, data.company_id, { oblast: "doklady", zapis: true });
    const sb = context.supabase as any;
    const { TABULKY } = await import("./auto-uctovanie.server");
    const m = TABULKY[data.typ];
    const { data: row } = await sb
      .from(m.tabulka)
      .select("id, exported_at, status")
      .eq("id", data.id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!row) throw new Error("Doklad sa nenašiel.");
    if (row.exported_at) throw new Error("Doklad je už odovzdaný do účtovníctva — opravte ho tam.");
    const { error } = await sb
      .from(m.tabulka)
      .update({
        zauctovane_at: null,
        zauctoval: null,
        ...(data.typ === "prijata" && row.status === "booked" ? { status: "received" } : {}),
      })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Dashboard: koľko dokladov sa tento mesiac zaúčtovalo samo. */
export const statistikaAutoUctovaniaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { overPristup } = await import("./over-pristup");
    await overPristup(context as any, data.company_id);
    const { statistikaMesiaca, nacitajFirmu } = await import("./auto-uctovanie.server");
    const sb = context.supabase as any;
    const firma = await nacitajFirmu(sb, data.company_id);
    if (!firma.pouzivaUctovanie) return null;
    const d = new Date();
    const od = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
    return { ...(await statistikaMesiaca(sb, data.company_id, od)), rezim: firma.rezim };
  });
