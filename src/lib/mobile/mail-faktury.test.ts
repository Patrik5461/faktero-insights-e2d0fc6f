import { describe, expect, it } from "vitest";
import { udajeMailuFaktury } from "./mail-faktury";

describe("odoslanie faktúry e-mailom z appky", () => {
  const faktura = { id: "f1", invoice_number: "FA2026007", customer_email: "a@faktero.sk" };

  it("posiela číslo, ktoré appka ukazovala (cislo_v_okne)", () => {
    expect(udajeMailuFaktury({ faktura })).toEqual({
      invoiceId: "f1",
      recipient_email: "a@faktero.sk",
      cislo_v_okne: "FA2026007",
    });
  });

  it("so šablónou, prílohami a starým dátumom", () => {
    expect(
      udajeMailuFaktury({
        faktura,
        sPrilohami: true,
        potvrdenyStaryDatum: true,
        sablona: { subject: "Faktúra [CISLO_FAKTURY]", message: "Dobrý deň" },
      }),
    ).toEqual({
      invoiceId: "f1",
      recipient_email: "a@faktero.sk",
      s_prilohami: true,
      potvrdeny_stary_datum: true,
      subject: "Faktúra [CISLO_FAKTURY]",
      message: "Dobrý deň",
      cislo_v_okne: "FA2026007",
    });
  });

  it("bez čísla (koncept) cislo_v_okne neposiela", () => {
    expect(udajeMailuFaktury({ faktura: { ...faktura, invoice_number: null } })).not.toHaveProperty(
      "cislo_v_okne",
    );
  });
});
