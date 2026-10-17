import { describe, expect, it } from "vitest";
import { nacitajVstup } from "./dph-vykazy.server";
import { ustva } from "./ustva";
import { platbyFaktury, podielUhradyVObdobi, riadkyPodielom } from "./ust-ist";
import {
  maSondervorauszahlung,
  nastaveniaUstva,
  pracovnyDen,
  sviatkyDe,
  terminSondervorauszahlung,
  terminUstva,
} from "./ustva-terminy";
import {
  basiszinssatz,
  jePodnikatel,
  omeskanieDe,
  sadzbaVerzug,
  upomienkaDe,
  urokyZOmeskania,
  zaciatokOmeskania,
} from "./upomienky-de";
import { buildReminderContent } from "./reminders.server";
import { upravyNaVyber, VETA_AUFBEWAHRUNG_DE, VETA_68D, vetyNaDoklad } from "./faktura-nalezitosti";
import { popisky } from "./faktura-jazyk";
import { predvolenyMailFaktury } from "./email-jazyk";
import { filterNav, nedostupneAgendy } from "@/components/faktero/nav";
import { agendaPreKrajinu } from "./agendy-krajiny";
import { getProductCapabilitiesMarkdown } from "./product-capabilities";

/* Klient bez databázy: vráti riadky podľa tabuľky, filtre ignoruje. */
function klient(tabulky: Record<string, any[]>) {
  return {
    from(t: string) {
      const riadky = tabulky[t] ?? [];
      const q: any = {
        select: () => q,
        eq: () => q,
        is: () => q,
        in: () => q,
        not: () => q,
        gte: () => q,
        lte: () => q,
        or: () => q,
        order: () => q,
        limit: () => q,
        range: () => q,
        maybeSingle: () => Promise.resolve({ data: riadky[0] ?? null, error: null }),
        single: () => Promise.resolve({ data: riadky[0] ?? null, error: null }),
        then: (ok: any, zle: any) => Promise.resolve({ data: riadky, error: null }).then(ok, zle),
      };
      return q;
    },
  };
}

const faktura = {
  id: "f1",
  invoice_number: "RE-2026-001",
  type: "regular",
  status: "sent",
  issue_date: "2026-08-20",
  delivery_date: "2026-08-20",
  currency: "EUR",
  total: 119,
  invoice_items: [{ vat_rate: 19, subtotal: 100, quantity: 1, unit_price: 100 }],
};

