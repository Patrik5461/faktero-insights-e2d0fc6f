import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PREDPONA_SKUPINY } from "./telegram";

/*
  Admin → Podpora → Telegram skupina: párovací kód pre skupinu, zapnutie /
  vypnutie, zoznam správ zo skupiny a označenie „vybavené“. Všetko cez
  servisný kľúč až po overení platform admina (s aal2).
*/

async function overAdmina(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("platform_admins")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Forbidden: not a platform admin");
  // Od ADMIN_2FA_POVINNE_OD len s reláciou aal2 (admin-dvojfaktor.ts).
  (await import("@/lib/faktero/admin-dvojfaktor.server")).vyzadujAal2Admina();
  return supabaseAdmin;
}

type Skupina = {
  chat_id: number;
  nazov: string | null;
  aktivna: boolean;
  created_at: string;
  posledna_sprava: string | null;
  nevybavenych: number;
};

/** Spárované skupiny s časom poslednej správy a počtom nevybavených. */
export const adminTelegramSkupinyFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await overAdmina((context as { userId: string }).userId);
    const { data } = await db
      .from("telegram_skupiny")
      .select("chat_id, nazov, aktivna, created_at")
      .order("created_at");
    const skupiny: Skupina[] = [];
    for (const s of (data ?? []) as Omit<Skupina, "posledna_sprava" | "nevybavenych">[]) {
      const [{ data: posledna }, { count }] = await Promise.all([
        db
          .from("telegram_skupiny_spravy")
          .select("created_at")
          .eq("chat_id", s.chat_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        db
          .from("telegram_skupiny_spravy")
          .select("id", { count: "exact", head: true })
          .eq("chat_id", s.chat_id)
          .eq("vybavene", false),
      ]);
      skupiny.push({
        ...s,
        posledna_sprava: (posledna as { created_at: string } | null)?.created_at ?? null,
        nevybavenych: count ?? 0,
      });
    }
    return { skupiny };
  });

/** Jednorazový kód pre `/skupina <kód>` — platí 10 minút a len pre volajúceho admina. */
export const adminTelegramSkupinaKodFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = (context as { userId: string }).userId;
    await overAdmina(userId);
    const { vytvorKodTelegram, jeTelegramNastaveny } = await import("./telegram.server");
    if (!jeTelegramNastaveny()) throw new Error("Telegram nie je nastavený.");
    const { count } = await (
      await import("@/integrations/supabase/client.server")
    ).supabaseAdmin
      .from("telegram_admin_chaty")
      .select("chat_id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (!count)
      throw new Error(
        "Najprv si spárujte súkromný chat s botom (Prepojiť Telegram) — podľa neho bot pozná, že ste admin.",
      );
    return vytvorKodTelegram(userId, "skupina");
  });

export const adminTelegramSkupinaAktivnaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ chat_id: z.number().int(), aktivna: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await overAdmina((context as { userId: string }).userId);
    const { error } = await db
      .from("telegram_skupiny")
      .update({ aktivna: data.aktivna })
      .eq("chat_id", data.chat_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Správy zo skupín, najnovšie prvé; prílohy s podpísanou adresou na hodinu. */
export const adminTelegramSkupinaSpravyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        chat_id: z.number().int().optional(),
        /** Začiatok dňa „od“ a koniec dňa „do“ (okamihy z prehliadača, jeho časové pásmo). */
        od: z.string().datetime({ offset: true }).optional(),
        do: z.string().datetime({ offset: true }).optional(),
        stav: z.enum(["vsetky", "nevybavene", "vybavene"]).default("vsetky"),
        strana: z.number().int().min(1).default(1),
        naStranu: z.number().int().min(10).max(100).default(50),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await overAdmina((context as { userId: string }).userId);
    let q = db
      .from("telegram_skupiny_spravy")
      .select(
        "id, chat_id, message_id, od_id, od_meno, od_username, text, prilohy, odpoved_na, vybavene, poznamka, vybavene_at, created_at, upravene_at",
        { count: "exact" },
      );
    if (data.chat_id != null) q = q.eq("chat_id", data.chat_id);
    if (data.od) q = q.gte("created_at", new Date(data.od).toISOString());
    if (data.do) q = q.lt("created_at", new Date(data.do).toISOString());
    if (data.stav !== "vsetky") q = q.eq("vybavene", data.stav === "vybavene");
    const odRiadku = (data.strana - 1) * data.naStranu;
    const {
      data: riadky,
      count,
      error,
    } = await q
      .order("created_at", { ascending: false })
      .range(odRiadku, odRiadku + data.naStranu - 1);
    if (error) throw new Error(error.message);

    type Priloha = {
      nazov: string;
      mime: string | null;
      velkost: number | null;
      path?: string;
      chyba?: string;
    };
    const zoznam = (riadky ?? []) as unknown as {
      id: string;
      chat_id: number;
      message_id: number;
      od_id: number | null;
      od_meno: string | null;
      od_username: string | null;
      text: string | null;
      prilohy: Priloha[] | null;
      odpoved_na: number | null;
      vybavene: boolean;
      poznamka: string | null;
      vybavene_at: string | null;
      created_at: string;
      upravene_at: string | null;
    }[];
    const { KOS_PODPORY } = await import("./podpora-prilohy");
    // Len cesty skupiny — riadok v DB nikdy nesmie odomknúť cudziu prílohu požiadavky.
    const cesty = zoznam
      .flatMap((r) => (Array.isArray(r.prilohy) ? r.prilohy : []))
      .map((p) => p.path)
      .filter((p): p is string => !!p && p.startsWith(PREDPONA_SKUPINY));
    const { data: odkazy } = cesty.length
      ? await db.storage.from(KOS_PODPORY).createSignedUrls(cesty, 3600)
      : { data: [] as { path: string | null; signedUrl: string }[] };
    const url = new Map((odkazy ?? []).map((o) => [o.path, o.signedUrl]));
    return {
      pocet: count ?? 0,
      spravy: zoznam.map((r) => ({
        ...r,
        prilohy: (Array.isArray(r.prilohy) ? r.prilohy : []).map(({ path, ...p }) => ({
          ...p,
          url: path && path.startsWith(PREDPONA_SKUPINY) ? (url.get(path) ?? null) : null,
        })),
      })),
    };
  });

export const adminTelegramSkupinaVybavFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        vybavene: z.boolean(),
        poznamka: z.string().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const userId = (context as { userId: string }).userId;
    const db = await overAdmina(userId);
    const poznamka = data.poznamka?.trim() || null;
    const { error } = await db
      .from("telegram_skupiny_spravy")
      .update({
        vybavene: data.vybavene,
        poznamka,
        vybavene_at: data.vybavene ? new Date().toISOString() : null,
        vybavil: data.vybavene ? userId : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
