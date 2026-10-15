/*
  Denný e-mailový súhrn úloh — serverová časť pre cron.

  Beží bez prihláseného používateľa, preto cez `supabaseAdmin`. Ten obíde RLS
  aj vlastný prístup, takže každý počet sa ráta len pre dvojicu (človek,
  firma) z `company_users` a filtruje sa podľa oblastí, ktoré človek vo firme
  vidí (`vidiOblast`) — rovnako ako stránka Moje úlohy, kam e-mail vedie:

  - na schválenie: `mozeSchvalit` nad záznamami `schvalovanie` (ako
    `cakajuNaMnaFn`), agenda musí byť v oblasti, ktorú človek vidí;
  - komentáre: označený, nie autor, ešte nevyriešené (`cakaNaMna`);
  - nespracované: `nespracovane_doklady` + bločky v stave `new`, len
    s oblasťou Doklady;
  - po splatnosti: neuhradené vystavené faktúry s minulou splatnosťou
    (`jePoSplatnosti` z `faktury-sumy`) — len majiteľ, admin, účtovník
    a vlastný prístup s oblasťou Faktúry. Bežnému používateľovi pohľadávky
    firmy každé ráno neposielame, nie je to jeho úloha.

  Na firmu ide pár dotazov bez ohľadu na počet členov; po ľuďoch sa už len
  počíta. Proti dvojitému odoslaniu je `denny_suhrn_odoslane` (človek × deň):
  riadok sa zapíše pred odoslaním a pri chybe Resendu sa zmaže, aby to
  ďalší beh skúsil znova.
*/

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runInBatches, selectAll, selectByIds } from "./batch.server";
import {
  denVBratislave,
  maSaPoslat,
  odkazNaOdhlasenie,
  poctyClena,
  spoluVoFirme,
  tokenOdhlasenia,
  zostavEmail,
  type Clen,
  type DataFirmy,
  type Komentar,
  type PoctyFirmy,
  type ZaznamSchvalovania,
} from "./denny-suhrn";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

const web = () => (process.env.APP_PUBLIC_URL ?? "https://www.faktero.sk").replace(/\/+$/, "");

/** Kľúč na podpis odkazu na odhlásenie — ten istý zdroj ako pri Tesla OAuth. */
export function klucSuhrnu(): string {
  const k = process.env.PAYMENT_SECRETS_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!k) throw new Error("Chýba kľúč na podpis.");
  return k;
}

/** Načíta dáta firmy servisným klientom. Volá sa len pre firmy z `company_users`. */
export async function nacitajDataFirmy(companyId: string, dnes: string): Promise<DataFirmy> {
  const { nastavenieFirmy, zabezpecSchvalovanie, tabulkaAgendy } =
    await import("./schvalovanie.server");
  const n = await nastavenieFirmy(db, companyId);

  let schvalovanie: ZaznamSchvalovania[] = [];
  if (n.zapnute) {
    /*
      Rovnako ako `cakajuNaMnaFn`: doklady od zapnutia bez záznamu dostanú
      cestu (prípadne sa samy schvália pod hranicou sumy). Bez toho by súhrn
      nevidel doklad, ktorý stránka po otvorení ukáže.
    */
    for (const agenda of n.agendy as ("doklad" | "prijata" | "vystavena")[]) {
      try {
        const t = tabulkaAgendy(agenda);
        let q = db
          .from(t.tabulka)
          .select("id")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(300);
        if (n.od) q = q.gte("created_at", n.od);
        const { data } = await q;
        await zabezpecSchvalovanie(
          db,
          companyId,
          agenda,
          (data ?? []).map((x: any) => x.id),
        );
      } catch (e) {
        console.warn("[denny-suhrn] schvaľovanie", companyId, String((e as Error)?.message ?? e));
      }
    }
    schvalovanie = await selectAll<ZaznamSchvalovania>((from, to) =>
      db
        .from("schvalovanie")
        .select("id, agenda, urovne, schvalena_uroven, stav")
        .eq("company_id", companyId)
        .in("stav", ["caka", "vrateny"])
        .order("id")
        .range(from, to),
    );
  }

  const [komentare, nesp, bloc, splat] = await Promise.all([
    selectAll<Komentar>((from, to) =>
      db
        .from("komentare_dokladov")
        .select("id, agenda, user_id, upozornit, vyriesili")
        .eq("company_id", companyId)
        .not("upozornit", "eq", "{}")
        .order("id")
        .range(from, to),
    ),
    db
      .from("nespracovane_doklady")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId),
    db
      .from("expense_documents")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "new"),
    // Tie isté pravidlá ako `jePoSplatnosti` (faktury-sumy): neuhradená, nie
    // záloha, daňový doklad k platbe ani dobropis, splatnosť pred dneškom.
    db
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .in("status", ["issued", "sent"])
      .not("type", "in", "(proforma,advance_payment,credit_note)")
      .is("paid_at", null)
      .is("deleted_at", null)
      .lt("due_date", dnes),
  ]);

  return {
    schvalovanie,
    komentare,
    nespracovane: (nesp.count ?? 0) + (bloc.count ?? 0),
    poSplatnosti: splat.count ?? 0,
  };
}

