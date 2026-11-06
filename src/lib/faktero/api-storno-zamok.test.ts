import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
vi.mock("@/integrations/supabase/admin-zdroj.server", () => ({ adminPreApiKluc: () => ({}) }));

import {
  OBDOBIE_STLPCE,
  dovodZamkuApi,
  spravaZamkuObdobia,
  vUzavretomObdobi,
  zmenyVObdobi,
} from "./api-evidencia";
import { stornujFakturuApi, strazZamku } from "./api-evidencia.server";

type Riadok = Record<string, any>;

/** Klient v pamäti: výber, update, count (head) a rpc hlášky zámku. */
function klient(tabulky: Record<string, Riadok[]>) {
  const zmeny: { tab: string; zmena: Riadok }[] = [];
  const from = (meno: string) => {
    const filtre: ((r: Riadok) => boolean)[] = [];
    let zmena: Riadok | null = null;
    let pocet = false;
    const vysledok = () => (tabulky[meno] ?? []).filter((r) => filtre.every((f) => f(r)));
    const b: any = {
      select: (_s?: string, o?: { count?: string; head?: boolean }) => ((pocet = !!o?.head), b),
      update: (z: Riadok) => ((zmena = z), b),
      eq: (k: string, v: unknown) => (filtre.push((r) => r[k] === v), b),
      neq: (k: string, v: unknown) => (filtre.push((r) => r[k] !== v), b),
      is: (k: string, v: unknown) => (filtre.push((r) => (r[k] ?? null) === v), b),
      not: (k: string, _op: string, _v: unknown) => (filtre.push((r) => r[k] != null), b),
      maybeSingle: async () => {
        const r = vysledok()[0] ?? null;
        if (r && zmena) {
          zmeny.push({ tab: meno, zmena });
          Object.assign(r, zmena);
        }
        return { data: r, error: null };
      },
      then: (ok: (x: any) => unknown, zle?: (e: unknown) => unknown) =>
        Promise.resolve(
          pocet ? { count: vysledok().length, error: null } : { data: vysledok(), error: null },
        ).then(ok, zle),
    };
    return b;
  };
  const rpc = async () => ({ data: "Faktúra už bola odovzdaná do Pohody — najprv ju vráťte.", error: null });
  return { from, rpc, zmeny };
}

const FIRMA = "aaaaaaaa-0000-0000-0000-000000000001";
const ID = "cccccccc-0000-0000-0000-000000000001";
const faktura = (x: Riadok = {}) => ({
  id: ID,
  company_id: FIRMA,
  status: "issued",
  issue_date: "2026-09-15",
  total: 100,
  deleted_at: null,
  exported_at: null,
  ...x,
});
const ctx = (sb: any) => ({ supabase: sb, company_id: FIRMA, mode: "live" }) as any;
const tab = (f: Riadok, locked_until: string | null = null, logy: Riadok[] = []) =>
  klient({
    invoices: [f],
    companies: [{ id: FIRMA, locked_until }],
    export_logs: logy,
  });

describe("uzavreté obdobie v API", () => {
  it("dovodZamkuApi hlási obdobie aj pre vystavenú faktúru", () => {
    expect(dovodZamkuApi("invoices", { issue_date: "2026-09-15" }, "2026-09-30")).toBe("obdobie");
    expect(dovodZamkuApi("invoices", { issue_date: "2026-10-01" }, "2026-09-30")).toBeNull();
    expect(dovodZamkuApi("invoices", { issue_date: "2026-09-15" })).toBeNull();
    // Odovzdanie má prednosť.
    expect(
      dovodZamkuApi("invoices", { issue_date: "2026-09-15", exported_at: "x" }, "2026-09-30"),
    ).toBe("odovzdany");
  });
  it("aj presun dátumu DO uzavretého obdobia", () => {
    expect(
      vUzavretomObdobi("invoices", "2026-09-30", { issue_date: "2026-10-05" }, { issue_date: "2026-09-01" }),
    ).toBe(true);
  });
  it("chránené stĺpce zodpovedajú spúšťaču + storno", () => {
    expect(OBDOBIE_STLPCE.invoices.stlpce).toContain("cancelled_at");
    expect(OBDOBIE_STLPCE.invoices.stlpce).toContain("deleted_at");
    expect(OBDOBIE_STLPCE.invoices.stlpce).not.toContain("status");
    expect(OBDOBIE_STLPCE.invoices.stlpce).not.toContain("paid_at");
    expect(zmenyVObdobi("invoices", { total: 100 }, { total: 100, notes: "x" })).toEqual([]);
  });
  it("text ako v spúšťači", () => {
    expect(spravaZamkuObdobia("2026-09-30")).toBe(
      "Obdobie je uzamknuté do 30.09.2026. Doklad z uzavretého obdobia sa už nedá meniť ani mazať.",
    );
  });
  it("strazZamku: zmena dátumu v uzavretom období → 409 obdobie, poznámka prejde", () => {
    const r = strazZamku("invoices", faktura(), { delivery_date: "2026-09-16" }, "2026-09-30");
    expect(r?.status).toBe(409);
    expect(r?.body.error.details.reason).toBe("obdobie");
    expect(strazZamku("invoices", faktura(), { notes: "x" }, "2026-09-30")).toBeNull();
  });
});

describe("POST /invoices/{id}/cancel", () => {
  it("bežná faktúra sa stornuje", async () => {
    const sb = tab(faktura());
    const r = await stornujFakturuApi(ctx(sb), ID);
    expect(r.status).toBe(200);
    expect(sb.zmeny[0]?.zmena.status).toBe("cancelled");
  });
  it("odovzdaná bez čísla z Pohody → 409 locked, nič sa nezapíše", async () => {
    const sb = tab(faktura({ exported_at: "2026-10-01T10:00:00Z" }));
    const r = await stornujFakturuApi(ctx(sb), ID);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("locked");
    expect(r.body.error.details.reason).toBe("odovzdany");
    expect(sb.zmeny).toHaveLength(0);
  });
  it("odovzdaná, Pohoda vrátila číslo → storno prejde (ako spúšťač)", async () => {
    const sb = tab(faktura({ exported_at: "2026-10-01T10:00:00Z" }), null, [
      { invoice_id: ID, status: "ok", pohoda_cislo: "FV0042" },
    ]);
    expect((await stornujFakturuApi(ctx(sb), ID)).status).toBe(200);
  });
  it("uzavreté obdobie → 409 locked obdobie", async () => {
    const sb = tab(faktura(), "2026-09-30");
    const r = await stornujFakturuApi(ctx(sb), ID);
    expect(r.status).toBe(409);
    expect(r.body.error.details.reason).toBe("obdobie");
    expect(r.body.error.message).toContain("30.09.2026");
    expect(sb.zmeny).toHaveLength(0);
  });
  it("zmazaná faktúra → 404, stornovaná → 409 invalid_state", async () => {
    expect((await stornujFakturuApi(ctx(tab(faktura({ deleted_at: "x" }))), ID)).status).toBe(404);
    const r = await stornujFakturuApi(ctx(tab(faktura({ status: "cancelled" }))), ID);
    expect(r.body.error.code).toBe("invalid_state");
  });
});
