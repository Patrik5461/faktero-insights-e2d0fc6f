/*
  eFaktúra „len odosielanie“ — onboarding send_only v Enterprise API ePoštáka.

  Pre firmu, ktorá prijíma eFaktúry u iného poskytovateľa (napr. SFC, s.r.o.
  u Doklado) a z Faktera chce len odosielať. White Label to nevie: vždy
  zakladá účastníka v SMP, teda preberá aj príjem. Onboarding „iba
  odosielanie“ v SMP nič neregistruje ani neodregistrováva.

  Priebeh (podľa ePoštáka, 22. 10. 2026, a https://epostak.sk/api/docs/onboarding#iba-odosielanie):
    1. POST /api/v1/onboarding-requests partnerským kľúčom s firms:manage,
       bez X-Firm-Id, s Idempotency-Key → awaiting_pfs.
    2. Firma na portáli FS vyberie ePošťák ako poštára na odosielanie
       (overenie oprávnenosti Peppol ID; poštára na príjem to nemení).
    3. Na kontakt z portálu FS príde e-mail, firma potvrdí prepojenie
       (action_required → activating → active).
    4. Pri active (webhook onboarding.active alebo dopyt GET) príde firmId;
       vytvorí sa kľúč viazaný na firmu (scopedFirmId, documents:send +
       documents:read) a profil eFaktúry sa zapne v režime `len_odosielanie`.

  Endpointy sú u ePoštáka „controlled preview“ — kým ich pre Faktero
  nezapnú, vracajú 503. Hlásenie údajov o odoslaných faktúrach (od 1. 1.
  2027) robí ePošták, o prijatých poskytovateľ príjmu. Doklad o doručení
  (MLS) chodí ePoštákovi, odpovede odberateľov (Invoice Response) tam, kde
  je firma registrovaná na príjem — Faktero ich neuvidí.
*/

import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { overEpostakPodpis } from "./webhooky.server";
import type { OnboardingOdpoved } from "./epostak.server";

const db = supabaseAdmin as any;
const web = () => (process.env.APP_PUBLIC_URL ?? "https://www.faktero.sk").replace(/\/+$/, "");

export type StavOdosielania =
  | "vytvorena"
  | "caka_na_fs"
  | "caka_na_potvrdenie"
  | "aktivuje_sa"
  | "active"
  | "zamietnuta"
  | "chyba";

export type VztahOdosielania = "technical_delegation" | "managed_service";

/** Žiadosti, ktoré ešte môžu dobehnúť do active — tie dopytuje cron. */
export const ROZBEHNUTE: readonly StavOdosielania[] = [
  "vytvorena",
  "caka_na_fs",
  "caka_na_potvrdenie",
  "aktivuje_sa",
];

/** Koľkokrát sa vytvorenie žiadosti / kľúča skúsi samo. */
const MAX_POKUSOV = 5;
const MAX_POKUSOV_KLUCA = 3;

/** Kľúč v `efaktura_epostak_nastavenie` pre partnerský onboarding webhook. */
export const NASTAVENIE_WEBHOOKU = "onboarding_webhook";

/** Stav ePoštáka → náš stav. Neznámy stav je podľa nich konečný. */
export function stavZOnboardingu(status: string | null | undefined): StavOdosielania {
  switch (status) {
    case "awaiting_pfs":
      return "caka_na_fs";
    case "action_required":
      return "caka_na_potvrdenie";
    case "activating":
      return "aktivuje_sa";
    case "active":
      return "active";
    default:
      return "zamietnuta";
  }
}

/** customerRef — stabilná značka firmy; nový pokus po konečnom stave dostane príponu. */
export function customerRefOdosielania(dic: string, pokus: number): string {
  return pokus > 1 ? `odosielanie-${dic}-${pokus}` : `odosielanie-${dic}`;
}

/** Idempotency-Key podľa firmy a pokusu (8–128 znakov, [A-Za-z0-9_.:-]). */
export function klucOnboardingu(companyId: string, pokus: number): string {
  return `faktero-odosielanie:${companyId}:${pokus}`;
}

function popisKonca(status: string | null | undefined): string {
  if (status === "expired")
    return "Žiadosť vypršala — firma ju do 30 dní nepotvrdila. Treba vytvoriť novú.";
  if (status === "revoked") return "Prepojenie s Fakterom bolo zrušené (revoked).";
  if (status === "blocked")
    return "ePošták žiadosť zablokoval (blocked) — treba to vybaviť s ePoštákom.";
  return `ePošták vrátil stav „${status ?? "?"}“ — berie sa ako konečný.`;
}

