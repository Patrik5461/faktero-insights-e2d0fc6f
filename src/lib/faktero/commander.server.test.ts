import { describe, expect, it } from "vitest";
import { jePrazdnaStranka } from "./commander.server";

/**
 * Commander na okno bez jázd neodpovie prázdnym poľom, ale 404 s hláškou
 * „Page not found“. Rozlíšenie od naozaj chýbajúceho vozidla je jediné, čo
 * medzi „všetko je v poriadku“ a „integrácia hlási chybu“ rozhoduje.
 */
describe("jePrazdnaStranka", () => {
  it("404 s „Page not found“ je koniec zoznamu", () => {
    expect(jePrazdnaStranka(404, '{"status":"error","message":"Page not found"}')).toBe(true);
    expect(jePrazdnaStranka(404, '{"message":"page not found"}')).toBe(true);
  });

  it("404 s „Vehicle not found“ je skutočná chyba", () => {
    expect(jePrazdnaStranka(404, '{"status":"error","message":"Vehicle not found"}')).toBe(false);
  });

  it("iné stavy nie sú prázdna stránka", () => {
    expect(jePrazdnaStranka(500, "Page not found")).toBe(false);
    expect(jePrazdnaStranka(200, "")).toBe(false);
  });
});
