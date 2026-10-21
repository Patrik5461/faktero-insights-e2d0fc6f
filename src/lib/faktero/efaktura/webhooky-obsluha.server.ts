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
import {
  upozorniNaSchvalenie,
  upozorniNoveZiadosti,
  upozorniVysledokRegistracie,
} from "./upozornenia.server";

const db = supabaseAdmin as any;
const web = () => (process.env.APP_PUBLIC_URL ?? "https://www.faktero.sk").replace(/\/+$/, "");

/** Koľkokrát sa registrácia skúsi sama, kým ju musí niekto pozrieť. */
const MAX_POKUSOV = 5;

// ─── Finančná správa ─────────────────────────────────────────────────────────

/**
 * `neoverena`: podpis nesedel, no ručné schvaľovanie je zapnuté — žiadosť sa
 * uloží ako „na_schvalenie“ a registrácia počká na admina. Pravosť tokenu
 * aj tak overí ePošták/SMP; falošný token registráciu nespustí.
 */
export async function prijmiZiadostiFs(
  telo: string,
  ip: string | null,
  neoverena?: { via: string | null; diagnostika: string },
): Promise<{ ok: true; novych: number } | { ok: false; chyba: string }> {
  const r = rozparsujPds(telo);
  if ("chyba" in r) return { ok: false, chyba: r.chyba };
  const { encryptSecret } = await import("../payment-crypto.server");

  const nove: string[] = [];
  const noveFirmy: { nazov: string | null; dic: string; email: string | null; telefon: string | null }[] =
    [];
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
          ...(neoverena
            ? {
                stav: "na_schvalenie",
                podpis_overeny: false,
                via: neoverena.via?.slice(0, 300) ?? null,
                chyba: `Podpis X-PDS-Secret nesedel — čaká na ručné schválenie. ${neoverena.diagnostika}`.slice(0, 500),
              }
            : {}),
        },
        // Tú istú žiadosť (rovnaký token) FS môže poslať znova — zapíše sa raz.
        { onConflict: "token_odtlacok", ignoreDuplicates: true },
      )
      .select("id");
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      nove.push(row.id);
      noveFirmy.push({ nazov: z.nazov, dic: z.dic, email: z.email, telefon: z.telefon });
    }
  }

  // Opakovane poslaná žiadosť (rovnaký token) sa nezapíše, a preto ani neohlási.
  if (neoverena) {
    await upozorniNaSchvalenie(noveFirmy, neoverena.via);
    return { ok: true, novych: nove.length };
  }
  await upozorniNoveZiadosti(noveFirmy);

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
  // `companies` nemá `deleted_at` — filter naň zhodil dotaz a firma sa „nenašla“
  // nikdy (PALIERA dostala pozvánku, hoci účet mala). Chyba sa teraz neprehltne.
  const { data, error } = await db
    .from("companies")
    .select("id, email, created_at")
    .eq("dic", dic)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(`Firma podľa DIČ: ${error.message}`);
  return data?.[0] ?? null;
}

async function zapniProfil(companyId: string, op: { firmId: string | null; peppolId: string | null }) {
  if (!op.firmId) return;
  const { jeTestovaciRezim } = await import("./epostak.server");
  const { error } = await db.from("efaktura_profiles").upsert(
    {
      company_id: companyId,
      epostak_firm_id: op.firmId,
      peppol_provider: "epostak",
      peppol_participant_id: op.peppolId,
      peppol_scheme: op.peppolId?.split(":")[0] ?? "0245",
      enabled: true,
      // Registrácia v ostrom Peppole — profil nesmie ostať v testovacom režime
      // (predvolená hodnota stĺpca je true), inak ho ostatné časti berú ako skúšobný.
      test_mode: jeTestovaciRezim(),
      activated_at: new Date().toISOString(),
    },
    { onConflict: "company_id" },
  );
  if (error) throw new Error(error.message);
}

/** Chyba operácie ePoštáka ako text; SMP_REGISTRATION_NOT_FOUND vysvetlí, čo s tým. */
export function popisChybyOperacie(chyba: unknown): string | null {
  if (!chyba || typeof chyba !== "object") return typeof chyba === "string" ? chyba : null;
  const { code, message } = chyba as { code?: string; message?: string };
  if (code === "SMP_REGISTRATION_NOT_FOUND") {
    return "SMP_REGISTRATION_NOT_FOUND — ePošták registráciu v SMP nedokončil. Firma musí na portáli Finančnej správy znova vybrať Faktero ako poskytovateľa (vznikne nový overovací token); ak je registrovaná u iného poskytovateľa, treba migračný kód.";
  }
  return [code, message].filter(Boolean).join(" — ") || null;
}

