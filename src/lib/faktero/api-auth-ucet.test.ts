import { describe, expect, it, vi } from "vitest";

/*
  Kľúč účtu (viac firiem): výber firmy z hlavičky X-Company / ?company=.
  Databázu nahrádza falošný klient — vráti členstvá a firmy z pamäte.
*/
const CLENSTVA = [
  { user_id: "u1", company_id: "f1", role: "owner" },
  { user_id: "u1", company_id: "f2", role: "admin" },
  { user_id: "u1", company_id: "f3", role: "employee" },
];
const FIRMY = [
  { id: "f1", name: "Prvá", ico: "11111111", ic_dph: null, country: "SK" },
  { id: "f2", name: "Druhá", ico: "22 222 222", ic_dph: null, country: "SK" },
  { id: "f3", name: "Tretia", ico: "33333333", ic_dph: null, country: "SK" },
];
vi.mock("@/integrations/supabase/client.server", () => {
  const dotaz = (tabulka: string) => {
    const filtre: ((r: any) => boolean)[] = [];
    const q: any = {
      select: () => q,
      eq: (k: string, v: any) => (filtre.push((r) => r[k] === v), q),
      in: (k: string, v: any[]) => (filtre.push((r) => v.includes(r[k])), q),
      order: () => q,
      maybeSingle: async () => ({ data: riadky().find((r) => filtre.every((f) => f(r))) ?? null }),
      then: (ok: any) =>
        Promise.resolve({ data: riadky().filter((r) => filtre.every((f) => f(r))) }).then(ok),
    };
    const riadky = () =>
      tabulka === "company_users" ? CLENSTVA : tabulka === "companies" ? FIRMY : [];
    return q;
  };
  return { supabaseAdmin: { from: dotaz } };
});

const { vyberFirmu, firmyKluca } = await import("./api-auth.server");
const req = (hlavicka?: string, query = "") =>
  new Request(`https://www.faktero.sk/api/v1/invoices${query}`, {
    headers: hlavicka ? { "x-company": hlavicka } : {},
  });

describe("kľúč účtu", () => {
  const ucet = { id: "k", company_id: "f1", ucet_user_id: "u1", firmy: null };
  it("smie len k firmám, kde je vlastník alebo admin", async () => {
    expect((await firmyKluca(ucet)).map((f) => f.id).sort()).toEqual(["f1", "f2"]);
  });
  it("bez firmy pri viacerých firmách vráti company_required so zoznamom", async () => {
    const v: any = await vyberFirmu(ucet, req());
    expect(v.ok).toBe(false);
    expect(v.code).toBe("company_required");
    expect(v.firmy).toHaveLength(2);
  });
  it("firma podľa id, IČO (aj s medzerami) a ?company=", async () => {
    expect(await vyberFirmu(ucet, req("f2"))).toMatchObject({
      ok: true,
      company_id: "f2",
      ucet: true,
    });
    expect(await vyberFirmu(ucet, req("22222222"))).toMatchObject({ ok: true, company_id: "f2" });
    expect(await vyberFirmu(ucet, req(undefined, "?company=11111111"))).toMatchObject({
      ok: true,
      company_id: "f1",
    });
  });
  it("firma, kde je len zamestnanec, alebo cudzia firma je zakázaná", async () => {
    expect(await vyberFirmu(ucet, req("f3"))).toMatchObject({
      ok: false,
      code: "company_forbidden",
    });
    expect(await vyberFirmu(ucet, req("f9"))).toMatchObject({
      ok: false,
      code: "company_forbidden",
    });
  });
  it("zúžený kľúč smie len k vybraným firmám", async () => {
    const zuzeny = { ...ucet, firmy: ["f2"] };
    expect((await firmyKluca(zuzeny)).map((f) => f.id)).toEqual(["f2"]);
    // jediná firma — netreba ju uvádzať
    expect(await vyberFirmu(zuzeny, req())).toMatchObject({ ok: true, company_id: "f2" });
    expect(await vyberFirmu(zuzeny, req("f1"))).toMatchObject({
      ok: false,
      code: "company_forbidden",
    });
  });
});

describe("kľúč firmy", () => {
  const firmy = { id: "k2", company_id: "f1", ucet_user_id: null, firmy: null };
  it("ide vždy na svoju firmu; iná firma v hlavičke je chyba", async () => {
    expect(await vyberFirmu(firmy, req())).toMatchObject({
      ok: true,
      company_id: "f1",
      ucet: false,
    });
    expect(await vyberFirmu(firmy, req("11111111"))).toMatchObject({ ok: true, company_id: "f1" });
    expect(await vyberFirmu(firmy, req("f2"))).toMatchObject({
      ok: false,
      code: "company_forbidden",
    });
  });
});
