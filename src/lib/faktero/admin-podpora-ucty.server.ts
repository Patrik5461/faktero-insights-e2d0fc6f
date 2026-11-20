/*
  Zásahy podpory do účtu: zrušenie dvojfaktorového overenia (stratený telefón)
  a zmena prihlasovacieho e-mailu. Oboje je cesta k prevzatiu cudzieho účtu,
  preto:

  - smie to len superadmin s reláciou aal2 (to isté ako zákaz prihlásenia),
  - na účte administrátora platformy ani na vlastnom účte to nejde — admin si
    2FA obnoví len cez iného superadmina priamo v databáze, nie jedným klikom,
  - dôvod je povinný a každý zásah ide do `platform_audit_logs`,
  - človek dostane oznámenie (pri zmene e-mailu na starú aj novú adresu), aby
    sa o zásahu dozvedel aj vtedy, keby ho podpora urobila na podvodnú žiadosť.

  Logika je oddelená od serverových funkcií (`admin-podpora.functions.ts`) a
  databázu dostáva zvonku, aby sa dali stráže otestovať bez ostrej DB.
*/
import { escHtml } from "@/lib/bezpecny-text";

/** Klient Supabase so servisným kľúčom — v testoch podvrh. */
export type Db = any;

export type Oznam = { to: string; subject: string; text: string; html: string };
export type Posielac = (m: Oznam) => Promise<void>;

/** Overí superadmina a aal2. `vyzadujAal2` je `vyzadujAal2Admina` (v teste podvrh). */
export async function overSuperadminaPodpory(
  db: Db,
  adminId: string,
  vyzadujAal2: () => void,
): Promise<void> {
  const { data, error } = await db
    .from("platform_admins")
    .select("role")
    .eq("user_id", adminId)
    .maybeSingle();
  if (error) throw new Error("Overenie administrátora zlyhalo.");
  if (!data) throw new Error("Prístup zamietnutý: nie ste administrátor platformy.");
  vyzadujAal2();
  if (data.role !== "superadmin") throw new Error("Túto akciu smie urobiť len superadmin.");
}

