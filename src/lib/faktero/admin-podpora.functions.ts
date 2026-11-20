import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Nástroje podpory v administrácii: zrušenie 2FA, zmena e-mailu účtu a prehľad
  bankových pripojení. Logika je v `admin-podpora-ucty.server.ts` a
  `admin-banky.ts`; tu je len overenie admina (platform_admins + aal2 cez
  `vyzadujAal2Admina`) a až potom práca so servisným kľúčom.
*/

async function getAdmin(context: { userId: string }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("platform_admins")
    .select("role")
    .eq("user_id", context.userId)
    .maybeSingle();
  if (error) throw new Error("Overenie administrátora zlyhalo.");
  if (!data) throw new Error("Prístup zamietnutý: nie ste administrátor platformy.");
  // Od ADMIN_2FA_POVINNE_OD len s reláciou aal2 (admin-dvojfaktor.ts).
  (await import("@/lib/faktero/admin-dvojfaktor.server")).vyzadujAal2Admina();
  return { supabaseAdmin };
}

async function getSuperadmin(context: { userId: string }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { vyzadujAal2Admina } = await import("@/lib/faktero/admin-dvojfaktor.server");
  const { overSuperadminaPodpory } = await import("./admin-podpora-ucty.server");
  await overSuperadminaPodpory(supabaseAdmin, context.userId, () => vyzadujAal2Admina());
  return { supabaseAdmin };
}

/** Má účet zapnuté 2FA? (pre detail účtu v adminovi) */
export const adminStavDvojfaktora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await getAdmin(context);
    const { data: f, error } = await supabaseAdmin.auth.admin.mfa.listFactors({
      userId: data.userId,
    });
    if (error) return { faktorov: null as number | null, overenych: null as number | null };
    const faktory = f?.factors ?? [];
    return {
      faktorov: faktory.length as number | null,
      overenych: faktory.filter((x) => x.status === "verified").length as number | null,
    };
  });

/** Zruší dvojfaktorové overenie (stratený telefón). Len superadmin, nie na účte admina. */
export const adminZrusDvojfaktor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        dovod: z.string().trim().min(5).max(500),
        upozornit: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await getSuperadmin(context);
    const { zrusDvojfaktorUctu } = await import("./admin-podpora-ucty.server");
    return zrusDvojfaktorUctu(supabaseAdmin, {
      adminId: context.userId,
      userId: data.userId,
      dovod: data.dovod,
      upozornit: data.upozornit,
    });
  });

/** Zmení prihlasovací e-mail účtu po overení totožnosti. Len superadmin, nie na účte admina. */
export const adminZmenEmailUctu = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        novyEmail: z.string().trim().email().max(254),
        dovod: z.string().trim().min(5).max(500),
        totoznostOverena: z.literal(true),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await getSuperadmin(context);
    const { zmenEmailUctu } = await import("./admin-podpora-ucty.server");
    return zmenEmailUctu(supabaseAdmin, {
      adminId: context.userId,
      userId: data.userId,
      novyEmail: data.novyEmail,
      dovod: data.dovod,
      totoznostOverena: data.totoznostOverena,
    });
  });

/** Admin → Banky: všetky bankové pripojenia naprieč firmami (len čítanie). */
export const adminPrehladBank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await getAdmin(context);
    const { zostavPrehladBank } = await import("./admin-banky");
    const { vsetkyRiadky, poDavkach } = await import("./strankovanie");

    // `metadata` nesie súkromné kľúče — z nej sa berie len názov banky pri notifikáciách.
    const pripojenia = await vsetkyRiadky<any>((od, po) =>
      supabaseAdmin
        .from("bank_connections")
        .select("id, company_id, provider, status, last_synced_at, created_at, banka:metadata->>banka")
        .order("id")
        .range(od, po),
    );
    const ucty = await vsetkyRiadky<any>((od, po) =>
      supabaseAdmin
        .from("bank_accounts")
        .select(
          "bank_connection_id, iban, last_synced_at, pohyby_ok_at, pohyby_chyba, pohyby_chyba_suhlas, unavailable_since, unavailable_reason",
        )
        .order("id")
        .range(od, po),
    );
    const idFiriem = Array.from(new Set(pripojenia.map((p) => p.company_id)));
    const firmy = await poDavkach<any>(idFiriem, (kus) =>
      supabaseAdmin.from("companies").select("id, name, ico, testovacia_pre").in("id", kus),
    );
    return { riadky: zostavPrehladBank(pripojenia, ucty, firmy) };
  });