function stavZOperacie(s: string): string {
  if (s === "succeeded") return "registrovana";
  if (s === "manual_review") return "na_kontrolu";
  if (s === "rejected" || s === "released") return "zamietnuta";
  return "registruje_sa";
}

/** Text pre admina aj e-mail, keď firmu v SMP drží niekto iný. */
export const CHYBA_CUDZI_POSKYTOVATEL =
  "Firma je v Peppole u iného poskytovateľa — na prechod treba migračný kód od neho.";

/**
 * Registrácia narazila na firmu, ktorú v SMP drží iný poskytovateľ. ePošták
 * to hlási kódom PARTICIPANT_ALREADY_REGISTERED — buď v chybe požiadavky,
 * alebo v `error` operácie, ktorá skončila neskôr.
 */
export function jeCudziPoskytovatel(chyba: unknown): boolean {
  if (!chyba) return false;
  const e = chyba as any;
  const kody = [e?.code, e?.error?.code, e?.response?.error?.code, e?.response?.code];
  if (kody.includes("PARTICIPANT_ALREADY_REGISTERED")) return true;
  const text = typeof chyba === "string" ? chyba : String(e?.message ?? "");
  return text.includes("PARTICIPANT_ALREADY_REGISTERED");
}

/** Chyba migrácie (409/422/…) ako hláška pre admina. Kód v nej nikdy nie je — ePošták ho nevracia. */
export function popisChybyMigracie(status: number, sprava: string): string {
  const detail = sprava ? ` (ePošták: ${sprava})` : "";
  if (status === 422)
    return `Migračný kód neprešiel — je zlý, expirovaný alebo už použitý, prípadne firma nesedí s DIČ. Firma si musí u súčasného poskytovateľa vypýtať nový kód.${detail}`;
  if (status === 409)
    return `Prevzatie je v konflikte — firmu už preberá iná operácia alebo ju medzičasom prevzal niekto iný. Pozri stav u ePoštáka; ak treba, vypýtaj nový kód.${detail}`;
  if (status === 403)
    return `ePošták nemá pre Faktero povolenú migráciu (oprávnenie participants:migrate) — treba to vybaviť s ePoštákom.${detail}`;
  if (status === 400)
    return `ePošták požiadavku odmietol ako neplatnú — DIČ musí mať 10 číslic a e-mail firmy musí byť platný.${detail}`;
  return `Prevzatie zlyhalo${status ? ` (HTTP ${status})` : ""} — skúsi sa znova.${detail}`;
}

