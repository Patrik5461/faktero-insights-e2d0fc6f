/**
 * Hromadný import a export cenníka (Produkty → Exportovať / Importovať cenník).
 *
 * - doplní ceny cenových hladín od prvého kusu (export má v stĺpcoch hladín čo ukázať),
 * - `importuj_cennik` — prepis databázovej funkcie zo
 *   `supabase/migrations/20261105120000_cennik_import.sql` nad demo pamäťou.
 */
import type { DemoDb, Riadok } from "../server/db";
import { registrujRpc } from "../server/rpc";
import { FIRMA } from "./zaklad";
import { produkt, PRODUKTY } from "./kontakty";
import { cas, r2, uid } from "./pomocne";

export function naplnCennikImport(db: DemoDb) {
  const skupiny = ["vip", "velkoobchod", "partner", "skola"];
  const koef: Record<string, number> = { vip: 0.9, velkoobchod: 0.85, partner: 0.95, skola: 0.8 };
  const ceny = db.tabulka("product_prices");
  const nove: Riadok[] = [];
  PRODUKTY.slice(0, 8).forEach((p, i) => {
    skupiny.forEach((sk, j) => {
      // Každý tretí produkt hladinu vynechá — aby export ukázal aj prázdne bunky.
      if ((i + j) % 3 === 2) return;
      const gid = uid(`cenova-skupina:${sk}`);
      const pid = produkt(p.kluc);
      if (
        ceny.some(
          (c) => c.product_id === pid && c.price_group_id === gid && Number(c.min_quantity) <= 1,
        )
      )
        return;
      nove.push({
        id: uid(`cena:hladina:${p.kluc}:${sk}`),
        company_id: FIRMA,
        product_id: pid,
        price_group_id: gid,
        customer_id: null,
        unit_price: r2(Number(p.unit_price) * koef[sk]),
        min_quantity: 0,
        created_at: cas(-120 + i),
      });
    });
  });
  db.vloz("product_prices", nove);

  registrujRpc("importuj_cennik", (a, d) => {
    const firma = String(a.p_company_id);
    const polozky: Riadok[] = Array.isArray(a.p_polozky) ? a.p_polozky : [];
    const out = {
      nove_hladiny: 0,
      nove_produkty: 0,
      upravene_produkty: 0,
      nove_ceny: 0,
      zmenene_ceny: 0,
      zmazane_ceny: 0,
    };
    const hladiny = d.tabulka("price_groups");
    for (const meno of (a.p_nove_hladiny ?? []) as string[]) {
      const n = String(meno).trim();
      if (!n) continue;
      const uz = hladiny.find((g) => g.company_id === firma && g.name === n);
      if (uz) {
        if (uz.deleted_at) {
          uz.deleted_at = null;
          out.nove_hladiny += 1;
        }
      } else {
        d.vloz("price_groups", [{ company_id: firma, name: n, discount_percent: 0 }]);
        out.nove_hladiny += 1;
      }
    }
    const produkty = d.tabulka("products");
    const ceny = d.tabulka("product_prices");
    for (const p of polozky) {
      let pid = p.product_id as string | null;
      if (!pid) {
        const [r] = d.vloz("products", [
          {
            company_id: firma,
            code: p.code,
            name: p.name,
            unit: p.unit ?? "ks",
            vat_rate: p.vat_rate ?? 23,
            unit_price: p.unit_price ?? 0,
            external_id: p.external_id ?? null,
            active: true,
          },
        ]);
        pid = r.id as string;
        out.nove_produkty += 1;
      } else {
        const r = produkty.find((x) => x.id === pid && x.company_id === firma && !x.deleted_at);
        if (!r)
          throw new Error(`Riadok ${p.riadok}: produkt nepatrí tejto firme alebo je zmazaný.`);
        let zmena = false;
        for (const k of ["code", "name", "unit", "vat_rate", "unit_price", "external_id"]) {
          if (p[k] != null && r[k] !== p[k]) {
            r[k] = p[k];
            zmena = true;
          }
        }
        if (zmena) out.upravene_produkty += 1;
      }
      for (const c of p.ceny ?? []) {
        const g = hladiny.find(
          (x) =>
            x.company_id === firma &&
            !x.deleted_at &&
            (c.hladina_id
              ? x.id === c.hladina_id
              : x.name.toLowerCase() === String(c.hladina).toLowerCase()),
        );
        if (!g)
          throw new Error(
            `Riadok ${p.riadok}: cenová hladina ${c.hladina ?? c.hladina_id} neexistuje.`,
          );
        const i = ceny.findIndex(
          (x) =>
            x.product_id === pid &&
            x.price_group_id === g.id &&
            !x.customer_id &&
            Number(x.min_quantity) <= 1,
        );
        if (c.cena == null) {
          if (i >= 0) {
            ceny.splice(i, 1);
            out.zmazane_ceny += 1;
          }
        } else if (i >= 0) {
          if (Number(ceny[i].unit_price) !== Number(c.cena)) {
            ceny[i].unit_price = c.cena;
            out.zmenene_ceny += 1;
          }
        } else {
          d.vloz("product_prices", [
            {
              company_id: firma,
              product_id: pid,
              price_group_id: g.id,
              customer_id: null,
              unit_price: c.cena,
              min_quantity: 0,
            },
          ]);
          out.nove_ceny += 1;
        }
      }
    }
    return out;
  });
}
