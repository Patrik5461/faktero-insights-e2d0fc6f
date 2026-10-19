/*
  Registrácia účtu cez server Faktera.

  Prečo vôbec cez server: falošné účty z phishingového útoku vznikali priamym
  `supabase.auth.signUp` z prehliadača — server Faktera ich ani nevidel, takže
  nemal kde postaviť captchu ani obmedziť počet pokusov. Teraz registráciu
  (web, appka aj prijatie pozvánky) zakladá server cez admin API Supabase:

  - `auth.admin.generateLink({ type: "signup" })` vytvorí nepotvrdeného
    používateľa a vráti jednorazový kód. Funguje aj pri vypnutej verejnej
    registrácii („Allow new users to sign up“ off) — tú admin API nekontroluje
    (overené v zdrojáku supabase/auth, `adminGenerateLink`). Obyčajný `signUp`
    s anon kľúčom by po vypnutí registrácie padol aj na serveri.
  - Potvrdzovací e-mail pošle Faktero samo cez Resend s odkazom na
    `/auth/potvrdenie?token_hash=…&type=signup&next=…` — ten istý tvar ako
    šablóna v Supabase, overuje ho tá istá stránka (`verifyOtp`).
  - Spúšťač `auth_users_jednorazove` na `auth.users` platí aj pre admin API
    (je to `before insert` v databáze), jednorazové domény teda neprejdú ani tu.

  V e-maile zámerne nie je meno z formulára: pri útokoch tohto typu sa do mena
  píše text podvodu s odkazom a potvrdzovací e-mail od nás ho doručí obeti.
*/
import type { VysledokEmailu } from "./overenie-emailu.server";

/* ───────────── Turnstile ───────────── */

/** Hostitelia widgetu (rovnaké ako v nastavení widgetu v Cloudflare). */
export const HOSTY_TURNSTILE = new Set(["faktero.sk", "www.faktero.sk", "localhost"]);

/** `action` z widgetu — server ho porovná, token z inej stránky neprejde. */
export const AKCIE_TURNSTILE = ["registracia", "registracia-apka"] as const;

export type VysledokTurnstile =
  | { ok: true; hostname: string }
  | {
      ok: false;
      dovod:
        "chyba_tokenu" | "nenastavene" | "nedostupne" | "neplatny" | "zly_hostname" | "zla_akcia";
      kody?: string[];
    };

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Overí token z widgetu Turnstile. Pri akejkoľvek pochybnosti odmieta
 * (výpadok Cloudflare, timeout, chýbajúci kľúč) — registrácia sa dá zopakovať,
 * falošný účet sa späť nevezme.
 */
export async function overTurnstile(
  token: string | null | undefined,
  o: {
    secret: string | null | undefined;
    remoteip?: string | null;
    akcie?: readonly string[];
    fetchFn?: typeof fetch;
    casMs?: number;
  },
): Promise<VysledokTurnstile> {
  const t = String(token ?? "").trim();
  // Token má najviac 2048 znakov (dokumentácia Cloudflare).
  if (!t || t.length > 2048) return { ok: false, dovod: "chyba_tokenu" };
  if (!o.secret) {
    console.error("[registracia] chýba TURNSTILE_SECRET_KEY");
    return { ok: false, dovod: "nenastavene" };
  }
  const telo = new URLSearchParams({ secret: o.secret, response: t });
  if (o.remoteip) telo.set("remoteip", o.remoteip);
  let json: any;
  try {
    const r = await (o.fetchFn ?? fetch)(SITEVERIFY, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: telo.toString(),
      signal: AbortSignal.timeout(o.casMs ?? 8000),
    });
    if (!r.ok) return { ok: false, dovod: "nedostupne" };
    json = await r.json();
  } catch {
    return { ok: false, dovod: "nedostupne" };
  }
  if (json?.success !== true) {
    return {
      ok: false,
      dovod: "neplatny",
      kody: Array.isArray(json?.["error-codes"]) ? json["error-codes"] : [],
    };
  }
  const hostname = String(json.hostname ?? "").toLowerCase();
  if (!HOSTY_TURNSTILE.has(hostname)) return { ok: false, dovod: "zly_hostname" };
  if (o.akcie && json.action != null && !o.akcie.includes(String(json.action))) {
    return { ok: false, dovod: "zla_akcia" };
  }
  return { ok: true, hostname };
}

