import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { novaFakturaZadarmo, type FakturaZadarmo } from "./faktura-zadarmo";
import {
  HLASKY_ZADARMO,
  generujFakturuZadarmo,
  noveLimityZadarmo,
  overLogo,
  pdfFakturyZadarmo,
  vyhladajFirmuZadarmo,
  type ZavislostiZadarmo,
} from "./faktura-zadarmo.server";
import { generateInvoicePdfBytes } from "./pdf-generator.server";

const DNES = new Date().toISOString().slice(0, 10);

function faktura(o: Partial<FakturaZadarmo> = {}, krajina: "SK" | "CZ" = "SK"): FakturaZadarmo {
  const f = novaFakturaZadarmo(krajina, DNES);
  return {
    ...f,
    dodavatel: {
      ...f.dodavatel,
      nazov: krajina === "CZ" ? "Petr Dvořák" : "Ján Novák – Webdizajn",
      ulica: "Hlavná 1",
      mesto: krajina === "CZ" ? "Brno" : "Žilina",
      psc: "010 01",
      ico: "12345678",
      dic: krajina === "CZ" ? "CZ12345678" : "1012345678",
      iban: krajina === "CZ" ? "CZ6508000000192000145399" : "SK3112000000198742637541",
    },
    odberatel: {
      ...f.odberatel,
      nazov: "Odberateľ s.r.o.",
      ulica: "Obchodná 5",
      mesto: "Bratislava",
      ico: "87654321",
    },
    cislo: "2026001",
    polozky: [{ nazov: "Tvorba webu", mnozstvo: 2, mj: "hod", cena: 45.5, sadzba: 0 }],
    ...o,
  };
}

const platitel = (krajina: "SK" | "CZ" = "SK") => {
  const f = faktura({}, krajina);
  return faktura(
    {
      dodavatel: {
        ...f.dodavatel,
        platitel: true,
        icDph: krajina === "CZ" ? "CZ12345678" : "SK1012345678",
      },
      polozky: [
        { nazov: "Služba", mnozstvo: 1, mj: "ks", cena: 100, sadzba: krajina === "CZ" ? 21 : 23 },
      ],
    },
    krajina,
  );
};

function zavislosti(o: Partial<ZavislostiZadarmo> = {}): ZavislostiZadarmo {
  return {
    overTurnstile: async () => ({ ok: true, hostname: "localhost" }),
    limity: noveLimityZadarmo(),
    prepocet: async () => null,
    generujPdf: generateInvoicePdfBytes,
    ...o,
  };
}

async function strany(b64: string) {
  const b = Buffer.from(b64, "base64");
  expect(b.subarray(0, 5).toString()).toBe("%PDF-");
  return (await PDFDocument.load(b)).getPageCount();
}

describe("PDF faktúry zadarmo", () => {
  it("SK platiteľ", async () => {
    const r = await generujFakturuZadarmo(
      { faktura: platitel(), token: "t" },
      { ip: "8.8.8.8" },
      zavislosti(),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.nazov).toBe("faktura-2026001.pdf");
      expect(await strany(r.pdf)).toBe(1);
    }
  });

  it("SK neplatiteľ", async () => {
    const r = await generujFakturuZadarmo(
      { faktura: faktura(), token: "t" },
      { ip: null },
      zavislosti(),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(await strany(r.pdf)).toBe(1);
  });

  it("CZ plátca v korunách", async () => {
    const r = await generujFakturuZadarmo(
      { faktura: platitel("CZ"), token: "t" },
      { ip: null },
      zavislosti(),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(await strany(r.pdf)).toBe(1);
  });

  it("cudzia mena u platiteľa si vypýta kurz a vloží daň v domácej mene", async () => {
    const prepocet = vi.fn(async () => ({
      kurz: 25,
      den: DNES,
      zdroj: "ecb",
      zaklad: 4,
      dan: 0.92,
      celkom: 4.92,
    }));
    const generujPdf = vi.fn(async (_v: any) => new Uint8Array([1]));
    await pdfFakturyZadarmo(
      { ...platitel(), mena: "CZK" },
      { bajty: null, mime: null },
      { prepocet, generujPdf },
    );
    expect(prepocet).toHaveBeenCalledOnce();
    expect(generujPdf.mock.calls[0][0].invoice.vat_total_eur).toBe(0.92);
  });

  it("logo PNG sa vloží, podvrhnutý súbor nie", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    ).toString("base64");
    expect(overLogo({ mime: "image/png", base64: png }).ok).toBe(true);
    expect(
      overLogo({ mime: "image/png", base64: Buffer.from("<svg/>").toString("base64") }).ok,
    ).toBe(false);
    expect(overLogo({ mime: "image/jpeg", base64: png }).ok).toBe(false);
    const r = await generujFakturuZadarmo(
      { faktura: faktura(), logo: { mime: "image/png", base64: png }, token: "t" },
      { ip: null },
      zavislosti(),
    );
    expect(r.ok).toBe(true);
  });
});

