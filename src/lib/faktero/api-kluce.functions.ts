import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Kľúč účtu — jeden API kľúč pre viac firiem (ako Doklado). Vyrába sa na
  serveri: patrí prihlásenému (`ucet_user_id`), platí pre firmy, kde je
  vlastník alebo admin, prípadne len pre vybrané. Firma sa potom vyberá
  v každej požiadavke hlavičkou X-Company.
*/

/** Firmy, kde je prihlásený vlastník alebo admin — ponuka pre kľúč účtu. */
export const firmyPreKlucUctuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: clen } = await supabaseAdmin
      .from("company_users")
      .select("company_id, role")
      .eq("user_id", context.userId)
      .in("role", ["owner", "admin"]);
    const ids = (clen ?? []).map((r: any) => r.company_id);
    if (!ids.length) return { firmy: [] as { id: string; name: string; ico: string | null }[] };
    const { data } = await supabaseAdmin
      .from("companies")
      .select("id, name, ico")
      .in("id", ids)
      .order("name");
    return { firmy: (data ?? []) as { id: string; name: string; ico: string | null }[] };
  });

export const vytvorKlucUctuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        mode: z.enum(["test", "live"]),
        /** Prázdne/null = všetky firmy, kde som vlastník alebo admin (aj budúce). */
        firmy: z.array(z.string().uuid()).max(500).nullable(),
        nazov: z.string().trim().max(80).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { overPristup } = await import("./over-pristup");
    // Kľúč sa zobrazí v API kľúčoch tejto firmy — tam ho musí smieť spravovať.
    await overPristup(context as any, data.company_id, { spravca: true });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let firmy: string[] | null = null;
    if (data.firmy?.length) {
      const { data: clen } = await supabaseAdmin
        .from("company_users")
        .select("company_id")
        .eq("user_id", context.userId)
        .in("role", ["owner", "admin"])
        .in("company_id", data.firmy);
      firmy = [...new Set((clen ?? []).map((r: any) => String(r.company_id)))];
      if (firmy.length !== new Set(data.firmy).size)
        throw new Error(
          "Niektorú z vybraných firiem nespravujete (treba byť vlastník alebo admin).",
        );
    }
    const { randomBytes, createHash } = await import("crypto");
    const plaintext = `fk_${data.mode}_${randomBytes(24).toString("hex")}`;
    const { data: k, error } = await supabaseAdmin
      .from("api_keys")
      .insert({
        company_id: data.company_id,
        mode: data.mode,
        name:
          data.nazov?.trim() ||
          (firmy ? `Kľúč účtu — ${firmy.length} firiem` : "Kľúč účtu — všetky moje firmy"),
        prefix: plaintext.slice(0, 14),
        key_hash: createHash("sha256").update(plaintext).digest("hex"),
        created_by: context.userId,
        ucet_user_id: context.userId,
        firmy,
      })
      .select("id")
      .single();
    if (error || !k) throw new Error(error?.message ?? "Kľúč sa nepodarilo vytvoriť.");
    return { id: k.id as string, plaintext };
  });
