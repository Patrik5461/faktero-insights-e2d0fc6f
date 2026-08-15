import { describe, expect, it } from "vitest";
import { dalsiKrok, vyberFirmy } from "./start";

const A = { id: "a", name: "Alfa" };
const B = { id: "b", name: "Beta" };

describe("ktorá firma sa otvorí", () => {
  it("naposledy vybraná má prednosť", () => {
    expect(vyberFirmy([A, B], "b")).toBe(B);
  });

  it("jediná firma sa otvorí sama", () => {
    // Pýtať sa pri jedinej možnosti je len klik navyše.
    expect(vyberFirmy([A], null)).toBe(A);
  });

  it("pri viacerých bez uloženej voľby sa treba spýtať", () => {
    expect(vyberFirmy([A, B], null)).toBeNull();
  });

  it("uložená firma, ktorá už v zozname nie je, sa nepoužije", () => {
    // Odobratý prístup alebo prepnutý účet. Pracovať ďalej za firmu, do ktorej
    // človek nepatrí, by bola tichá chyba.
    expect(vyberFirmy([A, B], "c")).toBeNull();
  });

  it("uložená firma mimo zoznamu pri jedinej firme ustúpi tej jedinej", () => {
    expect(vyberFirmy([A], "c")).toBe(A);
  });

  it("prázdny zoznam nevyberie nič", () => {
    expect(vyberFirmy([], "a")).toBeNull();
  });
});

describe("kam appka po štarte pôjde", () => {
  it("bez relácie na prihlásenie", () => {
    expect(dalsiKrok({ maRelaciu: false, zoznamFiriem: [A], ulozenaFirmaId: "a" })).toBe(
      "prihlasenie",
    );
  });

  it("so zapamätanou reláciou rovno domov, aj keď sa nedá overiť", () => {
    // Toto je jadro offline režimu: relácia z telefónu stačí na otvorenie.
    expect(dalsiKrok({ maRelaciu: true, zoznamFiriem: [A, B], ulozenaFirmaId: "a" })).toBe("domov");
  });

  it("s reláciou a bez jasnej firmy na výber firmy", () => {
    expect(dalsiKrok({ maRelaciu: true, zoznamFiriem: [A, B], ulozenaFirmaId: null })).toBe(
      "firma",
    );
  });

  it("s reláciou a bez firiem tiež na výber firmy", () => {
    // Bez firiem sa nedá nič robiť, ale tvrdiť „nie ste prihlásený" by bola
    // nepravda a človek by hľadal chybu v hesle.
    expect(dalsiKrok({ maRelaciu: true, zoznamFiriem: [], ulozenaFirmaId: null })).toBe("firma");
  });
});
