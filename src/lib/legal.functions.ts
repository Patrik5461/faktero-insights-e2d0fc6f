import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

const DOC_TYPES = ["obchodne-podmienky", "gdpr", "reklamacny-poriadok", "gopay-podmienky", "cookies"] as const;

const schema = z.object({
  user_id: z.string().uuid(),
  documents: z.array(z.object({
    document_type: z.enum(DOC_TYPES),
    version: z.string().min(1).max(20),
  })).min(1).max(10),
});

export const recordLegalAcceptance = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let ip: string | null = null;
    let ua: string | null = null;
    try {
      const req = getRequest();
      ip = req.headers.get("cf-connecting-ip")
        || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        || req.headers.get("x-real-ip")
        || null;
      ua = req.headers.get("user-agent");
    } catch {}

    const rows = data.documents.map((d) => ({
      user_id: data.user_id,
      document_type: d.document_type,
      version: d.version,
      ip_address: ip,
      user_agent: ua,
    }));
    const { error } = await supabaseAdmin.from("legal_acceptances").insert(rows);
    if (error) throw new Error(error.message);
    return { ok: true };
  });