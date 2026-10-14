import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Moje úlohy. Čítanie ide cez prihláseného (RLS, mfa_ok, vlastný prístup);
  servisný klient len na mená kolegov z tej istej firmy a na zápis
  vyriešenia — oboje až po overení prístupu. Doklady na schválenie sa tu
  nepočítajú nanovo: stránka volá `cakajuNaMnaFn` zo schvaľovania, tu je len
  ľahký počet pre menu postavený na tom istom `mozeSchvalit`.
*/

const Firma = z.object({ company_id: z.string().uuid() });

const KOMENTARE_STLPCE = "id, agenda, doklad_id, user_id, text, created_at, upozornit, vyriesili";

/** Komentáre, v ktorých je človek označený a ešte ich nevyriešil. */
function dotazKomentarov(
  supabase: any,
  companyId: string,
  userId: string,
  stlpce: string,
  pocet = false,
) {
  return supabase
    .from("komentare_dokladov")
    .select(stlpce, pocet ? { count: "exact", head: true } : undefined)
    .eq("company_id", companyId)
    .contains("upozornit", [userId])
    .not("vyriesili", "cs", `{${userId}}`)
    .neq("user_id", userId);
}

/** Komentáre a nespracované doklady pre stránku Moje úlohy. */
export const mojeUlohyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Firma.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { overPristup } = await import("./over-pristup");
    await overPristup(context as any, data.company_id);
    const uid = context.userId;

    const [kom, nesp, bloc] = await Promise.all([
      dotazKomentarov(supabase, data.company_id, uid, KOMENTARE_STLPCE)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("nespracovane_doklady")
        .select("id, zdroj, stav, druh, file_name, udaje, chyba, created_at, inbox_message_id", {
          count: "exact",
        })
        .eq("company_id", data.company_id)
        .order("created_at", { ascending: false })
        .limit(10),
      // Bločky z appky čakajú na kontrolu tiež — rovnako ako v zozname Nespracovaných.
      supabase
        .from("expense_documents")
        .select(
          "id, supplier_name, document_number, total_amount, currency, issue_date, created_at, source",
          {
            count: "exact",
          },
        )
        .eq("company_id", data.company_id)
        .eq("status", "new")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    if (kom.error) throw new Error(kom.error.message);

    const { cakaNaMna, najnovsie } = await import("./moje-ulohy");
    const komentare = ((kom.data ?? []) as any[]).filter((k) => cakaNaMna(k, uid));

    // Čísla dokladov ku komentárom — cez RLS, takže čo človek nevidí, ostane bez čísla.
    const { tabulkaAgendy } = await import("./schvalovanie.server");
    const doklady = new Map<string, { cislo: string | null; partner: string | null }>();
    await Promise.all(
      (["doklad", "prijata", "vystavena"] as const).map(async (agenda) => {
        const ids = [
          ...new Set(
            komentare.filter((k) => k.agenda === agenda).map((k) => k.doklad_id as string),
          ),
        ];
        if (!ids.length) return;
        const t = tabulkaAgendy(agenda);
        const { data: d } = await supabase
          .from(t.tabulka)
          .select(`id, ${t.cislo}, ${t.partner}`)
          .in("id", ids);
        for (const x of (d ?? []) as any[])
          doklady.set(`${agenda}:${x.id}`, {
            cislo: x[t.cislo] ?? null,
            partner: x[t.partner] ?? null,
          });
      }),
    );

    // Mená autorov len pre ľudí z tejto firmy — profily cudzích firiem sa nevydávajú.
    const autori = [...new Set(komentare.map((k) => k.user_id as string))];
    const mena = new Map<string, string>();
    if (autori.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: cu } = await supabaseAdmin
        .from("company_users")
        .select("user_id")
        .eq("company_id", data.company_id)
        .in("user_id", autori);
      const clenovia = ((cu ?? []) as any[]).map((r) => r.user_id as string);
      if (clenovia.length) {
        const { data: prof } = await supabaseAdmin
          .from("profiles")
          .select("id, email, full_name")
          .in("id", clenovia);
        for (const p of (prof ?? []) as any[]) mena.set(p.id, p.full_name || p.email || "kolega");
      }
    }

    const { zhrnutieNespracovaneho, zhrnutieBlocku } = await import("./nespracovane");
    return {
      komentare: komentare.map((k) => {
        const d = doklady.get(`${k.agenda}:${k.doklad_id}`);
        return {
          id: k.id as string,
          agenda: k.agenda as string,
          dokladId: k.doklad_id as string,
          cislo: d?.cislo ?? null,
          partner: d?.partner ?? null,
          dokladDostupny: Boolean(d),
          autor: mena.get(k.user_id) ?? "bývalý kolega",
          text: String(k.text ?? ""),
          vytvorene: k.created_at as string,
        };
      }),
      nespracovane: {
        pocet: (nesp.count ?? 0) + (bloc.count ?? 0),
        polozky: najnovsie(
          [
            ((nesp.data ?? []) as any[]).map((r) => zhrnutieNespracovaneho(r)),
            ((bloc.data ?? []) as any[]).map((b) => ({ ...zhrnutieBlocku(b), stav: "vytazene" })),
          ] as any,
          10,
        ) as Array<
          | ReturnType<typeof zhrnutieNespracovaneho>
          | (ReturnType<typeof zhrnutieBlocku> & { stav: string })
        >,
      },
    };
  });