/* ───────────── IP klienta ───────────── */

/**
 * IP klienta z hlavičiek, ktorým sa dá veriť.
 *
 * `X-Real-IP` nastavuje nginx z `$remote_addr` a hodnotu od klienta prepíše.
 * Z `X-Forwarded-For` sa berie **posledná** položka — tú pridal nginx; prvé
 * položky si klient napíše, aké chce, a obchádzal by nimi limit pokusov.
 * `CF-Connecting-IP` sa nečíta vôbec: Faktero nie je za Cloudflare, takže by to
 * bola hlavička od klienta.
 */
export function ipKlienta(h: { get(n: string): string | null }): string | null {
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const posledna = xff
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .pop();
    if (posledna) return posledna;
  }
  return null;
}

/**
 * Verejná adresa? Router pred serverom dnes prepisuje zdroj na 192.168.1.1
 * (každá požiadavka má tú istú IP), takže limit „na IP“ by bol v skutočnosti
 * limit na celý svet. Súkromné a lokálne adresy sa preto za IP klienta neberú.
 */
export function jeVerejnaIp(ip: string | null | undefined): boolean {
  if (!ip) return false;
  let a = ip.trim().toLowerCase();
  if (a.startsWith("::ffff:")) a = a.slice(7);
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(a);
  if (v4) {
    const [x, y] = [Number(v4[1]), Number(v4[2])];
    if ([x, y, Number(v4[3]), Number(v4[4])].some((n) => n > 255)) return false;
    if (x === 10 || x === 127 || x === 0) return false;
    if (x === 172 && y >= 16 && y <= 31) return false;
    if (x === 192 && y === 168) return false;
    if (x === 169 && y === 254) return false;
    if (x === 100 && y >= 64 && y <= 127) return false; // CGNAT
    return true;
  }
  if (!a.includes(":")) return false;
  if (a === "::1" || a === "::") return false;
  if (/^f[cd]/.test(a)) return false; // fc00::/7
  if (/^fe[89ab]/.test(a)) return false; // fe80::/10
  return true;
}

/* ───────────── limit pokusov ───────────── */

/**
 * Posuvné okno v pamäti procesu. Stačí: Faktero beží ako jeden proces pm2
 * (bez `instances`), takže všetky požiadavky vidia to isté počítadlo. Reštart
 * ho vynuluje — to je prijateľné, limit je brzda, nie evidencia. Pri viacerých
 * procesoch by ho bolo treba presunúť do databázy.
 */
export class LimitPokusov {
  private zaznamy = new Map<string, number[]>();
  constructor(
    readonly max: number,
    readonly oknoMs: number,
    private teraz: () => number = () => Date.now(),
  ) {}

  /** Zaznamená pokus; `false`, keď by prekročil limit (vtedy sa nezaznamená). */
  skus(kluc: string): boolean {
    const t = this.teraz();
    const od = t - this.oknoMs;
    const casy = (this.zaznamy.get(kluc) ?? []).filter((c) => c > od);
    if (casy.length >= this.max) {
      this.zaznamy.set(kluc, casy);
      return false;
    }
    casy.push(t);
    this.zaznamy.set(kluc, casy);
    if (this.zaznamy.size > 5000) this.uprac(od);
    return true;
  }

  private uprac(od: number) {
    for (const [k, casy] of this.zaznamy) {
      if (!casy.some((c) => c > od)) this.zaznamy.delete(k);
    }
  }
}

const HODINA = 60 * 60 * 1000;

