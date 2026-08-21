import { describe, it, expect } from "vitest";
import {
  adresaOdosielatela,
  poskytovatelPotvrdenia,
  overPravostPotvrdenia,
  rozbalTelo,
  kodPotvrdenia,
  odkazPotvrdenia,
  zdrojovaSchranka,
  potvrdenieZMailu,
} from "./mail-potvrdenie";

/* Skutočný tvar mailu, ktorý Gmail posiela pri zapnutí preposielania. */
const PREDMET =
  "(#123456789) Gmail Forwarding Confirmation - Receive Mail from patrik@maxiticket.sk";

const TEXT = `patrik@maxiticket.sk has requested to automatically forward mail to your address doklady-k7f2p9@doklady.faktero.sk.
Confirmation code: 123456789

To allow patrik@maxiticket.sk to automatically forward mail to your address, please click the link below to confirm the request:

https://mail-settings.google.com/mail/vf-%5BANGjdJ_9Xk2mQ%5D-KJdue92mSl3kd0

If you click the link and it appears to be broken, please copy and paste it into a new browser window.

Thanks for using Gmail!`;

const HTML = `<div>patrik@maxiticket.sk has requested to automatically forward mail to your address
 <b>doklady-k7f2p9@doklady.faktero.sk</b>. Confirmation code: <b>123456789</b>
 <a href="https://mail-settings.google.com/mail/vf-%5BANGjdJ_9Xk2mQ%5D-KJdue92mSl3kd0">Confirm request</a></div>`;

/* Slovenská verzia toho istého mailu — Gmail píše v jazyku používateľa. */
const PREDMET_SK =
  "(#987654321) Potvrdenie preposielania Gmailu – prijímanie pošty z adresy sefka@firma.sk";

