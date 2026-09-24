/**
 * Volanie registra VIES.
 *
 * Používa sa REST rozhranie Európskej komisie. Register býva po častiach
 * nedostupný (jednotlivé štáty odpovedajú samostatne), takže výpadok sa hlási
 * ako výpadok — nie ako neplatné IČ DPH. To je dôležité: neplatné IČ DPH
 * znamená, že faktúra nesmie ísť bez dane, kým výpadok neznamená nič.
 */

import { rozdelIcDph, vysledokZOdpovede, type VysledokVies } from "./vies";

const ZAKLAD = "https://ec.europa.eu/taxation_customs/vies/rest-api/ms";

export async function overVies(icDph: string): Promise<VysledokVies> {
  const rozdelene = rozdelIcDph(icDph);
  if (!rozdelene) {
    return {
      platne: false,
      chyba: "IČ DPH nemá platný tvar (napr. CZ12345678).",
      overene: new Date().toISOString(),
    };
  }
  const { kod, cislo } = rozdelene;
  try {
    const res = await fetch(`${ZAKLAD}/${kod}/vat/${cislo}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      return {
        platne: false,
        chyba: `Register VIES odpovedal ${res.status} — skúste o chvíľu znova.`,
        overene: new Date().toISOString(),
      };
    }
    return vysledokZOdpovede(await res.json());
  } catch (e) {
    return {
      platne: false,
      chyba: `Register VIES je nedostupný (${String((e as Error)?.message ?? e).slice(0, 80)}).`,
      overene: new Date().toISOString(),
    };
  }
}