export type Limity = {
  /** Web s overenou captchou, na jednu verejnú IP. */
  webIp: LimitPokusov;
  /** Web s overenou captchou spolu — IP sa na routeri stráca, toto je strop navrchu. */
  webSpolu: LimitPokusov;
  /** Appka bez captchy, na jednu verejnú IP. */
  apkaIp: LimitPokusov;
  /** Appka bez captchy spolu — kto sa za appku vydáva, má málo pokusov. */
  apkaSpolu: LimitPokusov;
  /** Na jednu adresu (web, appka, pozvánka) — aby sa nedala zasypať e-mailmi. */
  email: LimitPokusov;
  /** Na jednu pozvánku. */
  pozvanka: LimitPokusov;
};

export function noveLimity(teraz?: () => number): Limity {
  return {
    webIp: new LimitPokusov(5, HODINA, teraz),
    webSpolu: new LimitPokusov(30, HODINA, teraz),
    apkaIp: new LimitPokusov(2, HODINA, teraz),
    apkaSpolu: new LimitPokusov(10, HODINA, teraz),
    email: new LimitPokusov(3, HODINA, teraz),
    pozvanka: new LimitPokusov(5, HODINA, teraz),
  };
}

let _limity: Limity | null = null;
function limityProcesu(): Limity {
  return (_limity ??= noveLimity());
}

/* ───────────── hlášky ───────────── */

/** Slovenské vety sú zároveň kľúče prekladu (`src/lib/i18n/{de,cs}/captcha.ts`). */
export const HLASKY_REGISTRACIE = {
  captcha: "Overenie, že nie ste robot, sa nepodarilo. Skúste to znova.",
  captchaNedostupna: "Overenie sa teraz nedá dokončiť. Skúste to o chvíľu znova.",
  limit: "Priveľa pokusov o registráciu. Skúste to o hodinu znova.",
  meno: "Meno nesmie obsahovať webovú ani e-mailovú adresu.",
  suhlasy: "Pre pokračovanie potvrďte obidva súhlasy.",
  heslo: "Heslo musí mať aspoň 8 znakov.",
  hesloDlhe: "Heslo môže mať najviac 72 znakov.",
  pozvanka: "Pozvánka je neplatná alebo jej platnosť vypršala.",
  zlyhanie: "Registrácia sa nepodarila. Skúste to o chvíľu znova.",
} as const;

export type VysledokRegistracie =
  | {
      ok: true;
      /** Potvrdzovací e-mail odišiel. `false` = účet je, nech si pošle e-mail znova. */
      emailOdoslany: boolean;
      /** Súhlasy sú zapísané na serveri — klient ich už neodkladá. */
      suhlasyZapisane: boolean;
      /** Len pozvánka: účet s touto adresou už existuje, treba sa prihlásiť heslom. */
      existuje?: boolean;
    }
  | {
      ok: false;
      sprava: string;
      parametre?: Record<string, string>;
      /** Token captchy je spotrebovaný alebo neplatný — widget treba resetovať. */
      captcha?: boolean;
    };

/* ───────────── vstup ───────────── */

export type JazykMailu = "sk" | "cs" | "de" | "en";

export function jazykMailu(j: unknown): JazykMailu {
  return j === "cs" || j === "de" || j === "en" ? j : "sk";
}

