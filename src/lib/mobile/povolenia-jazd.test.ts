import { describe, expect, it } from "vitest";
import { chybajucePovolenia } from "./povolenia-jazd";

describe("chybajucePovolenia", () => {
  it("pri všetkom povolenom nechýba nič", () => {
    expect(
      chybajucePovolenia({
        location: "granted",
        background: "granted",
        motion: "granted",
        notifications: "granted",
      }),
    ).toEqual([]);
  });

  it("poloha ide prvá a „vždy“ posledná — v tom poradí sa aj pýta", () => {
    expect(
      chybajucePovolenia({
        location: "denied",
        background: "denied",
        motion: "denied",
        notifications: "denied",
      }),
    ).toEqual(["poloha", "notifikacie", "pohyb", "vzdy"]);
  });

  it("čo binárka nehlási, o to sa nepýta — inak by iOS pýtal notifikácie navždy", () => {
    expect(chybajucePovolenia({ location: "granted", background: "granted" })).toEqual([]);
  });

  it("samotné „počas používania“ nestačí", () => {
    expect(
      chybajucePovolenia({ location: "granted", background: "denied", motion: "granted" }),
    ).toEqual(["vzdy"]);
  });
});
