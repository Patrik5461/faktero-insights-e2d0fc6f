import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Schvaľovanie dokladov. Čítanie ide cez prihláseného (RLS); zápis cez
  servisný klient až po overení, že používateľ je vo firme a smie danú vec
  urobiť — inak by si zamestnanec mohol doklad schváliť sám cez API.
*/

const Agenda = z.enum(["doklad", "prijata", "vystavena"]);

async function rolaVoFirme(supabase: any, companyId: string, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("company_users")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.role ?? null) as string | null;
}

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}

/** Nastavenie, cesty a ľudia, ktorí môžu schvaľovať. */
export const nastavenieSchvalovaniaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const rola = await rolaVoFirme(supabase, data.company_id, context.userId);
    if (!rola) throw new Error("Do firmy nemáte prístup.");
    const { nastavenieFirmy } = await import("./schvalovanie.server");
    const [n, { data: cesty }, ludia] = await Promise.all([
      nastavenieFirmy(supabase, data.company_id),
      supabase.from("schvalovacie_cesty").select("*").eq("company_id", data.company_id).order("poradie"),
      (async () => {
        const a = await admin();
        const { data: cu } = await a
          .from("company_users")
          .select("user_id, role")
          .eq("company_id", data.company_id);
        const ids = (cu ?? []).map((r: any) => r.user_id);
        const { data: prof } = ids.length
          ? await a.from("profiles").select("id, email, full_name").in("id", ids)
          : { data: [] };
        const p = new Map((prof ?? []).map((x: any) => [x.id, x]));
        return (cu ?? []).map((r: any) => ({
          id: r.user_id as string,
          rola: r.role as string,
          meno: ((p.get(r.user_id) as any)?.full_name || (p.get(r.user_id) as any)?.email || "používateľ") as string,
        }));
      })(),
    ]);
    return { nastavenie: n, cesty: (cesty ?? []) as any[], ludia, mojaRola: rola, ja: context.userId };
  });

export const ulozNastavenieSchvalovaniaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        zapnute: z.boolean(),
        agendy: z.array(Agenda).max(3),
        autoPod: z.number().min(0).nullable().optional(),
        odoslanie: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const rola = await rolaVoFirme(context.supabase, data.company_id, context.userId);
    if (!["owner", "admin"].includes(String(rola))) throw new Error("Schvaľovanie nastavuje majiteľ alebo správca firmy.");
    const a = await admin();
    const { data: f } = await a.from("companies").select("schvalovanie_zapnute").eq("id", data.company_id).single();
    const { error } = await a
      .from("companies")
      .update({
        schvalovanie_zapnute: data.zapnute,
        // Platí od zapnutia — staršie doklady sa neschvaľujú.
        ...(data.zapnute && !f?.schvalovanie_zapnute ? { schvalovanie_od: new Date().toISOString() } : {}),
        schvalovanie_agendy: data.agendy,
        schvalovanie_auto_pod: data.autoPod ?? null,
        schvalovanie_odoslanie: data.odoslanie,
      })
      .eq("id", data.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const ulozCestuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        id: z.string().uuid().optional().nullable(),
        nazov: z.string().trim().min(1).max(80),
        urovne: z
          .array(z.array(z.union([z.string().uuid(), z.literal("manazer")])).min(1).max(20))
          .min(1)
          .max(15),
        podmienky: z.object({
          agenda: z.union([Agenda, z.literal("")]).optional(),
          ico: z.string().max(20).optional(),
          suma_od: z.number().nullable().optional(),
          predkontacia: z.string().max(30).optional(),
        }),
        predvolena: z.boolean(),
        poradie: z.number().int().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const rola = await rolaVoFirme(context.supabase, data.company_id, context.userId);
    if (!["owner", "admin"].includes(String(rola))) throw new Error("Cesty nastavuje majiteľ alebo správca firmy.");
    // Ten istý schvaľovateľ nesmie byť na dvoch úrovniach (ako v Doklado).
    const vsetci = data.urovne.flat();
    if (new Set(vsetci).size !== vsetci.length)
      throw new Error("Ten istý schvaľovateľ nesmie byť na viacerých úrovniach.");
    const a = await admin();
    const { data: clenovia } = await a.from("company_users").select("user_id").eq("company_id", data.company_id);
    const povoleni = new Set((clenovia ?? []).map((r: any) => r.user_id));
    if (vsetci.some((u) => u !== "manazer" && !povoleni.has(u)))
      throw new Error("Schvaľovateľ musí byť členom firmy.");
    const riadok = {
      company_id: data.company_id,
      nazov: data.nazov,
      urovne: data.urovne,
      podmienky: data.podmienky,
      predvolena: data.predvolena,
      poradie: data.poradie ?? 0,
    };
    if (data.predvolena)
      await a.from("schvalovacie_cesty").update({ predvolena: false }).eq("company_id", data.company_id);
    const { error } = data.id
      ? await a.from("schvalovacie_cesty").update(riadok).eq("id", data.id).eq("company_id", data.company_id)
      : await a.from("schvalovacie_cesty").insert(riadok);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const zmazCestuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ company_id: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const rola = await rolaVoFirme(context.supabase, data.company_id, context.userId);
    if (!["owner", "admin"].includes(String(rola))) throw new Error("Cesty nastavuje majiteľ alebo správca firmy.");
    const a = await admin();
    const { error } = await a.from("schvalovacie_cesty").delete().eq("id", data.id).eq("company_id", data.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Stav schvaľovania pre zoznam — chýbajúce záznamy sa pri tom založia. */
export const stavSchvalovaniaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ company_id: z.string().uuid(), agenda: Agenda, ids: z.array(z.string().uuid()).max(1000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const rola = await rolaVoFirme(supabase, data.company_id, context.userId);
    if (!rola) throw new Error("Do firmy nemáte prístup.");
    const { nastavenieFirmy, zabezpecSchvalovanie } = await import("./schvalovanie.server");
    const n = await nastavenieFirmy(supabase, data.company_id);
    if (!n.zapnute || !n.agendy.includes(data.agenda)) return { zapnute: false, stavy: {} };
    await zabezpecSchvalovanie(await admin(), data.company_id, data.agenda, data.ids);
    const { data: riadky } = await supabase
      .from("schvalovanie")
      .select("doklad_id, stav, schvalena_uroven, urovne")
      .eq("agenda", data.agenda)
      .in("doklad_id", data.ids.length ? data.ids : ["00000000-0000-0000-0000-000000000000"]);
    const { mozeSchvalit, nacitajUrovne, odznak } = await import("./schvalovanie");
    const stavy: Record<string, { stav: string; odznak: string; mozem: boolean }> = {};
    for (const r of riadky ?? []) {
      const s = { ...r, urovne: nacitajUrovne(r.urovne) };
      stavy[r.doklad_id] = { stav: r.stav, odznak: odznak(s), mozem: mozeSchvalit(s, context.userId, rola) };
    }
    return { zapnute: true, stavy };
  });

/** Detail pre panel na doklade: cesta, história, čo smiem. */
export const detailSchvalovaniaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ company_id: z.string().uuid(), agenda: Agenda, id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const rola = await rolaVoFirme(supabase, data.company_id, context.userId);
    if (!rola) throw new Error("Do firmy nemáte prístup.");
    const { nastavenieFirmy, zabezpecSchvalovanie } = await import("./schvalovanie.server");
    const n = await nastavenieFirmy(supabase, data.company_id);
    if (!n.zapnute || !n.agendy.includes(data.agenda)) return { zapnute: false } as const;
    await zabezpecSchvalovanie(await admin(), data.company_id, data.agenda, [data.id]);
    const { data: s } = await supabase
      .from("schvalovanie")
      .select("*")
      .eq("agenda", data.agenda)
      .eq("doklad_id", data.id)
      .maybeSingle();
    if (!s) return { zapnute: true, zaznam: null, predZapnutim: true } as const;
    const { data: hist } = await supabase
      .from("schvalovanie_historia")
      .select("akcia, uroven, poznamka, created_at, user_id")
      .eq("schvalovanie_id", s.id)
      .order("created_at");
    const a = await admin();
    const ids = [...new Set([...(hist ?? []).map((h: any) => h.user_id), ...(s.urovne ?? []).flat()].filter(Boolean))];
    const { data: prof } = ids.length ? await a.from("profiles").select("id, email, full_name").in("id", ids) : { data: [] };
    const mena: Record<string, string> = Object.fromEntries(
      (prof ?? []).map((p: any) => [p.id, p.full_name || p.email || "používateľ"]),
    );
    const { mozeSchvalit, mozeZrusit, nacitajUrovne, odznak } = await import("./schvalovanie");
    const z0 = { ...s, urovne: nacitajUrovne(s.urovne) };
    const { data: cesty } = await supabase
      .from("schvalovacie_cesty")
      .select("id, nazov")
      .eq("company_id", data.company_id)
      .order("poradie");
    return {
      zapnute: true,
      zaznam: {
        stav: s.stav as string,
        odznak: odznak(z0),
        schvalenaUroven: s.schvalena_uroven as number,
        urovne: z0.urovne.map((l: string[]) => l.map((u) => mena[u] ?? "používateľ")),
        cestaId: s.cesta_id as string | null,
      },
      historia: (hist ?? []).map((h: any) => ({ ...h, meno: h.user_id ? mena[h.user_id] ?? "používateľ" : "Faktero" })),
      mozem: mozeSchvalit(z0, context.userId, rola),
      mozemZrusit: mozeZrusit(z0, context.userId, rola),
      mozemPriradit: ["owner", "admin", "accountant"].includes(rola),
      cesty: (cesty ?? []) as { id: string; nazov: string }[],
    } as const;
  });