/** Meno bez odkazov a adries — text podvodu sa doň píše najčastejšie. */
export function menoJeBezpecne(meno: string): boolean {
  const m = meno.trim();
  if (!m || m.length > 100) return false;
  if (/[\u0000-\u001f\u007f<>]/.test(m)) return false;
  if (/https?:|www\.|@|:\/\//i.test(m)) return false;
  /*
    Doména typu „zly-web.com“ alebo „bit.ly/x“. Zoznam koncoviek, nie hocijaké
    „x.yz“ — inak by neprešlo „J.Novák“ či „Ing.Peter“.
  */
  if (
    /[a-z0-9-]\.(com|net|org|info|biz|sk|cz|de|at|eu|io|ly|me|co|us|uk|ru|xyz|top|site|online|app|shop|link|click|live|pro|gg|to|cc)(?![a-z0-9])/i.test(
      m,
    )
  )
    return false;
  return true;
}

export function normalizujEmail(e: string): string {
  return String(e ?? "")
    .trim()
    .toLowerCase();
}

/* ───────────── potvrdzovací e-mail ───────────── */

const TEXTY_MAILU: Record<
  JazykMailu,
  { predmet: string; nadpis: string; text: string; tlacidlo: string; alebo: string; nevy: string }
> = {
  sk: {
    predmet: "Potvrďte registráciu vo Faktere",
    nadpis: "Potvrďte svoju e-mailovú adresu",
    text: "Ďakujeme za registráciu vo Faktere. Účet aktivujete kliknutím na tlačidlo:",
    tlacidlo: "Potvrdiť e-mail",
    alebo: "Alebo skopírujte odkaz do prehliadača:",
    nevy: "Ak ste sa vo Faktere neregistrovali, tento e-mail ignorujte — bez potvrdenia sa účet nedá použiť.",
  },
  cs: {
    predmet: "Potvrďte registraci ve Fakteru",
    nadpis: "Potvrďte svou e-mailovou adresu",
    text: "Děkujeme za registraci ve Fakteru. Účet aktivujete kliknutím na tlačítko:",
    tlacidlo: "Potvrdit e-mail",
    alebo: "Nebo zkopírujte odkaz do prohlížeče:",
    nevy: "Pokud jste se ve Fakteru neregistrovali, tento e-mail ignorujte — bez potvrzení nelze účet použít.",
  },
  de: {
    predmet: "Bestätigen Sie Ihre Registrierung bei Faktero",
    nadpis: "Bestätigen Sie Ihre E-Mail-Adresse",
    text: "Vielen Dank für Ihre Registrierung bei Faktero. Aktivieren Sie Ihr Konto mit einem Klick auf die Schaltfläche:",
    tlacidlo: "E-Mail bestätigen",
    alebo: "Oder kopieren Sie den Link in Ihren Browser:",
    nevy: "Wenn Sie sich nicht bei Faktero registriert haben, ignorieren Sie diese E-Mail — ohne Bestätigung kann das Konto nicht verwendet werden.",
  },
  en: {
    predmet: "Confirm your Faktero registration",
    nadpis: "Confirm your email address",
    text: "Thank you for signing up for Faktero. Activate your account by clicking the button:",
    tlacidlo: "Confirm email",
    alebo: "Or copy the link into your browser:",
    nevy: "If you did not sign up for Faktero, ignore this email — the account cannot be used without confirmation.",
  },
};

export function odkazPotvrdenia(zaklad: string, hashedToken: string, next: string): string {
  const z = zaklad.replace(/\/+$/, "");
  return `${z}/auth/potvrdenie?token_hash=${encodeURIComponent(hashedToken)}&type=signup&next=${encodeURIComponent(next)}`;
}

export function mailPotvrdenia(
  odkaz: string,
  jazyk: JazykMailu,
): { predmet: string; html: string; text: string } {
  const t = TEXTY_MAILU[jazyk];
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const u = esc(odkaz);
  const html = `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#111;max-width:560px">
  <h2 style="margin:0 0 12px">${t.nadpis}</h2>
  <p>${t.text}</p>
  <p><a href="${u}" style="background:#16a34a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">${t.tlacidlo}</a></p>
  <p style="color:#666;font-size:12px">${t.alebo}<br/>${u}</p>
  <p style="color:#666;font-size:12px">${t.nevy}</p>
  <p style="color:#666;font-size:12px">Faktero · <a href="https://www.faktero.sk" style="color:#666">www.faktero.sk</a></p>
</div>`;
  const text = `${t.nadpis}\n\n${t.text}\n${odkaz}\n\n${t.nevy}\n\nFaktero · www.faktero.sk`;
  return { predmet: t.predmet, html, text };
}

/* ───────────── závislosti (v testoch sa podsúvajú) ───────────── */

export type VysledokOdkazu =
  | { ok: true; userId: string; hashedToken: string }
  | { ok: false; existuje: true }
  | { ok: false; existuje: false; chyba: string };

export type Zavislosti = {
  overTurnstile: (token: string | null, remoteip: string | null) => Promise<VysledokTurnstile>;
  overEmail: (email: string) => Promise<VysledokEmailu>;
  generujOdkaz: (p: {
    email: string;
    heslo: string;
    data: Record<string, unknown>;
    redirectTo: string;
  }) => Promise<VysledokOdkazu>;
  posliMail: (p: {
    email: string;
    predmet: string;
    html: string;
    text: string;
  }) => Promise<boolean>;
  zapisSuhlasy: (userId: string, ip: string | null, ua: string | null) => Promise<boolean>;
  nacitajPozvanku: (token: string) => Promise<{ email: string } | null>;
  limity: Limity;
  zaklad: string;
};

export function predvoleneZavislosti(): Zavislosti {
  return {
    overTurnstile: (token, remoteip) =>
      overTurnstile(token, {
        secret: process.env.TURNSTILE_SECRET_KEY,
        remoteip,
        akcie: AKCIE_TURNSTILE,
      }),
    overEmail: async (email) => {
      const { overEmailNaRegistraciu } = await import("./overenie-emailu.server");
      return overEmailNaRegistraciu(email);
    },
    generujOdkaz: async ({ email, heslo, data, redirectTo }) => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: d, error } = await supabaseAdmin.auth.admin.generateLink({
        type: "signup",
        email,
        password: heslo,
        options: { data, redirectTo },
      });
      if (error) {
        const kod = String((error as any).code ?? "");
        if (kod === "email_exists" || /already (been )?registered/i.test(error.message)) {
          return { ok: false, existuje: true };
        }
        return { ok: false, existuje: false, chyba: error.message };
      }
      const userId = d?.user?.id;
      const hashedToken = d?.properties?.hashed_token;
      if (!userId || !hashedToken) {
        return { ok: false, existuje: false, chyba: "generateLink nevrátil kód" };
      }
      return { ok: true, userId, hashedToken };
    },
    posliMail: async ({ email, predmet, html, text }) => {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        console.error("[registracia] chýba RESEND_API_KEY");
        return false;
      }
      const od = process.env.RESEND_FROM_EMAIL || "faktury@faktero.sk";
      try {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            from: `Faktero <${od}>`,
            to: [email],
            reply_to: "podpora@faktero.sk",
            subject: predmet,
            html,
            text,
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!r.ok) console.error("[registracia] Resend odmietol e-mail", r.status);
        return r.ok;
      } catch (e: any) {
        console.error("[registracia] e-mail neodišiel", e?.message ?? e);
        return false;
      }
    },
    zapisSuhlasy: async (userId, ip, ua) => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { DOKUMENTY_REGISTRACIE } = await import("./pravne-suhlasy");
      const { error } = await supabaseAdmin.from("legal_acceptances").insert(
        DOKUMENTY_REGISTRACIE.map((d) => ({
          user_id: userId,
          document_type: d.document_type,
          version: d.version,
          ip_address: ip,
          user_agent: ua ? ua.slice(0, 500) : null,
        })),
      );
      if (error) console.error("[registracia] súhlasy sa nezapísali", error.message);
      return !error;
    },
    nacitajPozvanku: async (token) => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data } = await supabaseAdmin
        .from("company_invitations")
        .select("email, expires_at, accepted_at")
        .eq("token", token)
        .maybeSingle();
      if (!data || data.accepted_at || new Date(data.expires_at) < new Date()) return null;
      return { email: String(data.email) };
    },
    limity: limityProcesu(),
    zaklad: (process.env.APP_PUBLIC_URL ?? "https://www.faktero.sk").replace(/\/+$/, ""),
  };
}

