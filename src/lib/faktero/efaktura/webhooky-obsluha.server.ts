/*
  Obsluha webhookov eFaktúry na serveri.

  Finančná správa → `prijmiZiadostiFs` → zápis (token zašifrovaný) →
  `spracujZiadost` → ePošták White Label registrácia do SMP → priradenie
  firme vo Fakteri (profil eFaktúry) alebo pozvánka na registráciu.

  ePošták → `prijmiUdalostEpostaka` → overenie podpisu tajomstvom firmy →
  `synchronizujFirmu` (to isté, čo robí nočná úloha, len hneď).
*/

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  odtlacokTokenu,
  overEpostakPodpis,
  rozparsujPds,
  rozparsujUdalost,
} from "./webhooky.server";

const db = supabaseAdmin as any;
const web = () => (process.env.APP_PUBLIC_URL ?? "https://www.faktero.sk").replace(/\/+$/, "");

/** Koľkokrát sa registrácia skúsi sama, kým ju musí niekto pozrieť. */
const MAX_POKUSOV = 5;

// ─── Finančná správa ─────────────────────────────────────────────────────────

export async function prijmiZiadostiFs(
  telo: string,
  ip: string | null,
): Promise<{ ok: true; novych: number } | { ok: false; chyba: string }> {
  const r = rozparsujPds(telo);
  if ("chyba" in r) return { ok: false, chyba: r.chyba };
  const { encryptSecret } = await import("../payment-crypto.server");

  const nove: string[] = [];
  for (const z of r.ziadosti) {
    const { data, error } = await db
      .from("efaktura_pds_ziadosti")
      .upsert(
        {
          vytvorene_fs: z.vytvorene,
          dic: z.dic,
          nazov: z.nazov,
          email: z.email,
          telefon: z.telefon,
          token_sifrovany: encryptSecret(z.token),
          token_odtlacok: odtlacokTokenu(z.token),
          ip,
        },
        // Tú istú žiadosť (rovnaký token) FS môže poslať znova — zapíše sa raz.
        { onConflict: "token_odtlacok", ignoreDuplicates: true },
      )
      .select("id");
    if (error) throw new Error(error.message);
    for (const row of data ?? []) nove.push(row.id);
  }

  /*
    FS čaká synchrónnu odpoveď a registrácia u ePoštáka môže trvať. Žiadosti
    sú bezpečne zapísané, takže odpoveď ide hneď a registrácia beží potom.
    Keď by zlyhala, nočná úloha ju zopakuje.
  */
  for (const id of nove) {
    void spracujZiadost(id).catch((e) =>
      console.warn("[efaktura-pds] spracovanie:", id, String(e?.message ?? e)),
    );
  }
  return { ok: true, novych: nove.length };
}

async function firmaPodlaDic(dic: string): Promise<{ id: string; email: string | null } | null> {
  const { data } = await db
    .from("companies")
    .select("id, email, created_at")
    .eq("dic", dic)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1);
  return data?.[0] ?? null;
}

async function zapniProfil(companyId: string, op: { firmId: string | null; peppolId: string | null }) {
  if (!op.firmId) return;
  const { error } = await db.from("efaktura_profiles").upsert(
    {
      company_id: companyId,
      epostak_firm_id: op.firmId,
      peppol_provider: "epostak",
      peppol_participant_id: op.peppolId,
      peppol_scheme: op.peppolId?.split(":")[0] ?? "0245",
      enabled: true,
      activated_at: new Date().toISOString(),
    },
    { onConflict: "company_id" },
  );
  if (error) throw new Error(error.message);
}

function stavZOperacie(s: string): string {
  if (s === "succeeded") return "registrovana";
  if (s === "manual_review") return "na_kontrolu";
  if (s === "rejected" || s === "released") return "zamietnuta";
  return "registruje_sa";
}