describe("potvrdenie preposielania z Gmailu", () => {
  it("pozná odosielateľa aj v tvare s menom", () => {
    expect(adresaOdosielatela("Gmail Team <forwarding-noreply@google.com>")).toBe(
      "forwarding-noreply@google.com",
    );
    expect(poskytovatelPotvrdenia("Gmail Team <forwarding-noreply@google.com>")?.provider).toBe(
      "gmail",
    );
    expect(poskytovatelPotvrdenia("FORWARDING-NOREPLY@GOOGLE.COM")?.domena).toBe("google.com");
    // Podvrhnutá adresa na inej doméne sa sem nedostane.
    expect(poskytovatelPotvrdenia("forwarding-noreply@google.com.utocnik.sk")).toBeNull();
    expect(poskytovatelPotvrdenia("dodavatel@firma.sk")).toBeNull();
    expect(poskytovatelPotvrdenia(null)).toBeNull();
  });

  it("vyzobe kód z predmetu a odkaz z tela", () => {
    expect(kodPotvrdenia(PREDMET, TEXT)).toBe("123456789");
    expect(kodPotvrdenia(PREDMET_SK, "")).toBe("987654321");
    // Bez predmetu ho nájde v texte.
    expect(kodPotvrdenia("Potvrdenie", TEXT)).toBe("123456789");
    expect(odkazPotvrdenia(HTML, null)).toBe(
      "https://mail-settings.google.com/mail/vf-%5BANGjdJ_9Xk2mQ%5D-KJdue92mSl3kd0",
    );
    expect(odkazPotvrdenia(null, TEXT)).toBe(
      "https://mail-settings.google.com/mail/vf-%5BANGjdJ_9Xk2mQ%5D-KJdue92mSl3kd0",
    );
    expect(odkazPotvrdenia("<p>nič tu nie je</p>", "ani tu")).toBeNull();
  });

  it("bodka na konci vety nie je súčasť odkazu", () => {
    expect(
      odkazPotvrdenia(null, "Potvrďte na https://mail-settings.google.com/mail/vf-ABC-123."),
    ).toBe("https://mail-settings.google.com/mail/vf-ABC-123");
  });

  it("nájde schránku, z ktorej sa preposiela, a nepomýli si ju s našou", () => {
    expect(
      zdrojovaSchranka({
        predmet: PREDMET,
        telo: TEXT,
        naseAdresy: ["doklady-k7f2p9@doklady.faktero.sk"],
      }),
    ).toBe("patrik@maxiticket.sk");
    expect(zdrojovaSchranka({ predmet: PREDMET_SK, telo: "" })).toBe("sefka@firma.sk");
    // Keď v maile žiadna cudzia adresa nie je, radšej nič než nesprávne.
    expect(
      zdrojovaSchranka({
        predmet: "Potvrdenie",
        telo: "napíšte na forwarding-noreply@google.com",
        naseAdresy: ["doklady-k7f2p9@doklady.faktero.sk"],
      }),
    ).toBeNull();
  });

  it("celý mail poskladá do toho, čo sa uloží — a telo medzi tým nie je", () => {
    const v = potvrdenieZMailu({
      provider: "gmail",
      predmet: PREDMET,
      text: TEXT,
      html: HTML,
      naseAdresy: ["doklady-k7f2p9@doklady.faktero.sk"],
    });
    expect(v).toEqual({
      provider: "gmail",
      code: "123456789",
      confirm_url: "https://mail-settings.google.com/mail/vf-%5BANGjdJ_9Xk2mQ%5D-KJdue92mSl3kd0",
      source_email: "patrik@maxiticket.sk",
    });
    expect(Object.keys(v)).toHaveLength(4);
  });

  it("telo v podobe data: URI sa rozbalí", () => {
    const base64 = Buffer.from(HTML, "utf8").toString("base64");
    expect(rozbalTelo(`data:text/html;base64,${base64}`)).toBe(HTML);
    expect(rozbalTelo(`data:text/html,${encodeURIComponent("<b>ahoj</b>")}`)).toBe("<b>ahoj</b>");
    expect(rozbalTelo("<b>obyčajné html</b>")).toBe("<b>obyčajné html</b>");
    expect(rozbalTelo(null)).toBe("");
  });

  describe("pravosť", () => {
    const hlavicky = (authResults: string) => ({ "authentication-results": authResults });

    it("prejde len mail, ktorý podpísal Google", () => {
      expect(
        overPravostPotvrdenia({
          headers: hlavicky(
            "mx.resend.com; spf=pass smtp.mailfrom=google.com; dkim=pass header.d=google.com; dmarc=pass",
          ),
          domena: "google.com",
        }),
      ).toEqual({ ok: true });
      // Aj podpis z podomény je v poriadku.
      expect(
        overPravostPotvrdenia({
          headers: hlavicky("mx; spf=pass; dkim=pass header.i=@mail.google.com"),
          domena: "google.com",
        }).ok,
      ).toBe(true);
    });

    it("prejde skutočná hlavička, akú posiela Resend (cez Amazon SES)", () => {
      // Odpísané z ozajstného mailu prijatého na doklady.faktero.sk, len s
      // doménou Googlu — takto vyzerá `dkim=pass` pri pošte od `google.com`.
      const skutocna =
        "amazonses.com; spf=pass (spfCheck: domain of google.com designates 209.85.220.41 as permitted sender)" +
        " client-ip=209.85.220.41; envelope-from=forwarding-noreply@google.com; helo=mail-sor-f41.google.com;" +
        " dkim=pass header.i=@google.com; dmarc=pass header.from=google.com;";
      expect(overPravostPotvrdenia({ headers: hlavicky(skutocna), domena: "google.com" })).toEqual({
        ok: true,
      });
      // Tá istá hlavička, ale mail podpísala firemná doména cez Google Workspace
      // (`gappssmtp.com`) — to nie je potvrdenie od Googlu.
      expect(
        overPravostPotvrdenia({
          headers: hlavicky(
            skutocna.replace(
              "dkim=pass header.i=@google.com;",
              "dkim=pass header.i=@firma-sk.20251104.gappssmtp.com;",
            ),
          ),
          domena: "google.com",
        }).ok,
      ).toBe(false);
    });

    it("podvrh zahodí a povie prečo", () => {
      expect(
        overPravostPotvrdenia({
          headers: hlavicky("mx; spf=pass; dkim=pass header.d=utocnik.sk"),
          domena: "google.com",
        }),
      ).toEqual({ ok: false, dovod: "DKIM podpísala doména utocnik.sk, nie google.com" });
      expect(
        overPravostPotvrdenia({
          headers: hlavicky("mx; spf=fail; dkim=pass header.d=google.com"),
          domena: "google.com",
        }).ok,
      ).toBe(false);
      expect(
        overPravostPotvrdenia({
          headers: hlavicky("mx; spf=pass; dkim=none"),
          domena: "google.com",
        }).ok,
      ).toBe(false);
      // Keď o pravosti nevieme nič, mail neprejde.
      expect(overPravostPotvrdenia({ headers: {}, domena: "google.com" })).toEqual({
        ok: false,
        dovod: "chýba hlavička Authentication-Results",
      });
      expect(overPravostPotvrdenia({ headers: null, domena: "google.com" }).ok).toBe(false);
    });

    it("keď Resend pošle výsledky priamo, majú prednosť", () => {
      expect(overPravostPotvrdenia({ spf: "pass", dkim: "pass", domena: "google.com" })).toEqual({
        ok: true,
      });
      expect(
        overPravostPotvrdenia({
          spf: { status: "pass" },
          dkim: { status: "fail" },
          domena: "google.com",
        }),
      ).toEqual({ ok: false, dovod: "DKIM fail" });
    });

    it("veľkosť písmen v názve hlavičky nerozhoduje", () => {
      expect(
        overPravostPotvrdenia({
          headers: { "Authentication-Results": "mx; SPF=Pass; DKIM=Pass header.d=Google.com" },
          domena: "google.com",
        }).ok,
      ).toBe(true);
    });
  });
});