describe("ochrana", () => {
  it("chybný vstup sa odmietne ešte pred captchou", async () => {
    const overTurnstile = vi.fn(async () => ({ ok: true as const, hostname: "localhost" }));
    const r = await generujFakturuZadarmo(
      { faktura: faktura({ cislo: "" }), token: "t" },
      { ip: null },
      zavislosti({ overTurnstile }),
    );
    expect(r.ok).toBe(false);
    expect(overTurnstile).not.toHaveBeenCalled();
    const zly = await generujFakturuZadarmo(
      { faktura: { x: 1 }, token: "t" },
      { ip: null },
      zavislosti({ overTurnstile }),
    );
    expect(zly).toMatchObject({ ok: false, sprava: HLASKY_ZADARMO.vstup });
  });

  it("bez platnej captchy PDF nevznikne", async () => {
    const generujPdf = vi.fn(generateInvoicePdfBytes);
    const r = await generujFakturuZadarmo(
      { faktura: faktura(), token: "zly" },
      { ip: null },
      zavislosti({ overTurnstile: async () => ({ ok: false, dovod: "neplatny" }), generujPdf }),
    );
    expect(r).toMatchObject({ ok: false, captcha: true, sprava: HLASKY_ZADARMO.captcha });
    expect(generujPdf).not.toHaveBeenCalled();
  });

  it("limit 10 PDF za hodinu na verejnú IP", async () => {
    const z = zavislosti({ generujPdf: async () => new Uint8Array([37, 80, 68, 70]) });
    for (let i = 0; i < 10; i++) {
      const r = await generujFakturuZadarmo(
        { faktura: faktura(), token: "t" },
        { ip: "8.8.8.8" },
        z,
      );
      expect(r.ok).toBe(true);
    }
    const r = await generujFakturuZadarmo({ faktura: faktura(), token: "t" }, { ip: "8.8.8.8" }, z);
    expect(r).toMatchObject({ ok: false, sprava: HLASKY_ZADARMO.limit });
    // Iná IP má vlastný limit; súkromná adresa routera sa za IP neberie.
    expect(
      (await generujFakturuZadarmo({ faktura: faktura(), token: "t" }, { ip: "1.1.1.1" }, z)).ok,
    ).toBe(true);
    expect(
      (await generujFakturuZadarmo({ faktura: faktura(), token: "t" }, { ip: "192.168.1.1" }, z))
        .ok,
    ).toBe(true);
  });

  it("strop pre všetkých spolu platí aj bez známej IP", async () => {
    let t = 0;
    const limity = noveLimityZadarmo(() => t);
    const z = zavislosti({ limity, generujPdf: async () => new Uint8Array([1]) });
    for (let i = 0; i < 300; i++) limity.pdfSpolu.skus("vsetci");
    expect(
      await generujFakturuZadarmo({ faktura: faktura(), token: "t" }, { ip: null }, z),
    ).toMatchObject({ ok: false });
    t += 61 * 60 * 1000;
    expect(
      (await generujFakturuZadarmo({ faktura: faktura(), token: "t" }, { ip: null }, z)).ok,
    ).toBe(true);
  });

  it("vyhľadanie firmy: formát IČO, limit a česká firma cez ARES", async () => {
    const cz = vi.fn(async () => ({
      nazov: "Firma a.s.",
      ulica: "",
      mesto: "Praha",
      psc: "",
      dic: "CZ1",
      icDph: "",
      platitel: false,
    }));
    const sk = vi.fn(async () => null);
    const z = { limity: noveLimityZadarmo(), cz, sk };
    expect(await vyhladajFirmuZadarmo({ ico: "12", krajina: "SK" }, { ip: null }, z)).toMatchObject(
      { ok: false, sprava: HLASKY_ZADARMO.ico },
    );
    expect(
      await vyhladajFirmuZadarmo({ ico: "123456", krajina: "CZ" }, { ip: null }, z),
    ).toMatchObject({ ok: true });
    expect(cz).toHaveBeenCalledWith("00123456");
    expect(
      await vyhladajFirmuZadarmo({ ico: "12345678", krajina: "SK" }, { ip: null }, z),
    ).toMatchObject({ ok: false, sprava: HLASKY_ZADARMO.nenajdene });
    for (let i = 0; i < 20; i++)
      await vyhladajFirmuZadarmo({ ico: "12345678", krajina: "SK" }, { ip: "8.8.4.4" }, z);
    expect(
      await vyhladajFirmuZadarmo({ ico: "12345678", krajina: "SK" }, { ip: "8.8.4.4" }, z),
    ).toMatchObject({ sprava: HLASKY_ZADARMO.limitHladania });
  });
});
