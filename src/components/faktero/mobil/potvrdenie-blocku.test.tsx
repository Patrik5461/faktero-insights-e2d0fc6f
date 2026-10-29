import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { Potvrdenie } from "./MobilApp";
import type { BlocekVysledok } from "@/lib/faktero/blocek.functions";

/**
 * Bloček v appke sa bez fotky uložiť nedá (Patrik, 2026-10-29).
 *
 * Po načítaní samotného QR kódu je obrazovka „Skontrolujte doklad" bez fotky:
 * výzva odfotiť bloček je hore a tlačidlo Uložiť je neaktívne.
 */
const vysledok = {
  zdroj: "ekasa",
  overeny: true,
  supplier: "Potraviny s.r.o.",
  total: 12.5,
  date: "2026-10-29",
  qr_raw: "O-123",
  items: [],
} as BlocekVysledok;
const nic = () => {};

function vykresli(foto: string | null, uhrada: "karta" | null) {
  return renderToString(
    <Potvrdenie
      vysledok={vysledok}
      duplikat={null}
      uhrada={uhrada}
      setUhrada={nic}
      foto={foto}
      onOdfotit={nic}
      onUloz={nic}
      onSpat={nic}
    />,
  );
}

/** Hlavné tlačidlo v pätičke — jediné s `disabled` na tejto obrazovke. */
function tlacidloUlozit(html: string): string {
  const m = /<button[^>]*disabled[^>]*>/.exec(html);
  return m?.[0] ?? "";
}

describe("potvrdenie bločku v appke", () => {
  it("bez fotky ukáže výzvu a Uložiť je neaktívne, aj keď je úhrada vybraná", () => {
    const html = vykresli(null, "karta");
    expect(html).toContain("Odfoťte bloček — bez fotky sa uložiť nedá");
    expect(html).toContain("Odfotiť bloček");
    expect(html).toContain("Najprv odfoťte bloček");
    expect(tlacidloUlozit(html)).not.toBe("");
    expect(html).not.toContain("Uložiť doklad");
  });

  it("s fotkou a úhradou sa dá uložiť", () => {
    const html = vykresli("data:image/jpeg;base64,AA", "karta");
    expect(html).not.toContain("bez fotky sa uložiť nedá");
    expect(html).toContain("Uložiť doklad");
    expect(tlacidloUlozit(html)).toBe("");
  });

  it("s fotkou bez úhrady pýta úhradu", () => {
    const html = vykresli("data:image/jpeg;base64,AA", null);
    expect(html).not.toContain("bez fotky sa uložiť nedá");
    expect(html).toContain("Vyberte spôsob úhrady");
  });
});
