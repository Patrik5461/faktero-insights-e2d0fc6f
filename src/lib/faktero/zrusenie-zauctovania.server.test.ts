import { describe, expect, it } from "vitest";
import { textNezrusenia, zrusZauctovanie } from "./zrusenie-zauctovania.server";

/*
  Zrušenie zaúčtovania bločkov a prijatých faktúr — falošný PostgREST klient
  v pamäti (ako duplicita-zauctovania.server.test.ts).
*/

type Riadok = Record<string, any>;

function falosnyKlient(tabulky: Record<string, Riadok[]>) {
  const zapisy: { tabulka: string; zmena: Riadok; ids: string[] }[] = [];
  const from = (tabulka: string) => {
    const filtre: ((r: Riadok) => boolean)[] = [];
    let zmena: Riadok | null = null;
    const q: any = {
      select: () => q,
      eq: (k: string, v: any) => (filtre.push((r) => r[k] === v), q),
      in: (k: string, vs: any[]) => (filtre.push((r) => vs.includes(r[k])), q),
      is: (k: string, v: any) => (filtre.push((r) => (r[k] ?? null) === v), q),
      update: (z: Riadok) => ((zmena = z), q),
      vysledok() {
        const rs = (tabulky[tabulka] ?? []).filter((r) => filtre.every((f) => f(r)));
        if (zmena) {
          for (const r of rs) Object.assign(r, zmena);
          zapisy.push({ tabulka, zmena, ids: rs.map((r) => r.id) });
        }
        return rs.map((r) => ({ ...r }));
      },
      maybeSingle: async () => ({ data: q.vysledok()[0] ?? null, error: null }),
      then: (ok: any, zle: any) => Promise.resolve({ data: q.vysledok(), error: null }).then(ok, zle),
    };
    return q;
  };
  return { from, zapisy };
}

const FIRMA = "11111111-1111-4111-8111-111111111111";
const ZAUCTOVANE = "2026-10-30T10:00:00Z";
const blocek = (id: string, x: Riadok = {}) => ({
  id,
  company_id: FIRMA,
  document_number: id.toUpperCase(),
  status: "processed",
  issue_date: "2026-10-20",
  zauctovane_at: ZAUCTOVANE,
  zauctoval: "u1",
  pohoda_predkontacia: "1Fp",
  pohoda_clenenie_dph: "PD",
  kv_clenenie: "B3",
  auto_uctovanie_at: null,
  exported_at: null,
  locked_at: null,
  ...x,
});