/* ───────────── registrácia ───────────── */

export type VstupRegistracie = {
  email: string;
  heslo: string;
  meno: string;
  jazyk?: string | null;
  /** Token z widgetu Turnstile. Appka ho môže vynechať (pozri `zApky`). */
  token?: string | null;
  podmienky: boolean;
  gdpr: boolean;
};

export type KontextPoziadavky = {
  ip: string | null;
  ua: string | null;
  /**
   * Požiadavka prišla cez most appky (`/api/mobil/…`). Vo WebView appky sa
   * captcha nemusí načítať, preto tam token nie je povinný — ale bez neho
   * platia prísne limity. Hlavičku si vie podvrhnúť ktokoľvek, takže „appka
   * bez tokenu“ je zámerne najužšia cesta.
   */
  zApky: boolean;
};

function chybaAuth(sprava: string): VysledokRegistracie {
  return { ok: false, sprava };
}

async function dokonciZalozenie(
  z: Zavislosti,
  p: {
    email: string;
    heslo: string;
    data: Record<string, unknown>;
    next: string;
    jazyk: JazykMailu;
  },
): Promise<
  | { ok: true; userId: string | null; emailOdoslany: boolean; existuje: boolean }
  | VysledokRegistracie
> {
  const { prelozAuthChybu } = await import("./auth-chyby");
  const odkaz = await z.generujOdkaz({
    email: p.email,
    heslo: p.heslo,
    data: p.data,
    redirectTo: `${z.zaklad}${p.next}`,
  });
  if (!odkaz.ok) {
    if (odkaz.existuje) return { ok: true, userId: null, emailOdoslany: false, existuje: true };
    console.error("[registracia] generateLink zlyhal", odkaz.chyba);
    return chybaAuth(prelozAuthChybu(odkaz.chyba).sprava);
  }
  const mail = mailPotvrdenia(odkazPotvrdenia(z.zaklad, odkaz.hashedToken, p.next), p.jazyk);
  const emailOdoslany = await z.posliMail({ email: p.email, ...mail });
  return { ok: true, userId: odkaz.userId, emailOdoslany, existuje: false };
}

