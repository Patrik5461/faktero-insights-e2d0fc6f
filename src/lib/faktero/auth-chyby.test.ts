import { describe, expect, it } from "vitest";
import { prelozAuthChybu } from "./auth-chyby";

describe("prelozAuthChybu", () => {
  it("nepotvrdený účet sa dá rozoznať, nielen preložiť", () => {
    const r = prelozAuthChybu("Email not confirmed");
    expect(r.nepotvrdeny).toBe(true);
    expect(r.sprava).toMatch(/nie je potvrdený/i);
  });

  it("zlé heslo nesmie prezradiť, či účet existuje", () => {
    const r = prelozAuthChybu("Invalid login credentials");
    expect(r.sprava).toBe("Nesprávny e-mail alebo heslo.");
    expect(r.nepotvrdeny).toBe(false);
  });

  it("už zaregistrovaný e-mail nasmeruje na prihlásenie", () => {
    expect(prelozAuthChybu("User already registered").sprava).toMatch(/už je zaregistrovaný/i);
  });

  it("z pauzy pri opakovaní vytiahne počet sekúnd", () => {
    expect(
      prelozAuthChybu("For security purposes, you can only request this after 47 seconds").sprava,
    ).toMatch(/o 47 s/);
  });

  it("neznámu chybu nechá tak, ako prišla", () => {
    expect(prelozAuthChybu("Something exploded").sprava).toBe("Something exploded");
  });

  it("prázdna chyba nespadne", () => {
    expect(prelozAuthChybu(null).sprava).toBe("Prihlásenie zlyhalo.");
    expect(prelozAuthChybu("").sprava).toBe("Prihlásenie zlyhalo.");
  });
});