/** Schváliť, zamietnuť, vrátiť alebo zrušiť rozhodnutie — aj hromadne. */
export const rozhodnutieFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        agenda: Agenda,
        ids: z.array(z.string().uuid()).min(1).max(500),
        akcia: z.enum(["schvalit", "zamietnut", "vratit", "zrusit"]),
        poznamka: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const rola = await rolaVoFirme(supabase, data.company_id, context.userId);
    if (!rola) throw new Error("Do firmy nemáte prístup.");
    const a = await admin();
    const { zabezpecSchvalovanie } = await import("./schvalovanie.server");
    await zabezpecSchvalovanie(a, data.company_id, data.agenda, data.ids);
    const { data: riadky } = await a
      .from("schvalovanie")
      .select("*")
      .eq("company_id", data.company_id)
      .eq("agenda", data.agenda)
      .in("doklad_id", data.ids);
    const { mozeSchvalit, mozeZrusit, nacitajUrovne, poSchvaleni, urovenPouzivatela } = await import("./schvalovanie");
    let hotovo = 0;
    const preskocene: string[] = [];
    for (const r of riadky ?? []) {
      const s = { ...r, urovne: nacitajUrovne(r.urovne) };
      let zmena: Record<string, unknown> | null = null;
      let akcia = "";
      if (data.akcia === "schvalit") {
        if (!mozeSchvalit(s, context.userId, rola)) {
          preskocene.push(r.doklad_id);
          continue;
        }
        zmena = poSchvaleni(s, context.userId);
        akcia = "schvalil";
      } else if (data.akcia === "zrusit") {
        if (!mozeZrusit(s, context.userId, rola)) {
          preskocene.push(r.doklad_id);
          continue;
        }
        zmena = { stav: "caka", schvalena_uroven: 0 };
        akcia = "zrusil";
      } else {
        // Zamietnuť či vrátiť smie ten, kto by smel schváliť.
        if (!mozeSchvalit(s, context.userId, rola)) {
          preskocene.push(r.doklad_id);
          continue;
        }
        zmena = { stav: data.akcia === "zamietnut" ? "zamietnuty" : "vrateny" };
        akcia = data.akcia === "zamietnut" ? "zamietol" : "vratil";
      }
      await a.from("schvalovanie").update({ ...zmena, updated_at: new Date().toISOString() }).eq("id", r.id);
      await a.from("schvalovanie_historia").insert({
        schvalovanie_id: r.id,
        company_id: data.company_id,
        user_id: context.userId,
        akcia,
        uroven: urovenPouzivatela(s.urovne, context.userId) || null,
        poznamka: data.poznamka?.trim() || null,
      });
      hotovo++;
    }
    return { hotovo, preskocene: preskocene.length };
  });

