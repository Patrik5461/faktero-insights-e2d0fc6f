import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Zmazanie jednej firmy.
 *
 * Firmu sa dalo doteraz len založiť — skúšobná či omylom vytvorená firma
 * ostávala v prepínači navždy a jediná cesta preč viedla cez zrušenie celého
 * účtu. Mazanie robí tá istá RPC ako pri rušení účtu: `faktero_zmaz_firmu` si
 * na to zapne výnimku z nemennosti skladových pohybov, prílohy treba zmazať
 * cez Storage API zvlášť (kaskáda v SQL na ne nesiaha).
 *
 * Poistky sú tri: firmu maže len jej majiteľ, poslednú firmu takto zmazať
 * nejde (na to je zrušenie účtu s odkladom) a názov treba prepísať ručne.
 */
export const zmazFirmuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ company_id: z.string().uuid(), potvrdenie: z.string() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const { data: clenstvo } = await supabase
      .from("company_users")
      .select("role")
      .eq("company_id", data.company_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!clenstvo) throw new Error("K tejto firme nemáte prístup.");
    if (clenstvo.role !== "owner") throw new Error("Zmazať firmu môže len jej majiteľ.");

    // Testovacia firma (náhľad) sa za firmu nepočíta — s rodičom by inak „druhá
    // firma" vždy existovala a zmazať by sa dala aj jediná skutočná.
    const { data: moje } = await supabase
      .from("company_users")
      .select("company_id, companies!inner(testovacia_pre)")
      .eq("user_id", userId)
      .is("companies.testovacia_pre", null);
    const mojeFirmy = (moje ?? []).length;
    const mazemTestovaciu = !(moje ?? []).some((r: any) => r.company_id === data.company_id);
    // Testovacia firma sa samostatne nemaže — znova by sa nedala založiť.
    // Údaje z nej vymaže tlačidlo v Nastaveniach, zanikne so skutočnou firmou.
    if (mazemTestovaciu) {
      throw new Error(
        "Testovacia firma sa maže spolu so skutočnou firmou. Jej údaje vymažete v Nastaveniach firmy → Testovacia firma.",
      );
    }
    if (mojeFirmy <= 1) {
      throw new Error(
        "Toto je vaša jediná firma. Ak chcete skončiť, zrušte účet v Nastaveniach — má odklad, počas ktorého sa to dá vziať späť.",
      );
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: firma } = await supabaseAdmin
      .from("companies")
      .select("name")
      .eq("id", data.company_id)
      .maybeSingle();
    if (!firma) throw new Error("Firma sa nenašla.");
    if (data.potvrdenie.trim() !== (firma.name ?? "").trim()) {
      throw new Error("Názov firmy nesedí — prepíšte ho presne tak, ako je uvedený.");
    }

    const { zmazSuboryFirmy, testovaciaFirmaRodica } =
      await import("@/lib/faktero/ucet-zrusenie.server");
    // Testovaciu firmu zmaže RPC s rodičom; jej prílohy treba zmazať zvlášť.
    const testovacia = await testovaciaFirmaRodica(data.company_id);
    let subory = testovacia ? await zmazSuboryFirmy(testovacia) : 0;
    subory += await zmazSuboryFirmy(data.company_id);
    const { error } = await (supabaseAdmin as any).rpc("faktero_zmaz_firmu", {
      _company_id: data.company_id,
    });
    if (error) throw new Error(`Firmu sa nepodarilo zmazať: ${error.message}`);

    return { ok: true, subory };
  });
