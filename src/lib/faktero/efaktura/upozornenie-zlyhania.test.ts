import { describe, expect, it } from "vitest";
import { preloz } from "@/lib/i18n/jazyk";
import { textNotifikacie } from "../notifications";
import { notifikacieZlyhanychEfaktur, type DorucenieKDokladu } from "./upozornenie-zlyhania";

const d = (o: Partial<DorucenieKDokladu>): DorucenieKDokladu => ({
  document_id: "doc1",
  status: "sent",
  channel: "peppol",
  sent_at: "2026-10-30T10:00:00Z",
  created_at: "2026-10-30T10:00:00Z",
  updated_at: "2026-10-30T10:05:00Z",
  ...o,
});
const doklad = {
  id: "doc1",
  invoice_id: "inv1",
  invoice_number: "FA2026001",
  customer_name: "Odberateľ s.r.o.",
};

describe("zvonček: eFaktúra neodišla", () => {
  it("zlyhanie od ePoštáka hlási s dôvodom a odkazom na faktúru", () => {
    const n = notifikacieZlyhanychEfaktur(
      [d({ status: "pending", zlyhanie: { code: "participant_not_found" } })],
      [doklad],
    );
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({
      key: "efaktura_zlyhala:doc1:2026-10-30T10:00:00Z",
      severity: "danger",
      to: "/faktury/inv1",
      date: "2026-10-30",
    });
    const t = (s: string, p?: Record<string, string | number>) => preloz("sk", s, p);
    expect(textNotifikacie(n[0], "title", t)).toBe("eFaktúra FA2026001 neodišla");
    expect(textNotifikacie(n[0], "detail", t)).toMatch(
      /^Odberateľ s\.r\.o\. · Odberateľ nie je zaregistrovaný/,
    );
    const de = (s: string, p?: Record<string, string | number>) => preloz("de", s, p);
    expect(textNotifikacie(n[0], "detail", de)).toMatch(/nicht im Peppol-Netz registriert/);
  });

  it("úspešné opätovné odoslanie položku zruší", () => {
    expect(
      notifikacieZlyhanychEfaktur(
        [
          d({ status: "failed", created_at: "2026-10-30T10:00:00Z" }),
          d({ status: "delivered", created_at: "2026-10-30T11:00:00Z" }),
        ],
        [doklad],
      ),
    ).toEqual([]);
  });

  it("nové zlyhanie po opakovaní má nový kľúč", () => {
    const n = notifikacieZlyhanychEfaktur(
      [
        d({ status: "failed", created_at: "2026-10-30T10:00:00Z" }),
        d({ status: "failed", created_at: "2026-10-31T09:00:00Z" }),
      ],
      [doklad],
    );
    expect(n[0].key).toBe("efaktura_zlyhala:doc1:2026-10-31T09:00:00Z");
  });

  it("odoslaná, doručená, accepted a prijatá sa nehlásia", () => {
    for (const o of [
      { status: "sent" },
      { status: "accepted" },
      { status: "delivered" },
      { status: "delivered", odpoved: "AP" },
    ]) {
      expect(notifikacieZlyhanychEfaktur([d(o)], [doklad])).toEqual([]);
    }
  });

  it("zamietnutie odberateľom je upozornenie", () => {
    const n = notifikacieZlyhanychEfaktur([d({ status: "delivered", odpoved: "RE" })], [doklad]);
    expect(n[0]).toMatchObject({
      severity: "warning",
      title: "Odberateľ zamietol eFaktúru {cislo}",
    });
    expect(n[0].key.startsWith("efaktura_zamietnuta:doc1:")).toBe(true);
  });

  it("stornovaná, zmazaná či neznáma faktúra sa nehlási", () => {
    const z = [d({ status: "failed" })];
    expect(notifikacieZlyhanychEfaktur(z, [{ ...doklad, status: "cancelled" }])).toEqual([]);
    expect(notifikacieZlyhanychEfaktur(z, [{ ...doklad, deleted_at: "2026-10-31" }])).toEqual([]);
    expect(notifikacieZlyhanychEfaktur(z, [])).toEqual([]);
  });
});