/** Chyba vytvorenia žiadosti ako text pre admina. */
export function popisChybyOnboardingu(status: number, detail: string): string {
  const d = detail ? ` (ePošták: ${detail})` : "";
  if (status === 503)
    return `ePošták má onboarding „iba odosielanie“ pre Faktero vypnutý (controlled preview, 503) — treba ho u nich zapnúť.${d}`;
  if (status === 403)
    return `ePošták partnerský kľúč odmietol (403) — musí byť neobmedzený, s oprávnením firms:manage, a Faktero musí mať povolený onboarding iba odosielanie.${d}`;
  if (status === 409)
    return `Konflikt Idempotency-Key alebo customerRef (409) — rovnaká žiadosť s iným obsahom už existuje.${d}`;
  if (status === 400)
    return `ePošták žiadosť odmietol ako neplatnú (400) — DIČ musí mať 10 číslic a e-mail musí byť platný.${d}`;
  return `Vytvorenie žiadosti zlyhalo${status ? ` (HTTP ${status})` : ""} — skúsi sa znova.${d}`;
}

function popisChybyKluca(status: number, detail: string): string {
  const d = detail ? ` (ePošták: ${detail})` : "";
  if (status === 403)
    return `Kľúč firmy sa nepodarilo vytvoriť (403) — hlavný kľúč nemá keys:manage alebo ePošták nemá zapnuté vydávanie kľúčov viazaných na firmu (FIRM_KEY_ISSUANCE_DISABLED). Kým nebude, odosiela sa hlavným kľúčom s X-Firm-Id.${d}`;
  if (status === 400)
    return `Kľúč firmy sa nepodarilo vytvoriť (400) — neplatné údaje alebo limit piatich kľúčov na firmu.${d}`;
  if (!status)
    return `Nie je isté, či kľúč firmy vznikol (bez odpovede). Pred ďalším pokusom pozri zoznam kľúčov u ePoštáka — POST nie je idempotentný.${d}`;
  return `Kľúč firmy sa nepodarilo vytvoriť (HTTP ${status}).${d}`;
}

async function detailChyby(e: any): Promise<{ status: number; detail: string }> {
  const status = Number(e?.status ?? 0);
  const { chybaEPostaka } = await import("./epostak.server");
  const detail = e?.response
    ? chybaEPostaka(e.response, status)
    : String(e?.message ?? e).slice(0, 300);
  return { status, detail };
}

const emailOk = (e: string | null | undefined) =>
  !!e && e.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export type VysledokOdosielania = {
  stav: StavOdosielania;
  chyba: string | null;
  nextAction: string | null;
  clientMessage: string | null;
};

const vysledok = (r: any): VysledokOdosielania => ({
  stav: r.stav,
  chyba: r.chyba ?? null,
  nextAction: r.next_action ?? null,
  clientMessage: r.client_message_sk ?? null,
});