/** Jedna žiadosť FS → registrácia (alebo migrácia kódom) u ePoštáka → firma alebo pozvánka. */
export async function spracujZiadost(id: string): Promise<string> {
  const { data: z } = await db.from("efaktura_pds_ziadosti").select("*").eq("id", id).maybeSingle();
  if (!z) throw new Error("Žiadosť sa nenašla.");
  if (z.stav === "registrovana" || z.stav === "zamietnuta") return z.stav;
  // Neoverená žiadosť ide ďalej až po schválení v admine.
  if (z.stav === "na_schvalenie") return z.stav;

  // Admin zadal migračný kód — firma sa preberá od iného poskytovateľa.
  const migracia = Boolean(z.migracny_kod_sifrovany);
  const firma = z.company_id ? { id: z.company_id, email: null } : await firmaPodlaDic(z.dic);
  const email = z.email || firma?.email;
  const zmena: Record<string, unknown> = {
    pokusov: (z.pokusov ?? 0) + 1,
    posledny_pokus_at: new Date().toISOString(),
    company_id: firma?.id ?? null,
  };
  let poskytovatel: string | null = z.cudzi_poskytovatel ?? null;

  if (!migracia && !z.token_sifrovany) {
    zmena.stav = "chyba";
    zmena.chyba = "Chýba verification_token — FS musí žiadosť poslať znova.";
  } else if (!email) {
    zmena.stav = "chyba";
    zmena.chyba = "FS neposlala e-mail firmy a firmu vo Fakteri nepoznáme — ePošták ho vyžaduje.";
    if (migracia) zmena.migracny_kod_sifrovany = null;
  } else {
    try {
      const { decryptSecret } = await import("../payment-crypto.server");
      const ep = await import("./epostak.server");
      let op;
      if (migracia) {
        const kod = decryptSecret(z.migracny_kod_sifrovany);
        op = await ep.migrujWhiteLabel({
          customerRef: `dic-${z.dic}`,
          dic: z.dic,
          companyEmail: email,
          migrationCode: kod,
          // Rovnaký kľúč pre ten istý kód, kým nepríde konečný výsledok; v kľúči je len hash.
          idempotencyKey: ep.klucMigracie(z.id, kod),
        });
      } else {
        op = await ep.registrujWhiteLabel({
          // ePošták povolí len písmená, číslice, bodku, podčiarkovník a pomlčku.
          customerRef: `dic-${z.dic}`,
          dic: z.dic,
          companyEmail: email,
          verificationToken: decryptSecret(z.token_sifrovany),
          // Rovnaký kľúč pri každom pokuse, kým nepríde konečný výsledok.
          idempotencyKey: `faktero-pds:${z.id}`,
        });
      }
      zmena.stav = stavZOperacie(op.status);
      zmena.epostak_operacia_id = op.id;
      zmena.epostak_firm_id = op.firmId;
      zmena.peppol_id = op.peppolId;
      zmena.chyba = popisChybyOperacie(op.error);
      if (!migracia && zmena.stav === "zamietnuta" && jeCudziPoskytovatel(op.error)) {
        zmena.stav = "cudzi_poskytovatel";
        zmena.chyba = CHYBA_CUDZI_POSKYTOVATEL;
      }
      if (zmena.stav === "registrovana" || zmena.stav === "zamietnuta") {
        // Token ani kód už nie sú potrebné — ePošták ich žiada nikde nedržať.
        zmena.token_sifrovany = null;
        zmena.migracny_kod_sifrovany = null;
      }
      if (zmena.stav === "registrovana" && firma?.id) await zapniProfil(firma.id, op);
    } catch (e: any) {
      const status = Number(e?.status ?? 0);
      const sprava = String(e?.message ?? e).slice(0, 500);
      if (migracia) {
        if ([400, 403, 409, 422].includes(status)) {
          // Rovnaký kód znova neprejde — admin zadá nový, cron to neskúša.
          zmena.stav = "cudzi_poskytovatel";
          zmena.migracny_kod_sifrovany = null;
        } else {
          zmena.stav = "chyba";
          // Posledný automatický pokus — kód sa ďalej nedrží.
          if ((zmena.pokusov as number) >= MAX_POKUSOV) zmena.migracny_kod_sifrovany = null;
        }
        const { chybaEPostaka } = await import("./epostak.server");
        const detail = e?.response ? chybaEPostaka(e.response, status) : sprava;
        zmena.chyba = popisChybyMigracie(status, detail).slice(0, 500);
      } else if (jeCudziPoskytovatel(e)) {
        // Opakovanie nepomôže, kým firmu pôvodný poskytovateľ nepustí.
        zmena.stav = "cudzi_poskytovatel";
        zmena.chyba = CHYBA_CUDZI_POSKYTOVATEL;
        if (!poskytovatel) {
          const { zistiPoskytovatelaVSmp } = await import("./epostak.server");
          poskytovatel = await zistiPoskytovatelaVSmp(z.dic).catch(() => null);
          if (poskytovatel) zmena.cudzi_poskytovatel = poskytovatel;
        }
      } else {
        zmena.chyba = sprava;
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
  }

  await db.from("efaktura_pds_ziadosti").update(zmena).eq("id", id);

  // Ohlási sa zmena stavu; ďalší neúspešný pokus s tým istým stavom už nie.
  // Prevzatie z adminu začína v „prijata“, takže jeho výsledok sa ohlási vždy.
  if (zmena.stav !== z.stav) {
    await upozorniVysledokRegistracie({
      nazov: z.nazov,
      dic: z.dic,
      email,
      telefon: z.telefon,
      stav: String(zmena.stav),
      chyba: (zmena.chyba as string | null) ?? null,
      pokusov: zmena.pokusov as number,
      maFirmu: Boolean(firma?.id),
      poskytovatel,
      migracia,
    });
  }

  if (zmena.stav === "registrovana" && !z.pozvanka_odoslana_at && email) {
    await oznamRegistraciuFirme({ id, email, nazov: z.nazov, dic: z.dic, maFirmu: Boolean(zmena.company_id) });
  }
  return String(zmena.stav);
}

/**
 * Oznámenie firme po úspešnej registrácii v Peppole. Firma s účtom vo Fakteri
 * dostane potvrdenie, že eFaktúry idú cez Faktero; bez účtu pozvánku.
 * `pozvanka_odoslana_at` drží, že oznámenie (ktorékoľvek) už odišlo.
 */
async function oznamRegistraciuFirme(v: {
  id: string;
  email: string;
  nazov: string | null;
  dic: string;
  maFirmu: boolean;
}) {
  if (!v.maFirmu) return posliPozvanku(v);
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const { escapeHtml } = await import("../ponuka-odpoved.server");
  const odkaz = `${web()}/efaktura`;
  const meno = v.nazov || `DIČ ${v.dic}`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: `Faktero <${process.env.RESEND_FROM_NOREPLY || "noreply@faktero.sk"}>`,
      to: [v.email],
      subject: `eFaktúra: ${meno} je napojená na Faktero`,
      text: [
        "Dobrý deň,",
        "",
        `firma ${meno} (DIČ ${v.dic}) je odteraz napojená na Faktero ako poskytovateľa doručovacej služby pre eFaktúry (digitálneho poštára) v sieti Peppol.`,
        "eFaktúry vám dodávatelia môžu posielať a vy ich môžete odosielať priamo z Faktera. Prijaté eFaktúry nájdete v časti eFaktúra:",
        `  ${odkaz}`,
        "",
        "Tím Faktero",
      ].join("\n"),
      html: `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#111;max-width:560px;line-height:1.5">
        <p>Dobrý deň,</p>
        <p>firma <strong>${escapeHtml(meno)}</strong> (DIČ ${escapeHtml(v.dic)}) je odteraz napojená na Faktero ako poskytovateľa doručovacej služby pre eFaktúry (digitálneho poštára) v sieti Peppol.</p>
        <p>eFaktúry vám dodávatelia môžu posielať a vy ich môžete odosielať priamo z Faktera.</p>
        <p><a href="${odkaz}" style="display:inline-block;background:#12734f;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">Otvoriť eFaktúry vo Fakteri</a></p>
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
    .select(
      "id, epostak_operacia_id, company_id, stav, pokusov, dic, nazov, email, telefon, pozvanka_odoslana_at, migracny_kod_sifrovany",
    )
    .in("stav", ["prijata", "registruje_sa", "chyba", "na_kontrolu"])
    .limit(200);
  for (const z of rozbehnute ?? []) {
    try {
      if ((z.stav === "registruje_sa" || z.stav === "na_kontrolu") && z.epostak_operacia_id) {
        const { stavWhiteLabel } = await import("./epostak.server");
        const op = await stavWhiteLabel(z.epostak_operacia_id);
        let stav = stavZOperacie(op.status);
        // Dôvod zamietnutia treba vidieť v admine aj v e-maile — inak ostane
        // len „zamietnutá“ a nikto nevie, či má firma znova vybrať poskytovateľa.
        let chyba = popisChybyOperacie(op.error);
        const zmena: Record<string, unknown> = {
          stav,
          epostak_firm_id: op.firmId,
          peppol_id: op.peppolId,
          ...(chyba ? { chyba } : {}),
        };
        // Registrácia (nie migrácia) zamietnutá, lebo firmu drží iný poskytovateľ.
        if (stav === "zamietnuta" && !z.migracny_kod_sifrovany && jeCudziPoskytovatel(op.error)) {
          stav = "cudzi_poskytovatel";
          zmena.stav = stav;
          zmena.chyba = chyba = CHYBA_CUDZI_POSKYTOVATEL;
        }
        if (stav === "registrovana" || stav === "zamietnuta") {
          zmena.token_sifrovany = null;
          zmena.migracny_kod_sifrovany = null;
        }
        await db.from("efaktura_pds_ziadosti").update(zmena).eq("id", z.id);
        if (stav === "registrovana" && z.company_id) await zapniProfil(z.company_id, op);
        // Registrácia dokončená až po kontrole u ePoštáka — firma sa to dozvie tiež.
        if (stav === "registrovana" && z.email && !z.pozvanka_odoslana_at) {
          await oznamRegistraciuFirme({
            id: z.id,
            email: z.email,
            nazov: z.nazov,
            dic: z.dic,
            maFirmu: Boolean(z.company_id),
          });
        }
        if (stav !== z.stav) {
          await upozorniVysledokRegistracie({
            nazov: z.nazov,
            dic: z.dic,
            email: z.email,
            telefon: z.telefon,
            stav,
            chyba,
            maFirmu: Boolean(z.company_id),
            migracia: Boolean(z.migracny_kod_sifrovany),
          });
        }
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
  // Udalosť je pár stoviek bajtov. Hlavičky a pečiatku overíme raz ešte pred
  // cyklom — inak nepodpísaná 20 MB požiadavka spustila stovky dešifrovaní
  // a HMAC nad celým telom.
  if (args.telo.length > 256 * 1024) return { ok: false, dovod: "zly_tvar" };
  const predbezne = overEpostakPodpis({ podpis: args.podpis, pecatka: args.pecatka, telo: "", tajomstvo: "-" });
  if (!predbezne.platny && predbezne.dovod !== "nesedi_podpis") return { ok: false, dovod: predbezne.dovod };
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
