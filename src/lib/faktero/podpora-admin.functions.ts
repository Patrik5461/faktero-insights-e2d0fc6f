import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Help desk — strana podpory (platform admin). Všetko ide cez servisný kľúč,
  preto každé volanie najprv overí, že volajúci je v `platform_admins`.
*/

async function admin(userId: string) {
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

const STAVY = ["nova", "otvorena", "caka_na_zakaznika", "vyriesena"] as const;

export const adminPoziadavkyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        filter: z.enum(["aktivne", "vsetky", ...STAVY]).default("aktivne"),
        hladat: z.string().trim().max(100).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin((context as { userId: string }).userId);
    let q = db
      .from("podpora_poziadavky")
      .select(
        "id, cislo, email, meno, predmet, kategoria, stav, zdroj, company_id, posledna_sprava_at, posledna_od, zakaznik_videl_at, podpora_videla_at, created_at",
      )
      .order("posledna_sprava_at", { ascending: false })
      .limit(300);
    if (data.filter === "aktivne") q = q.neq("stav", "vyriesena");
    else if (data.filter !== "vsetky") q = q.eq("stav", data.filter);
    if (data.hladat) {
      const h = data.hladat.replace(/[%,()]/g, " ");
      const cislo = Number(h.replace(/\D/g, ""));
      q = q.or(
        [`predmet.ilike.%${h}%`, `email.ilike.%${h}%`, cislo ? `cislo.eq.${cislo}` : ""]
          .filter(Boolean)
          .join(","),
      );
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const zoznam = (rows ?? []) as any[];

    const firmyIds = [...new Set(zoznam.map((r) => r.company_id).filter(Boolean))];
    const { data: firmy } = firmyIds.length
      ? await db.from("companies").select("id, name").in("id", firmyIds)
      : { data: [] as any[] };
    const menoFirmy = new Map((firmy ?? []).map((f: any) => [f.id, f.name]));

    const { data: vsetky } = await db
      .from("podpora_poziadavky")
      .select("stav")
      .limit(5000);
    const pocty: Record<string, number> = {};
    for (const r of (vsetky ?? []) as any[]) pocty[r.stav] = (pocty[r.stav] ?? 0) + 1;

    return {
      rows: zoznam.map((r) => ({
        ...r,
        firma: r.company_id ? (menoFirmy.get(r.company_id) ?? null) : null,
      })),
      pocty,
    };
  });

export const adminPoziadavkaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin((context as { userId: string }).userId);
    const { data: p, error } = await db
      .from("podpora_poziadavky")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!p) throw new Error("Požiadavka sa nenašla.");
    const poz = p as any;
    const { data: spravy } = await db
      .from("podpora_spravy")
      .select("id, autor_id, od_podpory, interna, text, created_at, cez_email")
      .eq("poziadavka_id", data.id)
      .order("created_at");
    const autori = [...new Set(((spravy ?? []) as any[]).map((s) => s.autor_id).filter(Boolean))];
    const { data: profily } = autori.length
      ? await db.from("profiles").select("id, email, full_name").in("id", autori)
      : { data: [] as any[] };
    const meno = new Map((profily ?? []).map((x: any) => [x.id, x.full_name || x.email]));
    const { data: firma } = poz.company_id
      ? await db.from("companies").select("id, name, ico").eq("id", poz.company_id).maybeSingle()
      : { data: null };
    /*
      Prílohy (snímky obrazovky, fotky, PDF) aj s podpísaným odkazom na hodinu —
      kôš je súkromný a obrázok sa má ukázať rovno vo vlákne.
    */
    const { KOS_PODPORY } = await import("./podpora-prilohy");
    const { data: riadkyPriloh } = await db
      .from("podpora_prilohy")
      .select("id, sprava_id, path, name, mime, size, created_at")
      .eq("poziadavka_id", data.id)
      .order("created_at");
    const zoznamPriloh = (riadkyPriloh ?? []) as {
      id: string;
      sprava_id: string | null;
      path: string;
      name: string;
      mime: string;
      size: number;
      created_at: string;
    }[];
    const { data: odkazy } = zoznamPriloh.length
      ? await db.storage.from(KOS_PODPORY).createSignedUrls(
          zoznamPriloh.map((r) => r.path),
          3600,
        )
      : { data: [] as { path: string | null; signedUrl: string }[] };
    const odkazPodlaCesty = new Map((odkazy ?? []).map((o) => [o.path, o.signedUrl]));
    const prilohy = zoznamPriloh.map(({ path, ...r }) => ({
      ...r,
      url: odkazPodlaCesty.get(path) ?? null,
    }));

    // Otvorením podpora požiadavku videla.
    await db
      .from("podpora_poziadavky")
      .update({ podpora_videla_at: new Date().toISOString() })
      .eq("id", data.id);

    /*
      Požiadavka z WhatsAppu: len maskované číslo a stav 24 h okna — celé
      telefónne číslo do administrácie nejde.
    */
    const { data: waChat } = poz.whatsapp_chat_id
      ? await db
          .from("whatsapp_chaty")
          .select("cislo_maska, user_id, posledna_od_zakaznika_at, nedorucene_od, posledna_chyba")
          .eq("id", poz.whatsapp_chat_id)
          .maybeSingle()
      : { data: null };
    const { jeVOkne, koniecOkna } = await import("./whatsapp");
    const whatsapp = waChat
      ? {
          cislo: waChat.cislo_maska,
          prepojeny: !!waChat.user_id,
          vOkne: jeVOkne(waChat.posledna_od_zakaznika_at),
          oknoDo: koniecOkna(waChat.posledna_od_zakaznika_at),
          nedorucene: !!waChat.nedorucene_od,
          poslednaChyba: waChat.posledna_chyba,
        }
      : null;

    return {
      poziadavka: poz,
      whatsapp,
      firma: firma as { id: string; name: string; ico: string | null } | null,
      spravy: ((spravy ?? []) as any[]).map((s) => ({
        ...s,
        autor: s.autor_id ? (meno.get(s.autor_id) ?? null) : null,
      })),
      prilohy,
    };
  });

