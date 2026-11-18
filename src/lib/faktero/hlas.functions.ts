import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Hlasové ovládanie (TEST, len administrátori platformy) — `hlas.server.ts`.
  Všetko ide klientom prihláseného (RLS); `overPristup` overí firmu a oblasť
  Doklady. Jediný zápis je potvrdenie návrhu zaúčtovania.
*/

const Typ = z.enum(["nespracovany", "prijata", "blocek", "vystavena"]);
const Doklad = z.object({
  typ: Typ,
  id: z.string().uuid(),
  cislo: z.string().max(200).nullish(),
  partner: z.string().max(300).nullish(),
  suma: z.number().nullish(),
  mena: z.string().max(10).nullish(),
});

export const hlasPrikazFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        text: z.string().trim().min(1).max(1000),
        jazyk: z.enum(["sk", "cs", "de"]).default("sk"),
        kontext: z.object({
          stranka: z.string().max(60).nullable(),
          cesta: z.string().max(300),
          doklady: z.array(Doklad).max(50),
          oznacene: z.array(z.string().uuid()).max(200),
          otvoreny: z.object({ typ: Typ, id: z.string().uuid() }).nullable(),
        }),
        historia: z
          .array(z.object({ kto: z.enum(["user", "asistent"]), text: z.string().max(2000) }))
          .max(12),
        caka_navrh: z.boolean(),
        zname: z.array(Doklad).max(60),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const srv = await import("./hlas.server");
    await srv.overSmieHlas(context as any);
    const { overPristup } = await import("./over-pristup");
    await overPristup(context as any, data.company_id, { oblast: "doklady" });
    const { dnesBratislava } = await import("./datum-vystavenia");
    const sb = context.supabase as any;
    return srv.spracujPrikaz(
      {
        jazyk: data.jazyk,
        dnes: dnesBratislava(),
        companyId: data.company_id,
        nastroje: srv.vykonavace(sb, data.company_id, context.userId),
        volajModel: srv.volajClauda(data.company_id),
      },
      {
        text: data.text,
        kontext: data.kontext,
        historia: data.historia,
        cakaNavrh: data.caka_navrh,
        zname: data.zname,
      },
    );
  });

/** Potvrdenie návrhu zaúčtovania (klik Potvrdiť alebo „potvrď“ hlasom). */
export const hlasPotvrdFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        polozky: z
          .array(z.object({ typ: Typ, id: z.string().uuid(), predkontacia: z.string().min(1).max(60) }))
          .min(1)
          .max(10),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const srv = await import("./hlas.server");
    await srv.overSmieHlas(context as any);
    const { overPristup } = await import("./over-pristup");
    await overPristup(context as any, data.company_id, { oblast: "doklady", zapis: true });
    return srv.potvrdNavrhHlasu(context.supabase as any, data.company_id, context.userId, data.polozky);
  });
