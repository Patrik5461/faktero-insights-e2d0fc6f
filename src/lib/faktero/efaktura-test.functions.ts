// TODO: remove before production — dočasné diagnostické server fns pre ePošťák sandbox.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("platform_admins")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Admin check failed");
  if (!data) throw new Error("Forbidden: not a platform admin");
}

export const testEPostakAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { getEPostakToken } = await import("./efaktura/epostak.server");
    const token = await getEPostakToken();
    return {
      ok: true,
      tokenAcquired: Boolean(token),
      tokenPreview: token ? `${token.slice(0, 12)}…${token.slice(-6)}` : null,
      tokenLength: token?.length ?? 0,
    };
  });

export const testEPostakLookup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ peppolId: z.string().min(3) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { lookupParticipant } = await import("./efaktura/epostak.server");
    const r = await lookupParticipant(data.peppolId);
    return {
      ok: true,
      exists: r.exists,
      supportedDocuments: r.supportedDocuments ?? null,
      raw: r.raw,
    };
  });

export const testEPostakSend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ invoiceId: z.string().uuid(), firmEpostakId: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { sendEfaktura } = await import("./efaktura/epostak.server");
    const r = await sendEfaktura(data.invoiceId, data.firmEpostakId);
    return { ok: true, documentId: r.documentId, status: r.status, providerResponse: r.providerResponse };
  });
