import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Nahlásenie chyby a návrh na zlepšenie z prihlásenej aplikácie.
 *
 * Kontaktný formulár na verejnom webe existoval, ale kto je vnútri a niečo mu
 * nesedí, ten sa neodhlasuje, aby napísal, kto je a kde to videl. Tu sa adresa
 * stránky, prehliadač aj firma pripoja k správe samy — a práve tie tri veci
 * rozhodujú, či sa chyba dá zopakovať.
 *
 * Správa sa **uloží aj pošle e-mailom**. Uloženie je to podstatné (e-mail sa
 * stratí v schránke), odoslanie je to rýchle — a keď zlyhá, nahlásenie sa preto
 * nezahodí.
 */

const Vstup = z.object({
  kind: z.enum(["chyba", "napad"]),
  message: z.string().trim().min(5, "Napíšte aspoň vetu.").max(4000),
  /** Kde to človek videl. Adresu berieme z prehliadača, nie z jeho písania. */
  url: z.string().trim().max(300).optional(),
  user_agent: z.string().trim().max(400).optional(),
  company_id: z.string().uuid().optional(),
});

function bezpecne(v: string): string {
  return v.replace(/[<>&]/g, (z) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[z] ?? z);
}

async function posliMailom(args: {
  kind: string;
  message: string;
  url?: string;
  userAgent?: string;
  email: string | null;
  firma: string | null;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const prijemca = process.env.CONTACT_TO_EMAIL || "info@faktero.sk";
  const odosielatel = process.env.RESEND_FROM_EMAIL || "faktury@faktero.sk";
  const nadpis = args.kind === "chyba" ? "Nahlásená chyba" : "Návrh na zlepšenie";

  const riadky = [
    `Od: ${args.email ?? "neznámy"}`,
    args.firma ? `Firma: ${args.firma}` : null,
    args.url ? `Stránka: ${args.url}` : null,
    args.userAgent ? `Prehliadač: ${args.userAgent}` : null,
  ].filter(Boolean) as string[];

  const html =
    `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#111">` +
    `<p>${riadky.map(bezpecne).join("<br>")}</p>` +
    `<div style="white-space:pre-wrap;border-left:3px solid #12734f;padding-left:12px">${bezpecne(
      args.message,
    )}</div></div>`;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: `Faktero <${odosielatel}>`,
        to: [prijemca],
        ...(args.email ? { reply_to: args.email } : {}),
        subject: `${nadpis} — ${args.email ?? "Faktero"}`,
        text: `${riadky.join("\n")}\n\n${args.message}`,
        html,
      }),
    });
    if (!r.ok)
      console.error("[spatna-vazba] Resend odmietol", r.status, (await r.text()).slice(0, 200));
  } catch (e: any) {
    console.error("[spatna-vazba] e-mail zlyhal:", e?.message ?? e);
  }
}

export const posliSpatnuVazbu = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => Vstup.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };

    const { error } = await supabase.from("feedback").insert({
      user_id: userId,
      company_id: data.company_id ?? null,
      kind: data.kind,
      message: data.message,
      url: data.url ?? null,
      user_agent: data.user_agent ?? null,
    });
    if (error) throw new Error(error.message);

    // Na e-mail sa dopĺňa, kto a za akú firmu píše — aby sa dalo odpovedať bez
    // hľadania v databáze. Keď sa to nezistí, správa aj tak odíde.
    const [{ data: profil }, { data: firma }] = await Promise.all([
      supabase.from("profiles").select("email").eq("id", userId).maybeSingle(),
      data.company_id
        ? supabase.from("companies").select("name").eq("id", data.company_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    await posliMailom({
      kind: data.kind,
      message: data.message,
      url: data.url,
      userAgent: data.user_agent,
      email: profil?.email ?? null,
      firma: firma?.name ?? null,
    });

    return { ok: true };
  });