export const adminOdpovedzFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        text: z.string().trim().min(1).max(10000),
        interna: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const userId = (context as { userId: string }).userId;
    await admin(userId);
    const { nacitajPoziadavku, pridajSpravu } = await import("./podpora.server");
    const p = await nacitajPoziadavku(data.id);
    if (!p) throw new Error("Požiadavka sa nenašla.");
    const r = await pridajSpravu({
      poziadavka: p,
      autorId: userId,
      od: "podpora",
      text: data.text,
      interna: data.interna,
    });
    // Napr. odpoveď do WhatsAppu mimo 24 h okna — admin to má vedieť hneď.
    return { ok: true, upozornenie: r.upozornenie ?? null };
  });

export const adminStavFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid(), stav: z.enum(STAVY) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin((context as { userId: string }).userId);
    const { error } = await db
      .from("podpora_poziadavky")
      .update({ stav: data.stav, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Počet požiadaviek, na ktoré podpora ešte nereagovala — do menu administrácie. */
export const adminPocetNovychFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin((context as { userId: string }).userId);
    const { data } = await db
      .from("podpora_poziadavky")
      .select("posledna_od, posledna_sprava_at, podpora_videla_at, stav")
      .neq("stav", "vyriesena")
      .limit(1000);
    const n = ((data ?? []) as any[]).filter(
      (p) =>
        p.posledna_od === "zakaznik" &&
        (!p.podpora_videla_at || p.podpora_videla_at < p.posledna_sprava_at),
    ).length;
    return { n };
  });

/*
  Automatická oprava (scripts/auto-oprava/oprava.mjs). Návrh robí spúšťač na
  serveri; tu podpora len vidí výsledok a rozhodne — nasadí sa až po schválení.
*/
const STAVY_AKTIVNEJ_OPRAVY = ["caka", "bezi", "navrh", "schvalena", "zlucuje", "zlucena"];

export const adminAutoOpravyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ poziadavka_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin((context as { userId: string }).userId);
    const { data: rows, error } = await db
      .from("podpora_auto_opravy")
      .select("*")
      .eq("poziadavka_id", data.poziadavka_id)
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    // Text odpovede, ktorý po nasadení odíde (predvolený alebo upravený podporou).
    const { data: poz } = await db
      .from("podpora_poziadavky")
      .select("cislo, predmet")
      .eq("id", data.poziadavka_id)
      .maybeSingle();
    const { textOdpovede } = await import("./auto-oprava-odpoved");
    return ((rows ?? []) as any[]).map((r) => ({
      ...r,
      odpoved_vysledny: poz
        ? textOdpovede({ ...r, cislo: (poz as any).cislo, predmet: (poz as any).predmet })
        : null,
    }));
  });