describe("Ist-Versteuerung (§ 20 UStG)", () => {
  it("podiel úhrady v období — čiastočné platby, preplatok sa nezdaní", () => {
    const platby = [
      { suma: 59.5, datum: "2026-09-05" },
      { suma: 59.5, datum: "2026-10-03" },
      { suma: 10, datum: "2026-10-20" },
    ];
    expect(podielUhradyVObdobi(platby, 119, "2026-09-01", "2026-09-30")).toBe(0.5);
    expect(podielUhradyVObdobi(platby, 119, "2026-10-01", "2026-10-31")).toBe(0.5);
    expect(podielUhradyVObdobi(platby, 119, "2026-08-01", "2026-08-31")).toBe(0);
    expect(podielUhradyVObdobi(platby, 0, "2026-09-01", "2026-09-30")).toBe(0);
  });

  it("faktúra označená ako uhradená bez záznamu platby — celá suma k paid_at", () => {
    expect(
      platbyFaktury({ status: "paid", paid_at: "2026-09-02T10:00:00Z", total: 119 }, []),
    ).toEqual([{ suma: 119, datum: "2026-09-02" }]);
    expect(platbyFaktury({ status: "sent", total: 119 }, [])).toEqual([]);
    expect(riadkyPodielom([{ sadzba: 19, zaklad: 100, dan: 19 }], 0.5)).toEqual([
      { sadzba: 19, zaklad: 50, dan: 9.5 },
    ]);
  });

  it("UStVA pri Ist: daň v období úhrady, pomerne; pri Soll v období dodania", async () => {
    const tabulky = {
      companies: [{ country: "DE" }],
      invoices: [faktura],
      payments: [
        { id: "p1", invoice_id: "f1", amount: 59.5, paid_at: "2026-09-05" },
        { id: "p2", invoice_id: "f1", amount: 59.5, paid_at: "2026-10-03" },
      ],
    };
    const zaSeptember = await nacitajVstup(
      klient(tabulky) as any,
      "c",
      { rok: 2026, mesiac: 9 },
      { ist: true },
    );
    const u = ustva(zaSeptember.vstup);
    expect(u.kz["81"]).toBe(50);
    expect(u.danKZakladu["81"]).toBe(9.5);

    const august = await nacitajVstup(
      klient(tabulky) as any,
      "c",
      { rok: 2026, mesiac: 8 },
      { ist: true },
    );
    expect(ustva(august.vstup).kz["81"]).toBeUndefined();

    const soll = await nacitajVstup(klient(tabulky) as any, "c", { rok: 2026, mesiac: 8 });
    expect(ustva(soll.vstup).kz["81"]).toBe(100);
    const sollSept = await nacitajVstup(klient(tabulky) as any, "c", { rok: 2026, mesiac: 9 });
    expect(ustva(sollSept.vstup).kz["81"]).toBeUndefined();
  });

  it("Vorsteuer pri Ist ostáva podľa prijatej faktúry, nie podľa zaplatenia", async () => {
    const { vstup } = await nacitajVstup(
      klient({
        companies: [{ country: "DE" }],
        purchase_invoices: [
          {
            id: "pi1",
            invoice_number: "ER-5",
            supplier_ic_dph: "DE123456789",
            delivery_date: "2026-09-10",
            currency: "EUR",
            amount_without_vat: 200,
            vat_amount: 38,
            amount_total: 238,
            status: "unpaid",
            dph_rezim: "tuzemsko",
            type: "regular",
          },
        ],
      }) as any,
      "c",
      { rok: 2026, mesiac: 9 },
      { ist: true },
    );
    expect(ustva(vstup).kz["66"]).toBe(38);
  });

  it("Rechnungskorrektur k nezaplatenej faktúre pri Ist do prehľadu nejde", async () => {
    const dobropis = {
      id: "d1",
      invoice_number: "RK-1",
      type: "credit_note",
      status: "sent",
      issue_date: "2026-09-12",
      delivery_date: "2026-08-20",
      currency: "EUR",
      total: -11.9,
      opravuje_fakturu_id: "f1",
      invoice_items: [{ vat_rate: 19, subtotal: -10, quantity: -1, unit_price: 10 }],
    };
    const t = (platby: any[]) => ({
      companies: [{ country: "DE" }],
      invoices: [faktura, dobropis],
      payments: platby,
    });
    const nezaplatena = await nacitajVstup(
      klient(t([])) as any,
      "c",
      { rok: 2026, mesiac: 9 },
      { ist: true },
    );
    expect(ustva(nezaplatena.vstup).kz["81"]).toBeUndefined();
    // Zaplatená pred dobropisom → vrátenie peňazí znižuje daň v období dobropisu.
    const zaplatena = await nacitajVstup(
      klient(t([{ id: "p", invoice_id: "f1", amount: 119, paid_at: "2026-08-30" }])) as any,
      "c",
      { rok: 2026, mesiac: 9 },
      { ist: true },
    );
    expect(ustva(zaplatena.vstup).kz["81"]).toBe(-10);
  });

  it("platba na zálohovú faktúru bez dokladu k prijatej platbe sa ozve (Mindest-Ist)", async () => {
    const { vytky } = await nacitajVstup(
      klient({
        companies: [{ country: "DE" }],
        invoices: [{ ...faktura, id: "z1", invoice_number: "AZ-1", type: "proforma" }],
        payments: [{ id: "p", invoice_id: "z1", amount: 119, paid_at: "2026-09-03" }],
      }) as any,
      "c",
      { rok: 2026, mesiac: 9 },
      { kontrolaZaloh: true },
    );
    expect(vytky.some((v) => /§ 13 Abs. 1 Nr. 1/.test(v.text))).toBe(true);
  });
});