export async function registrujUcet(
  v: VstupRegistracie,
  k: KontextPoziadavky,
  z: Zavislosti = predvoleneZavislosti(),
): Promise<VysledokRegistracie> {
  const email = normalizujEmail(v.email);
  const meno = String(v.meno ?? "").trim();
  if (!v.podmienky || !v.gdpr) return chybaAuth(HLASKY_REGISTRACIE.suhlasy);
  if (String(v.heslo ?? "").length < 8) return chybaAuth(HLASKY_REGISTRACIE.heslo);
  // bcrypt v Supabase berie len prvých 72 bajtov — dlhšie heslo by klamalo.
  if (new TextEncoder().encode(v.heslo).length > 72) return chybaAuth(HLASKY_REGISTRACIE.hesloDlhe);
  if (!menoJeBezpecne(meno)) return chybaAuth(HLASKY_REGISTRACIE.meno);

  const verejnaIp = jeVerejnaIp(k.ip) ? k.ip : null;
  const token = String(v.token ?? "").trim();
  const bezCaptchy = k.zApky && !token;

  if (!bezCaptchy) {
    const c = await z.overTurnstile(token || null, verejnaIp);
    if (!c.ok) {
      if (c.dovod !== "chyba_tokenu")
        console.warn("[registracia] captcha odmietnutá", c.dovod, c.ok === false ? c.kody : "");
      return {
        ok: false,
        sprava:
          c.dovod === "nedostupne" || c.dovod === "nenastavene"
            ? HLASKY_REGISTRACIE.captchaNedostupna
            : HLASKY_REGISTRACIE.captcha,
        captcha: true,
      };
    }
  }

  // Limity až po captche: kto ju nevyriešil, nemá ich ako vyčerpať ostatným.
  const L = z.limity;
  const limitIp = bezCaptchy ? L.apkaIp : L.webIp;
  const limitSpolu = bezCaptchy ? L.apkaSpolu : L.webSpolu;
  if (
    (verejnaIp && !limitIp.skus(verejnaIp)) ||
    !L.email.skus(email) ||
    !limitSpolu.skus("vsetci")
  ) {
    console.warn("[registracia] limit pokusov", { bezCaptchy, ip: verejnaIp ?? "neznáma" });
    return { ok: false, sprava: HLASKY_REGISTRACIE.limit, captcha: true };
  }

  const overenie = await z.overEmail(email);
  if (!overenie.ok) {
    return {
      ok: false,
      sprava: overenie.sprava,
      parametre: { domena: overenie.domena },
      captcha: true,
    };
  }

  const vysledok = await dokonciZalozenie(z, {
    email,
    heslo: v.heslo,
    // Presne to, čo posielala registrácia z prehliadača aj z appky.
    data: { full_name: meno },
    next: "/dashboard",
    jazyk: jazykMailu(v.jazyk),
  });
  if (!("userId" in vysledok)) return { ...vysledok, captcha: true } as VysledokRegistracie;

  /*
    Existujúci potvrdený účet: odpoveď je rovnaká ako pri novom (človek čaká
    na e-mail), aby sa registráciou nedalo zisťovať, kto má vo Faktere účet.
    Tak to robil aj `signUp` Supabase. E-mail sa neposiela.
  */
  if (vysledok.existuje || !vysledok.userId) {
    return { ok: true, emailOdoslany: true, suhlasyZapisane: false };
  }
  const suhlasyZapisane = await z.zapisSuhlasy(vysledok.userId, k.ip, k.ua);
  return { ok: true, emailOdoslany: vysledok.emailOdoslany, suhlasyZapisane };
}

