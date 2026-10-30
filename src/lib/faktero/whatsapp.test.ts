import { describe, expect, it } from "vitest";
import {
  OKNO_ZAKAZNICKEJ_SLUZBY_MS,
  cislaZWaId,
  cisloNaZobrazenie,
  jeVOkne,
  koniecOkna,
  maskujCislo,
  menoZWhatsAppu,
  odkazNaWhatsApp,
  rozbalUdalost,
  rozoberPrikazWhatsApp,
  textPrepojenia,
  textSpravy,
} from "./whatsapp";

describe("maskovanie čísla", () => {
  it("nechá predvoľbu a posledné tri číslice", () => {
    expect(maskujCislo("421911222333")).toBe("+421 ••• ••• 333");
    expect(maskujCislo("420777123456")).toBe("+420 ••• ••• 456");
    expect(maskujCislo("4915112345678")).toBe("+49 ••• ••• 678");
  });

  it("celé číslo sa v maske nikdy neobjaví", () => {
    const m = maskujCislo("421911222333");
    expect(m).not.toContain("911");
    expect(m).not.toContain("222");
  });

  it("neznáma predvoľba a nezmysel", () => {
    expect(maskujCislo("999123456789")).toBe("+••• ••• 789");
    expect(maskujCislo("abc")).toBe("WhatsApp");
    expect(maskujCislo(null)).toBe("WhatsApp");
  });

  it("meno z profilu s maskou, bez mena len maska", () => {
    expect(menoZWhatsAppu("Ján‮ Novák", "421911222333")).toBe("Ján Novák · +421 ••• ••• 333");
    expect(menoZWhatsAppu("", "421911222333")).toBe("+421 ••• ••• 333");
  });

  it("wa_id len z číslic", () => {
    expect(cislaZWaId("+421 911 222 333")).toBe("421911222333");
    expect(cislaZWaId("12")).toBeNull();
  });
});

describe("24-hodinové okno", () => {
  const teraz = Date.UTC(2026, 9, 30, 12, 0, 0);
  it("platí krátko po správe zákazníka", () => {
    expect(jeVOkne(new Date(teraz - 3600_000).toISOString(), teraz)).toBe(true);
  });
  it("neplatí po 24 hodinách ani tesne pred koncom (rezerva)", () => {
    expect(jeVOkne(new Date(teraz - OKNO_ZAKAZNICKEJ_SLUZBY_MS - 1).toISOString(), teraz)).toBe(
      false,
    );
    expect(
      jeVOkne(new Date(teraz - OKNO_ZAKAZNICKEJ_SLUZBY_MS + 30_000).toISOString(), teraz),
    ).toBe(false);
  });
  it("bez správy zákazníka okno nie je", () => {
    expect(jeVOkne(null, teraz)).toBe(false);
    expect(jeVOkne("nezmysel", teraz)).toBe(false);
    expect(koniecOkna(null)).toBeNull();
  });
  it("koniec okna je 24 h po správe", () => {
    expect(koniecOkna("2026-10-30T10:00:00.000Z")).toBe("2026-10-31T10:00:00.000Z");
  });
});

describe("príkazy", () => {
  it("predvyplnený text prepojenia nesie kód", () => {
    expect(rozoberPrikazWhatsApp(textPrepojenia("K7QM-XW3P"))).toEqual({
      druh: "prepojit",
      kod: "K7QM-XW3P",
    });
    expect(rozoberPrikazWhatsApp("/prepojit k7qm xw3p")).toEqual({
      druh: "prepojit",
      kod: "K7QM-XW3P",
    });
    expect(rozoberPrikazWhatsApp("Prepojit ucet: ZLYKOD99")).toEqual({
      druh: "prepojit",
      kod: null,
    });
  });
  it("príkazy ako v Telegrame", () => {
    expect(rozoberPrikazWhatsApp("/nova")).toEqual({ druh: "nova" });
    expect(rozoberPrikazWhatsApp("/chyba Nejde PDF")).toEqual({ druh: "chyba", text: "Nejde PDF" });
    expect(rozoberPrikazWhatsApp("/pomoc")).toEqual({ druh: "pomoc" });
    // Párovanie admina cez WhatsApp nie je.
    expect(rozoberPrikazWhatsApp("/admin ABCD-EFGH").druh).toBe("text");
    expect(rozoberPrikazWhatsApp("Dobrý deň")).toEqual({ druh: "text", text: "Dobrý deň" });
  });
});

describe("odkazy", () => {
  it("wa.me s predvyplneným textom", () => {
    expect(odkazNaWhatsApp("+421902101967", "Dobrý deň")).toBe(
      "https://wa.me/421902101967?text=Dobr%C3%BD%20de%C5%88",
    );
    expect(odkazNaWhatsApp("+421 902 101 967")).toBe("https://wa.me/421902101967");
  });
  it("číslo na zobrazenie", () => {
    expect(cisloNaZobrazenie("+421902101967")).toBe("+421 902 101 967");
  });
});

describe("udalosť z webhooku", () => {
  const udalost = (phoneNumberId: string) => ({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "1",
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: phoneNumberId },
              contacts: [{ wa_id: "421911222333", profile: { name: "Ján" } }],
              messages: [
                { from: "421911222333", id: "wamid.1", type: "text", text: { body: "Ahoj" } },
              ],
              statuses: [{ id: "wamid.x", status: "delivered" }],
            },
          },
        ],
      },
    ],
  });

  it("vytiahne správy s menom a stavy", () => {
    const r = rozbalUdalost(udalost("123"), "123");
    expect(r.spravy).toHaveLength(1);
    expect(r.spravy[0]!.profil).toBe("Ján");
    expect(textSpravy(r.spravy[0]!.sprava)).toBe("Ahoj");
    expect(r.stavy).toHaveLength(1);
  });

  it("cudzie číslo aplikácie a iný objekt ignoruje", () => {
    expect(rozbalUdalost(udalost("999"), "123").spravy).toHaveLength(0);
    expect(rozbalUdalost({ object: "page" } as any, "123").spravy).toHaveLength(0);
  });

  it("text z popisu fotky a z tlačidla", () => {
    expect(
      textSpravy({ from: "1", id: "a", type: "image", image: { id: "m", caption: "x" } }),
    ).toBe("x");
    expect(textSpravy({ from: "1", id: "a", type: "button", button: { text: "Zobraziť" } })).toBe(
      "Zobraziť",
    );
    expect(textSpravy({ from: "1", id: "a", type: "audio" })).toBe("");
  });
});
