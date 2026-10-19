/**
 * Párovanie cez e-mailové notifikácie banky — čítanie, validácia, duplicity
 * a rozhodnutie „pohyb hneď" vs. „na kontrolu".
 *
 * Ukážky v `__fixtures__/banka-notifikacie/` sú doslovne prevzaté z knižnice
 * tomaj/bank-mails-parser (MIT), https://github.com/tomaj/bank-mails-parser,
 * `tests/fixtures/<banka>/<názov>.txt` (súbor `<banka>_<názov>.txt`). Sú to
 * skutočné notifikácie s anonymizovanými účtami a menami — preto napr. IBAN
 * Tatra banky „SK9812353347235" nemá platnú dĺžku.
 *
 * Ukážky priamo v tomto súbore (podvrh, ručne preposlaný mail, mail pre AI)
 * sú VYROBENÉ podľa popisu, nie skutočné maily.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  adresaNotifikacii,
  citajDatum,
  citajSumu,
  citajSumuSoZnamienkom,
  dkimPodpisaneDomeny,
  ibanPlatny,
  jeRovnakyPohyb,
  bezPohybovZMailu,
  novyTokenNotifikacii,
  overOdosielatela,
  pohybZNotifikacie,
  povodnyOdosielatelZTela,
  PRAZDNA_NOTIFIKACIA,
  referenciaNotifikacie,
  rozhodni,
  tokenNotifikacii,
  ucetSedi,
  udajeVTexte,
  validujNotifikaciu,
  type Notifikacia,
} from "./banka-notifikacie";
import {
  citajPravidlom,
  citajCsobCz,
  citajCsobSk,
  citajTatrabanku,
  pole,
} from "./banka-notifikacie-parsery";
import { notifikaciaZAi } from "./banka-notifikacie-ai";
import { overVlastnyLocalPart } from "./mail-prijem";

const PRIECINOK = path.resolve(import.meta.dirname, "__fixtures__/banka-notifikacie");
const ukazka = (meno: string) => readFileSync(path.join(PRIECINOK, `${meno}.txt`), "utf8");

const AUTH_OK = (domena: string) => ({
  "Authentication-Results": `mx.resend.com; spf=pass smtp.mailfrom=${domena}; dkim=pass header.d=${domena} header.s=s1; dmarc=pass`,
});

describe("adresa pre notifikácie", () => {
  it("token má 16 znakov a dá sa z adresy späť vytiahnuť", () => {
    const t = novyTokenNotifikacii();
    expect(t).toMatch(/^[a-z0-9]{16}$/);
    const a = adresaNotifikacii(t, "doklady.faktero.sk");
    expect(a).toBe(`banka-${t}@doklady.faktero.sk`);
    expect(tokenNotifikacii(a.split("@")[0])).toBe(t);
  });
  it("cudzia alebo skrátená adresa token nemá", () => {
    expect(tokenNotifikacii("banka-abc")).toBeNull();
    expect(tokenNotifikacii("podpora-0123456789abcdef01")).toBeNull();
    expect(tokenNotifikacii("firma-k7f2p9")).toBeNull();
  });
  it("vlastná adresa na doklady si predponu banka- zabrať nesmie", () => {
    expect(overVlastnyLocalPart("banka-moja").ok).toBe(false);
  });
});

describe("čísla, dátumy, IBAN", () => {
  it("sumy v rôznych zápisoch", () => {
    expect(citajSumu("1 234,56")).toBe(1234.56);
    expect(citajSumu("+1150,00")).toBe(1150);
    expect(citajSumu("1.234,56")).toBe(1234.56);
    expect(citajSumu("1,234.56")).toBe(1234.56);
    expect(citajSumu("12,3")).toBe(12.3);
    expect(citajSumu("150,-")).toBe(150);
    expect(citajSumu("1.234")).toBe(1234);
    expect(citajSumu("abc")).toBeNull();
    expect(citajSumuSoZnamienkom("-12,30")).toBe(-12.3);
  });
  it("dátumy", () => {
    expect(citajDatum("6.9.2019")).toBe("2019-09-06");
    expect(citajDatum("19. 10. 2026")).toBe("2026-10-19");
    expect(citajDatum("2026-10-19")).toBe("2026-10-19");
    expect(citajDatum("19 Oct 2026")).toBe("2026-10-19");
    expect(citajDatum("31.2.2026")).toBeNull();
  });
  it("kontrolná číslica IBAN", () => {
    expect(ibanPlatny("SK31 1200 0000 1987 4263 7541")).toBe(true);
    expect(ibanPlatny("SK32 1200 0000 1987 4263 7541")).toBe(false);
    expect(ibanPlatny("CZ65 0800 0000 1920 0014 5399")).toBe(true);
  });
  it("maskované číslo účtu sa porovná podľa konca", () => {
    expect(ucetSedi("SK31 **** 7541", "SK3112000000198742637541")).toBe(true);
    expect(ucetSedi("SK1375000000004019425381", "SK1375000000004019425381")).toBe(true);
    expect(ucetSedi("xxxx9999", "SK3112000000198742637541")).toBe(false);
    expect(ucetSedi(null, "SK3112000000198742637541")).toBeNull();
  });
});

describe("pole zo začiatku riadku", () => {
  it("menovka bez diakritiky a správna hranica", () => {
    const blok = "Účet: 123, CZK\nÚčet protistrany: 999/0100\nČástka: +1,00 CZK";
    expect(pole(blok, ["Účet"])).toBe("123, CZK");
    expect(pole(blok, ["Účet protistrany"])).toBe("999/0100");
    expect(pole(blok, ["castka"])).toBe("+1,00 CZK");
  });
});

describe("Tatra banka (b-mail)", () => {
  it("prijatá platba", () => {
    const [n] = citajTatrabanku({
      predmet: "Kredit na ucte",
      text: ukazka("tatrabanka_notifikacia"),
    })!;
    expect(n).toMatchObject({
      jePohyb: true,
      smer: "kredit",
      suma: 12.31,
      mena: "EUR",
      datum: "2015-01-16",
      vs: "1234056789",
      ss: null,
      ks: null,
      ibanUctu: "SK9812353347235",
      zostatok: 142.11,
    });
    expect(n!.sprava).toContain("test-sprava");
  });
  it("odchádzajúca platba v inej mene: debet a bez zostatku v EUR", () => {
    const [n] = citajTatrabanku({ predmet: null, text: ukazka("tatrabanka_odchadzajuca-platba") })!;
    expect(n).toMatchObject({
      smer: "debet",
      suma: 1243.29,
      mena: "USD",
      vs: "1234056789",
      ss: "9087654321",
      ks: "5428175648",
      zostatok: null,
    });
  });
  it("VS zo štruktúrovanej SEPA referencie, meno nie je symbol", () => {
    const [n] = citajTatrabanku({ predmet: null, text: ukazka("tatrabanka_vs-v-sprave") })!;
    expect(n!.vs).toBe("1234056789");
    expect(n!.sprava).toContain("Firstname Surname");
  });
  it("na cudzí text nesedí", () => {
    expect(citajTatrabanku({ predmet: null, text: "Dobrý deň, posielam faktúru." })).toBeNull();
  });
});

describe("ČSOB SK (Info 24 – Avízo)", () => {
  it("SEPA platba so všetkými údajmi", () => {
    const [n] = citajCsobSk({
      predmet: "ČSOB Info 24 - Avízo",
      text: ukazka("csob-sk_sepa-platba"),
    })!;
    expect(n).toMatchObject({
      smer: "kredit",
      suma: 1150,
      mena: "EUR",
      datum: "2019-09-06",
      vs: "212049000",
      ss: "964",
      ks: "308",
      protistrana: "NOVAK JOZEF",
      protistranaIban: "SK9175000000003020729058",
      ibanUctu: "SK1375000000004019425381",
      zostatok: 14050.7,
      sprava: "Maroko 2019 rodicia",
    });
  });
  it("viac pohybov v jednom maile, nezmyselný blok sa preskočí", () => {
    const r = citajCsobSk({ predmet: null, text: ukazka("csob-sk_viac-transakcii") })!;
    expect(r.map((n) => [n.suma, n.datum])).toEqual([
      [100, "2019-09-06"],
      [200, "2019-09-07"],
    ]);
  });
});

describe("ČSOB CZ (CEB Info)", () => {
  it("došlá platba", () => {
    const [n] = citajCsobCz({
      predmet: "CEB Info: Zaúčtování platby",
      text: ukazka("csob-cz_dosla-platba"),
    })!;
    expect(n).toMatchObject({
      smer: "kredit",
      suma: 1234.56,
      mena: "CZK",
      datum: "2018-09-25",
      vs: "23456789",
      ks: "3456",
      protistrana: "Capi Hnizdo a.s.",
      protistranaIban: "1122334455/9999",
      ibanUctu: "123456789",
      zostatok: 1234567.89,
    });
  });
  it("okamžitá úhrada", () => {
    const [n] = citajCsobCz({ predmet: null, text: ukazka("csob-cz_okamzita-uhrada") })!;
    expect(n).toMatchObject({ suma: 414, vs: "23456789" });
  });
  it("SEPA prevod: suma v mene účtu, referencia ČSOB", () => {
    const [n] = citajCsobCz({ predmet: null, text: ukazka("csob-cz_zahranicna-platba-sepa") })!;
    expect(n).toMatchObject({
      suma: 3581.7,
      mena: "CZK",
      referencia: "9876543210",
      vs: "23456789",
    });
    expect(n!.protistranaIban).toBe("NL56ABNA1234567890");
  });
  it("dva pohyby v jednom maile", () => {
    const r = citajCsobCz({ predmet: null, text: ukazka("csob-cz_viac-transakcii") })!;
    expect(r.map((n) => [n.suma, n.vs])).toEqual([
      [1234.56, "23456789"],
      [987.65, "78787878"],
    ]);
  });
  it("pravidlo sa vyberá podľa banky; banka bez pravidla vráti null (ide AI)", () => {
    expect(
      citajPravidlom("csob_cz", { predmet: null, text: ukazka("csob-cz_dosla-platba") }),
    ).toHaveLength(1);
    expect(
      citajPravidlom("vub", { predmet: null, text: ukazka("csob-cz_dosla-platba") }),
    ).toBeNull();
    expect(
      citajPravidlom(null, { predmet: null, text: ukazka("csob-cz_dosla-platba") }),
    ).toBeNull();
  });
});

describe("overenie odosielateľa", () => {
  it("DKIM podpis domény banky = overené", () => {
    const o = overOdosielatela({
      from: "b-mail <b-mail@tatrabanka.sk>",
      headers: AUTH_OK("tatrabanka.sk"),
    });
    expect(o.stav).toBe("overene");
    expect(o.banka?.kod).toBe("tatrabanka");
  });
  it("From banky, ale podpis cudzej domény = nepodpísané", () => {
    const o = overOdosielatela({ from: "AdminTBS@csob.sk", headers: AUTH_OK("zly.example") });
    expect(o.stav).toBe("nepodpisane");
  });
  it("bez Authentication-Results = nepodpísané", () => {
    expect(overOdosielatela({ from: "AdminTBS@csob.sk", headers: {} }).stav).toBe("nepodpisane");
  });
  it("podobná doména nie je banka", () => {
    expect(
      overOdosielatela({ from: "x@csob.sk.example.com", headers: AUTH_OK("csob.sk.example.com") })
        .stav,
    ).toBe("nezname");
    expect(overOdosielatela({ from: "x@notcsob.sk", headers: AUTH_OK("notcsob.sk") }).stav).toBe(
      "nezname",
    );
  });
  it("poddoména banky prejde", () => {
    expect(
      overOdosielatela({ from: "info@notify.csob.cz", headers: AUTH_OK("csob.cz") }).stav,
    ).toBe("overene");
  });
  it("podvrhnutá Authentication-Results pod našou sa neberie", () => {
    const headers = {
      "Authentication-Results": [
        "mx.resend.com; spf=fail; dkim=none",
        "mx.resend.com; dkim=pass header.d=csob.sk",
      ],
    };
    expect(overOdosielatela({ from: "AdminTBS@csob.sk", headers }).stav).toBe("nepodpisane");
    const sId = {
      "Authentication-Results": [
        "zly.example; dkim=pass header.d=csob.sk",
        "inbound.resend.com; dkim=fail",
      ],
    };
    expect(
      overOdosielatela({ from: "AdminTBS@csob.sk", headers: sId, authservId: "inbound.resend.com" })
        .stav,
    ).toBe("nepodpisane");
    expect(
      overOdosielatela({
        from: "AdminTBS@csob.sk",
        headers: AUTH_OK("csob.sk"),
        authservId: "mx.resend.com",
      }).stav,
    ).toBe("overene");
  });
  it("DKIM domény z header.i", () => {
    expect(dkimPodpisaneDomeny("dkim=pass header.i=@kb.cz; spf=pass")).toEqual(["kb.cz"]);
  });
  it("ručne preposlaný mail: pôvodný odosielateľ z tela, ale len na výber pravidla", () => {
    // VYROBENÉ: tvar preposlania z Gmailu.
    const text = `Pozri\n\n---------- Forwarded message ---------\nFrom: ČSOB <AdminTBS@csob.sk>\nDate: Mon, 6 Sep 2019\nSubject: ČSOB Info 24 - Avízo\n\n${ukazka("csob-sk_sepa-platba")}`;
    expect(povodnyOdosielatelZTela(text)).toBe("admintbs@csob.sk");
    expect(
      overOdosielatela({ from: "Jana <jana@gmail.com>", headers: AUTH_OK("gmail.com") }).stav,
    ).toBe("nezname");
  });
});

const DNES = "2019-09-10";
/** IBAN v ukážke je anonymizovaný (bez platnej kontrolnej číslice), tak ho nahradíme platným. */
const PLATNY_IBAN = "SK3112000000198742637541";
function zakladna(): Notifikacia {
  return {
    ...citajCsobSk({ predmet: null, text: ukazka("csob-sk_sepa-platba") })![0]!,
    protistranaIban: PLATNY_IBAN,
  };
}

