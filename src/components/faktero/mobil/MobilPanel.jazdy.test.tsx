import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

/**
 * Bočný panel vie, v ktorej appke stojí.
 *
 * Panel je spoločný pre Faktero aj pre Knihu jázd, ale odkazy von z neho nie
 * sú. V Knihe jázd ponúkal „Návody k Fakteru", návod k pokladni a „Otvoriť
 * Faktero na webe" — teda agendu, ktorú tá appka vôbec nemá. Vetvenie je podľa
 * `JE_KNIHA_JAZD`, čo je konštanta zo zostavenia, takže sa tu podsúva.
 */
vi.mock("@/lib/mobile/apka", () => ({ APKA: "jazdy", JE_KNIHA_JAZD: true }));

const firma = { id: "11111111-1111-1111-1111-111111111111", name: "Skúšobná s.r.o." };
const nic = () => {};

async function panel() {
  const { MobilPanel } = await import("./MobilPanel");
  return renderToString(
    <MobilPanel
      otvoreny
      onZavri={nic}
      email="skuska@faktero.sk"
      firma={firma}
      viacFiriem={false}
      onZmenitFirmu={nic}
      onUcet={nic}
      onOdhlasit={nic}
    />,
  );
}

describe("bočný panel v Knihe jázd", () => {
  it("návody vedú ku knihe jázd, nie k Fakteru", async () => {
    const html = await panel();
    expect(html).toContain("Návody ku knihe jázd");
    expect(html).not.toContain("Návody k Fakteru");
  });

  it("otvorenie na webe vedie na jazdy", async () => {
    const html = await panel();
    expect(html).toContain("Otvoriť Knihu jázd na webe");
    expect(html).not.toContain("Otvoriť Faktero na webe");
  });

  it("bločky z eKasy sa neponúkajú — appka pokladňu nemá", async () => {
    const html = await panel();
    expect(html).not.toContain("Bločky a pokladňa");
  });
});