describe("termín UStVA", () => {
  it("10. deň po skončení obdobia, víkend posúva na pondelok", () => {
    // 10. 10. 2026 je sobota.
    expect(terminUstva({ rok: 2026, stvrtrok: 3 }, false)).toEqual({
      termin: "2026-10-12",
      zakonny: "2026-10-10",
    });
    expect(terminUstva({ rok: 2026, mesiac: 10 }, false).termin).toBe("2026-11-10");
  });

  it("Dauerfristverlängerung o mesiac neskôr, december prechádza do ďalšieho roka", () => {
    expect(terminUstva({ rok: 2026, stvrtrok: 3 }, true).termin).toBe("2026-11-10");
    // 10. 1. 2027 je nedeľa.
    expect(terminUstva({ rok: 2026, mesiac: 12 }, false).termin).toBe("2027-01-11");
    expect(terminUstva({ rok: 2026, mesiac: 12 }, true).termin).toBe("2027-02-10");
    expect(terminUstva({ rok: 2026, stvrtrok: 4 }, true).termin).toBe("2027-02-10");
  });

  it("celoštátne sviatky (Veľká noc 2026: 5. 4.)", () => {
    const s = sviatkyDe(2026);
    expect(s.has("2026-04-03")).toBe(true); // Karfreitag
    expect(s.has("2026-04-06")).toBe(true); // Ostermontag
    expect(s.has("2026-05-14")).toBe(true); // Christi Himmelfahrt
    expect(s.has("2026-05-25")).toBe(true); // Pfingstmontag
    expect(pracovnyDen("2026-04-03")).toBe("2026-04-07");
  });

  it("Sondervorauszahlung len mesačne s Dauerfristverlängerung", () => {
    expect(maSondervorauszahlung({ obdobie: "mesacne", dauerfrist: true })).toBe(true);
    expect(maSondervorauszahlung({ obdobie: "stvrtrocne", dauerfrist: true })).toBe(false);
    expect(maSondervorauszahlung({ obdobie: "mesacne", dauerfrist: false })).toBe(false);
    expect(terminSondervorauszahlung(2027)).toBe("2027-02-10");
    expect(nastaveniaUstva(null)).toEqual({ obdobie: "mesacne", dauerfrist: false });
    expect(nastaveniaUstva({ de_ustva_obdobie: "stvrtrocne", de_dauerfrist: true })).toEqual({
      obdobie: "stvrtrocne",
      dauerfrist: true,
    });
  });
});