describe("validácia", () => {
  it("platný pohyb prejde", () => {
    expect(
      validujNotifikaciu(zakladna(), {
        dnes: DNES,
        menaUctu: "EUR",
        ibanUctu: "SK1375000000004019425381",
      }),
    ).toEqual({ ok: true, problemy: [] });
  });
  it("zlá mena účtu, starý dátum, iný účet, zlý IBAN protistrany", () => {
    const n = { ...zakladna(), protistranaIban: "SK9275000000003020729058" }; // neplatná kontrolná číslica
    const v = validujNotifikaciu(n, {
      dnes: "2020-01-01",
      menaUctu: "CZK",
      ibanUctu: "SK3112000000198742637541",
    });
    expect(v.ok).toBe(false);
    expect(v.problemy.join(" | ")).toMatch(/mena EUR nesedí/);
    expect(v.problemy.join(" | ")).toMatch(/starší než dva mesiace/);
    expect(v.problemy.join(" | ")).toMatch(/inému účtu/);
    expect(v.problemy.join(" | ")).toMatch(/kontrolnú číslicu/);
  });
  it("nulová suma a chýbajúci smer", () => {
    const v = validujNotifikaciu({ ...zakladna(), suma: 0, smer: null }, { dnes: DNES });
    expect(v.problemy).toEqual(
      expect.arrayContaining([
        "chýba suma alebo nie je kladná",
        "nedá sa určiť, či peniaze prišli alebo odišli",
      ]),
    );
  });
  it("dátum v budúcnosti", () => {
    expect(validujNotifikaciu({ ...zakladna(), datum: "2019-09-20" }, { dnes: DNES }).ok).toBe(
      false,
    );
  });
});

