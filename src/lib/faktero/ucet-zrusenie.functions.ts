import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { terminSlovom, terminZrusenia, ODKLAD_DNI } from "./ucet-zrusenie";

/**
 * Zrušenie účtu na žiadosť používateľa.
 *
 * Žiadosť sa len zapíše s termínom o 14 dní; samotné mazanie robí plánovaná
 * úloha (`ucet-zrusenie.server.ts`). Kým lehota beží, stačí sa prihlásiť a
 * žiadosť odvolať — vo fakturačnom systéme je omylom zrušený účet drahšia
 * chyba než čakanie.
 *
 * Termín zapisuje výhradne server servisným kľúčom. Vlastník riadku naň nemá
 * právo (odobraté v migrácii), inak by si ho vedel posunúť do minulosti.
 */

async function posliMail(opts: { to: string; subject: string; text: string; html: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: `Faktero <${process.env.RESEND_FROM_NOREPLY || "noreply@faktero.sk"}>`,
      to: [opts.to],
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    }),
  }).catch(() => {
    // Nedoručený e-mail nesmie zhodiť žiadosť — stav je aj tak v aplikácii.
  });
}

/** Čo sa stane, keď účet zruším, a či už žiadosť beží. */
export const stavZrusenieUctuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { firmyNaZmazanie } = await import("./ucet-zrusenie.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: profil }, firmy] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("email, deletion_requested_at, deletion_scheduled_for")
        .eq("id", context.userId)
        .maybeSingle(),
      firmyNaZmazanie(context.userId),
    ]);

    return {
      email: (profil?.email as string | null) ?? null,
      poziadaneOd: (profil?.deletion_requested_at as string | null) ?? null,
      zrusiSa: (profil?.deletion_scheduled_for as string | null) ?? null,
      /** Firmy, ktoré zrušením zaniknú — človek je v nich jediným členom. */
      firmyNaZmazanie: firmy,
      odkladDni: ODKLAD_DNI,
    };
  });

export const poziadajOZrusenieUctuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { firmyNaZmazanie } = await import("./ucet-zrusenie.server");

    const teraz = new Date();
    const termin = terminZrusenia(teraz);

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        deletion_requested_at: teraz.toISOString(),
        deletion_scheduled_for: termin.toISOString(),
      })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);

    const { data: profil } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", context.userId)
      .maybeSingle();

    const email = profil?.email as string | null;
    if (email) {
      const firmy = await firmyNaZmazanie(context.userId);
      const zoznam = firmy.map((f) => f.name).join(", ");
      const den = terminSlovom(termin);
      await posliMail({
        to: email,
        subject: "Žiadosť o zrušenie účtu vo Fakteri",
        text:
          `Prijali sme žiadosť o zrušenie vášho účtu.\n\n` +
          `Účet sa zruší ${den}. Do vtedy stačí sa prihlásiť a žiadosť odvolať — nič sa nestratí.\n\n` +
          (zoznam ? `Spolu s účtom zaniknú aj tieto firmy a ich doklady: ${zoznam}.\n\n` : "") +
          `Ak ste o zrušenie nežiadali, prihláste sa a žiadosť zrušte, prípadne si zmeňte heslo.\n`,
        html:
          `<p>Prijali sme žiadosť o zrušenie vášho účtu.</p>` +
          `<p><strong>Účet sa zruší ${den}.</strong> Do vtedy stačí sa prihlásiť a žiadosť odvolať — nič sa nestratí.</p>` +
          (zoznam ? `<p>Spolu s účtom zaniknú aj tieto firmy a ich doklady: ${zoznam}.</p>` : "") +
          `<p>Ak ste o zrušenie nežiadali, prihláste sa a žiadosť zrušte, prípadne si zmeňte heslo.</p>`,
      });
    }

    return { zrusiSa: termin.toISOString() };
  });

export const odvolajZrusenieUctuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ deletion_requested_at: null, deletion_scheduled_for: null })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
