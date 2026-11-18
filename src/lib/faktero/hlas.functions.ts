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
    const { admin } = await srv.overSmieHlas(context as any);
    const { overPristup } = await import("./over-pristup");
    await overPristup(context as any, data.company_id, { oblast: "doklady" });
    const { dnesBratislava } = await import("./datum-vystavenia");
    const { strankyPreHlas } = await import("./hlas-stranky");
    const sb = context.supabase as any;
    const dnes = dnesBratislava();
    const { data: firma } = await sb
      .from("companies")
      .select("name")
      .eq("id", data.company_id)
      .maybeSingle();
    return srv.spracujPrikaz(
      {
        jazyk: data.jazyk,
        dnes,
        companyId: data.company_id,
        firma: firma?.name ?? null,
        stranky: strankyPreHlas(admin),
        nastroje: srv.vykonavace(sb, data.company_id, context.userId, dnes),
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

/** Najväčšia nahrávka v base64 (~2,2 MB zvuku; 30 s opusu má ~150 kB, Safari mp4 ~500 kB). */
const MAX_AUDIO_BASE64 = 3_000_000;

/**
 * Prepis nahratého príkazu na serveri (OpenAI gpt-4o-transcribe, záloha
 * whisper-1) so slovníkom Faktera a menami partnerov aktívnej firmy.
 * Pri chybe hodí výnimku — prehliadač potom použije svoje rozpoznávanie.
 */
export const hlasPrepisFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        audio_base64: z.string().min(100).max(MAX_AUDIO_BASE64),
        mime: z
          .string()
          .max(60)
          .regex(/^audio\/[\w.+-]+(;\s*codecs=[\w.,"-]+)?$/i),
        jazyk: z.enum(["sk", "cs", "de"]).default("sk"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const srv = await import("./hlas.server");
    await srv.overSmieHlas(context as any);
    const { overPristup } = await import("./over-pristup");
    await overPristup(context as any, data.company_id, { oblast: "doklady" });
    const kluc = process.env.OPENAI_API_KEY?.trim();
    if (!kluc) throw new Error("Prepis reči nie je nastavený (chýba kľúč OpenAI).");
    const p = await import("./hlas-prepis.server");
    const { zapisPouzitie } = await import("./ai-merac.server");
    const sb = context.supabase as any;
    const [firma, partneri] = await Promise.all([
      sb.from("companies").select("name").eq("id", data.company_id).maybeSingle(),
      // Slovník je pomôcka — keď sa nenačíta, prepisuje sa bez mien.
      p.partneriPreSlovnik(sb, data.company_id).catch(() => [] as string[]),
    ]);
    const prompt = p.slovnikPrepisu({
      jazyk: data.jazyk,
      firma: firma.data?.name ?? null,
      partneri,
    });
    const audio = new Uint8Array(Buffer.from(data.audio_base64, "base64"));
    const r = await p.prepisReci(
      { audio, mime: data.mime, jazyk: data.jazyk, prompt },
      {
        kluc,
        zmeraj: (m) =>
          zapisPouzitie({
            poskytovatel: "openai",
            model: m.model,
            ucel: "hlas",
            firma: data.company_id,
            vstupneTokeny: m.vstup,
            vystupneTokeny: m.vystup,
            trvanieMs: m.trvanieMs,
            ok: m.ok,
            nahrada: m.model !== p.MODEL_PREPISU,
            chyba: m.chyba ?? null,
          }),
      },
    );
    return r;
  });

/** Potvrdenie návrhu zaúčtovania (klik Potvrdiť alebo „potvrď“ hlasom). */
export const hlasPotvrdFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        polozky: z
          .array(
            z.object({ typ: Typ, id: z.string().uuid(), predkontacia: z.string().min(1).max(60) }),
          )
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
    return srv.potvrdNavrhHlasu(
      context.supabase as any,
      data.company_id,
      context.userId,
      data.polozky,
    );
  });
