import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { odkazNaWhatsApp, textPrepojenia } from "./whatsapp";

/*
  WhatsApp — stav napojenia pre administráciu a tlačidlá pre zákazníka.
  Tajomstvá (token, tajomstvo aplikácie, overovací token) sa nikdy nevracajú —
  admin vidí len, či sú nastavené. Bez WHATSAPP_TOKEN a WHATSAPP_PHONE_NUMBER_ID
  sa zákazníkovi nič nezobrazí.
*/

async function overAdmina(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("platform_admins")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Forbidden: not a platform admin");
  return supabaseAdmin;
}

export const adminWhatsAppStavFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await overAdmina((context as { userId: string }).userId);
    const s = await import("./whatsapp.server");
    const { data: stav } = await db
      .from("whatsapp_stav")
      .select(
        "webhook_overeny_at, posledna_udalost_at, posledna_sprava_at, posledna_chyba, posledna_chyba_at",
      )
      .eq("id", 1)
      .maybeSingle();
    const { count: chatov } = await db
      .from("whatsapp_chaty")
      .select("id", { count: "exact", head: true });
    const { count: nedorucenych } = await db
      .from("whatsapp_chaty")
      .select("id", { count: "exact", head: true })
      .not("nedorucene_od", "is", null);
    return {
      zapnuty: s.jeWhatsAppZapnuty(),
      nastavene: {
        token: !!s.tokenWhatsApp(),
        cisloId: !!s.phoneNumberId(),
        appSecret: !!process.env.WHATSAPP_APP_SECRET?.trim(),
        verifyToken: !!process.env.WHATSAPP_VERIFY_TOKEN?.trim(),
      },
      cislo: s.cisloPodpory(),
      sablona: s.sablonaOdpovede(),
      stav: (stav ?? null) as {
        webhook_overeny_at: string | null;
        posledna_udalost_at: string | null;
        posledna_sprava_at: string | null;
        posledna_chyba: string | null;
        posledna_chyba_at: string | null;
      } | null,
      chatov: chatov ?? 0,
      nedorucenych: nedorucenych ?? 0,
    };
  });

/** Pre stránku Pomoc a podpora: je WhatsApp zapnutý a je číslo prepojené s účtom? */
export const whatsappPodporaFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = (context as { userId: string }).userId;
    const { jeWhatsAppZapnuty, cisloPodpory } = await import("./whatsapp.server");
    if (!jeWhatsAppZapnuty()) return { cislo: null, prepojeny: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("whatsapp_chaty")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    return { cislo: cisloPodpory(), prepojeny: (count ?? 0) > 0 };
  });

/** Odkaz wa.me s predvyplneným kódom — odoslaná správa prepojí číslo s účtom volajúceho. */
export const whatsappPrepojZakaznikaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = (context as { userId: string }).userId;
    const { jeWhatsAppZapnuty, cisloPodpory, vytvorKodWhatsApp } =
      await import("./whatsapp.server");
    if (!jeWhatsAppZapnuty()) throw new Error("WhatsApp nie je nastavený.");
    const { kod } = await vytvorKodWhatsApp(userId);
    return { odkaz: odkazNaWhatsApp(cisloPodpory(), textPrepojenia(kod)) };
  });

/**
 * Verejne (web bez prihlásenia): je WhatsApp podpory zapnutý a na aké číslo
 * písať. Číslo podpory nie je tajomstvo — je v pätičke webu.
 */
export const kanalyPodporyFn = createServerFn({ method: "GET" }).handler(async () => {
  const { jeWhatsAppZapnuty, cisloPodpory } = await import("./whatsapp.server");
  return { whatsapp: jeWhatsAppZapnuty() ? cisloPodpory() : null };
});