async function riadokFirmy(companyId: string): Promise<any | null> {
  const { data, error } = await db
    .from("efaktura_odosielanie_ziadosti")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

/**
 * Vytvorí (alebo zopakuje) onboarding „iba odosielanie“ pre firmu.
 * Rozbehnutá žiadosť sa len dopytuje; aktívna sa nemení.
 */
export async function vytvorOnboardingLenOdosielanie(
  companyId: string,
  kontaktEmail: string,
  relationshipMode: VztahOdosielania = "technical_delegation",
  v: {
    pdsZiadostId?: string | null;
    prijemPoskytovatel?: string | null;
    adminUserId?: string | null;
  } = {},
): Promise<VysledokOdosielania> {
  const { data: firma, error: chybaFirmy } = await db
    .from("companies")
    .select("id, dic, name")
    .eq("id", companyId)
    .maybeSingle();
  if (chybaFirmy) throw new Error(chybaFirmy.message);
  if (!firma) throw new Error("Firma sa nenašla.");
  const dic = String(firma.dic ?? "").replace(/\s+/g, "");
  if (!/^[0-9]{10}$/.test(dic)) throw new Error("Firma nemá platné DIČ (10 číslic).");
  const email = kontaktEmail.trim();
  if (!emailOk(email)) throw new Error("Zadaj platný kontaktný e-mail firmy.");

  const doteraz = await riadokFirmy(companyId);
  if (doteraz?.stav === "active") return vysledok(doteraz);
  if (doteraz && ROZBEHNUTE.includes(doteraz.stav) && doteraz.epostak_request_id) {
    return obnovOnboarding(doteraz);
  }

  // Nový pokus (nový Idempotency-Key aj customerRef), keď predchádzajúci skončil
  // natrvalo alebo sa mení obsah žiadosti — inak by ePošták vrátil 409.
  const iny =
    doteraz &&
    (doteraz.stav === "zamietnuta" ||
      doteraz.relationship_mode !== relationshipMode ||
      (doteraz.contact_email ?? "") !== email);
  const pokus = doteraz ? (iny ? (doteraz.pokus ?? 1) + 1 : (doteraz.pokus ?? 1)) : 1;

  const zaklad: Record<string, unknown> = {
    company_id: companyId,
    dic,
    customer_ref: customerRefOdosielania(dic, pokus),
    pokus,
    relationship_mode: relationshipMode,
    contact_email: email,
    stav: "vytvorena",
    chyba: null,
    aktualizovane_at: new Date().toISOString(),
    ...(v.pdsZiadostId !== undefined ? { pds_ziadost_id: v.pdsZiadostId } : {}),
    ...(v.prijemPoskytovatel !== undefined ? { prijem_poskytovatel: v.prijemPoskytovatel } : {}),
    ...(v.adminUserId ? { vytvoril: v.adminUserId } : {}),
    ...(iny || !doteraz
      ? {
          epostak_request_id: null,
          epostak_stav: null,
          next_action: null,
          client_message_sk: null,
          pokusov: 0,
        }
      : {}),
  };
  const { error } = await db
    .from("efaktura_odosielanie_ziadosti")
    .upsert(zaklad, { onConflict: "company_id" });
  if (error) throw new Error(error.message);
  const riadok = { ...(doteraz ?? {}), ...zaklad };
  return odosliZiadost(riadok);
}

/** Samotné POST — volá ho vytvorenie aj cron pri zopakovaní po chybe. */
async function odosliZiadost(riadok: any): Promise<VysledokOdosielania> {
  const ep = await import("./epostak.server");
  try {
    const odp = await ep.vytvorOnboardingRequest({
      customerRef: riadok.customer_ref,
      dic: riadok.dic,
      contactEmail: riadok.contact_email,
      relationshipMode: riadok.relationship_mode,
      idempotencyKey: klucOnboardingu(riadok.company_id, riadok.pokus ?? 1),
    });
    return await spracujOdpoved({ ...riadok, pokusov: (riadok.pokusov ?? 0) + 1 }, odp);
  } catch (e: any) {
    const { status, detail } = await detailChyby(e);
    const zmena = {
      stav: "chyba",
      chyba: popisChybyOnboardingu(status, detail).slice(0, 500),
      pokusov: [400, 403, 409].includes(status) ? MAX_POKUSOV : (riadok.pokusov ?? 0) + 1,
      aktualizovane_at: new Date().toISOString(),
    };
    await db
      .from("efaktura_odosielanie_ziadosti")
      .update(zmena)
      .eq("company_id", riadok.company_id);
    return vysledok({ ...riadok, ...zmena });
  }
}

/** Dopyt stavu rozbehnutej žiadosti (GET /onboarding-requests/{id}). */
export async function obnovOnboarding(riadok: any): Promise<VysledokOdosielania> {
  const { stavOnboardingRequest } = await import("./epostak.server");
  try {
    const odp = await stavOnboardingRequest(riadok.epostak_request_id);
    return await spracujOdpoved(riadok, odp);
  } catch (e: any) {
    // Výpadok dopytu nemení stav — skúsi sa pri ďalšom behu.
    const { status, detail } = await detailChyby(e);
    console.warn("[efaktura-odosielanie] dopyt:", riadok.company_id, status, detail);
    return vysledok(riadok);
  }
}

/** Zapíše stav z odpovede (POST, GET aj webhook) a pri active firmu zapne. */
async function spracujOdpoved(
  riadok: any,
  odp: Partial<OnboardingOdpoved> & { status?: string },
  udalostId?: string | null,
): Promise<VysledokOdosielania> {
  const stav = stavZOnboardingu(odp.status);
  const zmena: Record<string, unknown> = {
    epostak_request_id: odp.id ?? riadok.epostak_request_id ?? null,
    epostak_stav: odp.status ?? null,
    next_action: odp.nextAction ?? null,
    client_message_sk: odp.clientMessage?.sk ?? null,
    payer_mode: odp.payerMode ?? riadok.payer_mode ?? null,
    epostak_firm_id: odp.firmId ?? riadok.epostak_firm_id ?? null,
    stav,
    chyba: stav === "zamietnuta" ? popisKonca(odp.status) : null,
    pokusov: riadok.pokusov ?? 0,
    aktualizovane_at: new Date().toISOString(),
    ...(udalostId ? { posledna_udalost_id: udalostId } : {}),
  };
  if (stav === "active") zmena.aktivovane_at = riadok.aktivovane_at ?? new Date().toISOString();
  const { error } = await db
    .from("efaktura_odosielanie_ziadosti")
    .update(zmena)
    .eq("company_id", riadok.company_id);
  if (error) throw new Error(error.message);
  const novy = { ...riadok, ...zmena };

  if (stav === "active" && novy.epostak_firm_id) {
    await aktivujLenOdosielanie(novy);
  } else if (stav === "active") {
    // active bez firmId by nemalo prísť; bez neho sa nedá odosielať.
    await db
      .from("efaktura_odosielanie_ziadosti")
      .update({ chyba: "ePošták hlási active, ale bez firmId — dopytuje sa znova." })
      .eq("company_id", riadok.company_id);
  } else if (stav === "zamietnuta" && riadok.stav === "active") {
    // Zrušené po aktivácii — odosielať sa už nedá.
    await db
      .from("efaktura_profiles")
      .update({ enabled: false })
      .eq("company_id", riadok.company_id)
      .eq("rezim", "len_odosielanie");
    const { zabudniKlucFirmy } = await import("./epostak.server");
    zabudniKlucFirmy(riadok.epostak_firm_id ?? undefined);
  }
  return vysledok(novy);
}

/**
 * Po active: kľúč viazaný na firmu (ak sa dá) a profil eFaktúry v režime
 * `len_odosielanie`. Opakovateľné — cron ho volá znova, kým kľúč chýba.
 */
export async function aktivujLenOdosielanie(riadok: any): Promise<void> {
  const ep = await import("./epostak.server");
  const firmId: string = riadok.epostak_firm_id;

  if (!riadok.kluc_sifrovany && (riadok.kluc_pokusov ?? 0) < MAX_POKUSOV_KLUCA) {
    const zmena: Record<string, unknown> = { kluc_pokusov: (riadok.kluc_pokusov ?? 0) + 1 };
    try {
      const k = await ep.vytvorKlucFirmy({ firmId, nazov: `Faktero odosielanie ${riadok.dic}` });
      const { encryptSecret } = await import("../payment-crypto.server");
      Object.assign(zmena, {
        kluc_id: k.id || null,
        kluc_client_id: k.clientId,
        kluc_sifrovany: encryptSecret(k.key),
        kluc_chyba: null,
      });
    } catch (e: any) {
      const { status, detail } = await detailChyby(e);
      zmena.kluc_chyba = popisChybyKluca(status, detail).slice(0, 500);
      // Bez odpovede nevieme, či kľúč vznikol — ďalší pokus by mohol založiť druhý.
      if (!status) zmena.kluc_pokusov = MAX_POKUSOV_KLUCA;
    }
    await db
      .from("efaktura_odosielanie_ziadosti")
      .update(zmena)
      .eq("company_id", riadok.company_id);
    Object.assign(riadok, zmena);
    ep.zabudniKlucFirmy(firmId);
  }

  const { error } = await db.from("efaktura_profiles").upsert(
    {
      company_id: riadok.company_id,
      epostak_firm_id: firmId,
      peppol_provider: "epostak",
      peppol_participant_id: `0245:${riadok.dic}`,
      peppol_scheme: "0245",
      enabled: true,
      test_mode: ep.jeTestovaciRezim(),
      rezim: "len_odosielanie",
      prijem_poskytovatel: riadok.prijem_poskytovatel ?? null,
      activated_at: riadok.aktivovane_at ?? new Date().toISOString(),
    },
    { onConflict: "company_id" },
  );
  if (error) throw new Error(error.message);

  if (!riadok.oznamenie_odoslane_at && emailOk(riadok.contact_email)) {
    const { data: firma } = await db
      .from("companies")
      .select("name")
      .eq("id", riadok.company_id)
      .maybeSingle();
    const odoslane = await oznamLenOdosielanieFirme({
      email: riadok.contact_email,
      nazov: firma?.name ?? null,
      dic: riadok.dic,
      prijemU: riadok.prijem_poskytovatel ?? null,
    });
    if (odoslane) {
      await db
        .from("efaktura_odosielanie_ziadosti")
        .update({ oznamenie_odoslane_at: new Date().toISOString() })
        .eq("company_id", riadok.company_id);
    }
  }
}

/** E-mail firme po aktivácii (vzor `oznamRegistraciuFirme`). */
async function oznamLenOdosielanieFirme(v: {
  email: string;
  nazov: string | null;
  dic: string;
  prijemU: string | null;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  const { escapeHtml } = await import("../ponuka-odpoved.server");
  const odkaz = `${web()}/efaktura`;
  const meno = v.nazov || `DIČ ${v.dic}`;
  const prijem = v.prijemU ? `u ${v.prijemU}` : "u vášho doterajšieho poskytovateľa";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: `Faktero <${process.env.RESEND_FROM_NOREPLY || "noreply@faktero.sk"}>`,
      to: [v.email],
      subject: `eFaktúra: ${meno} môže odosielať eFaktúry z Faktera`,
      text: [
        "Dobrý deň,",
        "",
        `firma ${meno} (DIČ ${v.dic}) môže odteraz odosielať eFaktúry priamo z Faktera cez sieť Peppol.`,
        `Prijaté eFaktúry vám ďalej chodia ${prijem} — tam nájdete aj odpovede odberateľov na vaše faktúry. Vo Fakteri ich neuvidíte.`,
        `  ${odkaz}`,
        "",
        "Tím Faktero",
      ].join("\n"),
      html: `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#111;max-width:560px;line-height:1.5">
        <p>Dobrý deň,</p>
        <p>firma <strong>${escapeHtml(meno)}</strong> (DIČ ${escapeHtml(v.dic)}) môže odteraz odosielať eFaktúry priamo z Faktera cez sieť Peppol.</p>
        <p>Prijaté eFaktúry vám ďalej chodia ${escapeHtml(prijem)} — tam nájdete aj odpovede odberateľov na vaše faktúry. Vo Fakteri ich neuvidíte.</p>
        <p><a href="${odkaz}" style="display:inline-block;background:#12734f;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">Otvoriť eFaktúry vo Fakteri</a></p>
      </div>`,
    }),
  });
  return res.ok;
}

