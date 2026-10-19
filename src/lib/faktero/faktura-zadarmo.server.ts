/*
  „Faktúra zadarmo“ na serveri — PDF pre človeka bez účtu.

  Ochrana proti zneužitiu:
  - captcha Cloudflare Turnstile (to isté overenie ako registrácia, vlastná
    `action`, takže token z registrácie tu neprejde a naopak),
  - limit PDF na verejnú IP a strop navrchu pre všetkých spolu — IP sa dnes na
    routeri stráca (pozri `jeVerejnaIp`), takže v praxi drží hlavne strop,
  - tvar a dĺžky vstupu (zod + `ocistiFakturu`), najviac 50 položiek,
    logo len PNG/JPEG do 250 kB overené podľa prvých bajtov,
  - nič sa neukladá do databázy a nič sa neposiela e-mailom. PDF dostane
    späť len ten, kto ho vyplnil (žiadne odoslanie z našej domény).

  Vyhľadanie firmy podľa IČO je tiež bez prihlásenia, s vlastným limitom.
  Slovenská firma ide cez FinStat (platený, s 24 h vyrovnávacou pamäťou
  `company_cache`), česká rovno cez ARES (verejný, zadarmo).
*/
import {
  FakturaZadarmoZ,
  LIMITY_ZADARMO,
  LogoZ,
  nazovSuboruZadarmo,
  naVstupPdf,
  ocistiFakturu,
  skontrolujFakturuZadarmo,
  trebaKurz,
  type FakturaZadarmo,
} from "./faktura-zadarmo";
import {
  LimitPokusov,
  jeVerejnaIp,
  overTurnstile,
  type VysledokTurnstile,
} from "./registracia.server";

const HODINA = 60 * 60 * 1000;

export const AKCIA_TURNSTILE_ZADARMO = "faktura-zadarmo";

export const HLASKY_ZADARMO = {
  vstup: "Skontrolujte údaje faktúry.",
  captcha: "Overenie, že nie ste robot, sa nepodarilo. Skúste to znova.",
  captchaNedostupna: "Overenie sa teraz nedá dokončiť. Skúste to o chvíľu znova.",
  limit: "Dosiahli ste limit bezplatných faktúr na hodinu. Skúste to neskôr alebo si založte účet.",
  logo: "Logo musí byť obrázok PNG alebo JPG do 250 kB.",
  zlyhanie: "PDF sa nepodarilo vytvoriť. Skúste to o chvíľu znova.",
  ico: "Zadajte IČO s 6 až 8 číslicami.",
  limitHladania: "Priveľa vyhľadávaní. Údaje firmy vyplňte ručne alebo to skúste o chvíľu.",
  nenajdene: "Firmu s týmto IČO sme v registri nenašli.",
  hladanieNedostupne: "Register firiem teraz neodpovedá. Údaje vyplňte ručne.",
} as const;

export type LimityZadarmo = {
  pdfIp: LimitPokusov;
  pdfSpolu: LimitPokusov;
  hladanieIp: LimitPokusov;
  hladanieSpolu: LimitPokusov;
};

export function noveLimityZadarmo(teraz?: () => number): LimityZadarmo {
  return {
    pdfIp: new LimitPokusov(10, HODINA, teraz),
    pdfSpolu: new LimitPokusov(300, HODINA, teraz),
    hladanieIp: new LimitPokusov(20, HODINA, teraz),
    hladanieSpolu: new LimitPokusov(120, HODINA, teraz),
  };
}

let _limity: LimityZadarmo | null = null;
const limityProcesu = () => (_limity ??= noveLimityZadarmo());

/* ───────────── logo ───────────── */

/** Rozbalí logo z base64 a overí, že je to naozaj PNG alebo JPEG. */
export function overLogo(
  logo: { mime: string; base64: string } | null | undefined,
): { ok: true; bajty: Uint8Array | null; mime: string | null } | { ok: false } {
  if (!logo || !logo.base64) return { ok: true, bajty: null, mime: null };
  const b64 = logo.base64.replace(/^data:[^,]*,/, "");
  if (!/^[A-Za-z0-9+/=\s]+$/.test(b64)) return { ok: false };
  const bajty = new Uint8Array(Buffer.from(b64, "base64"));
  if (bajty.length === 0 || bajty.length > LIMITY_ZADARMO.logoBajtov) return { ok: false };
  const png = bajty[0] === 0x89 && bajty[1] === 0x50 && bajty[2] === 0x4e && bajty[3] === 0x47;
  const jpg = bajty[0] === 0xff && bajty[1] === 0xd8 && bajty[2] === 0xff;
  if (logo.mime === "image/png" && png) return { ok: true, bajty, mime: "image/png" };
  if (logo.mime === "image/jpeg" && jpg) return { ok: true, bajty, mime: "image/jpeg" };
  return { ok: false };
}