/**
 * Počty pre jedného človeka a jednu firmu — pre volanie mimo cronu (napr.
 * náhľad). Overí členstvo v `company_users`; bez neho vyhodí chybu.
 */
export async function poctyPreClovekaAFirmu(
  userId: string,
  companyId: string,
  dnes = denVBratislave(),
): Promise<PoctyFirmy> {
  const [{ data: clen }, { data: firma }] = await Promise.all([
    db
      .from("company_users")
      .select("user_id, role, permissions")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .maybeSingle(),
    db.from("companies").select("id, name").eq("id", companyId).maybeSingle(),
  ]);
  if (!clen || !firma) throw new Error("Človek nie je členom tejto firmy.");
  const d = await nacitajDataFirmy(companyId, dnes);
  return poctyClena(clen as Clen, { id: firma.id, nazov: firma.name }, d);
}

async function posliEmail(args: {
  to: string;
  predmet: string;
  text: string;
  html: string;
  odhlasenieApi: string;
}): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY nie je nakonfigurovaný.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: `Faktero <${process.env.RESEND_FROM_NOREPLY || "noreply@faktero.sk"}>`,
      to: [args.to],
      subject: args.predmet,
      text: args.text,
      html: args.html,
      // Odhlásenie jedným klikom priamo v pošte (RFC 8058) — Gmail ho chce.
      headers: {
        "List-Unsubscribe": `<${args.odhlasenieApi}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = (await res.json().catch(() => ({}))) as { id?: string };
  return j.id ?? null;
}

/** Koľko e-mailov naraz — Resend má limit požiadaviek za sekundu. */
const NARAZ = 4;

export type VysledokSuhrnu = {
  den: string;
  ludi: number;
  firiem: number;
  odoslane: number;
  uzOdoslane: number;
  nicNecaka: number;
  chyby: number;
};

/**
 * Celý beh: kto má súhrn zapnutý, čo na neho čaká, a e-mail tým, na koho
 * niečo čaká. `nanecisto` nič nepošle ani nezapíše — len vráti, komu by šlo.
 */
export async function spustiDennySuhrn(
  opt: { den?: string; nanecisto?: boolean; teraz?: Date } = {},
): Promise<VysledokSuhrnu & { nahlad?: { email: string; predmet: string }[] }> {
  const den = opt.den ?? denVBratislave(opt.teraz);
  const kluc = klucSuhrnu();

  const clenstva = await selectAll<Clen & { company_id: string }>((from, to) =>
    db
      .from("company_users")
      .select("id, company_id, user_id, role, permissions")
      .order("id")
      .range(from, to),
  );
  const userIds = [...new Set(clenstva.map((c) => c.user_id))];

  const profily = await selectByIds<{
    id: string;
    email: string | null;
    full_name: string | null;
    denny_suhrn: boolean | null;
    deletion_requested_at: string | null;
  }>(userIds, (part, from, to) =>
    db
      .from("profiles")
      .select("id, email, full_name, denny_suhrn, deletion_requested_at")
      .in("id", part)
      .range(from, to),
  );

  // Zakázané prihlásenie (admin účet zablokoval) — súhrn by viedol na stránku, kam sa nedostane.
  const zakazani = new Set<string>();
  try {
    const { data: stavy } = await db.rpc("faktero_stav_prihlaseni", { _ids: userIds });
    const teraz = Date.now();
    for (const s of (stavy ?? []) as any[])
      if (s.banned_until && new Date(s.banned_until).getTime() > teraz) zakazani.add(s.id);
  } catch {
    // bez stavu prihlásení sa pošle všetkým so zapnutým súhrnom
  }

  const prijemcovia = new Map(
    profily
      .filter(
        (p) =>
          p.denny_suhrn !== false && p.email && !p.deletion_requested_at && !zakazani.has(p.id),
      )
      .map((p) => [p.id, p]),
  );

  // Kto už dnes súhrn dostal — tých netreba ani počítať.
  const uz = new Set<string>(
    (
      await selectAll<{ user_id: string }>((from, to) =>
        db
          .from("denny_suhrn_odoslane")
          .select("user_id")
          .eq("den", den)
          .order("user_id")
          .range(from, to),
      )
    ).map((r) => r.user_id),
  );

  const clenoviaFirmy = new Map<string, Clen[]>();
  for (const c of clenstva) {
    if (!prijemcovia.has(c.user_id) || uz.has(c.user_id)) continue;
    const z = clenoviaFirmy.get(c.company_id) ?? [];
    z.push(c);
    clenoviaFirmy.set(c.company_id, z);
  }

  const firmy = await selectByIds<{ id: string; name: string; suspended_at: string | null }>(
    [...clenoviaFirmy.keys()],
    (part, from, to) =>
      db.from("companies").select("id, name, suspended_at").in("id", part).range(from, to),
  );

  const poctyLudi = new Map<string, PoctyFirmy[]>();
  let chyby = 0;
  for (const f of firmy) {
    if (f.suspended_at) continue;
    let d: DataFirmy;
    try {
      d = await nacitajDataFirmy(f.id, den);
    } catch (e) {
      chyby++;
      console.warn("[denny-suhrn] firma", f.id, String((e as Error)?.message ?? e));
      continue;
    }
    for (const c of clenoviaFirmy.get(f.id) ?? []) {
      const p = poctyClena(c, { id: f.id, nazov: f.name || "(bez názvu)" }, d);
      const z = poctyLudi.get(c.user_id) ?? [];
      z.push(p);
      poctyLudi.set(c.user_id, z);
    }
  }

  const naOdoslanie = [...poctyLudi.entries()].filter(([uid, f]) =>
    maSaPoslat({
      zapnute: prijemcovia.get(uid)?.denny_suhrn,
      email: prijemcovia.get(uid)?.email,
      firmy: f,
    }),
  );
  const vysledok: VysledokSuhrnu = {
    den,
    ludi: poctyLudi.size,
    firiem: firmy.length,
    odoslane: 0,
    uzOdoslane: uz.size,
    nicNecaka: poctyLudi.size - naOdoslanie.length,
    chyby,
  };

  const nahlad: { email: string; predmet: string }[] = [];
  await runInBatches(naOdoslanie, NARAZ, async ([uid, f]) => {
    const p = prijemcovia.get(uid)!;
    const token = await tokenOdhlasenia(uid, kluc);
    const e = zostavEmail({
      meno: p.full_name,
      firmy: f,
      web: web(),
      odhlasenie: odkazNaOdhlasenie(web(), token),
    });
    if (opt.nanecisto) {
      nahlad.push({ email: p.email!, predmet: e.predmet });
      return;
    }

    // Rezervácia pred odoslaním: druhý súbežný beh narazí na unikátny kľúč a nepošle nič.
    const { data: zapisane, error } = await db
      .from("denny_suhrn_odoslane")
      .upsert(
        {
          user_id: uid,
          den,
          firmy: f.filter((x) => spoluVoFirme(x) > 0).map((x) => x.companyId),
          pocty: f,
          stav: "odosiela",
        },
        { onConflict: "user_id,den", ignoreDuplicates: true },
      )
      .select("user_id");
    if (error) {
      vysledok.chyby++;
      console.warn("[denny-suhrn] rezervácia", uid, error.message);
      return;
    }
    if (!(zapisane ?? []).length) {
      vysledok.uzOdoslane++;
      return;
    }

    try {
      const resendId = await posliEmail({
        to: p.email!,
        predmet: e.predmet,
        text: e.text,
        html: e.html,
        odhlasenieApi: `${web()}/api/public/denny-suhrn/odhlasit?t=${encodeURIComponent(token)}`,
      });
      await db
        .from("denny_suhrn_odoslane")
        .update({ stav: "odoslane", resend_id: resendId, odoslane_at: new Date().toISOString() })
        .eq("user_id", uid)
        .eq("den", den);
      vysledok.odoslane++;
    } catch (err) {
      vysledok.chyby++;
      console.warn("[denny-suhrn] odoslanie", uid, String((err as Error)?.message ?? err));
      // Neodišlo — rezerváciu uvoľniť, aby to ďalší beh v ten deň skúsil znova.
      await db
        .from("denny_suhrn_odoslane")
        .delete()
        .eq("user_id", uid)
        .eq("den", den)
        .eq("stav", "odosiela");
    }
  });

  return opt.nanecisto ? { ...vysledok, nahlad } : vysledok;
}

/** Odhlásenie z odkazu v e-maile. Vráti true, keď token platil. */
export async function odhlasZoSuhrnu(token: string): Promise<boolean> {
  const { overTokenOdhlasenia } = await import("./denny-suhrn");
  const uid = await overTokenOdhlasenia(token, klucSuhrnu());
  if (!uid) return false;
  const { error } = await db.from("profiles").update({ denny_suhrn: false }).eq("id", uid);
  if (error) throw new Error(error.message);
  return true;
}