// ─── Webhook onboardingu ─────────────────────────────────────────────────────

function rovnakeHex(a: string, b: string): boolean {
  const x = Buffer.from(a.toLowerCase(), "utf8");
  const y = Buffer.from(b.toLowerCase(), "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Podpis partnerského onboarding webhooku: `X-Webhook-Signature`, HMAC-SHA256
 * tajomstvom z PUT /onboarding-requests/webhook. Pri pečiatke
 * (`X-Webhook-Timestamp`) rovnako ako udalosti dokladov — `sha256=` +
 * HMAC z `${pečiatka}.${telo}`, tolerancia 5 minút. Dokumentácia onboardingu
 * formát podpisovaného reťazca neuvádza; bez pečiatky sa preto prijme aj HMAC
 * z holého tela (s `sha256=` alebo bez) — opakovaniu bráni `id` udalosti.
 */
export function overOnboardingPodpis(args: {
  podpis: string | null | undefined;
  pecatka: string | null | undefined;
  telo: string;
  tajomstvo: string;
  terazSekundy?: number;
}): { platny: boolean; dovod?: string } {
  const podpis = String(args.podpis ?? "").trim();
  if (!podpis) return { platny: false, dovod: "chyba_hlavicka" };
  if (args.pecatka) {
    return overEpostakPodpis({
      podpis: podpis.startsWith("sha256=") ? podpis : `sha256=${podpis}`,
      pecatka: args.pecatka,
      telo: args.telo,
      tajomstvo: args.tajomstvo,
      terazSekundy: args.terazSekundy,
    });
  }
  const hex = podpis.startsWith("sha256=") ? podpis.slice(7) : podpis;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return { platny: false, dovod: "zly_tvar" };
  const ocakavany = createHmac("sha256", args.tajomstvo).update(args.telo, "utf8").digest("hex");
  return rovnakeHex(hex, ocakavany) ? { platny: true } : { platny: false, dovod: "nesedi_podpis" };
}

/** Či telo vyzerá ako partnerská udalosť (onboarding/consent/…), nie udalosť dokladu. */
export function jePartnerskaUdalost(telo: string): boolean {
  try {
    const o = JSON.parse(telo);
    const typ = String(o?.type ?? o?.event ?? "");
    return /^(onboarding|consent|participant)\./.test(typ) || typ === "webhook.disabled";
  } catch {
    return false;
  }
}

async function tajomstvoWebhooku(): Promise<string | null> {
  if (process.env.EPOSTAK_ONBOARDING_WEBHOOK_SECRET)
    return process.env.EPOSTAK_ONBOARDING_WEBHOOK_SECRET;
  const { data } = await db
    .from("efaktura_epostak_nastavenie")
    .select("tajomstvo_sifrovane")
    .eq("kluc", NASTAVENIE_WEBHOOKU)
    .maybeSingle();
  if (!data?.tajomstvo_sifrovane) return null;
  try {
    const { decryptSecret } = await import("../payment-crypto.server");
    return decryptSecret(data.tajomstvo_sifrovane);
  } catch {
    return null;
  }
}

/** Typ udalosti → stav, keď `data.status` chýba. */
const STAV_Z_UDALOSTI: Record<string, string> = {
  "onboarding.pfs_received": "action_required",
  "onboarding.signed": "activating",
  "onboarding.review_required": "activating",
  "onboarding.active": "active",
  "onboarding.expired": "expired",
  "onboarding.revoked": "revoked",
};

export async function prijmiOnboardingUdalost(args: {
  telo: string;
  podpis: string | null;
  pecatka: string | null;
}): Promise<{ ok: boolean; dovod?: string; spracovane?: boolean }> {
  if (args.telo.length > 256 * 1024) return { ok: false, dovod: "zly_tvar" };
  const tajomstvo = await tajomstvoWebhooku();
  if (!tajomstvo) return { ok: false, dovod: "bez_tajomstva" };
  const v = overOnboardingPodpis({ ...args, tajomstvo });
  if (!v.platny) return { ok: false, dovod: v.dovod };

  let o: any;
  try {
    o = JSON.parse(args.telo);
  } catch {
    return { ok: false, dovod: "zly_tvar" };
  }
  const typ = String(o?.type ?? o?.event ?? "");
  const udalostId = typeof o?.id === "string" ? o.id : null;
  const d = (o?.data ?? {}) as Record<string, any>;

  if (typ === "webhook.disabled") {
    console.warn("[efaktura-onboarding] ePošták vypol webhook:", d?.url, d?.reason);
    await db
      .from("efaktura_epostak_nastavenie")
      .update({
        chyba:
          `ePošták vypol webhook ${d?.url ?? ""} (${d?.reason ?? "?"}) — oprav adresu a zapni ho znova.`.slice(
            0,
            500,
          ),
        aktualizovane_at: new Date().toISOString(),
      })
      .eq("kluc", NASTAVENIE_WEBHOOKU);
    return { ok: true, spracovane: true };
  }
  if (!typ.startsWith("onboarding.")) return { ok: true, spracovane: false };

  const requestId = typeof d.requestId === "string" ? d.requestId : null;
  let riadok: any = null;
  if (requestId) {
    const { data } = await db
      .from("efaktura_odosielanie_ziadosti")
      .select("*")
      .eq("epostak_request_id", requestId)
      .maybeSingle();
    riadok = data;
  }
  if (!riadok && typeof d.customerRef === "string") {
    const { data } = await db
      .from("efaktura_odosielanie_ziadosti")
      .select("*")
      .eq("customer_ref", d.customerRef)
      .maybeSingle();
    riadok = data;
  }
  // Neznáma žiadosť (napr. z iného prostredia) — prijať, nech ju ePošták neopakuje.
  if (!riadok) return { ok: true, spracovane: false };
  // Opakované doručenie tej istej udalosti.
  if (udalostId && riadok.posledna_udalost_id === udalostId) return { ok: true, spracovane: false };

  await spracujOdpoved(
    riadok,
    {
      id: requestId ?? riadok.epostak_request_id,
      status: typeof d.status === "string" ? d.status : STAV_Z_UDALOSTI[typ],
      firmId: typeof d.firmId === "string" ? d.firmId : null,
      nextAction: typeof d.nextAction === "string" ? d.nextAction : null,
      clientMessage:
        d.clientMessage && typeof d.clientMessage === "object" ? d.clientMessage : null,
      payerMode: typeof d.payerMode === "string" ? d.payerMode : undefined,
    },
    udalostId,
  );
  return { ok: true, spracovane: true };
}

/**
 * Nastaví partnerský onboarding webhook u ePoštáka na našu adresu a uloží
 * tajomstvo (vráti ho len pri vytvorení). Keď webhook u ePoštáka už je a
 * tajomstvo nepoznáme, treba `znova` (DELETE + PUT = nové tajomstvo).
 */
export async function nastavWebhookOnboardingu(znova = false): Promise<{
  url: string;
  udalosti: string[];
  maTajomstvo: boolean;
}> {
  const ep = await import("./epostak.server");
  const url = `${web()}/api/public/efaktura/epostak`;
  const { data: ulozene } = await db
    .from("efaktura_epostak_nastavenie")
    .select("tajomstvo_sifrovane")
    .eq("kluc", NASTAVENIE_WEBHOOKU)
    .maybeSingle();
  const existuje = await ep.citajOnboardingWebhook();
  if (
    existuje &&
    !ulozene?.tajomstvo_sifrovane &&
    !process.env.EPOSTAK_ONBOARDING_WEBHOOK_SECRET &&
    !znova
  ) {
    throw new Error(
      "U ePoštáka už onboarding webhook je, ale jeho tajomstvo nepoznáme — zvoľ „Vytvoriť nanovo“ (zmaže ho a založí s novým tajomstvom).",
    );
  }
  if (existuje && znova) await ep.zmazOnboardingWebhook();
  const r = await ep.nastavOnboardingWebhook(url);
  const { encryptSecret } = await import("../payment-crypto.server");
  const zapis: Record<string, unknown> = {
    kluc: NASTAVENIE_WEBHOOKU,
    url,
    udalosti: [...ep.UDALOSTI_ONBOARDINGU],
    chyba: null,
    aktualizovane_at: new Date().toISOString(),
  };
  if (r.secret) zapis.tajomstvo_sifrovane = encryptSecret(r.secret);
  const { error } = await db
    .from("efaktura_epostak_nastavenie")
    .upsert(zapis, { onConflict: "kluc" });
  if (error) throw new Error(error.message);
  return {
    url,
    udalosti: [...ep.UDALOSTI_ONBOARDINGU],
    maTajomstvo: Boolean(
      r.secret || ulozene?.tajomstvo_sifrovane || process.env.EPOSTAK_ONBOARDING_WEBHOOK_SECRET,
    ),
  };
}

// ─── Cron ────────────────────────────────────────────────────────────────────

/**
 * Záloha za webhook: dopyt rozbehnutých žiadostí, zopakovanie zlyhaných
 * a dorobenie kľúča firmy, keď pri aktivácii nevznikol.
 */
export async function dokonciOnboardingyLenOdosielanie(): Promise<{ obnovenych: number }> {
  const { data: riadky } = await db
    .from("efaktura_odosielanie_ziadosti")
    .select("*")
    .in("stav", [...ROZBEHNUTE, "chyba", "active"])
    .limit(200);
  let obnovenych = 0;
  for (const r of riadky ?? []) {
    try {
      if (ROZBEHNUTE.includes(r.stav) && r.epostak_request_id) {
        await obnovOnboarding(r);
        obnovenych += 1;
      } else if (
        (r.stav === "chyba" || (r.stav === "vytvorena" && !r.epostak_request_id)) &&
        (r.pokusov ?? 0) < MAX_POKUSOV
      ) {
        await odosliZiadost(r);
        obnovenych += 1;
      } else if (
        r.stav === "active" &&
        r.epostak_firm_id &&
        !r.kluc_sifrovany &&
        (r.kluc_pokusov ?? 0) < MAX_POKUSOV_KLUCA
      ) {
        await aktivujLenOdosielanie(r);
        obnovenych += 1;
      }
    } catch (e) {
      console.warn(
        "[efaktura-odosielanie] cron:",
        r.company_id,
        String((e as Error)?.message ?? e),
      );
    }
  }
  return { obnovenych };
}
