/*
  Testovacia firma („Test – <názov>“).

  Každá skutočná firma má jednu testovaciu kópiu (`companies.testovacia_pre`
  = id skutočnej firmy). Vidia ju len členovia skutočnej firmy (členstvo sa
  zrkadlí spúšťačom v DB) a slúži na skúšanie funkcií bez dopadu na ostré dáta.

  Pravidlá, ktoré musia držať všetky cesty:
    - nič neodchádza von (e-maily, eFaktúra, banka, Pohoda, push, webhooky…),
    - nič nestojí peniaze (predplatné je zadarmo navždy, GoPay sa nevolá),
    - testovacia firma nemá IČO (NULL), aby ju žiadne párovanie podľa IČO
      nevybralo namiesto skutočnej; párovanie podľa DIČ/IČ DPH ju vynecháva
      filtrom `testovacia_pre is null`.

  Tento súbor je čistý (bez servera) — používa ho UI aj server.
*/

export const PREDPONA_TESTOVACEJ = "Test – ";

/** Hláška pri zastavenom e-maile (kľúč prekladu = slovenský text). */
export const HLASKA_TESTOVACIA_EMAIL = "Testovacia firma — e-mail sa neodoslal (náhľad)";

/** Všeobecná hláška pri zastavenej akcii, ktorá by išla mimo Faktera. */
export const HLASKA_TESTOVACIA_AKCIA =
  "Testovacia firma — táto akcia by išla mimo Faktera, preto sa v testovacej firme nevykoná.";

export type FirmaSTestom = { testovacia_pre?: string | null } | null | undefined;

/** Je firma testovacia? */
export function jeTestovacia(f: FirmaSTestom): boolean {
  return !!f?.testovacia_pre;
}

/** Názov testovacej firmy podľa skutočnej (rovnako ako v SQL `faktero_zaloz_testovaciu_firmu`). */
export function nazovTestovacej(nazovFirmy: string): string {
  const n = String(nazovFirmy ?? "").trim();
  return n.startsWith(PREDPONA_TESTOVACEJ) ? n : `${PREDPONA_TESTOVACEJ}${n}`;
}

/**
 * Zoradí firmy pre prepínač: testovacia ide hneď pod svoju skutočnú firmu.
 * Ostatné poradie ostáva tak, ako prišlo. Testovacia bez rodiča v zozname
 * (napr. člen len testovacej) ide na koniec.
 */
export function zoradSTestovacimi<T extends { id: string; testovacia_pre?: string | null }>(
  firmy: T[],
): T[] {
  const skutocne = firmy.filter((f) => !f.testovacia_pre);
  const testPodla = new Map<string, T[]>();
  for (const f of firmy) {
    if (!f.testovacia_pre) continue;
    const z = testPodla.get(f.testovacia_pre) ?? [];
    z.push(f);
    testPodla.set(f.testovacia_pre, z);
  }
  const vysledok: T[] = [];
  const pouzite = new Set<string>();
  for (const f of skutocne) {
    vysledok.push(f);
    for (const t of testPodla.get(f.id) ?? []) {
      vysledok.push(t);
      pouzite.add(t.id);
    }
  }
  for (const f of firmy) if (f.testovacia_pre && !pouzite.has(f.id)) vysledok.push(f);
  return vysledok;
}

/** Akcia zastavená preto, že ide o testovaciu firmu. Správa je pre človeka. */
export class TestovaciaFirmaZastavene extends Error {
  constructor(message: string = HLASKA_TESTOVACIA_AKCIA) {
    super(message);
    this.name = "TestovaciaFirmaZastavene";
  }
}

export function jeZastaveneTestom(e: unknown): e is TestovaciaFirmaZastavene {
  return (
    e instanceof TestovaciaFirmaZastavene || (e as any)?.name === "TestovaciaFirmaZastavene"
  );
}