/* ───────────── závislosti ───────────── */

export type KurzZadarmo = {
  kurz: number;
  den: string;
  zdroj: string;
  zaklad: number;
  dan: number;
  celkom: number;
} | null;

export type ZavislostiZadarmo = {
  overTurnstile: (token: string | null, remoteip: string | null) => Promise<VysledokTurnstile>;
  limity: LimityZadarmo;
  /** Prepočet dane do domácej meny (cudzia mena u platiteľa). */
  prepocet: (
    f: FakturaZadarmo,
    sumy: { zaklad: number; dan: number; celkom: number },
  ) => Promise<KurzZadarmo>;
  generujPdf: (vstup: any) => Promise<Uint8Array>;
};

export function predvoleneZavislostiZadarmo(): ZavislostiZadarmo {
  return {
    overTurnstile: (token, remoteip) =>
      overTurnstile(token, {
        secret: process.env.TURNSTILE_SECRET_KEY,
        remoteip,
        akcie: [AKCIA_TURNSTILE_ZADARMO],
      }),
    limity: limityProcesu(),
    prepocet: async (f, sumy) => {
      const { prepocitajDoklad } = await import("./kurzy.server");
      return prepocitajDoklad(
        f.mena,
        f.datumDodania || f.datumVystavenia,
        sumy,
        f.krajina === "CZ" ? "CZ" : "SK",
      );
    },
    generujPdf: async (vstup) => {
      const { generateInvoicePdfBytes } = await import("./pdf-generator.server");
      return generateInvoicePdfBytes(vstup);
    },
  };
}

/* ───────────── PDF ───────────── */

export type VysledokZadarmo =
  | { ok: true; pdf: string; nazov: string }
  | {
      ok: false;
      sprava: string;
      parametre?: Record<string, string | number>;
      /** Token captchy je spotrebovaný alebo neplatný — widget treba resetovať. */
      captcha?: boolean;
      /** Chyby pri poliach (kontrola náležitostí). */
      polia?: { pole: string; sprava: string; parametre?: Record<string, string | number> }[];
    };

/** Postaví PDF bez captchy a limitov — pre testy a pre `generujFakturuZadarmo`. */
export async function pdfFakturyZadarmo(
  f: FakturaZadarmo,
  logo: { bajty: Uint8Array | null; mime: string | null },
  z: Pick<ZavislostiZadarmo, "prepocet" | "generujPdf">,
): Promise<Uint8Array> {
  const vstup = naVstupPdf(f);
  if (trebaKurz(f)) {
    const i = vstup.invoice;
    try {
      const p = await z.prepocet(f, { zaklad: i.subtotal, dan: i.vat_total, celkom: i.total });
      if (p) {
        Object.assign(i, {
          exchange_rate: p.kurz,
          exchange_rate_date: p.den,
          exchange_rate_source: p.zdroj,
          subtotal_eur: p.zaklad,
          vat_total_eur: p.dan,
          total_eur: p.celkom,
        });
      }
    } catch (e) {
      console.warn("[faktura-zadarmo] kurz sa nepodarilo zistiť:", (e as Error)?.message ?? e);
    }
  }
  return z.generujPdf({ ...vstup, logoBytes: logo.bajty, logoMime: logo.mime });
}

export async function generujFakturuZadarmo(
  v: { faktura?: unknown; logo?: unknown; token?: string | null },
  k: { ip: string | null },
  z: ZavislostiZadarmo = predvoleneZavislostiZadarmo(),
): Promise<VysledokZadarmo> {
  // 1. Tvar a čistenie — pred captchou, aby preklep nespálil token.
  const tvar = FakturaZadarmoZ.safeParse(v.faktura);
  if (!tvar.success) return { ok: false, sprava: HLASKY_ZADARMO.vstup };
  const f = ocistiFakturu(tvar.data);
  const chyby = skontrolujFakturuZadarmo(f);
  if (chyby.length) {
    return { ok: false, sprava: chyby[0].sprava, parametre: chyby[0].parametre, polia: chyby };
  }
  const logoTvar = LogoZ.safeParse(v.logo ?? null);
  if (!logoTvar.success) return { ok: false, sprava: HLASKY_ZADARMO.logo };
  const logo = overLogo(logoTvar.data);
  if (!logo.ok) return { ok: false, sprava: HLASKY_ZADARMO.logo };

  // 2. Captcha.
  const verejnaIp = jeVerejnaIp(k.ip) ? k.ip : null;
  const c = await z.overTurnstile(String(v.token ?? "").trim() || null, verejnaIp);
  if (!c.ok) {
    if (c.dovod !== "chyba_tokenu") console.warn("[faktura-zadarmo] captcha odmietnutá", c.dovod);
    return {
      ok: false,
      sprava:
        c.dovod === "nedostupne" || c.dovod === "nenastavene"
          ? HLASKY_ZADARMO.captchaNedostupna
          : HLASKY_ZADARMO.captcha,
      captcha: true,
    };
  }

  // 3. Limity až po captche — kto ju nevyriešil, nemá ich ako vyčerpať ostatným.
  if ((verejnaIp && !z.limity.pdfIp.skus(verejnaIp)) || !z.limity.pdfSpolu.skus("vsetci")) {
    console.warn("[faktura-zadarmo] limit PDF", { ip: verejnaIp ?? "neznáma" });
    return { ok: false, sprava: HLASKY_ZADARMO.limit, captcha: true };
  }

  // 4. PDF — nič sa neukladá, vracia sa len volajúcemu.
  try {
    const bajty = await pdfFakturyZadarmo(f, logo, z);
    return {
      ok: true,
      pdf: Buffer.from(bajty).toString("base64"),
      nazov: nazovSuboruZadarmo(f.cislo),
    };
  } catch (e) {
    console.error("[faktura-zadarmo] PDF zlyhalo", (e as Error)?.message ?? e);
    return { ok: false, sprava: HLASKY_ZADARMO.zlyhanie, captcha: true };
  }
}

