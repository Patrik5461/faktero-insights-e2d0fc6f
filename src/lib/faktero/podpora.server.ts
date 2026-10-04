/*
  Help desk — zápis požiadaviek a správ a e-maily k nim. Používajú ho
  zákaznícke aj administrátorské serverové funkcie, „Nahlásiť chybu" v appke
  aj kontaktný formulár na webe, aby všetko skončilo v jednej schránke.
*/
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  cisloPoziadavky,
  nazovKategorie,
  stavPoSprave,
  type KategoriaPoziadavky,
  type StavPoziadavky,
} from "./podpora";

const web = () => (process.env.APP_PUBLIC_URL ?? "https://www.faktero.sk").replace(/\/+$/, "");
/** Kam chodia nové požiadavky — tá istá servisná adresa ako doteraz hlásenia chýb. */
const schrankaPodpory = () => process.env.FEEDBACK_TO_EMAIL || "servis@faktero.sk";
const odosielatel = () => process.env.RESEND_FROM_NOREPLY || "noreply@faktero.sk";

function html(v: string): string {
  return v.replace(
    /[<>&"]/g,
    (z) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[z] ?? z,
  );
}

async function posliMail(args: {
  komu: string;
  predmet: string;
  riadky: string[];
  text: string;
  odkaz?: { url: string; popis: string };
  odpovedatNa?: string | null;
}) {
  const kluc = process.env.RESEND_API_KEY;
  if (!kluc) return;
  const telo =
    `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#111;line-height:1.5">` +
    (args.riadky.length ? `<p style="color:#555">${args.riadky.map(html).join("<br>")}</p>` : "") +
    `<div style="white-space:pre-wrap;border-left:3px solid #12734f;padding-left:12px;margin:12px 0">${html(args.text)}</div>` +
    (args.odkaz
      ? `<p><a href="${html(args.odkaz.url)}" style="color:#12734f;font-weight:600">${html(args.odkaz.popis)}</a></p>`
      : "") +
    `</div>`;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${kluc}` },
      body: JSON.stringify({
        from: `Faktero podpora <${odosielatel()}>`,
        to: [args.komu],
        ...(args.odpovedatNa ? { reply_to: args.odpovedatNa } : {}),
        subject: args.predmet,
        text: [
          ...args.riadky,
          "",
          args.text,
          args.odkaz ? `\n${args.odkaz.popis}: ${args.odkaz.url}` : "",
        ].join("\n"),
        html: telo,
      }),
    });
    if (!r.ok) console.error("[podpora] Resend odmietol", r.status, (await r.text()).slice(0, 200));
  } catch (e: any) {
    // E-mail je upozornenie navyše — požiadavka je uložená aj bez neho.
    console.error("[podpora] e-mail zlyhal:", e?.message ?? e);
  }
}

export type NovaPoziadavka = {
  userId: string | null;
  companyId?: string | null;
  email: string;
  meno?: string | null;
  predmet: string;
  kategoria: KategoriaPoziadavky;
  zdroj: "aplikacia" | "mobil" | "web";
  text: string;
  url?: string | null;
  userAgent?: string | null;
  /** Kontaktný formulár si posiela vlastný e-mail — dvakrát netreba. */
  bezUpozornenia?: boolean;
};

export async function zalozPoziadavku(n: NovaPoziadavka): Promise<{ id: string; cislo: number }> {
  const { data: p, error } = await supabaseAdmin
    .from("podpora_poziadavky" as any)
    .insert({
      user_id: n.userId,
      company_id: n.companyId ?? null,
      email: n.email,
      meno: n.meno ?? null,
      predmet: n.predmet.slice(0, 200),
      kategoria: n.kategoria,
      zdroj: n.zdroj,
      url: n.url ?? null,
      user_agent: n.userAgent ?? null,
      posledna_od: "zakaznik",
      zakaznik_videl_at: new Date().toISOString(),
    })
    .select("id, cislo")
    .single();
  if (error) throw new Error(error.message);
  const poz = p as unknown as { id: string; cislo: number };

  const { error: e2 } = await supabaseAdmin.from("podpora_spravy" as any).insert({
    poziadavka_id: poz.id,
    autor_id: n.userId,
    od_podpory: false,
    text: n.text.slice(0, 10000),
  });
  if (e2) throw new Error(e2.message);

  if (!n.bezUpozornenia) {
    let firma: string | null = null;
    if (n.companyId) {
      const { data } = await supabaseAdmin
        .from("companies")
        .select("name")
        .eq("id", n.companyId)
        .maybeSingle();
      firma = (data as any)?.name ?? null;
    }
    const c = cisloPoziadavky(poz.cislo);
    await posliMail({
      komu: schrankaPodpory(),
      predmet: `[${c}] ${nazovKategorie(n.kategoria)}: ${n.predmet}`,
      riadky: [
        `Od: ${n.meno ? `${n.meno} <${n.email}>` : n.email}`,
        firma ? `Firma: ${firma}` : "",
        n.url ? `Stránka: ${n.url}` : "",
        n.userAgent ? `Prehliadač: ${n.userAgent}` : "",
      ].filter(Boolean),
      text: n.text,
      odkaz: { url: `${web()}/admin/podpora/${poz.id}`, popis: `Otvoriť ${c} v administrácii` },
      odpovedatNa: n.email,
    });
    // Potvrdenie zákazníkovi z appky — vie, že správa neodišla do prázdna.
    if (n.userId) {
      await posliMail({
        komu: n.email,
        predmet: `Prijali sme vašu požiadavku ${c}`,
        riadky: [`Ďakujeme, požiadavku ${c} sme prijali. Odpoveď uvidíte vo Fakteri aj v e-maile.`],
        text: n.text,
        odkaz: { url: `${web()}/podpora/${poz.id}`, popis: "Zobraziť požiadavku" },
      });
    }
  }
  return poz;
}

type Poziadavka = {
  id: string;
  cislo: number;
  user_id: string | null;
  email: string;
  predmet: string;
  stav: StavPoziadavky;
};

export async function nacitajPoziadavku(id: string): Promise<Poziadavka | null> {
  const { data } = await supabaseAdmin
    .from("podpora_poziadavky" as any)
    .select("id, cislo, user_id, email, predmet, stav")
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as Poziadavka) ?? null;
}

/** Nová správa vo vlákne; postará sa o stav, „prečítané" aj e-mail druhej strane. */
export async function pridajSpravu(args: {
  poziadavka: Poziadavka;
  autorId: string;
  od: "zakaznik" | "podpora";
  text: string;
  interna?: boolean;
}) {
  const { poziadavka: p, od } = args;
  const interna = od === "podpora" && !!args.interna;
  const { error } = await supabaseAdmin.from("podpora_spravy" as any).insert({
    poziadavka_id: p.id,
    autor_id: args.autorId,
    od_podpory: od === "podpora",
    interna,
    text: args.text.slice(0, 10000),
  });
  if (error) throw new Error(error.message);

  const teraz = new Date().toISOString();
  // Interná poznámka nemení nič, čo vidí zákazník.
  if (interna) {
    await supabaseAdmin
      .from("podpora_poziadavky" as any)
      .update({ podpora_videla_at: teraz, updated_at: teraz })
      .eq("id", p.id);
    return;
  }
  const stav = stavPoSprave(od, p.stav);
  await supabaseAdmin
    .from("podpora_poziadavky" as any)
    .update({
      stav,
      posledna_od: od,
      posledna_sprava_at: teraz,
      ...(od === "podpora" ? { podpora_videla_at: teraz } : { zakaznik_videl_at: teraz }),
      updated_at: teraz,
    })
    .eq("id", p.id);

  const c = cisloPoziadavky(p.cislo);
  if (od === "podpora") {
    await posliMail({
      komu: p.email,
      predmet: `Re: [${c}] ${p.predmet}`,
      riadky: [`Podpora Faktera odpovedala na vašu požiadavku ${c}.`],
      text: args.text,
      odkaz: p.user_id
        ? { url: `${web()}/podpora/${p.id}`, popis: "Odpovedať vo Fakteri" }
        : undefined,
      // Kontakt z webu nemá účet — odpovedať môže len e-mailom.
      odpovedatNa: schrankaPodpory(),
    });
  } else {
    await posliMail({
      komu: schrankaPodpory(),
      predmet: `Re: [${c}] ${p.predmet}`,
      riadky: [`Zákazník ${p.email} odpísal na ${c}.`],
      text: args.text,
      odkaz: { url: `${web()}/admin/podpora/${p.id}`, popis: `Otvoriť ${c} v administrácii` },
      odpovedatNa: p.email,
    });
  }
}
