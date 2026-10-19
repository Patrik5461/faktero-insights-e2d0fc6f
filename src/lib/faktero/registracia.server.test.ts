import { describe, it, expect, vi } from "vitest";
import {
  HLASKY_REGISTRACIE,
  LimitPokusov,
  ipKlienta,
  jeVerejnaIp,
  mailPotvrdenia,
  menoJeBezpecne,
  noveLimity,
  odkazPotvrdenia,
  overTurnstile,
  registrujPozvaneho,
  registrujUcet,
  type Zavislosti,
} from "./registracia.server";
import { bezpecnyCiel } from "./auth-potvrdenie";
import deCaptcha from "@/lib/i18n/de/captcha";
import csCaptcha from "@/lib/i18n/cs/captcha";

const odpoved = (json: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(json), { status }));

describe("overTurnstile", () => {
  const zaklad = { secret: "tajne", akcie: ["registracia", "registracia-apka"] };

  it("prijme úspešný token z nášho hostiteľa a pošle secret, response aj remoteip", async () => {
    const fetchFn = vi.fn((_u: any, _i: any) =>
      odpoved({ success: true, hostname: "www.faktero.sk", action: "registracia" }),
    );
    const v = await overTurnstile("tok", {
      ...zaklad,
      remoteip: "1.2.3.4",
      fetchFn: fetchFn as any,
    });
    expect(v).toEqual({ ok: true, hostname: "www.faktero.sk" });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const telo = new URLSearchParams(String(init.body));
    expect(telo.get("secret")).toBe("tajne");
    expect(telo.get("response")).toBe("tok");
    expect(telo.get("remoteip")).toBe("1.2.3.4");
  });

  it("bez remoteip ho nepošle", async () => {
    const fetchFn = vi.fn((_u: any, _i: any) => odpoved({ success: true, hostname: "localhost" }));
    await overTurnstile("tok", { ...zaklad, fetchFn: fetchFn as any });
    expect(new URLSearchParams(String(fetchFn.mock.calls[0][1].body)).has("remoteip")).toBe(false);
  });

  it("odmietne neúspešné overenie", async () => {
    const fetchFn = vi.fn(() =>
      odpoved({ success: false, "error-codes": ["invalid-input-response"] }),
    );
    const v = await overTurnstile("tok", { ...zaklad, fetchFn: fetchFn as any });
    expect(v).toMatchObject({ ok: false, dovod: "neplatny", kody: ["invalid-input-response"] });
  });

  it("odmietne cudzí hostname", async () => {
    const fetchFn = vi.fn(() => odpoved({ success: true, hostname: "zly-web.com" }));
    expect(await overTurnstile("tok", { ...zaklad, fetchFn: fetchFn as any })).toMatchObject({
      ok: false,
      dovod: "zly_hostname",
    });
  });

  it("odmietne cudziu akciu", async () => {
    const fetchFn = vi.fn(() =>
      odpoved({ success: true, hostname: "faktero.sk", action: "prihlasenie" }),
    );
    expect(await overTurnstile("tok", { ...zaklad, fetchFn: fetchFn as any })).toMatchObject({
      ok: false,
      dovod: "zla_akcia",
    });
  });

  it("timeout alebo výpadok siete → odmietne", async () => {
    const fetchFn = vi.fn(
      (_u: any, init: any) =>
        new Promise<Response>((_, nie) => {
          init.signal.addEventListener("abort", () =>
            nie(new DOMException("timeout", "TimeoutError")),
          );
        }),
    );
    const v = await overTurnstile("tok", { ...zaklad, fetchFn: fetchFn as any, casMs: 20 });
    expect(v).toMatchObject({ ok: false, dovod: "nedostupne" });
  });

  it("chyba 5xx → odmietne", async () => {
    const fetchFn = vi.fn(() => odpoved({}, 503));
    expect(await overTurnstile("tok", { ...zaklad, fetchFn: fetchFn as any })).toMatchObject({
      ok: false,
      dovod: "nedostupne",
    });
  });

  it("prázdny token a chýbajúci secret odmietne bez volania Cloudflare", async () => {
    const fetchFn = vi.fn();
    expect(await overTurnstile("", { ...zaklad, fetchFn: fetchFn as any })).toMatchObject({
      dovod: "chyba_tokenu",
    });
    expect(await overTurnstile("tok", { secret: "", fetchFn: fetchFn as any })).toMatchObject({
      dovod: "nenastavene",
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("IP klienta", () => {
  it("verí X-Real-IP a poslednej položke X-Forwarded-For, nie CF-Connecting-IP", () => {
    expect(ipKlienta(new Headers({ "x-real-ip": "8.8.8.8", "x-forwarded-for": "1.1.1.1" }))).toBe(
      "8.8.8.8",
    );
    expect(ipKlienta(new Headers({ "x-forwarded-for": "6.6.6.6, 9.9.9.9" }))).toBe("9.9.9.9");
    expect(ipKlienta(new Headers({ "cf-connecting-ip": "6.6.6.6" }))).toBeNull();
  });

  it("súkromné a lokálne adresy nie sú verejné (router ich prepisuje na 192.168.1.1)", () => {
    for (const ip of [
      "192.168.1.1",
      "10.0.0.5",
      "172.16.3.1",
      "127.0.0.1",
      "::1",
      "fe80::1",
      "fd00::2",
      "::ffff:192.168.1.1",
      "100.64.0.1",
    ]) {
      expect(jeVerejnaIp(ip), ip).toBe(false);
    }
    for (const ip of ["8.8.8.8", "185.12.1.4", "2a00:1450::1", "::ffff:8.8.4.4"]) {
      expect(jeVerejnaIp(ip), ip).toBe(true);
    }
  });
});

describe("LimitPokusov", () => {
  it("pustí max pokusov za okno a po ňom znova", () => {
    let t = 0;
    const l = new LimitPokusov(3, 1000, () => t);
    expect([l.skus("a"), l.skus("a"), l.skus("a"), l.skus("a")]).toEqual([true, true, true, false]);
    expect(l.skus("b")).toBe(true);
    t = 1001;
    expect(l.skus("a")).toBe(true);
  });
});

describe("meno a e-mail", () => {
  it("meno s odkazom neprejde, bežné mená áno", () => {
    for (const m of ["Ján Novák", "Ing. Peter Kováč, PhD.", "J.Novák", "Müller GmbH"])
      expect(menoJeBezpecne(m), m).toBe(true);
    for (const m of [
      "Výhra! http://x.y",
      "pozri www.zly",
      "info@zly.sk",
      "bit.ly/abc",
      "zly-web.com výhra",
      "",
      "a".repeat(101),
    ])
      expect(menoJeBezpecne(m), m).toBe(false);
  });

  it("odkaz vedie cez /auth/potvrdenie a cieľ prejde bezpečnostnou kontrolou", () => {
    const o = odkazPotvrdenia("https://www.faktero.sk/", "ab12cd", "/pridat-pouzivatela?token=abc");
    const u = new URL(o);
    expect(u.origin + u.pathname).toBe("https://www.faktero.sk/auth/potvrdenie");
    expect(u.searchParams.get("token_hash")).toBe("ab12cd");
    expect(u.searchParams.get("type")).toBe("signup");
    expect(bezpecnyCiel(u.searchParams.get("next"), u.origin)).toBe(
      "/pridat-pouzivatela?token=abc",
    );
  });

  it("e-mail je v jazyku a obsahuje odkaz", () => {
    const m = mailPotvrdenia(
      "https://www.faktero.sk/auth/potvrdenie?token_hash=x&type=signup&next=%2F",
      "de",
    );
    expect(m.predmet).toContain("Faktero");
    expect(m.html).toContain("token_hash=x&amp;type=signup");
    expect(m.text).toContain("token_hash=x&type=signup");
  });
});

function zavislosti(nad: Partial<Zavislosti> = {}): Zavislosti & { mocky: Record<string, any> } {
  const mocky = {
    overTurnstile: vi.fn(async () => ({ ok: true as const, hostname: "www.faktero.sk" })),
    overEmail: vi.fn(async () => ({ ok: true as const })),
    generujOdkaz: vi.fn(async () => ({
      ok: true as const,
      userId: "u1",
      hashedToken: "h".repeat(56),
    })),
    posliMail: vi.fn(async () => true),
    zapisSuhlasy: vi.fn(async () => true),
    nacitajPozvanku: vi.fn(async () => ({ email: "Pozvany@Firma.sk" })),
  };
  return { ...mocky, limity: noveLimity(), zaklad: "https://www.faktero.sk", ...nad, mocky } as any;
}

const vstup = {
  email: " Jan@Firma.SK ",
  heslo: "tajneheslo",
  meno: "Ján Novák",
  jazyk: "cs",
  token: "tok",
  podmienky: true,
  gdpr: true,
};
const web = { ip: "8.8.8.8", ua: "test", zApky: false };

describe("registrujUcet", () => {
  it("prenesie meno do metadát, cieľ /dashboard, pošle e-mail a zapíše súhlasy", async () => {
    const z = zavislosti();
    const v = await registrujUcet(vstup, web, z);
    expect(v).toEqual({ ok: true, emailOdoslany: true, suhlasyZapisane: true });
    expect(z.mocky.overTurnstile).toHaveBeenCalledWith("tok", "8.8.8.8");
    expect(z.mocky.generujOdkaz).toHaveBeenCalledWith({
      email: "jan@firma.sk",
      heslo: "tajneheslo",
      data: { full_name: "Ján Novák" },
      redirectTo: "https://www.faktero.sk/dashboard",
    });
    const mail = z.mocky.posliMail.mock.calls[0][0];
    expect(mail.email).toBe("jan@firma.sk");
    expect(mail.predmet).toBe("Potvrďte registraci ve Fakteru");
    expect(mail.text).toContain("/auth/potvrdenie?token_hash=");
    expect(mail.text).toContain("next=%2Fdashboard");
    // Meno sa do e-mailu nedostane (text podvodu v mene).
    expect(mail.html).not.toContain("Novák");
    expect(z.mocky.zapisSuhlasy).toHaveBeenCalledWith("u1", "8.8.8.8", "test");
  });

  it("súkromnú IP (router) neposiela do Cloudflare ako remoteip", async () => {
    const z = zavislosti();
    await registrujUcet(vstup, { ...web, ip: "192.168.1.1" }, z);
    expect(z.mocky.overTurnstile).toHaveBeenCalledWith("tok", null);
  });

  it("web bez platnej captchy účet nezaloží", async () => {
    const z = zavislosti({
      overTurnstile: vi.fn(async () => ({ ok: false as const, dovod: "neplatny" as const })),
    });
    const v = await registrujUcet(vstup, web, z);
    expect(v).toEqual({ ok: false, sprava: HLASKY_REGISTRACIE.captcha, captcha: true });
    expect(z.mocky.generujOdkaz).not.toHaveBeenCalled();
  });

  it("web bez tokenu captchu vyžaduje", async () => {
    const z = zavislosti({
      overTurnstile: vi.fn(async () => ({ ok: false as const, dovod: "chyba_tokenu" as const })),
    });
    const v = await registrujUcet({ ...vstup, token: null }, web, z);
    expect(v.ok).toBe(false);
    expect(z.mocky.generujOdkaz).not.toHaveBeenCalled();
  });

  it("výpadok Cloudflare → iná hláška, účet nevznikne", async () => {
    const z = zavislosti({
      overTurnstile: vi.fn(async () => ({ ok: false as const, dovod: "nedostupne" as const })),
    });
    expect(await registrujUcet(vstup, web, z)).toMatchObject({
      ok: false,
      sprava: HLASKY_REGISTRACIE.captchaNedostupna,
    });
  });

  it("appka bez tokenu captchu preskočí, ale má prísnejší limit", async () => {
    const z = zavislosti();
    const apka = { ip: "9.9.9.9", ua: null, zApky: true };
    const vysledky = [];
    for (let i = 0; i < 3; i++) {
      vysledky.push(
        (await registrujUcet({ ...vstup, token: null, email: `a${i}@firma.sk` }, apka, z)).ok,
      );
    }
    expect(vysledky).toEqual([true, true, false]); // 2 za hodinu z jednej IP
    expect(z.mocky.overTurnstile).not.toHaveBeenCalled();
  });

  it("appka bez tokenu a bez verejnej IP — strop 10 za hodinu spolu", async () => {
    const z = zavislosti();
    const apka = { ip: "192.168.1.1", ua: null, zApky: true };
    let ok = 0;
    for (let i = 0; i < 12; i++) {
      if ((await registrujUcet({ ...vstup, token: null, email: `b${i}@firma.sk` }, apka, z)).ok)
        ok++;
    }
    expect(ok).toBe(10);
  });

  it("appka s tokenom ho overí ako web", async () => {
    const z = zavislosti();
    await registrujUcet(vstup, { ip: null, ua: null, zApky: true }, z);
    expect(z.mocky.overTurnstile).toHaveBeenCalledWith("tok", null);
  });

  it("limit 5 registrácií za hodinu z jednej verejnej IP a 3 na jeden e-mail", async () => {
    const z = zavislosti();
    let ok = 0;
    for (let i = 0; i < 7; i++) {
      if ((await registrujUcet({ ...vstup, email: `c${i}@firma.sk` }, web, z)).ok) ok++;
    }
    expect(ok).toBe(5);

    const z2 = zavislosti();
    const naEmail = [];
    for (let i = 0; i < 4; i++)
      naEmail.push((await registrujUcet(vstup, { ...web, ip: `8.8.8.${i}` }, z2)).ok);
    expect(naEmail).toEqual([true, true, true, false]);
  });

  it("kontrola e-mailu (jednorazová doména) zastaví registráciu a vráti doménu", async () => {
    const z = zavislosti({
      overEmail: vi.fn(async () => ({
        ok: false as const,
        dovod: "jednorazova" as const,
        sprava: "X",
        domena: "zly.sk",
      })),
    });
    expect(await registrujUcet(vstup, web, z)).toMatchObject({
      ok: false,
      sprava: "X",
      parametre: { domena: "zly.sk" },
    });
    expect(z.mocky.generujOdkaz).not.toHaveBeenCalled();
  });

  it("existujúci účet: rovnaká odpoveď ako nový, bez e-mailu (nedá sa zisťovať, kto má účet)", async () => {
    const z = zavislosti({
      generujOdkaz: vi.fn(async () => ({ ok: false as const, existuje: true as const })),
    });
    expect(await registrujUcet(vstup, web, z)).toEqual({
      ok: true,
      emailOdoslany: true,
      suhlasyZapisane: false,
    });
    expect(z.mocky.posliMail).not.toHaveBeenCalled();
  });

  it("chybu Supabase preloží (spúšťač proti jednorazovým doménam)", async () => {
    const z = zavislosti({
      generujOdkaz: vi.fn(async () => ({
        ok: false as const,
        existuje: false as const,
        chyba: "Database error saving new user",
      })),
    });
    const v = await registrujUcet(vstup, web, z);
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.sprava).toContain("Jednorazové");
  });

  it("odmietne meno s odkazom, chýbajúce súhlasy a krátke heslo ešte pred captchou", async () => {
    const z = zavislosti();
    expect(
      await registrujUcet({ ...vstup, meno: "Vyhrali ste www.zly.com" }, web, z),
    ).toMatchObject({ sprava: HLASKY_REGISTRACIE.meno });
    expect(await registrujUcet({ ...vstup, gdpr: false }, web, z)).toMatchObject({
      sprava: HLASKY_REGISTRACIE.suhlasy,
    });
    expect(await registrujUcet({ ...vstup, heslo: "kratke" }, web, z)).toMatchObject({
      sprava: HLASKY_REGISTRACIE.heslo,
    });
    expect(z.mocky.overTurnstile).not.toHaveBeenCalled();
  });

  it("neodoslaný e-mail povie, účet ostáva", async () => {
    const z = zavislosti({ posliMail: vi.fn(async () => false) });
    expect(await registrujUcet(vstup, web, z)).toMatchObject({ ok: true, emailOdoslany: false });
  });
});

describe("registrujPozvaneho", () => {
  const token = "a".repeat(48);

  it("adresu berie z pozvánky a po potvrdení vráti na pozvánku", async () => {
    const z = zavislosti();
    const v = await registrujPozvaneho({ token, heslo: "tajneheslo" }, z);
    expect(v).toEqual({ ok: true, emailOdoslany: true, suhlasyZapisane: false });
    expect(z.mocky.overTurnstile).not.toHaveBeenCalled();
    expect(z.mocky.generujOdkaz.mock.calls[0][0]).toMatchObject({
      email: "pozvany@firma.sk",
      redirectTo: `https://www.faktero.sk/pridat-pouzivatela?token=${token}`,
    });
    expect(z.mocky.posliMail.mock.calls[0][0].text).toContain(
      `next=${encodeURIComponent(`/pridat-pouzivatela?token=${token}`)}`,
    );
  });

  it("neplatná pozvánka účet nezaloží", async () => {
    const z = zavislosti({ nacitajPozvanku: vi.fn(async () => null) });
    expect(await registrujPozvaneho({ token, heslo: "tajneheslo" }, z)).toEqual({
      ok: false,
      sprava: HLASKY_REGISTRACIE.pozvanka,
    });
    expect(z.mocky.generujOdkaz).not.toHaveBeenCalled();
  });

  it("existujúci účet → prihlásiť sa heslom", async () => {
    const z = zavislosti({
      generujOdkaz: vi.fn(async () => ({ ok: false as const, existuje: true as const })),
    });
    expect(await registrujPozvaneho({ token, heslo: "tajneheslo" }, z)).toMatchObject({
      ok: true,
      existuje: true,
    });
  });

  it("limit 5 pokusov na pozvánku", async () => {
    const z = zavislosti({ nacitajPozvanku: vi.fn(async () => null) });
    const r = [];
    for (let i = 0; i < 6; i++)
      r.push((await registrujPozvaneho({ token, heslo: "tajneheslo" }, z)) as any);
    expect(r[5].sprava).toBe(HLASKY_REGISTRACIE.limit);
  });
});

describe("preklady hlášok", () => {
  it("každá hláška registrácie je v nemčine aj češtine", () => {
    const de = deCaptcha as Record<string, string>;
    const cs = csCaptcha as Record<string, string>;
    const chyba = Object.values(HLASKY_REGISTRACIE).filter(
      (h) =>
        h !== HLASKY_REGISTRACIE.suhlasy && h !== HLASKY_REGISTRACIE.heslo && (!de[h] || !cs[h]),
    );
    expect(chyba).toEqual([]);
  });
});