/*
  Odpoveď zákazníkovi po nasadení opravy: podpora môže text upraviť, automatiku
  vypnúť (zapnúť) alebo odpoveď po nasadení poslať hneď ručne.
*/
export const adminAutoOpravaOdpovedFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        poziadavka_id: z.string().uuid(),
        id: z.string().uuid(),
        akcia: z.enum(["ulozit", "odoslat"]),
        /** Prázdny text = vrátiť sa k predvolenému zo zhrnutia opravy. */
        text: z.string().max(10000).optional(),
        auto: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = (await admin((context as { userId: string }).userId)) as any;
    const { data: o } = await db
      .from("podpora_auto_opravy")
      .select("id, poziadavka_id, odpoved_odoslana_at")
      .eq("id", data.id)
      .eq("poziadavka_id", data.poziadavka_id)
      .maybeSingle();
    if (!o) throw new Error("Návrh opravy sa nenašiel.");
    if (o.odpoved_odoslana_at) throw new Error("Odpoveď už bola odoslaná.");
    const zmena: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.text !== undefined) zmena.odpoved_text = data.text.trim() || null;
    if (data.auto !== undefined) zmena.odpoved_auto = data.auto;
    const { error } = await db.from("podpora_auto_opravy").update(zmena).eq("id", o.id);
    if (error) throw new Error(error.message);
    if (data.akcia === "odoslat") {
      const { odosliOdpovedPoOprave } = await import("./auto-oprava-odpoved.server");
      const r = await odosliOdpovedPoOprave({ id: o.id, rucne: true });
      if (!r.ok) throw new Error(r.chyba);
      if (!r.odoslana)
        throw new Error(
          r.dovod === "nie_je_nasadena"
            ? "Oprava ešte nie je nasadená."
            : "Odpoveď už bola odoslaná.",
        );
    }
    return { ok: true };
  });

export const adminAutoOpravaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        poziadavka_id: z.string().uuid(),
        id: z.string().uuid().optional(),
        akcia: z.enum(["spustit", "schvalit", "zamietnut", "znova"]),
        pokyn: z.string().trim().max(4000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const userId = (context as { userId: string }).userId;
    const db = await admin(userId);
    const teraz = new Date().toISOString();
    const { data: posledne } = await db
      .from("podpora_auto_opravy")
      .select("id, stav, pokus, commit_sha")
      .eq("poziadavka_id", data.poziadavka_id)
      .order("created_at", { ascending: false });
    const riadky = (posledne ?? []) as { id: string; stav: string; pokus: number; commit_sha: string | null }[];
    const ciel = data.id ? riadky.find((r) => r.id === data.id) : undefined;
    if (data.id && !ciel) throw new Error("Návrh opravy sa nenašiel.");

    if (data.akcia === "schvalit" || data.akcia === "zamietnut") {
      // Tá istá kontrola aj účinok ako tlačidlá v Telegrame (len superadmin schvaľuje).
      if (!ciel) throw new Error("Návrh opravy sa nenašiel.");
      const { rozhodniOAutoOprave } = await import("./auto-oprava-rozhodnutie.server");
      await rozhodniOAutoOprave({
        userId,
        id: ciel.id,
        akcia: data.akcia,
        poziadavkaId: data.poziadavka_id,
      });
      return { ok: true };
    }
    // spustit / znova — nový pokus; rozbehnutý alebo schválený beh sa nezdvojí.
    if (riadky.some((r) => ["caka", "bezi", "schvalena", "zlucuje", "zlucena"].includes(r.stav)))
      throw new Error("Oprava pre túto požiadavku už beží alebo sa nasadzuje.");
    if (data.akcia === "spustit" && riadky.some((r) => STAVY_AKTIVNEJ_OPRAVY.includes(r.stav)))
      throw new Error("Návrh už existuje — použite „Skúsiť znova“.");
    for (const r of riadky.filter((x) => x.stav === "navrh"))
      await db
        .from("podpora_auto_opravy")
        .update({ stav: "zamietnuta", updated_at: teraz })
        .eq("id", r.id);
    const { error } = await db.from("podpora_auto_opravy").insert({
      poziadavka_id: data.poziadavka_id,
      pokyn: data.pokyn || null,
      pokus: Math.max(0, ...riadky.map((r) => r.pokus)) + 1,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