/** Iná cesta pre doklad — stav schvaľovania sa začne odznova. */
export const priraditCestuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({ company_id: z.string().uuid(), agenda: Agenda, id: z.string().uuid(), cesta_id: z.string().uuid().nullable() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const rola = await rolaVoFirme(context.supabase, data.company_id, context.userId);
    if (!["owner", "admin", "accountant"].includes(String(rola))) throw new Error("Cestu prideľuje majiteľ, správca alebo účtovník.");
    const a = await admin();
    const { data: c0 } = data.cesta_id
      ? await a.from("schvalovacie_cesty").select("id, urovne").eq("id", data.cesta_id).eq("company_id", data.company_id).maybeSingle()
      : { data: null };
    const { tabulkaAgendy } = await import("./schvalovanie.server");
    const { rozvinUrovne, nacitajUrovne } = await import("./schvalovanie");
    const { data: dok } = await a.from(tabulkaAgendy(data.agenda).tabulka).select("job_id").eq("id", data.id).maybeSingle();
    const { data: zak } = dok?.job_id
      ? await a.from("jobs").select("manazer_id").eq("id", dok.job_id).maybeSingle()
      : { data: null };
    const c = c0 ? { ...c0, urovne: rozvinUrovne(nacitajUrovne(c0.urovne), zak?.manazer_id) } : null;
    const { data: r } = await a
      .from("schvalovanie")
      .upsert(
        {
          company_id: data.company_id,
          agenda: data.agenda,
          doklad_id: data.id,
          cesta_id: c?.id ?? null,
          urovne: c?.urovne ?? [],
          schvalena_uroven: 0,
          stav: "caka",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "agenda,doklad_id" },
      )
      .select("id")
      .single();
    if (r?.id)
      await a.from("schvalovanie_historia").insert({
        schvalovanie_id: r.id,
        company_id: data.company_id,
        user_id: context.userId,
        akcia: "pridelil",
      });
    return { ok: true };
  });

/** Doklady, ktoré čakajú na mňa — stránka Schvaľovanie. */
export const cakajuNaMnaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const rola = await rolaVoFirme(supabase, data.company_id, context.userId);
    if (!rola) throw new Error("Do firmy nemáte prístup.");
    const { nastavenieFirmy, zabezpecSchvalovanie, tabulkaAgendy } = await import("./schvalovanie.server");
    const n = await nastavenieFirmy(supabase, data.company_id);
    if (!n.zapnute) return { zapnute: false, polozky: [] };
    const a = await admin();
    // Doklady od zapnutia, ktoré ešte nemajú záznam, sa doplnia.
    for (const agenda of n.agendy as ("doklad" | "prijata" | "vystavena")[]) {
      const t = tabulkaAgendy(agenda);
      let q = a.from(t.tabulka).select("id").eq("company_id", data.company_id).order("created_at", { ascending: false }).limit(300);
      if (n.od) q = q.gte("created_at", n.od);
      const { data: d } = await q;
      await zabezpecSchvalovanie(a, data.company_id, agenda, (d ?? []).map((x: any) => x.id));
    }
    const { data: caka } = await supabase
      .from("schvalovanie")
      .select("*")
      .eq("company_id", data.company_id)
      .in("stav", ["caka", "vrateny"])
      .order("created_at", { ascending: false })
      .limit(500);
    const { mozeSchvalit, nacitajUrovne, odznak } = await import("./schvalovanie");
    const moje = (caka ?? []).filter((r: any) => mozeSchvalit({ ...r, urovne: nacitajUrovne(r.urovne) }, context.userId, rola));
    const polozky: any[] = [];
    for (const agenda of ["doklad", "prijata", "vystavena"] as const) {
      const ids = moje.filter((r: any) => r.agenda === agenda).map((r: any) => r.doklad_id);
      if (!ids.length) continue;
      const t = tabulkaAgendy(agenda);
      const { data: d } = await supabase
        .from(t.tabulka)
        .select(`id, issue_date, currency, ${t.cislo}, ${t.partner}, ${t.suma}`)
        .in("id", ids);
      for (const x of d ?? []) {
        const r = moje.find((m: any) => m.doklad_id === x.id && m.agenda === agenda);
        polozky.push({
          agenda,
          id: x.id,
          cislo: x[t.cislo],
          partner: x[t.partner],
          suma: Number(x[t.suma] ?? 0),
          mena: x.currency ?? "EUR",
          datum: x.issue_date,
          stav: r.stav,
          odznak: odznak({ ...r, urovne: nacitajUrovne(r.urovne) }),
        });
      }
    }
    return { zapnute: true, polozky };
  });
