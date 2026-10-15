import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Prečítanie výrezu z náhľadu dokladu — pre obrázky a skenované PDF, ktoré
  nemajú textovú vrstvu. Človek ťahaním označí oblasť, prehliadač ju vyreže
  (najviac ~1000 px) a tu ju prečíta AI. Vracia len text; na hodnotu poľa ho
  prevedie až prehliadač (`vyber-z-dokladu.ts`).
*/

const POKYN = `Na obrázku je malý výrez z účtovného dokladu (faktúry alebo bločku).
Vráť presne ten text, ktorý je na obrázku — nič nevysvetľuj, nič nepridávaj, nič neopravuj.
Čísla, dátumy, sumy a kódy prepíš znak po znaku, vrátane medzier, bodiek a čiarok.
Viac riadkov oddeľ znakom nového riadku.
Ak na obrázku nie je čitateľný text (napríklad len QR kód, logo alebo pečiatka), vráť prázdnu odpoveď — žiadne ospravedlnenie ani vysvetlenie.`;

export const precitajVyrezFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        /** Nespracovaný doklad, z ktorého je výrez — podľa neho sa overí firma. */
        id: z.string().uuid(),
        /** JPEG alebo PNG v base64, bez predpony `data:`. */
        obrazok: z.string().min(16).max(3_000_000),
        mime: z.enum(["image/jpeg", "image/png"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: r } = await supabase
      .from("nespracovane_doklady")
      .select("company_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!r) throw new Error("Doklad sa nenašiel.");
    const { overPristup } = await import("./over-pristup");
    await overPristup({ supabase, userId }, r.company_id, { oblast: "doklady", zapis: true });

    const { aiVision } = await import("./ai.server");
    const text = await aiVision(data.obrazok, data.mime, POKYN, {
      ucel: "vyber-z-dokladu",
      firma: r.company_id,
      maxOutputTokens: 400,
      bezUvazovania: true,
    });
    // Model občas obalí odpoveď do ``` alebo úvodzoviek.
    const cisty = String(text ?? "")
      .replace(/^```[a-z]*\s*|\s*```$/gi, "")
      .replace(/^["„“]|["“”]$/g, "")
      .trim()
      .slice(0, 2000);
    return { text: cisty };
  });
