import { describe, expect, it, vi } from "vitest";
import {
  MAX_POKUSOV_WEBHOOKU,
  ODSTUPY_OPAKOVANIA_MS,
  dalsiPokusWebhooku,
  jeDorucene,
  poNeuspechu,
} from "./webhook-opakovanie";
import { posliPokusWebhooku } from "./webhook-odoslanie.server";
import { webhookyVzdane } from "./notifications";

const T0 = new Date("2026-10-31T10:00:00Z");
const MIN = 60_000;

describe("rozvrh opakovania webhooku", () => {
  it("má 8 pokusov s narastajúcim odstupom", () => {
    expect(MAX_POKUSOV_WEBHOOKU).toBe(8);
    expect(ODSTUPY_OPAKOVANIA_MS.map((x) => x / MIN)).toEqual([1, 5, 30, 120, 360, 720, 1440]);
    for (let i = 1; i < ODSTUPY_OPAKOVANIA_MS.length; i++)
      expect(ODSTUPY_OPAKOVANIA_MS[i]).toBeGreaterThan(ODSTUPY_OPAKOVANIA_MS[i - 1]!);
  });

  it("po n-tom neúspechu naplánuje n-tý odstup", () => {
    expect(dalsiPokusWebhooku(1, T0)!.getTime() - T0.getTime()).toBe(1 * MIN);
    expect(dalsiPokusWebhooku(2, T0)!.getTime() - T0.getTime()).toBe(5 * MIN);
    expect(dalsiPokusWebhooku(7, T0)!.getTime() - T0.getTime()).toBe(1440 * MIN);
  });

  it("po ôsmom pokuse to vzdá", () => {
    expect(dalsiPokusWebhooku(8, T0)).toBeNull();
    expect(dalsiPokusWebhooku(9, T0)).toBeNull();
    expect(poNeuspechu(8, T0)).toEqual({ status: "failed", next_attempt_at: null });
    expect(poNeuspechu(3, T0)).toEqual({
      status: "retrying",
      next_attempt_at: new Date(T0.getTime() + 30 * MIN).toISOString(),
    });
  });

  it("celý rozvrh trvá necelé dva dni", () => {
    const spolu = ODSTUPY_OPAKOVANIA_MS.reduce((a, b) => a + b, 0);
    expect(spolu / 3_600_000).toBeGreaterThan(40);
    expect(spolu / 3_600_000).toBeLessThan(48);
  });

  it("doručené je len 2xx", () => {
    expect(jeDorucene(200)).toBe(true);
    expect(jeDorucene(204)).toBe(true);
    expect(jeDorucene(301)).toBe(false);
    expect(jeDorucene(500)).toBe(false);
    expect(jeDorucene(null)).toBe(false);
  });
});

describe("jeden pokus o doručenie", () => {
  const zaklad = {
    secret: "whsec_x",
    event: "invoice.paid",
    body: '{"a":1}',
    dorucenieId: "11111111-2222-3333-4444-555555555555",
    pokus: 3,
  };

  it("na vnútornú adresu nič nepošle", async () => {
    const f = vi.fn();
    for (const url of [
      "https://127.0.0.1/hook",
      "https://10.0.0.5/x",
      "https://[::1]/x",
      "https://169.254.169.254/latest",
    ]) {
      const r = await posliPokusWebhooku({ ...zaklad, url }, f as any);
      expect(r.ok, url).toBe(false);
      expect(r.chyba, url).toBeTruthy();
    }
    expect(f).not.toHaveBeenCalled();
  });

  it("http:// a iný port odmietne bez spojenia", async () => {
    const f = vi.fn();
    expect(
      (await posliPokusWebhooku({ ...zaklad, url: "http://example.com/x" }, f as any)).ok,
    ).toBe(false);
    expect(
      (await posliPokusWebhooku({ ...zaklad, url: "https://example.com:8443/x" }, f as any)).ok,
    ).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("zvonček: vzdané webhooky", () => {
  const hooky = [{ id: "h1", url: "https://api.klient.sk/faktero" }];
  it("jedna položka na webhook, kľúč sa mení s novým zlyhaním", () => {
    const z = [
      {
        id: "a",
        webhook_id: "h1",
        event_type: "invoice.paid",
        created_at: "2026-10-30T10:00:00Z",
        error_message: "HTTP 500",
      },
      {
        id: "b",
        webhook_id: "h1",
        event_type: "invoice.sent",
        created_at: "2026-10-31T09:00:00Z",
        error_message: null,
      },
      {
        id: "c",
        webhook_id: "zmazany",
        event_type: "invoice.sent",
        created_at: "2026-10-31T09:00:00Z",
        error_message: null,
      },
    ];
    const n = webhookyVzdane(z, hooky);
    expect(n).toHaveLength(1);
    expect(n[0]!.key).toBe("webhook_vzdane:h1:b");
    expect(n[0]!.kluceClenov).toEqual(["webhook_vzdane:h1:a", "webhook_vzdane:h1:b"]);
    expect(n[0]!.params).toMatchObject({ adresa: "api.klient.sk", n: 2, udalost: "invoice.sent" });
    expect(n[0]!.to).toBe("/webhooky");
    expect(webhookyVzdane([], hooky)).toEqual([]);
  });
});
