import { describe, expect, it } from "vitest";
import { kodyVJson, rozdelNaMazanie } from "./ciselnik-mazanie";
import { zmazKodyCiselnika, nastavAktivneKodov } from "./ciselnik-mazanie.server";

/* Falošný klient Supabase: tabuľky v pamäti, filtre eq/in/not is null, delete/update so select. */
type Riadok = Record<string, any>;
function falosnyKlient(tabulky: Record<string, Riadok[]>) {
  const log: { tabulka: string; op: string }[] = [];
  const hodnota = (r: Riadok, stlpec: string) => stlpec.split(".").reduce((o, k) => o?.[k], r as any);
  function from(tabulka: string) {
    const filtre: ((r: Riadok) => boolean)[] = [];
    let op: "select" | "delete" | "update" = "select";
    let zmena: Riadok = {};
    let od = 0;
    let po = Infinity;
    let jeden = false;
    const q: any = {
      select: () => q,
      eq: (s: string, v: unknown) => (filtre.push((r) => hodnota(r, s) === v), q),
      in: (s: string, v: unknown[]) => (filtre.push((r) => v.includes(hodnota(r, s))), q),
      not: (s: string, o: string, v: unknown) => {
        if (o === "is" && v === null) filtre.push((r) => hodnota(r, s) != null);
        return q;
      },
      order: () => q,
      limit: (n: number) => ((po = n - 1), q),
      range: (a: number, b: number) => ((od = a), (po = b), q),
      delete: () => ((op = "delete"), q),
      update: (z: Riadok) => ((op = "update"), (zmena = z), q),
      maybeSingle: () => ((jeden = true), q),
      then: (ok: any, chyba: any) => {
        log.push({ tabulka, op });
        const t = (tabulky[tabulka] ??= []);
        const zhoda = t.filter((r) => filtre.every((f) => f(r)));
        if (op === "delete") tabulky[tabulka] = t.filter((r) => !zhoda.includes(r));
        if (op === "update") zhoda.forEach((r) => Object.assign(r, zmena));
        const data = jeden ? (zhoda[0] ?? null) : zhoda.slice(od, po + 1);
        return Promise.resolve({ data, error: null }).then(ok, chyba);
      },
    };
    return q;
  }
  return { klient: { from }, log, tabulky };
}

const F = "11111111-1111-1111-1111-111111111111";
const INA = "22222222-2222-2222-2222-222222222222";
const p = (id: string, kod: string, druh = "predkontacia", company_id = F) => ({ id, kod, druh, company_id, aktivne: true });

