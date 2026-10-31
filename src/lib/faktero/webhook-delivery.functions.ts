import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const IdInput = z.object({ id: z.string().uuid() });

/**
 * „Poslať znova“ — jeden pokus hneď teraz pre opakované alebo vzdané
 * doručenie. Ide do toho istého záznamu s tým istým `Idempotency-Key`, takže
 * prijímateľ, ktorý udalosť medzičasom dostal, ju nespracuje druhý raz.
 */
export const retryWebhookDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    // Používateľský klient — RLS pustí k záznamu len správcu firmy.
    const { data: log, error } = await context.supabase
      .from("webhook_delivery_logs")
      .select("id")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !log) throw new Error("Záznam nenájdený");

    const { posliWebhookZnova } = await import("./webhook-trigger.server");
    const r = await posliWebhookZnova(log.id);
    return {
      ok: r.ok,
      log_id: log.id,
      status: r.status,
      response_status: r.http,
      duration_ms: r.trvanieMs,
      pokus: r.pokus,
    };
  });
