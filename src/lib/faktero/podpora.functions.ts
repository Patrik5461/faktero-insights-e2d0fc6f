import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Help desk — strana zákazníka. Zoznam a vlákno si obrazovka číta sama (RLS
  pustí len vlastné požiadavky a bez interných poznámok); zápis ide sem, aby sa
  overilo, komu požiadavka patrí, a odišiel e-mail.
*/

const Nova = z.object({
  kategoria: z.enum(["otazka", "chyba", "napad", "predplatne"]),
  predmet: z.string().trim().max(200).optional(),
  text: z.string().trim().min(5, "Napíšte aspoň vetu.").max(10000),
  company_id: z.string().uuid().optional(),
  url: z.string().trim().max(300).optional(),
  user_agent: z.string().trim().max(400).optional(),
});

async function mojEmail(
  supabase: any,
  userId: string,
): Promise<{ email: string; meno: string | null }> {
  const { data } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.email) throw new Error("K účtu sa nenašiel e-mail.");
  return { email: data.email, meno: data.full_name ?? null };
}

export const zalozPoziadavkuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Nova.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { predmetZoSpravy } = await import("./podpora");
    const { zalozPoziadavku } = await import("./podpora.server");
    const ja = await mojEmail(supabase, userId);
    return zalozPoziadavku({
      userId,
      companyId: data.company_id ?? null,
      email: ja.email,
      meno: ja.meno,
      predmet: data.predmet || predmetZoSpravy(data.text),
      kategoria: data.kategoria,
      zdroj: "aplikacia",
      text: data.text,
      url: data.url ?? null,
      userAgent: data.user_agent ?? null,
    });
  });

async function mojaPoziadavka(id: string, userId: string) {
  const { nacitajPoziadavku } = await import("./podpora.server");
  const p = await nacitajPoziadavku(id);
  // Cudzia aj neexistujúca požiadavka vyzerá rovnako — nič sa neprezradí.
  if (!p || p.user_id !== userId) throw new Error("Požiadavka sa nenašla.");
  return p;
}

export const odpovedzNaPoziadavkuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ id: z.string().uuid(), text: z.string().trim().min(1).max(10000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const p = await mojaPoziadavka(data.id, userId);
    const { pridajSpravu } = await import("./podpora.server");
    await pridajSpravu({ poziadavka: p, autorId: userId, od: "zakaznik", text: data.text });
    return { ok: true };
  });

export const uzavriPoziadavkuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await mojaPoziadavka(data.id, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const teraz = new Date().toISOString();
    await supabaseAdmin
      .from("podpora_poziadavky")
      .update({ stav: "vyriesena", updated_at: teraz })
      .eq("id", data.id);
    return { ok: true };
  });

/** Zákazník otvoril vlákno — odpoveď podpory už nesvieti ako nová. */
export const oznacPrecitaneFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await mojaPoziadavka(data.id, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("podpora_poziadavky")
      .update({ zakaznik_videl_at: new Date().toISOString() })
      .eq("id", data.id);
    return { ok: true };
  });