describe("upomienky nemeckej firmy (§ 286, § 288 BGB)", () => {
  it("sadzba: základná + 9 bodov podnikateľ, + 5 spotrebiteľ", () => {
    expect(basiszinssatz("2025-03-01")).toBe(2.27);
    expect(sadzbaVerzug("2025-03-01", true)).toBe(11.27);
    expect(sadzbaVerzug("2025-03-01", false)).toBe(7.27);
  });

  it("úroky po dňoch a po polrokoch", () => {
    // 1 000 € × 11,27 % × 31/365 (január 2025)
    expect(urokyZOmeskania(1000, "2025-01-01", "2025-01-31", true)).toBe(9.57);
    // jún 2025 (11,27 %) + júl 2025 (10,27 %), po 30 a 31 dní
    const ocak =
      Math.round(((1000 * 11.27 * 30) / 36500 + (1000 * 10.27 * 31) / 36500) * 100) / 100;
    expect(urokyZOmeskania(1000, "2025-06-01", "2025-07-31", true)).toBe(ocak);
    expect(urokyZOmeskania(1000, "2025-07-31", "2025-07-01", true)).toBe(0);
  });

  it("omeškanie: deň po prvej upomienke, podnikateľ aj 31. deň po splatnosti", () => {
    expect(
      zaciatokOmeskania({ splatnost: "2026-09-01", prvaUpomienka: "2026-09-10", b2b: true }),
    ).toBe("2026-09-11");
    expect(zaciatokOmeskania({ splatnost: "2026-09-01", prvaUpomienka: null, b2b: true })).toBe(
      "2026-10-02",
    );
    expect(
      zaciatokOmeskania({ splatnost: "2026-09-01", prvaUpomienka: null, b2b: false }),
    ).toBeNull();
    expect(jePodnikatel({ customer_ic_dph: "DE123456789" })).toBe(true);
    expect(jePodnikatel({ customer_dic: "", customer_ico: null })).toBe(false);
  });

  it("paušál 40 € len pri podnikateľovi a len v omeškaní", () => {
    const o = omeskanieDe({
      suma: 1000,
      splatnost: "2026-09-01",
      prvaUpomienka: "2026-09-10",
      b2b: true,
      dnes: "2026-10-10",
    });
    expect(o.pausal).toBe(40);
    expect(o.uroky).toBeGreaterThan(0);
    const spotr = omeskanieDe({
      suma: 1000,
      splatnost: "2026-09-01",
      prvaUpomienka: "2026-09-10",
      b2b: false,
      dnes: "2026-10-10",
    });
    expect(spotr.pausal).toBe(0);
    expect(spotr.sadzba).toBe(6.27);
    const bez = omeskanieDe({
      suma: 1000,
      splatnost: "2026-09-01",
      prvaUpomienka: null,
      b2b: false,
      dnes: "2026-10-10",
    });
    expect(bez).toMatchObject({ od: null, uroky: 0, pausal: 0 });
  });

  it("text upomienky po nemecky — 1. bez úrokov, 2. s úrokmi a paušálom", () => {
    const invoice = {
      invoice_number: "RE-7",
      total: 1000,
      currency: "EUR",
      due_date: "2026-09-01",
    };
    const prva = upomienkaDe({
      cislo: 1,
      invoice,
      firma: "Muster GmbH",
      omeskanie: omeskanieDe({
        suma: 1000,
        splatnost: "2026-09-01",
        b2b: true,
        dnes: "2026-09-05",
      }),
    });
    expect(prva.predmet).toBe("Zahlungserinnerung: Rechnung RE-7");
    expect(prva.text).not.toMatch(/Verzugszinsen/);
    expect(prva.text).toMatch(/01\.09\.2026/);
    const druha = upomienkaDe({
      cislo: 2,
      invoice,
      firma: "Muster GmbH",
      omeskanie: omeskanieDe({
        suma: 1000,
        splatnost: "2026-09-01",
        prvaUpomienka: "2026-09-10",
        b2b: true,
        dnes: "2026-10-10",
      }),
    });
    expect(druha.predmet).toBe("Mahnung: Rechnung RE-7");
    expect(druha.text).toMatch(/§ 288 BGB/);
    expect(druha.text).toMatch(/9 Prozentpunkte/);
    expect(druha.text).toMatch(/§ 288 Abs\. 5 BGB/);
  });

  it("buildReminderContent: nemecká firma dostane nemecký text, slovenská ostáva", () => {
    const invoice = {
      invoice_number: "RE-7",
      total: 1000,
      currency: "EUR",
      due_date: "2026-09-01",
      customer_ic_dph: "DE999999999",
    };
    const de = buildReminderContent({
      invoice,
      company: { name: "Muster GmbH", country: "DE" },
      reminderNumber: 2,
      prvaUpomienka: "2026-09-10",
      dnes: "2026-10-10",
    });
    expect(de.subject).toBe("Mahnung: Rechnung RE-7");
    expect(de.plain).toMatch(/Zahlungsdaten/);
    expect(de.plain).toMatch(/Verzugspauschale/);
    const sk = buildReminderContent({
      invoice,
      company: { name: "Firma s.r.o.", country: "SK" },
      reminderNumber: 2,
    });
    expect(sk.subject).toMatch(/^2\. upomienka/);
    // Vlastná šablóna firmy má prednosť aj pri nemeckej firme.
    const vlastna = buildReminderContent({
      invoice,
      company: {
        name: "Muster GmbH",
        country: "DE",
        reminder_subject_2: "Eigene {invoice_number}",
      },
      reminderNumber: 2,
    });
    expect(vlastna.subject).toBe("Eigene RE-7");
  });
});

