import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Hľadanie v hlavičke (⌘K) naprieč agendami aktívnej firmy —
  `globalne-hladanie.server.ts`. Ide klientom prihláseného (RLS), skupiny
  mimo jeho oblastí sa nepýtajú. Len čítanie.
*/
export const globalneHladanieFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        q: z.string().max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { hladajGlobalne } = await import("./globalne-hladanie.server");
    const { dnesBratislava } = await import("./datum-vystavenia");
    return hladajGlobalne(context.supabase as any, {
      companyId: data.company_id,
      userId: (context as any).userId,
      dotaz: data.q,
      dnes: dnesBratislava(),
    });
  });
