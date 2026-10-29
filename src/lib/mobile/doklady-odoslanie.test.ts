import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { zaznamZFronty } from "./doklady-odoslanie";
import type { CakajuciDoklad } from "./doklady-fronta";
import type { BlocekVysledok } from "@/lib/faktero/blocek.functions";

const vysledok = {
  zdroj: "ekasa",
  overeny: true,
  total: 9.9,
  date: "2026-10-29",
  qr_raw: "O-123",
  items: [],
} as BlocekVysledok;

const priloha = { path: "firma/a.jpg", mime: "image/jpeg", size: 1000 };

function doklad(zmena: Partial<CakajuciDoklad>): CakajuciDoklad {
  return { id: "1", company_id: "firma", uhrada: "karta", ts: 0, ...zmena };
}

describe("zaznamZFronty", () => {
  it("doklad s povinnou fotkou nesie značku appky aj súbor", () => {
    const z = zaznamZFronty(
      doklad({ fotkaPovinna: true, obrazok: "data:image/jpeg;base64,AA" }),
      vysledok,
      priloha,
    );
    expect(z).toMatchObject({ zdroj: "apka", source: "qr", file_path: "firma/a.jpg" });
  });

  it("doklad s povinnou fotkou, ktorý ju nemá, nesie značku — server ho odmietne", () => {
    const z = zaznamZFronty(doklad({ fotkaPovinna: true }), vysledok, null);
    expect(z).toMatchObject({ zdroj: "apka", file_path: null });
  });

  it("starý záznam vo fronte bez fotky ide po starom, bez značky", () => {
    const z = zaznamZFronty(doklad({}), vysledok, null);
    expect(z).not.toHaveProperty("zdroj");
  });

  it("zálohovú faktúru označí, aby nešla medzi bločky", () => {
    const z = zaznamZFronty(
      doklad({ fotkaPovinna: true, obrazok: "data:image/jpeg;base64,AA" }),
      { ...vysledok, zalohova: true },
      priloha,
    );
    expect(z).toMatchObject({ zdroj: "apka", zalohova: true });
  });
});
