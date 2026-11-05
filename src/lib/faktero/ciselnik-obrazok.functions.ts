import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Import číselníka zo screenshotu Pohody (AI). Jeden obrázok = jedno volanie
  (nginx preruší požiadavku po 30 s, viac obrázkov by sa nezmestilo) — okno
  ich posiela po jednom a riadky spája samo.
*/

const DRUH = z.enum(["predkontacia", "clenenie_dph", "kv_clenenie"]);

export const rozpoznajCiselnikZObrazkaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        druh: z.union([DRUH, z.literal("auto")]),
        mime: z.enum(["image/png", "image/jpeg", "image/webp"]),
        base64: z.string().min(16).max(11_000_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    // Firma, ktorú prihlásený nevidí, AI nedostane (RLS).
    const { data: firma } = await supabase.from("companies").select("id").eq("id", data.company_id).maybeSingle();
    if (!firma) throw new Error("Firma sa nenašla.");
    const s = await import("./ciselnik-obrazok.server");
    const { nahlad } = await import("./ciselnik-obrazok");
    let r;
    try {
      r = await s.rozpoznajObrazokCiselnika({
        base64: data.base64,
        mime: data.mime,
        druh: data.druh,
        firma: data.company_id,
      });
    } catch (e: any) {
      const sprava = String(e?.message ?? e);
      if (/AI nevrátila|AI vrátila/.test(sprava)) throw e;
      console.error("[ciselnik-obrazok] AI zlyhala:", sprava.slice(0, 300));
      throw new Error("Obrázok sa nepodarilo prečítať. Skúste to znova alebo s ostrejším obrázkom.");
    }
    const existujuce = await s.existujuceZaznamy(supabase, data.company_id, r.druh);
    return { druh: r.druh, vynechanych: r.vynechanych, riadky: nahlad(r.riadky, r.druh, existujuce) };
  });

/** Stav riadkov (po úprave v náhľade alebo spojení viacerých obrázkov) oproti číselníku firmy. */
export const stavRiadkovZObrazkaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        druh: DRUH,
        riadky: z.array(z.record(z.unknown())).max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const s = await import("./ciselnik-obrazok.server");
    const { nahlad, normalizujRiadky } = await import("./ciselnik-obrazok");
    const existujuce = await s.existujuceZaznamy(context.supabase as any, data.company_id, data.druh);
    return { riadky: nahlad(normalizujRiadky(data.riadky as any, data.druh), data.druh, existujuce) };
  });

const textNull = (n: number) => z.string().max(n).nullable().optional();

export const ulozCiselnikZObrazkaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        druh: DRUH,
        riadky: z
          .array(
            z.object({
              kod: z.string().trim().min(1).max(30),
              popis: textNull(200),
              kategoria: textNull(120),
              ucet_md: textNull(20),
              ucet_d: textNull(20),
              typ_dokladu: textNull(20),
              /** Prepísať aj kód z Pohody či ručne zadaný — len na výslovné zaškrtnutie. */
              prepisat: z.boolean().optional(),
            }),
          )
          .min(1)
          .max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const s = await import("./ciselnik-obrazok.server");
    return s.ulozCiselnikZObrazka(context.supabase as any, {
      companyId: data.company_id,
      druh: data.druh,
      riadky: data.riadky.map((r) => ({
        kod: r.kod,
        popis: r.popis ?? null,
        kategoria: r.kategoria ?? null,
        ucet_md: r.ucet_md ?? null,
        ucet_d: r.ucet_d ?? null,
        typ_dokladu: r.typ_dokladu ?? null,
        podozrivy: false,
        dovod: null,
        prepisat: r.prepisat ?? false,
      })),
    });
  });