/** Počty pre odznak v menu — bez zakladania záznamov schvaľovania, len čítanie. */
export const pocetMojichUlohFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Firma.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { overPristup } = await import("./over-pristup");
    const rola = await overPristup(context as any, data.company_id);
    const uid = context.userId;
    const { nastavenieFirmy } = await import("./schvalovanie.server");

    const [kom, nesp, bloc, n] = await Promise.all([
      dotazKomentarov(supabase, data.company_id, uid, "id", true),
      supabase
        .from("nespracovane_doklady")
        .select("id", { count: "exact", head: true })
        .eq("company_id", data.company_id),
      supabase
        .from("expense_documents")
        .select("id", { count: "exact", head: true })
        .eq("company_id", data.company_id)
        .eq("status", "new"),
      nastavenieFirmy(supabase, data.company_id),
    ]);

    let schvalenie = 0;
    if (n.zapnute) {
      // Ten istý výber ako `cakajuNaMnaFn` (čaká alebo vrátený, a smiem schváliť).
      const { data: riadky } = await supabase
        .from("schvalovanie")
        .select("urovne, schvalena_uroven, stav")
        .eq("company_id", data.company_id)
        .in("stav", ["caka", "vrateny"])
        .limit(500);
      const { mozeSchvalit, nacitajUrovne } = await import("./schvalovanie");
      schvalenie = ((riadky ?? []) as any[]).filter((r) =>
        mozeSchvalit({ ...r, urovne: nacitajUrovne(r.urovne) }, uid, rola),
      ).length;
    }

    const pocty = {
      schvalenie,
      // Kým migrácia `vyriesili` nie je v databáze, dotaz zlyhá — vtedy radšej 0 než pád menu.
      komentare: kom.error ? 0 : (kom.count ?? 0),
      nespracovane: (nesp.count ?? 0) + (bloc.count ?? 0),
    };
    const { spoluUloh } = await import("./moje-ulohy");
    return { ...pocty, spolu: spoluUloh(pocty) };
  });

/**
 * Vyriešiť komentár (alebo ho vrátiť medzi úlohy).
 *
 * Tabuľka nemá politiku na UPDATE — autor nesmie po prečítaní meniť text a
 * označený nič okrem svojho vyriešenia. Komentár sa preto najprv načíta
 * prihláseným klientom (RLS overí firmu, MFA aj vlastný prístup), potom sa
 * overí, že je volajúci medzi označenými, a až potom zapíše servisný klient
 * len stĺpec `vyriesili`. Zápis porovnáva pôvodné pole, aby súbežné
 * vyriešenie dvoch kolegov jedno druhé neprepísalo.
 */
export const vyriesKomentarFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        id: z.string().uuid(),
        vyriesene: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { overPristup } = await import("./over-pristup");
    await overPristup(context as any, data.company_id);
    const uid = context.userId;

    const { data: k, error } = await supabase
      .from("komentare_dokladov")
      .select("id, company_id, upozornit")
      .eq("id", data.id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!k) throw new Error("Komentár sa nenašiel.");
    if (!((k.upozornit ?? []) as string[]).includes(uid))
      throw new Error("Vyriešiť ho môže len kolega, ktorého komentár označil.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { zmenVyriesenie, poleProPostgrest } = await import("./moje-ulohy");
    for (let pokus = 0; pokus < 3; pokus++) {
      const { data: teraz } = await (supabaseAdmin as any)
        .from("komentare_dokladov")
        .select("vyriesili")
        .eq("id", data.id)
        .eq("company_id", data.company_id)
        .maybeSingle();
      if (!teraz) throw new Error("Komentár sa nenašiel.");
      const povodne = (teraz.vyriesili ?? []) as string[];
      const nove = zmenVyriesenie(povodne, uid, data.vyriesene);
      if (nove.length === povodne.length && nove.every((u) => povodne.includes(u)))
        return { ok: true };
      const { data: zmenene, error: chyba } = await (supabaseAdmin as any)
        .from("komentare_dokladov")
        .update({ vyriesili: nove })
        .eq("id", data.id)
        .eq("company_id", data.company_id)
        .filter("vyriesili", "eq", poleProPostgrest(povodne))
        .select("id");
      if (chyba) throw new Error(chyba.message);
      if ((zmenene ?? []).length) return { ok: true };
      // Medzitým ho vyriešil niekto iný — prečítať znova a skúsiť ešte raz.
    }
    throw new Error("Komentár sa práve mení, skúste to o chvíľu znova.");
  });