describe("vety na nemeckej faktúre", () => {
  it("§ 25a / § 25 podľa § 14a Abs. 6 UStG namiesto slovenských viet", () => {
    expect(vetyNaDoklad({ krajina: "DE", osobitnaUprava: "66_tovar" })).toEqual([
      "Gebrauchtgegenstände/Sonderregelung",
    ]);
    expect(vetyNaDoklad({ krajina: "DE", osobitnaUprava: "66_umenie" })).toEqual([
      "Kunstgegenstände/Sonderregelung",
    ]);
    expect(vetyNaDoklad({ krajina: "DE", osobitnaUprava: "66_starozitnosti" })).toEqual([
      "Sammlungsstücke und Antiquitäten/Sonderregelung",
    ]);
    expect(vetyNaDoklad({ krajina: "DE", osobitnaUprava: "65" })).toEqual([
      "Sonderregelung für Reisebüros",
    ]);
    // § 68d je slovenská veta — nemecká Ist-firma ju na faktúre nemá.
    expect(vetyNaDoklad({ krajina: "DE", danZPrijatejPlatby: true })).toEqual([]);
    expect(vetyNaDoklad({ krajina: "SK", danZPrijatejPlatby: true })).toEqual([VETA_68D]);
    expect(upravyNaVyber("DE").find((u) => u.kod === "66_tovar")?.nazov).toMatch(/§ 25a UStG/);
  });

  it("§ 14 Abs. 4 Nr. 9 UStG — upozornenie na úschovu 2 roky len keď je zaškrtnuté", () => {
    expect(vetyNaDoklad({ krajina: "DE", upozornenieUschova: true })).toEqual([
      VETA_AUFBEWAHRUNG_DE,
    ]);
    expect(VETA_AUFBEWAHRUNG_DE).toMatch(
      /zwei Jahre lang aufzubewahren \(§ 14b Abs\. 1 Satz 5 UStG\)/,
    );
    expect(vetyNaDoklad({ krajina: "DE" })).toEqual([]);
    expect(vetyNaDoklad({ krajina: "SK", upozornenieUschova: true })).toEqual([]);
  });

  it("opravná faktúra je Rechnungskorrektur, Gutschrift ostáva samofaktúre", () => {
    expect(popisky("de").dobropis).toBe("RECHNUNGSKORREKTUR");
    expect(popisky("de").vyhotovenieOdberatelom).toBe("Gutschrift");
    expect(predvolenyMailFaktury("de", "credit_note").predmet).toBe(
      "Rechnungskorrektur {invoice_number}",
    );
    expect(predvolenyMailFaktury("de", "regular").predmet).toBe("Rechnung {invoice_number}");
    expect(predvolenyMailFaktury("sk", "credit_note").predmet).toBe("Faktúra {invoice_number}");
  });
});

describe("agendy podľa slovenských predpisov pre nemeckú firmu", () => {
  const cesty = (k: "SK" | "DE", view: "invoicing" | "logbook" = "invoicing") =>
    filterNav(view, true, k, true).flatMap((g) => g.children.map((c) => String(c.to)));

  it("menu: bez pokladne, zamestnancov a knihy jázd", () => {
    expect(cesty("SK")).toContain("/pokladna");
    expect(cesty("SK")).toContain("/zamestnanci");
    expect(cesty("DE")).not.toContain("/pokladna");
    expect(cesty("DE").some((c) => c.startsWith("/zamestnanci"))).toBe(false);
    expect(cesty("DE", "logbook").some((c) => c.startsWith("/jazdy"))).toBe(false);
    expect(cesty("DE")).toContain("/uctovnictvo/vykazy");
  });

  it("priamy vstup ukáže vysvetlenie", () => {
    expect(nedostupneAgendy("/pokladna", "DE")?.nazov).toBe("Pokladňa");
    expect(nedostupneAgendy("/jazdy/nova", "DE")?.nazov).toBe("Kniha jázd");
    expect(nedostupneAgendy("/zamestnanci/123", "DE")?.nazov).toBe("Zamestnanci");
    expect(nedostupneAgendy("/jazdyx", "DE")).toBeNull();
    expect(nedostupneAgendy("/pokladna", "SK")).toBeNull();
    expect(nedostupneAgendy("/faktury", "DE")).toBeNull();
  });

  it("jedno pravidlo aj pre nástenku, zvonček a e-mail (agendaPreKrajinu)", () => {
    expect(agendaPreKrajinu("/jazdy", "DE")).toBe(false);
    expect(agendaPreKrajinu("/zamestnanci/abc", "DE")).toBe(false);
    expect(agendaPreKrajinu("/pokladna", "DE")).toBe(false);
    expect(agendaPreKrajinu("/faktury/1", "DE")).toBe(true);
    expect(agendaPreKrajinu("/jazdy", "SK")).toBe(true);
    expect(agendaPreKrajinu("/pokladna", null)).toBe(true);
  });

  it("AI asistent nemeckej firme pokladňu, knihu jázd ani zamestnancov neponúka", () => {
    const de = getProductCapabilitiesMarkdown("DE");
    const sk = getProductCapabilitiesMarkdown("SK");
    expect(sk).toContain("Cesty: /pokladna");
    expect(de).not.toContain("Cesty: /pokladna");
    expect(de).not.toContain("Cesty: /jazdy");
    expect(de).not.toContain("Cesty: /zamestnanci");
    expect(de).toContain("nemecká firma ich vo Faktere nemá");
    expect(de).toContain("Cesty: /faktury");
  });
});