/* ───────────── pozvánka ───────────── */

export async function registrujPozvaneho(
  v: { token: string; heslo: string; jazyk?: string | null },
  z: Zavislosti = predvoleneZavislosti(),
): Promise<VysledokRegistracie> {
  if (String(v.heslo ?? "").length < 8) return chybaAuth(HLASKY_REGISTRACIE.heslo);
  if (new TextEncoder().encode(v.heslo).length > 72) return chybaAuth(HLASKY_REGISTRACIE.hesloDlhe);
  /*
    Captcha tu nie je: platný token pozvánky (48 hex znakov, prišiel e-mailom
    a vydal ho admin firmy) je silnejší doklad ako captcha. Adresa sa berie
    z pozvánky, nie zo vstupu — token nedovolí založiť účet na cudzí e-mail.
  */
  if (!z.limity.pozvanka.skus(v.token)) return chybaAuth(HLASKY_REGISTRACIE.limit);
  const pozvanka = await z.nacitajPozvanku(v.token);
  if (!pozvanka) return chybaAuth(HLASKY_REGISTRACIE.pozvanka);
  const email = normalizujEmail(pozvanka.email);
  if (!z.limity.email.skus(email)) return chybaAuth(HLASKY_REGISTRACIE.limit);

  const vysledok = await dokonciZalozenie(z, {
    email,
    heslo: v.heslo,
    data: {},
    // Po potvrdení e-mailu sa človek vráti na pozvánku a tá sa prijme sama.
    next: `/pridat-pouzivatela?token=${v.token}`,
    jazyk: jazykMailu(v.jazyk),
  });
  if (!("userId" in vysledok)) return vysledok as VysledokRegistracie;
  // Pozvaný už účet má — tu to povedať možno (pozná token), prihlási sa heslom.
  if (vysledok.existuje)
    return { ok: true, emailOdoslany: false, suhlasyZapisane: false, existuje: true };
  return { ok: true, emailOdoslany: vysledok.emailOdoslany, suhlasyZapisane: false };
}

/** Verejný kľúč widgetu — pre web aj appku. */
export function nastavenieRegistracie(): { siteKey: string | null } {
  return { siteKey: process.env.TURNSTILE_SITE_KEY || null };
}
