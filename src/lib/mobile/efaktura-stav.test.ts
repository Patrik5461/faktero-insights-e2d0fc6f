import { describe, expect, it } from "vitest";
import { stavEfaktury, type RiadokDorucenia } from "@/lib/faktero/efaktura/stav-efaktury";
import {
  klucDovoduEfaktury,
  klucKanalaEfaktury,
  klucStavuEfaktury,
  tonEfaktury,
  ukazatDetail,
} from "./efaktura-stav";
import { sk } from "./preklady/sk";
import { cs } from "./preklady/cs";
import { en } from "./preklady/en";
import { de } from "./preklady/de";
import { hu } from "./preklady/hu";

const s = (o: Partial<RiadokDorucenia>) =>
  stavEfaktury([{ status: "sent", channel: "peppol", created_at: "2026-10-30T10:00:00Z", ...o }])!;

describe("stav eFaktúry v appke", () => {
  it("kľúče a farby", () => {
    expect(klucStavuEfaktury(s({ status: "delivered" }))).toBe("efs.stav.dorucena");
    expect(tonEfaktury(s({ status: "delivered" }))).toBe("zelena");
    expect(tonEfaktury(s({ status: "failed" }))).toBe("cervena");
    expect(tonEfaktury(s({ odpoved: "RE" }))).toBe("cervena");
    expect(klucDovoduEfaktury(s({ status: "delivered" }))).toBeNull();
    expect(klucDovoduEfaktury(s({ odpoved: "RE" }))).toBe("efs.zamietnutaPopis");
    expect(
      klucDovoduEfaktury(s({ status: "failed", zlyhanie: { code: "participant_not_found" } })),
    ).toBe("efs.dovod.nieVPeppole");
    expect(klucKanalaEfaktury("peppol")).toBe("efs.kanal.peppol");
    expect(klucKanalaEfaktury("nieco")).toBeNull();
  });

  it("technický text len pri neznámom dôvode", () => {
    expect(ukazatDetail(s({ status: "failed", error_message: "XYZ" }))).toBe(true);
    expect(
      ukazatDetail(s({ status: "failed", zlyhanie: { code: "transport_failed", detail: "AS4" } })),
    ).toBe(false);
  });

  it("všetky kľúče efs.* sú v piatich jazykoch", () => {
    const kluce = Object.keys(sk).filter((k) => k.startsWith("efs."));
    expect(kluce.length).toBeGreaterThan(30);
    for (const [jazyk, slovnik] of Object.entries({ cs, en, de, hu })) {
      const chyba = kluce.filter((k) => !(slovnik as Record<string, string>)[k]);
      expect(chyba, jazyk).toEqual([]);
    }
  });
});