async function jeAdminPlatformy(db: Db, userId: string): Promise<boolean> {
  const { data } = await db
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

/** Spoločné stráže cieľového účtu. */
async function overCiel(db: Db, adminId: string, userId: string, co: string) {
  if (userId === adminId) throw new Error(`Na vlastnom účte sa ${co} cez podporu nedá.`);
  if (await jeAdminPlatformy(db, userId)) {
    throw new Error(`Účtu administrátora platformy sa ${co} cez podporu nedá — z bezpečnostných dôvodov.`);
  }
  const { data: profil } = await db
    .from("profiles")
    .select("id, email, full_name")
    .eq("id", userId)
    .maybeSingle();
  if (!profil) throw new Error("Taký účet neexistuje.");
  return profil as { id: string; email: string | null; full_name: string | null };
}

export async function zapisAudit(
  db: Db,
  adminId: string,
  action: string,
  entityId: string,
  metadata: Record<string, unknown>,
) {
  const { error } = await db.from("platform_audit_logs").insert({
    admin_user_id: adminId,
    action,
    entity_type: "user",
    entity_id: entityId,
    metadata,
  });
  if (error) throw new Error("Zápis do audit logu zlyhal.");
}

/** Záznam po vykonaní — zásah už prebehol, jeho chyba ho nesmie vydávať za neúspešný. */
async function zapisAuditPo(...a: Parameters<typeof zapisAudit>) {
  try {
    await zapisAudit(...a);
  } catch {
    /* hlavný záznam je zapísaný pred zásahom */
  }
}

export function normalizujDovod(dovod: string): string {
  const d = String(dovod ?? "").trim();
  if (d.length < 5) throw new Error("Uveďte dôvod zásahu (aspoň 5 znakov).");
  return d.slice(0, 500);
}

// ── Oznámenia ───────────────────────────────────────────────────────────

const PODPIS = "Ak ste o to nežiadali, odpíšte nám hneď na podpora@faktero.sk.";

export function oznamZrusenia2fa(email: string): Oznam {
  const text =
    `Dobrý deň,\n\ndvojfaktorové overenie vo vašom účte Faktero (${email}) zrušila podpora na vašu žiadosť. ` +
    `Všetky prihlásenia na ostatných zariadeniach sa ukončili.\n\n` +
    `Po prihlásení si ho odporúčame znova zapnúť v Nastavenia → Zabezpečenie účtu.\n\n${PODPIS}\n`;
  const html =
    `<p>Dobrý deň,</p><p>dvojfaktorové overenie vo vašom účte Faktero (<strong>${escHtml(email)}</strong>) ` +
    `zrušila podpora na vašu žiadosť. Všetky prihlásenia na ostatných zariadeniach sa ukončili.</p>` +
    `<p>Po prihlásení si ho odporúčame znova zapnúť v <em>Nastavenia → Zabezpečenie účtu</em>.</p>` +
    `<p style="color:#555">${escHtml(PODPIS)}</p>`;
  return { to: email, subject: "Dvojfaktorové overenie bolo zrušené podporou", text, html };
}

export function oznamZmenyEmailu(to: string, stary: string, novy: string): Oznam {
  const text =
    `Dobrý deň,\n\nprihlasovací e-mail účtu Faktero zmenila podpora na vašu žiadosť:\n` +
    `pôvodný: ${stary}\nnový: ${novy}\n\nOdteraz sa prihlasujete novou adresou, heslo ostáva rovnaké.\n\n${PODPIS}\n`;
  const html =
    `<p>Dobrý deň,</p><p>prihlasovací e-mail účtu Faktero zmenila podpora na vašu žiadosť:</p>` +
    `<ul><li>pôvodný: <strong>${escHtml(stary)}</strong></li><li>nový: <strong>${escHtml(novy)}</strong></li></ul>` +
    `<p>Odteraz sa prihlasujete novou adresou, heslo ostáva rovnaké.</p>` +
    `<p style="color:#555">${escHtml(PODPIS)}</p>`;
  return { to, subject: "Prihlasovací e-mail účtu Faktero bol zmenený", text, html };
}

/*
  Oznámenie odchádza z platformy (noreply@faktero.sk) na adresu samotného účtu
  s pevným textom — nie je to mail firmy, preto nejde cez `posliMailFirmy` a
  jeho stropy (ochrana-odosielania). Rovnako posiela oznámenia zrušenie účtu.
*/
export const posliOznamPlatformy: Posielac = async (m) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: `Faktero <${process.env.RESEND_FROM_NOREPLY || "noreply@faktero.sk"}>`,
      to: [m.to],
      subject: m.subject,
      text: m.text,
      html: m.html,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}`);
};

// ── 1. Zrušenie dvojfaktorového overenia ────────────────────────────────

export async function zrusDvojfaktorUctu(
  db: Db,
  o: { adminId: string; userId: string; dovod: string; upozornit: boolean; posli?: Posielac },
): Promise<{ zmazanych: number; upozornenie: "odoslane" | "neodoslane" | "vypnute" }> {
  const dovod = normalizujDovod(o.dovod);
  const profil = await overCiel(db, o.adminId, o.userId, "dvojfaktorové overenie zrušiť");

  const { data, error } = await db.auth.admin.mfa.listFactors({ userId: o.userId });
  if (error) throw new Error(error.message || "Faktory sa nepodarilo načítať.");
  const faktory: Array<{ id: string; factor_type?: string; status?: string }> = data?.factors ?? [];
  if (!faktory.length) throw new Error("Účet nemá zapnuté dvojfaktorové overenie.");

  // Záznam ide do auditu **pred** zásahom — keď sa zapísať nedá, nič sa nezmení.
  await zapisAudit(db, o.adminId, "zrusenie_2fa", o.userId, {
    dovod,
    email: profil.email,
    faktory: faktory.map((f) => ({ typ: f.factor_type ?? "?", stav: f.status ?? "?" })),
  });

  const zmazane: Array<{ typ: string; stav: string }> = [];
  for (const f of faktory) {
    // Zmazanie overeného faktora odhlási používateľa zo všetkých relácií (GoTrue).
    const { error: e } = await db.auth.admin.mfa.deleteFactor({ id: f.id, userId: o.userId });
    if (e) {
      await zapisAuditPo(db, o.adminId, "zrusenie_2fa_ciastocne", o.userId, {
        zmazane,
        chyba: String(e.message ?? e).slice(0, 300),
      });
      throw new Error(`Faktor sa nepodarilo zmazať: ${e.message ?? e}`);
    }
    zmazane.push({ typ: f.factor_type ?? "?", stav: f.status ?? "?" });
  }

  let upozornenie: "odoslane" | "neodoslane" | "vypnute" = "vypnute";
  if (o.upozornit && profil.email) {
    try {
      await (o.posli ?? posliOznamPlatformy)(oznamZrusenia2fa(profil.email));
      upozornenie = "odoslane";
    } catch {
      upozornenie = "neodoslane";
    }
  }

  await zapisAuditPo(db, o.adminId, "zrusenie_2fa_hotovo", o.userId, {
    zmazanych: zmazane.length,
    upozornenie,
  });
  return { zmazanych: zmazane.length, upozornenie };
}

// ── 2. Zmena prihlasovacieho e-mailu ────────────────────────────────────

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizujEmail(v: string): string {
  const e = String(v ?? "").trim().toLowerCase();
  if (!EMAIL.test(e) || e.length > 254) throw new Error("Nový e-mail nemá platný tvar.");
  return e;
}

export async function zmenEmailUctu(
  db: Db,
  o: {
    adminId: string;
    userId: string;
    novyEmail: string;
    dovod: string;
    /** Podpora overila totožnosť — bez toho sa e-mail nemení. */
    totoznostOverena: boolean;
    posli?: Posielac;
  },
): Promise<{
  stary: string | null;
  novy: string;
  pozvanky: number;
  uctyZdarma: number;
  oznamy: { stary: boolean; novy: boolean };
}> {
  if (!o.totoznostOverena) throw new Error("Najprv overte totožnosť žiadateľa.");
  const dovod = normalizujDovod(o.dovod);
  const novy = normalizujEmail(o.novyEmail);
  const profil = await overCiel(db, o.adminId, o.userId, "e-mail meniť");
  const stary = (profil.email ?? "").trim().toLowerCase() || null;
  if (stary === novy) throw new Error("Nový e-mail je rovnaký ako súčasný.");

  // Adresa nesmie patriť inému účtu — ani v profiloch, ani v prihlásení (auth.users).
  const { data: obsadenyProfil } = await db
    .from("profiles")
    .select("id")
    .ilike("email", novy)
    .neq("id", o.userId)
    .limit(1);
  if ((obsadenyProfil ?? []).length) throw new Error("Tento e-mail už používa iný účet.");
  const { data: obsadenyAuth } = await db.rpc("pouzivatel_podla_emailu", { p_email: novy });
  if (obsadenyAuth && obsadenyAuth !== o.userId) throw new Error("Tento e-mail už používa iný účet.");

  await zapisAudit(db, o.adminId, "zmena_emailu", o.userId, {
    dovod,
    stary,
    novy,
    totoznost_overena: true,
  });

  // Podpora totožnosť overila (inak by sem nedošlo), preto sa nová adresa
  // rovno potvrdí — človek, ktorý prišiel o starú schránku, by potvrdenie
  // zmeny na starú adresu nikdy nedostal.
  const { error } = await db.auth.admin.updateUserById(o.userId, {
    email: novy,
    email_confirm: true,
  });
  if (error) throw new Error(error.message || "E-mail sa nepodarilo zmeniť.");

  // Kópie e-mailu mimo auth.users: profil (zobrazenie, admin, prepis pri mazaní),
  // zoznam účtov zadarmo (kľúčovaný e-mailom) a nevybavené pozvánky na starú adresu.
  await db.from("profiles").update({ email: novy }).eq("id", o.userId);

  let uctyZdarma = 0;
  let pozvanky = 0;
  if (stary) {
    const { data: zdarma } = await db
      .from("platform_free_accounts")
      .update({ email: novy })
      .eq("email", stary)
      .select("email");
    uctyZdarma = (zdarma ?? []).length;
    const { data: poz } = await db
      .from("company_invitations")
      .update({ email: novy })
      .ilike("email", stary)
      .is("accepted_at", null)
      .is("declined_at", null)
      .select("id");
    pozvanky = (poz ?? []).length;
  }

  const posli = o.posli ?? posliOznamPlatformy;
  const oznamy = { stary: false, novy: false };
  if (stary) {
    try {
      await posli(oznamZmenyEmailu(stary, stary, novy));
      oznamy.stary = true;
    } catch {
      /* stav je zapísaný v audite */
    }
  }
  try {
    await posli(oznamZmenyEmailu(novy, stary ?? "—", novy));
    oznamy.novy = true;
  } catch {
    /* stav je zapísaný v audite */
  }

  await zapisAuditPo(db, o.adminId, "zmena_emailu_hotovo", o.userId, {
    stary,
    novy,
    pozvanky,
    ucty_zdarma: uctyZdarma,
    oznamy,
  });
  return { stary, novy, pozvanky, uctyZdarma, oznamy };
}
