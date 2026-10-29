import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { kodDoOdkazu } from "./telegram";

/*
  Telegram — stav bota a párovanie chatov. Podpora (platform admin) si
  spáruje chat na upozornenia, zákazník si voliteľne prepojí chat so svojím
  účtom. Obe cesty idú cez jednorazový kód s krátkou platnosťou; v databáze
  je len jeho hash.
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

export const adminTelegramStavFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = (context as { userId: string }).userId;
    const db = await overAdmina(userId);
    const { jeTelegramNastaveny, menoBota } = await import("./telegram.server");
    const { data: chaty } = await db
      .from("telegram_admin_chaty")
      .select("chat_id, meno, username, created_at")
      .eq("user_id", userId)
      .order("created_at");
    const { count: zakaznikov } = await db
      .from("telegram_chaty")
      .select("chat_id", { count: "exact", head: true });
    return {
      nastaveny: jeTelegramNastaveny(),
      webhookTajomstvo: !!process.env.TELEGRAM_WEBHOOK_SECRET?.trim(),
      bot: menoBota(),
      chaty: (chaty ?? []) as {
        chat_id: number;
        meno: string | null;
        username: string | null;
        created_at: string;
      }[],
      zakaznikov: zakaznikov ?? 0,
    };
  });

export const adminTelegramPrepojFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = (context as { userId: string }).userId;
    await overAdmina(userId);
    const { vytvorKodTelegram, menoBota } = await import("./telegram.server");
    const { kod, platiDo } = await vytvorKodTelegram(userId, "admin");
    const bot = menoBota();
    return {
      kod,
      platiDo,
      odkaz: bot ? `https://t.me/${bot}?start=admin_${kodDoOdkazu(kod)}` : null,
    };
  });

export const adminTelegramOdpojFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ chat_id: z.number().int() }).parse(d))
  .handler(async ({ data, context }) => {
    const userId = (context as { userId: string }).userId;
    const db = await overAdmina(userId);
    const { error } = await db
      .from("telegram_admin_chaty")
      .delete()
      .eq("chat_id", data.chat_id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Pre stránku Pomoc a podpora: je bot nastavený a je chat prepojený s účtom? */
export const telegramPodporaFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = (context as { userId: string }).userId;
    const { menoBota } = await import("./telegram.server");
    const bot = menoBota();
    if (!bot) return { bot: null, prepojeny: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("telegram_chaty")
      .select("chat_id", { count: "exact", head: true })
      .eq("user_id", userId);
    return { bot, prepojeny: (count ?? 0) > 0 };
  });

/** Odkaz do Telegramu, ktorý chat rovno prepojí s účtom volajúceho. */
export const telegramPrepojZakaznikaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = (context as { userId: string }).userId;
    const { vytvorKodTelegram, menoBota } = await import("./telegram.server");
    const bot = menoBota();
    if (!bot) throw new Error("Telegram nie je nastavený.");
    const { kod } = await vytvorKodTelegram(userId, "zakaznik");
    return { odkaz: `https://t.me/${bot}?start=${kodDoOdkazu(kod)}` };
  });