describe("duplicity", () => {
  it("rovnaký pohyb dá rovnakú referenciu, iná suma inú", () => {
    const a = zakladna();
    expect(referenciaNotifikacie(a)).toBe(referenciaNotifikacie({ ...a }));
    expect(referenciaNotifikacie(a)).not.toBe(referenciaNotifikacie({ ...a, suma: 1150.01 }));
    expect(referenciaNotifikacie({ ...a, referencia: "9876" })).toBe("notif:ref:9876");
  });
  it("ten istý pohyb z výpisu (deň ± 1, suma, VS)", () => {
    const n = zakladna();
    expect(
      jeRovnakyPohyb(n, {
        booking_date: "2019-09-07",
        amount: 1150,
        variable_symbol: "0212049000",
        counterparty: null,
      }),
    ).toBe(true);
    expect(
      jeRovnakyPohyb(n, {
        booking_date: "2019-09-06",
        amount: 1150,
        variable_symbol: "111",
        counterparty: null,
      }),
    ).toBe(false);
    expect(
      jeRovnakyPohyb(n, {
        booking_date: "2019-09-09",
        amount: 1150,
        variable_symbol: "212049000",
        counterparty: null,
      }),
    ).toBe(false);
    expect(
      jeRovnakyPohyb(n, {
        booking_date: "2019-09-06",
        amount: -1150,
        variable_symbol: "212049000",
        counterparty: null,
      }),
    ).toBe(false);
  });
  it("nahratý výpis preskočí pohyby, ktoré už prišli z e-mailu — každý len raz", () => {
    const vypis = [
      {
        booking_date: "2019-09-06",
        amount: 1150,
        variable_symbol: "212049000",
        counterparty: "NOVAK JOZEF",
        ref: "a",
      },
      {
        booking_date: "2019-09-06",
        amount: 1150,
        variable_symbol: "212049000",
        counterparty: "NOVAK JOZEF",
        ref: "b",
      },
      {
        booking_date: "2019-09-06",
        amount: 20,
        variable_symbol: null,
        counterparty: "Iný",
        ref: "c",
      },
    ];
    const zMailu = [
      {
        booking_date: "2019-09-05",
        amount: 1150,
        variable_symbol: "212049000",
        counterparty: null,
      },
    ];
    expect(bezPohybovZMailu(vypis, zMailu).map((r) => r.ref)).toEqual(["b", "c"]);
  });
  it("riadok pohybu: znamienko podľa smeru, zdroj email", () => {
    const p = pohybZNotifikacie({ ...zakladna(), smer: "debet" });
    expect(p).toMatchObject({
      amount: -1150,
      currency: "EUR",
      variable_symbol: "212049000",
      counterparty: "NOVAK JOZEF",
      zdroj: "email",
    });
    expect(p.description).toContain(`IBAN ${PLATNY_IBAN}`);
    expect(p.transaction_reference.startsWith("notif:")).toBe(true);
  });
});