/** Jedna žiadosť FS → registrácia u ePoštáka → firma alebo pozvánka. */
export async function spracujZiadost(id: string): Promise<string> {
  const { data: z } = await db.from("efaktura_pds_ziadosti").select("*").eq("id", id).maybeSingle();
  if (!z) throw new Error("Žiadosť sa nenašla.");
  if (z.stav === "registrovana" || z.stav === "zamietnuta") return z.stav;

  const firma = z.company_id ? { id: z.company_id, email: null } : await firmaPodlaDic(z.dic);
  const email = z.email || firma?.email;
  const zmena: Record<string, unknown> = {
    pokusov: (z.pokusov ?? 0) + 1,
    posledny_pokus_at: new Date().toISOString(),
    company_id: firma?.id ?? null,
  };

  if (!z.token_sifrovany) {
    zmena.stav = "chyba";
    zmena.chyba = "Chýba verification_token — FS musí žiadosť poslať znova.";
  } else if (!email) {
    zmena.stav = "chyba";
    zmena.chyba = "FS neposlala e-mail firmy a firmu vo Fakteri nepoznáme — ePošták ho vyžaduje.";
  } else {
    try {
      const { decryptSecret } = await import("../payment-crypto.server");
      const { registrujWhiteLabel } = await import("./epostak.server");
      const op = await registrujWhiteLabel({
        customerRef: `dic:${z.dic}`,
        dic: z.dic,
        companyEmail: email,
        verificationToken: decryptSecret(z.token_sifrovany),
        // Rovnaký kľúč pri každom pokuse, kým nepríde konečný výsledok.
        idempotencyKey: `faktero-pds:${z.id}`,
      });
      zmena.stav = stavZOperacie(op.status);
      zmena.epostak_operacia_id = op.id;
      zmena.epostak_firm_id = op.firmId;
      zmena.peppol_id = op.peppolId;
      zmena.chyba = null;
      if (zmena.stav === "registrovana" || zmena.stav === "zamietnuta") {
        // Token už nie je potrebný — ePošták ho žiada nikde nedržať.
        zmena.token_sifrovany = null;
      }
      if (zmena.stav === "registrovana" && firma?.id) await zapniProfil(firma.id, op);
    } catch (e: any) {
      const status = Number(e?.status ?? 0);
      zmena.chyba = String(e?.message ?? e).slice(0, 500);
      if (status === 422) {
        // Firmu alebo podpis SMP odmietol — opakovanie nepomôže.
        zmena.stav = "zamietnuta";
        zmena.token_sifrovany = null;
      } else {
        zmena.stav = "chyba";
        if (status === 403) {
          zmena.chyba =
            "ePošták nemá pre Faktero povolený White Label (403) — treba to vybaviť s ePoštákom. " +
            zmena.chyba;
        }
      }
    }
  }

  await db.from("efaktura_pds_ziadosti").update(zmena).eq("id", id);

  if (zmena.stav === "registrovana" && !zmena.company_id && !z.pozvanka_odoslana_at && email) {
    await posliPozvanku({ id, email, nazov: z.nazov, dic: z.dic });
  }
  return String(zmena.stav);
}

/**
 * Firma, ktorá si Faktero vybrala na Portáli FS, ale účet u nás ešte nemá.
 * Registrácia v Peppole je hotová — stačí sa zaregistrovať s tým istým DIČ
 * a nočná úloha ju s profilom eFaktúry spáruje sama.
 */
async function posliPozvanku(v: { id: string; email: string; nazov: string | null; dic: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const { escapeHtml } = await import("../ponuka-odpoved.server");
  const odkaz = `${web()}/registracia`;
  const meno = v.nazov || `DIČ ${v.dic}`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: `Faktero <${process.env.RESEND_FROM_NOREPLY || "noreply@faktero.sk"}>`,
      to: [v.email],
      subject: "eFaktúra: vybrali ste si Faktero — dokončite registráciu",
      text: [
        "Dobrý deň,",
        "",
        `na Portáli finančnej správy ste pre ${meno} zvolili Faktero ako poskytovateľa doručovacej služby pre eFaktúry.`,
        "Vaša firma je zaregistrovaná v sieti Peppol. Aby ste mohli eFaktúry posielať a prijímať, založte si vo Fakteri účet s tým istým DIČ:",
        `  ${odkaz}`,
        "",
        "Prijaté eFaktúry sa vám po registrácii zobrazia samy.",
        "",
        "Tím Faktero",
      ].join("\n"),
      html: `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#111;max-width:560px;line-height:1.5">
        <p>Dobrý deň,</p>
        <p>na Portáli finančnej správy ste pre <strong>${escapeHtml(meno)}</strong> zvolili Faktero ako poskytovateľa doručovacej služby pre eFaktúry.</p>
        <p>Vaša firma je zaregistrovaná v sieti Peppol. Aby ste mohli eFaktúry posielať a prijímať, založte si vo Fakteri účet s tým istým DIČ (${escapeHtml(v.dic)}).</p>
        <p><a href="${odkaz}" style="display:inline-block;background:#12734f;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">Založiť účet vo Fakteri</a></p>
        <p style="color:#6b7280;font-size:13px">Prijaté eFaktúry sa vám po registrácii zobrazia samy.</p>
      </div>`,
    }),
  });
  if (res.ok) {
    await db
      .from("efaktura_pds_ziadosti")
      .update({ pozvanka_odoslana_at: new Date().toISOString() })
      .eq("id", v.id);
  }
}

/**
 * Nočné dočistenie: dopytovanie rozbehnutých registrácií, zopakovanie
 * zlyhaných a spárovanie registrovaných firiem, ktoré si medzitým založili
 * účet vo Fakteri.
 */
