import { describe, expect, it } from "vitest";
import {
  denOdoslania,
  filtrujUpomienky,
  klucKlienta,
  moznostiKlientov,
  podlaKlienta,
  suhrnUpomienok,
  type RiadokUpomienky,
} from "./upomienky-prehlad";

let n = 0;
function r(
  o: Partial<RiadokUpomienky> & { klient?: string; cid?: string | null },
): RiadokUpomienky {
  n++;
  const { klient, cid, ...zvysok } = o;
  return {
    id: `r${n}`,
    sent_at: "2026-10-10T08:00:00Z",
    email_to: "a@x.sk",
    reminder_number: 1,
    status: "sent",
    error_message: null,
    triggered_by: "auto",
    sent_by: null,
    invoice_id: `f${n}`,
    invoices: {
      invoice_number: `2026${n}`,
      customer_name: klient ?? "Alfa s.r.o.",
      customer_id: cid ?? null,
    },
    ...zvysok,
  };
}

describe("denOdoslania", () => {
  it("počíta deň v slovenskom čase", () => {
    // 23:30 UTC 9. 10. je už 10. 10. v Bratislave (letný čas +2).
    expect(denOdoslania("2026-10-09T23:30:00Z")).toBe("2026-10-10");
    expect(denOdoslania("2026-10-09T20:00:00Z")).toBe("2026-10-09");
  });
});

describe("klucKlienta", () => {
  it("prednosť má odberateľ z adresára, potom meno, potom e-mail", () => {
    expect(klucKlienta(r({ cid: "c1" }))).toBe("id:c1");
    expect(klucKlienta(r({ klient: " Beta " }))).toBe("meno:beta");
    expect(klucKlienta(r({ invoices: null, email_to: "X@Y.sk" }))).toBe("email:x@y.sk");
  });
});

describe("filtrujUpomienky", () => {
  const riadky = [
    r({ sent_at: "2026-10-01T07:00:00Z", klient: "Alfa" }),
    r({ sent_at: "2026-10-15T07:00:00Z", klient: "Beta", status: "failed", error_message: "x" }),
    r({
      sent_at: "2026-10-20T07:00:00Z",
      klient: "Beta",
      triggered_by: "manual",
      email_to: "b@b.sk",
    }),
  ];

  it("obdobie vrátane okrajov", () => {
    expect(filtrujUpomienky(riadky, { od: "2026-10-15", do: "2026-10-20" })).toHaveLength(2);
    expect(filtrujUpomienky(riadky, { do: "2026-10-01" })).toHaveLength(1);
  });

  it("klient, stav a spôsob", () => {
    expect(filtrujUpomienky(riadky, { klient: "meno:beta" })).toHaveLength(2);
    expect(filtrujUpomienky(riadky, { stav: "failed" }).map((x) => x.status)).toEqual(["failed"]);
    expect(filtrujUpomienky(riadky, { stav: "sent" })).toHaveLength(2);
    expect(filtrujUpomienky(riadky, { sposob: "manual" })).toHaveLength(1);
    expect(filtrujUpomienky(riadky, { sposob: "auto" })).toHaveLength(2);
  });

  it("hľadanie v e-maile aj čísle faktúry", () => {
    expect(filtrujUpomienky(riadky, { q: "B@B" })).toHaveLength(1);
    expect(filtrujUpomienky(riadky, { q: riadky[0]!.invoices!.invoice_number! })).toHaveLength(1);
  });
});

describe("suhrnUpomienok", () => {
  it("klientov a faktúry ráta len z naozaj odoslaných", () => {
    const s = suhrnUpomienok([
      r({ klient: "Alfa", invoice_id: "f1" }),
      r({ klient: "Alfa", invoice_id: "f1", reminder_number: 2 }),
      r({ klient: "Beta", invoice_id: "f2" }),
      r({ klient: "Gama", invoice_id: "f3", status: "failed" }),
    ]);
    expect(s).toEqual({ emailov: 4, odoslanych: 3, neuspesnych: 1, klientov: 2, faktur: 2 });
  });

  it("prázdny zoznam", () => {
    expect(suhrnUpomienok([])).toEqual({
      emailov: 0,
      odoslanych: 0,
      neuspesnych: 0,
      klientov: 0,
      faktur: 0,
    });
  });
});

describe("podlaKlienta", () => {
  it("zoskupí, zoradí podľa počtu a zozbiera e-maily", () => {
    const sk = podlaKlienta([
      r({ klient: "Alfa", sent_at: "2026-10-01T07:00:00Z" }),
      r({ klient: "Beta", email_to: "b1@b.sk", invoice_id: "fb", sent_at: "2026-10-02T07:00:00Z" }),
      r({ klient: "Beta", email_to: "b2@b.sk", invoice_id: "fb", sent_at: "2026-10-05T07:00:00Z" }),
      r({ klient: "Beta", email_to: "b1@b.sk", status: "failed", sent_at: "2026-10-03T07:00:00Z" }),
    ]);
    expect(sk.map((s) => s.nazov)).toEqual(["Beta", "Alfa"]);
    const b = sk[0]!;
    expect(b.odoslanych).toBe(2);
    expect(b.neuspesnych).toBe(1);
    expect(b.faktur).toBe(2);
    expect(b.emaily).toEqual(["b1@b.sk", "b2@b.sk"]);
    expect(b.posledna).toBe("2026-10-05T07:00:00Z");
    expect(b.riadky[0]!.sent_at).toBe("2026-10-05T07:00:00Z");
  });
});

describe("moznostiKlientov", () => {
  it("jedinečné a podľa abecedy", () => {
    expect(
      moznostiKlientov([r({ klient: "Žota" }), r({ klient: "Alfa" }), r({ klient: "Alfa" })]),
    ).toEqual([
      { value: "meno:alfa", label: "Alfa" },
      { value: "meno:žota", label: "Žota" },
    ]);
  });
});
