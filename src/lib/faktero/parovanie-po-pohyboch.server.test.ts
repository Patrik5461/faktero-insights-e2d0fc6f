import { beforeEach, describe, expect, it, vi } from "vitest";

const { faktury, splatky, kontokorent, oznam } = vi.hoisted(() => ({
  faktury: vi.fn(),
  splatky: vi.fn(),
  kontokorent: vi.fn(),
  oznam: vi.fn(),
}));

vi.mock("./parovanie.functions", () => ({ sparujFirmuAutomaticky: faktury }));
vi.mock("./financovanie.functions", () => ({ sparujSplatkyFirmyAutomaticky: splatky }));
vi.mock("./kontokorent.server", () => ({ sparujKontokorentyFirmyAutomaticky: kontokorent }));
vi.mock("./push-uhrada.server", () => ({ oznamUhradu: oznam }));

import { sparujNovePohybyFirmy } from "./parovanie-po-pohyboch.server";

describe("sparujNovePohybyFirmy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("spustí všetky tri prechody a pri úhrade pošle upozornenie", async () => {
    const uhradene = [
      { id: "f1", invoice_number: "1", total: 10, currency: "EUR", customer_name: null },
    ];
    faktury.mockResolvedValue({ zapisanych: 1, uhradene });
    splatky.mockResolvedValue({ zapisanych: 2 });
    kontokorent.mockResolvedValue({ zapisanych: 0 });

    const v = await sparujNovePohybyFirmy("firma-1", "import-vypisu");

    expect(v).toEqual({ faktur: 1, splatok: 2, kontokorent: 0 });
    expect(faktury).toHaveBeenCalledWith("firma-1");
    expect(splatky).toHaveBeenCalledWith("firma-1");
    expect(kontokorent).toHaveBeenCalledWith("firma-1");
    expect(oznam).toHaveBeenCalledWith("firma-1", uhradene);
  });

  it("bez úhrady upozornenie neposiela", async () => {
    faktury.mockResolvedValue({ zapisanych: 0, uhradene: [] });
    splatky.mockResolvedValue({ zapisanych: 0 });
    kontokorent.mockResolvedValue({ zapisanych: 0 });
    await sparujNovePohybyFirmy("firma-1");
    expect(oznam).not.toHaveBeenCalled();
  });

  it("zlyhanie jedného prechodu nezastaví ostatné", async () => {
    faktury.mockRejectedValue(new Error("db"));
    splatky.mockRejectedValue(new Error("db"));
    kontokorent.mockResolvedValue({ zapisanych: 3 });
    const v = await sparujNovePohybyFirmy("firma-1");
    expect(v).toEqual({ faktur: 0, splatok: 0, kontokorent: 3 });
  });
});