describe("mazanie kódov číselníka", () => {
  it("kódy v rozúčtovaní a pomere", () => {
    const j = [{ predkontacia: "1Fp", clenenie: "PD" }, { predkontacia: " 2Fp ", stredisko: "BA" }];
    expect([...kodyVJson(j, ["predkontacia"])]).toEqual(["1Fp", "2Fp"]);
    expect([...kodyVJson({ typ: "dph5050", zdanitelna: "X", casti: [{ predkontacia: "Y" }] }, ["predkontacia", "zdanitelna"])]).toEqual(["X", "Y"]);
  });

  it("rovnaký kód v inom riadku, ktorý ostáva, nebráni zmazaniu", () => {
    const pouzitie = new Map([["1Fp", new Set(["doklady" as const])]]);
    const r = rozdelNaMazanie([p("a", "1Fp")], [p("a", "1Fp"), p("b", "1Fp")], pouzitie);
    expect(r).toEqual({ zmazat: ["a"], pouzite: [] });
    const r2 = rozdelNaMazanie([p("a", "1Fp"), p("b", "1Fp")], [p("a", "1Fp"), p("b", "1Fp")], pouzitie);
    expect(r2.zmazat).toEqual([]);
    expect(r2.pouzite.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("zmaže nepoužité jedným požiadavkom, použité vráti s miestom použitia", async () => {
    const { klient, log, tabulky } = falosnyKlient({
      predkontacie: [
        p("a", "1Fp"),
        p("b", "2Fp"),
        p("c", "3Fp"),
        p("d", "4Fp"),
        p("e", "5Fp"),
        p("f", "6Fp"),
        p("x", "PD", "clenenie_dph"),
        p("cudzi", "1Fp", "predkontacia", INA),
      ],
      purchase_invoices: [
        { id: "pi1", company_id: F, pohoda_predkontacia: "1Fp", rozuctovanie: null },
        // Iná firma — jej použitie sa nepočíta.
        { id: "pi2", company_id: INA, pohoda_predkontacia: "2Fp", rozuctovanie: null },
      ],
      expense_documents: [{ id: "e1", company_id: F, rozuctovanie: [{ predkontacia: "3Fp", clenenie: "PD" }] }],
      invoice_items: [{ id: "ii", pohoda_predkontacia: "4Fp", invoices: { company_id: F } }],
      companies: [{ id: F, pohoda_predkontacia_prijata: "5Fp", pohoda_predkontacie_oznaceni: {} }],
    });
    const r = await zmazKodyCiselnika(klient, {
      companyId: F,
      druh: "predkontacia",
      ids: ["a", "b", "c", "d", "e", "f", "cudzi", "x"],
    });
    expect(r.zmazane.sort()).toEqual(["b", "f"]);
    expect(r.pouzite.map((x) => [x.kod, x.kde])).toEqual([
      ["1Fp", ["doklady"]],
      ["3Fp", ["doklady"]],
      ["4Fp", ["doklady"]],
      ["5Fp", ["nastavenia"]],
    ]);
    // Cudzia firma a iný druh sa nemažú.
    expect(r.nezmazane.sort()).toEqual(["cudzi", "x"]);
    expect(log.filter((l) => l.op === "delete")).toHaveLength(1);
    expect(tabulky.predkontacie.map((x) => x.id).sort()).toEqual(["a", "c", "cudzi", "d", "e", "x"]);

    await nastavAktivneKodov(klient, { companyId: F, ids: r.pouzite.map((x) => x.id).concat("cudzi"), aktivne: false });
    expect(tabulky.predkontacie.filter((x) => !x.aktivne).map((x) => x.id).sort()).toEqual(["a", "c", "d", "e"]);
  });

  it("zákazka je použitá, keď na zákazku s týmto číslom odkazuje doklad", async () => {
    const { klient } = falosnyKlient({
      predkontacie: [p("z1", "ZAK-1", "zakazka"), p("z2", "ZAK-2", "zakazka")],
      jobs: [
        { id: "j1", company_id: F, job_number: "ZAK-1" },
        { id: "j2", company_id: F, job_number: "ZAK-2" },
      ],
      invoices: [{ id: "i1", company_id: F, job_id: "j1" }],
    });
    const r = await zmazKodyCiselnika(klient, { companyId: F, druh: "zakazka", ids: ["z1", "z2"] });
    expect(r.zmazane).toEqual(["z2"]);
    expect(r.pouzite.map((x) => x.kod)).toEqual(["ZAK-1"]);
  });

  it("bankový účet: skratka na účte firmy", async () => {
    const { klient } = falosnyKlient({
      predkontacie: [p("b1", "TB", "bankovy_ucet"), p("b2", "SLSP", "bankovy_ucet")],
      company_bank_accounts: [{ id: "u", company_id: F, pohoda_skratka: "TB" }],
      companies: [{ id: F, pohoda_banka: null }],
    });
    const r = await zmazKodyCiselnika(klient, { companyId: F, druh: "bankovy_ucet", ids: ["b1", "b2"] });
    expect(r.zmazane).toEqual(["b2"]);
    expect(r.pouzite).toEqual([{ id: "b1", kod: "TB", kde: ["ucty"] }]);
  });
});