/* ───────────── vyhľadanie firmy ───────────── */

export type FirmaZadarmo = {
  nazov: string;
  ulica: string;
  mesto: string;
  psc: string;
  dic: string;
  icDph: string;
  platitel: boolean | null;
};

export type VysledokHladania = { ok: true; firma: FirmaZadarmo } | { ok: false; sprava: string };

export type ZavislostiHladania = {
  limity: LimityZadarmo;
  sk: (ico: string) => Promise<FirmaZadarmo | null | "chyba">;
  cz: (ico: string) => Promise<FirmaZadarmo | null | "chyba">;
};

export function predvoleneZavislostiHladania(): ZavislostiHladania {
  return {
    limity: limityProcesu(),
    sk: async (ico) => {
      const { lookupCompany, isRegistryConfigured } = await import("./company-registry.server");
      if (!isRegistryConfigured()) return "chyba";
      const r = await lookupCompany(ico);
      if (r.status === "error") return "chyba";
      if (r.status === "not_found") return null;
      const d = r.data;
      return {
        nazov: String(d.name ?? ""),
        ulica: String(d.street ?? ""),
        mesto: String(d.city ?? ""),
        psc: String(d.zip ?? ""),
        dic: String(d.dic ?? ""),
        icDph: String(d.ic_dph ?? ""),
        platitel: d.vatStatus === "Áno" ? true : d.vatStatus === "Nie" ? false : null,
      };
    },
    cz: async (ico) => {
      const { firmaZAres } = await import("./ares.server");
      const a = await firmaZAres(ico);
      if (!a || !a.nazov) return null;
      const dic = a.dic
        ? a.dic.toUpperCase().startsWith("CZ")
          ? a.dic.toUpperCase()
          : `CZ${a.dic}`
        : "";
      return {
        nazov: a.nazov,
        ulica: a.ulica ?? "",
        mesto: a.mesto ?? "",
        psc: a.psc ?? "",
        dic,
        icDph: a.platitelDph && dic ? dic : "",
        platitel: a.platitelDph ?? null,
      };
    },
  };
}

export async function vyhladajFirmuZadarmo(
  v: { ico: string; krajina: "SK" | "CZ" },
  k: { ip: string | null },
  z: ZavislostiHladania = predvoleneZavislostiHladania(),
): Promise<VysledokHladania> {
  const ico = String(v.ico ?? "").replace(/\s+/g, "");
  if (!/^\d{6,8}$/.test(ico)) return { ok: false, sprava: HLASKY_ZADARMO.ico };
  const verejnaIp = jeVerejnaIp(k.ip) ? k.ip : null;
  if (
    (verejnaIp && !z.limity.hladanieIp.skus(verejnaIp)) ||
    !z.limity.hladanieSpolu.skus("vsetci")
  ) {
    return { ok: false, sprava: HLASKY_ZADARMO.limitHladania };
  }
  try {
    const r = await (v.krajina === "CZ" ? z.cz(ico.padStart(8, "0")) : z.sk(ico));
    if (r === "chyba") return { ok: false, sprava: HLASKY_ZADARMO.hladanieNedostupne };
    if (!r) return { ok: false, sprava: HLASKY_ZADARMO.nenajdene };
    return { ok: true, firma: r };
  } catch (e) {
    console.warn("[faktura-zadarmo] vyhľadanie firmy zlyhalo", (e as Error)?.message ?? e);
    return { ok: false, sprava: HLASKY_ZADARMO.hladanieNedostupne };
  }
}
