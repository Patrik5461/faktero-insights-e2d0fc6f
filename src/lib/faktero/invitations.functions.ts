import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// randomToken() vydáva 48 hex znakov. Rozsah je zámerne voľnejší, aby prípadné
// staršie tokeny neprestali fungovať, ale odfiltruje vstupy, ktoré tokenom ani
// nemôžu byť — tie sa k DB dotazu vôbec nedostanú.
const tokenSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{32,128}$/, "Neplatný formát tokenu"),
});

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type InviteRole = "admin" | "accountant" | "employee";

export const createInvitationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { company_id: string; email: string; role: InviteRole }) => d)
  .handler(async ({ data, context }) => {
    const email = data.email.trim().toLowerCase();
    if (!email || !email.includes("@")) throw new Error("Neplatný email");

    const { data: admin } = await context.supabase.rpc("is_company_admin", {
      _company_id: data.company_id,
      _user_id: context.userId,
    });
    if (!admin) throw new Error("Nemáte oprávnenie pozývať používateľov");

    const token = randomToken();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: inv, error } = await supabaseAdmin
      .from("company_invitations")
      .insert({
        company_id: data.company_id,
        email,
        role: data.role,
        token,
        invited_by: context.userId,
      })
      .select("*, companies(name)")
      .single();
    if (error) throw error;

    // Send email (best effort)
    try {
      const apiKey = process.env.RESEND_API_KEY;
      if (apiKey) {
        const base = (process.env.APP_PUBLIC_URL ?? "https://www.faktero.sk").replace(/\/+$/, "");
        const url = `${base}/pridat-pouzivatela?token=${token}`;
        const fromEmail = process.env.RESEND_FROM_EMAIL || "faktury@faktero.sk";
        const companyName = (inv as any)?.companies?.name || "Faktero";
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            from: `Faktero <${fromEmail}>`,
            to: [email],
            subject: `Pozvánka do firmy ${companyName} vo Faktero`,
            html: `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#111;max-width:560px">
              <h2 style="margin:0 0 12px">Boli ste pozvaný do Faktera</h2>
              <p>Firma <strong>${companyName}</strong> vás pozvala do svojho účtu vo Faktero.</p>
              <p><a href="${url}" style="background:#16a34a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">Prijať pozvánku</a></p>
              <p style="color:#666;font-size:12px">Alebo skopírujte odkaz: ${url}<br/>Platnosť pozvánky je 14 dní.</p>
            </div>`,
          }),
        });
      }
    } catch (e) {
      console.error("[invitation-email]", e);
    }

    return { id: inv.id, token };
  });

export const getInvitationByTokenFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => tokenSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv } = await supabaseAdmin
      .from("company_invitations")
      .select("id, company_id, email, role, expires_at, accepted_at, companies(name)")
      .eq("token", data.token)
      .maybeSingle();
    if (!inv) return { valid: false as const };
    if (inv.accepted_at) return { valid: false as const, reason: "already_accepted" };
    if (new Date(inv.expires_at) < new Date()) return { valid: false as const, reason: "expired" };
    return {
      valid: true as const,
      email: inv.email,
      role: inv.role,
      company_id: inv.company_id,
      company_name: (inv as any).companies?.name ?? "",
    };
  });

export const acceptInvitationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => tokenSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv } = await supabaseAdmin
      .from("company_invitations")
      .select("*")
      .eq("token", data.token)
      .maybeSingle();
    if (!inv) throw new Error("Pozvánka neexistuje");
    if (inv.accepted_at) throw new Error("Pozvánka už bola využitá");
    if (new Date(inv.expires_at) < new Date()) throw new Error("Pozvánka expirovala");

    const { error: linkErr } = await supabaseAdmin
      .from("company_users")
      .upsert(
        { company_id: inv.company_id, user_id: context.userId, role: inv.role },
        { onConflict: "company_id,user_id" },
      );
    if (linkErr) throw linkErr;

    await supabaseAdmin
      .from("company_invitations")
      .update({ accepted_at: new Date().toISOString(), accepted_user_id: context.userId })
      .eq("id", inv.id);

    return { ok: true, company_id: inv.company_id };
  });

export const listInvitationsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { company_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("company_invitations")
      .select("id, email, role, accepted_at, expires_at, created_at")
      .eq("company_id", data.company_id)
      .order("created_at", { ascending: false })
      .limit(50);
    return rows ?? [];
  });

export const revokeInvitationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("company_invitations").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