describe("zrusZauctovanie — bločky", () => {
  it("zaúčtovaný bloček: príznak zmizne, kódy ostanú, autopilot ho znova nevezme", async () => {
    const b = blocek("b1");
    const sb = falosnyKlient({ expense_documents: [b], companies: [{ id: FIRMA, locked_until: null }] });
    const v = await zrusZauctovanie(sb, { companyId: FIRMA, agenda: "doklad", ids: ["b1"] });
    expect(v).toEqual({ zrusenych: 1, preskocene: [], dovody: {} });
    expect(b.zauctovane_at).toBeNull();
    expect(b.zauctoval).toBeNull();
    expect(b.pohoda_predkontacia).toBe("1Fp");
    expect(b.pohoda_clenenie_dph).toBe("PD");
    expect(b.kv_clenenie).toBe("B3");
    // Fronta autopilota berie len `auto_uctovanie_at is null`.
    expect(b.auto_uctovanie_at).toEqual(expect.any(String));
  });

  it("odovzdaný do Pohody sa nezmení", async () => {
    const b = blocek("b1", { exported_at: "2026-10-31T08:00:00Z" });
    const sb = falosnyKlient({ expense_documents: [b], companies: [{ id: FIRMA, locked_until: null }] });
    const v = await zrusZauctovanie(sb, { companyId: FIRMA, agenda: "doklad", ids: ["b1"] });
    expect(v.zrusenych).toBe(0);
    expect(v.dovody.b1).toBe("odovzdany");
    expect(v.preskocene[0]).toContain("vráťte z Pohody");
    expect(b.zauctovane_at).toBe(ZAUCTOVANE);
    expect(sb.zapisy).toEqual([]);
    expect(textNezrusenia("odovzdany", "doklad")).toBe(
      "Doklad je už odovzdaný do Pohody — najprv ho vráťte z Pohody, potom zrušte zaúčtovanie.",
    );
  });

  it("zamknutý doklad a doklad v uzavretom období sa nezmenia", async () => {
    const zamknuty = blocek("b1", { locked_at: "2026-10-31T08:00:00Z" });
    const vObdobi = blocek("b2", { issue_date: "2026-09-30" });
    const sb = falosnyKlient({
      expense_documents: [zamknuty, vObdobi],
      companies: [{ id: FIRMA, locked_until: "2026-09-30" }],
    });
    const v = await zrusZauctovanie(sb, { companyId: FIRMA, agenda: "doklad", ids: ["b1", "b2"] });
    expect(v.zrusenych).toBe(0);
    expect(v.dovody).toEqual({ b1: "zamknuty", b2: "obdobie" });
    expect(zamknuty.zauctovane_at).toBe(ZAUCTOVANE);
    expect(vObdobi.zauctovane_at).toBe(ZAUCTOVANE);
    expect(textNezrusenia("obdobie", "doklad")).toContain("uzamknutom období");
  });

  it("hromadne: zruší povolené, ostatné preskočí s dôvodom, nezaúčtované a cudzie nechá", async () => {
    const ok = blocek("b1");
    const odovzdany = blocek("b2", { exported_at: "2026-10-31T08:00:00Z" });
    const nezauctovany = blocek("b3", { zauctovane_at: null, zauctoval: null });
    const cudzi = blocek("b4", { company_id: "ina-firma" });
    const sb = falosnyKlient({
      expense_documents: [ok, odovzdany, nezauctovany, cudzi],
      companies: [{ id: FIRMA, locked_until: null }],
    });
    const v = await zrusZauctovanie(sb, {
      companyId: FIRMA,
      agenda: "doklad",
      ids: ["b1", "b2", "b3", "b4"],
    });
    expect(v.zrusenych).toBe(1);
    expect(v.preskocene).toEqual(["B2: Odovzdaný do účtovníctva — najprv ho vráťte z Pohody"]);
    expect(ok.zauctovane_at).toBeNull();
    expect(nezauctovany.auto_uctovanie_at).toBeNull();
    expect(cudzi.zauctovane_at).toBe(ZAUCTOVANE);
  });
});

describe("zrusZauctovanie — prijaté faktúry", () => {
  it("zaúčtovaná sa vráti na prijatú, zaplatená ostane zaplatená, zmazaná sa nemení", async () => {
    const f = (id: string, x: Riadok = {}) => ({
      id,
      company_id: FIRMA,
      invoice_number: id,
      issue_date: "2026-10-20",
      zauctovane_at: ZAUCTOVANE,
      zauctoval: "u1",
      auto_uctovanie_at: null,
      exported_at: null,
      locked_at: null,
      deleted_at: null,
      ...x,
    });
    const booked = f("F1", { status: "booked" });
    const paid = f("F2", { status: "paid" });
    const zmazana = f("F3", { status: "booked", deleted_at: "2026-10-31T08:00:00Z" });
    const sb = falosnyKlient({
      purchase_invoices: [booked, paid, zmazana],
      companies: [{ id: FIRMA, locked_until: null }],
    });
    const v = await zrusZauctovanie(sb, { companyId: FIRMA, agenda: "prijata", ids: ["F1", "F2", "F3"] });
    expect(v.zrusenych).toBe(2);
    expect(booked).toMatchObject({ zauctovane_at: null, status: "received" });
    expect(paid).toMatchObject({ zauctovane_at: null, status: "paid" });
    expect(zmazana).toMatchObject({ zauctovane_at: ZAUCTOVANE, status: "booked" });
  });

  it("chyba databázy (spúšťač) sa ukáže tak, ako ju povie", async () => {
    const sb: any = falosnyKlient({
      expense_documents: [blocek("b1")],
      companies: [{ id: FIRMA, locked_until: null }],
    });
    const povodny = sb.from;
    sb.from = (t: string) => {
      const q = povodny(t);
      const update = q.update;
      q.update = (z: Riadok) => {
        update(z);
        q.then = (ok: any, zle: any) =>
          Promise.resolve({ data: null, error: { message: "Faktúra už bola odovzdaná do Pohody" } }).then(ok, zle);
        return q;
      };
      return q;
    };
    await expect(
      zrusZauctovanie(sb, { companyId: FIRMA, agenda: "doklad", ids: ["b1"] }),
    ).rejects.toThrow("Faktúra už bola odovzdaná do Pohody");
  });
});