export async function dokonciRozbehnuteRegistracie(): Promise<void> {
  const { data: rozbehnute } = await db
    .from("efaktura_pds_ziadosti")
    .select("id, epostak_operacia_id, company_id, stav, pokusov")
    .in("stav", ["prijata", "registruje_sa", "chyba", "na_kontrolu"])
    .limit(200);
  for (const z of rozbehnute ?? []) {
    try {
      if ((z.stav === "registruje_sa" || z.stav === "na_kontrolu") && z.epostak_operacia_id) {
        const { stavWhiteLabel } = await import("./epostak.server");
        const op = await stavWhiteLabel(z.epostak_operacia_id);
        const stav = stavZOperacie(op.status);
        const zmena: Record<string, unknown> = {
          stav,
          epostak_firm_id: op.firmId,
          peppol_id: op.peppolId,
        };
        if (stav === "registrovana" || stav === "zamietnuta") zmena.token_sifrovany = null;
        await db.from("efaktura_pds_ziadosti").update(zmena).eq("id", z.id);
        if (stav === "registrovana" && z.company_id) await zapniProfil(z.company_id, op);
      } else if ((z.stav === "prijata" || z.stav === "chyba") && (z.pokusov ?? 0) < MAX_POKUSOV) {
        await spracujZiadost(z.id);
      }
    } catch (e) {
      console.warn("[efaktura-pds] dočistenie:", z.id, String((e as Error)?.message ?? e));
    }
  }

  // Registrované bez firmy — možno si ju medzitým niekto založil.
  const { data: bezFirmy } = await db
    .from("efaktura_pds_ziadosti")
    .select("id, dic, epostak_firm_id, peppol_id")
    .eq("stav", "registrovana")
    .is("company_id", null)
    .limit(200);
  for (const z of bezFirmy ?? []) {
    const firma = await firmaPodlaDic(z.dic);
    if (!firma) continue;
    await zapniProfil(firma.id, { firmId: z.epostak_firm_id, peppolId: z.peppol_id });
    await db.from("efaktura_pds_ziadosti").update({ company_id: firma.id }).eq("id", z.id);
  }
}

// ─── ePošták ─────────────────────────────────────────────────────────────────

export async function zapniWebhookyFiriem(): Promise<{ zapnutych: number }> {
  const { data: profily } = await db
    .from("efaktura_profiles")
    .select("company_id, epostak_firm_id")
    .not("epostak_firm_id", "is", null);
  const { data: existujuce } = await db.from("efaktura_webhooky").select("company_id");
  const ma = new Set((existujuce ?? []).map((r: any) => r.company_id));
  const { vytvorWebhookFirmy } = await import("./epostak.server");
  const { encryptSecret } = await import("../payment-crypto.server");
  let zapnutych = 0;
  for (const p of profily ?? []) {
    if (ma.has(p.company_id)) continue;
    try {
      const w = await vytvorWebhookFirmy(p.epostak_firm_id, `${web()}/api/public/efaktura/epostak`);
      await db.from("efaktura_webhooky").insert({
        company_id: p.company_id,
        epostak_firm_id: p.epostak_firm_id,
        webhook_id: w.id,
        tajomstvo_sifrovane: encryptSecret(w.secret),
        stav: "aktivny",
      });
      zapnutych += 1;
    } catch (e: any) {
      // Zapíše sa, aby sa to každú noc neskúšalo nanovo; admin to vie zmazať.
      await db.from("efaktura_webhooky").insert({
        company_id: p.company_id,
        epostak_firm_id: p.epostak_firm_id,
        stav: "chyba",
        chyba: String(e?.message ?? e).slice(0, 500),
      });
    }
  }
  return { zapnutych };
}

export async function prijmiUdalostEpostaka(args: {
  telo: string;
  podpis: string | null;
  pecatka: string | null;
}): Promise<{ ok: boolean; dovod?: string }> {
  const { decryptSecret } = await import("../payment-crypto.server");
  // Udalosť sa číta len na výber kandidáta; dôveruje sa jej až po podpise.
  const u = rozparsujUdalost(args.telo);
  let q = db
    .from("efaktura_webhooky")
    .select("company_id, epostak_firm_id, tajomstvo_sifrovane")
    .eq("stav", "aktivny");
  if (u?.firmId) q = q.eq("epostak_firm_id", u.firmId);
  const { data: kandidati } = await q.limit(500);

  let posledny = "nesedi_podpis";
  for (const k of kandidati ?? []) {
    if (!k.tajomstvo_sifrovane) continue;
    let tajomstvo: string;
    try {
      tajomstvo = decryptSecret(k.tajomstvo_sifrovane);
    } catch {
      continue;
    }
    const v = overEpostakPodpis({
      podpis: args.podpis,
      pecatka: args.pecatka,
      telo: args.telo,
      tajomstvo,
    });
    if (!v.platny) {
      posledny = v.dovod ?? posledny;
      continue;
    }
    await db
      .from("efaktura_webhooky")
      .update({ posledna_udalost_at: new Date().toISOString() })
      .eq("company_id", k.company_id);
    const { synchronizujFirmu } = await import("./nocna-uloha.server");
    void synchronizujFirmu(k.company_id, k.epostak_firm_id).catch((e) =>
      console.warn("[efaktura-webhook] sync:", String(e?.message ?? e)),
    );
    return { ok: true };
  }
  return { ok: false, dovod: posledny };
}