describe("rozhodnutie: pohyb hneď alebo na kontrolu", () => {
  const overene = overOdosielatela({ from: "AdminTBS@csob.sk", headers: AUTH_OK("csob.sk") });
  const text = ukazka("csob-sk_sepa-platba");
  const ok = { ok: true, problemy: [] };

  it("overená banka + pravidlo + validné = pohyb", () => {
    expect(
      rozhodni({
        overenie: overene,
        sposob: "pravidlo",
        notifikacia: zakladna(),
        validacia: ok,
        text,
      }).akcia,
    ).toBe("pohyb");
  });
  it("podvrh z neznámej domény ide na kontrolu, aj keď sedí všetko", () => {
    // VYROBENÉ: podvrhnutý mail s textom ČSOB z cudzej domény.
    const podvrh = overOdosielatela({
      from: "AdminTBS@csob-sk.com",
      headers: AUTH_OK("csob-sk.com"),
    });
    const r = rozhodni({
      overenie: podvrh,
      sposob: "pravidlo",
      notifikacia: zakladna(),
      validacia: ok,
      text,
    });
    expect(r.akcia).toBe("kontrola");
  });
  it("From banky bez podpisu ide na kontrolu", () => {
    const bez = overOdosielatela({ from: "AdminTBS@csob.sk", headers: {} });
    expect(
      rozhodni({ overenie: bez, sposob: "pravidlo", notifikacia: zakladna(), validacia: ok, text })
        .akcia,
    ).toBe("kontrola");
  });
  it("nevalidné ide na kontrolu s dôvodom", () => {
    const r = rozhodni({
      overenie: overene,
      sposob: "pravidlo",
      notifikacia: zakladna(),
      validacia: { ok: false, problemy: ["chýba mena"] },
      text,
    });
    expect(r).toEqual({ akcia: "kontrola", dovod: "chýba mena" });
  });
  it("AI so sumou, ktorá v texte nie je, ide na kontrolu", () => {
    const r = rozhodni({
      overenie: overene,
      sposob: "ai",
      notifikacia: { ...zakladna(), suma: 1105 },
      validacia: ok,
      text,
    });
    expect(r.akcia).toBe("kontrola");
    expect(
      rozhodni({ overenie: overene, sposob: "ai", notifikacia: zakladna(), validacia: ok, text })
        .akcia,
    ).toBe("pohyb");
  });
  it("mail od banky, ktorý nie je o pohybe", () => {
    const r = rozhodni({
      overenie: overene,
      sposob: "ai",
      notifikacia: { ...PRAZDNA_NOTIFIKACIA },
      validacia: null,
      text: "Nová aplikácia",
    });
    expect(r.akcia).toBe("nie_pohyb");
  });
  it("neprečítaný mail ide na kontrolu", () => {
    expect(
      rozhodni({ overenie: overene, sposob: null, notifikacia: null, validacia: null, text: "" })
        .akcia,
    ).toBe("kontrola");
  });
  it("suma a VS doslovne v texte", () => {
    expect(udajeVTexte(zakladna(), text)).toBe(true);
    expect(udajeVTexte({ ...zakladna(), vs: "999" }, text)).toBe(false);
    expect(
      udajeVTexte({ ...zakladna(), suma: 1234567.89, vs: null }, "Částka: +1 234 567,89 CZK"),
    ).toBe(true);
  });
});

describe("odpoveď AI", () => {
  it("prevod a čistenie", () => {
    const n = notifikaciaZAi({
      je_pohyb: true,
      smer: "kredit",
      suma: "1 234,50",
      mena: "eur",
      datum: "2026-10-18",
      variabilny_symbol: "VS 0042",
      protistrana_meno: "  Novák  s.r.o. ",
      protistrana_iban: "sk31 1200 0000 1987 4263 7541",
      zostatok: "-10,00",
    })!;
    expect(n).toMatchObject({
      jePohyb: true,
      smer: "kredit",
      suma: 1234.5,
      mena: "EUR",
      vs: "42",
      protistrana: "Novák s.r.o.",
      protistranaIban: "SK3112000000198742637541",
      zostatok: -10,
    });
  });
  it("nezmysel = žiadny pohyb", () => {
    const n = notifikaciaZAi({ smer: "hore", suma: "veľa" })!;
    expect(n.jePohyb).toBe(false);
    expect(n.smer).toBeNull();
    expect(n.suma).toBeNull();
    expect(notifikaciaZAi(null)).toBeNull();
  });
});
