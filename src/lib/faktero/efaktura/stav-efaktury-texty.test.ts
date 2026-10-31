import { describe, expect, it } from "vitest";
import { slovnikJazyka } from "@/lib/i18n/jazyk";
import { sk } from "@/lib/mobile/preklady/sk";
import { stavEfaktury, type RiadokDorucenia } from "./stav-efaktury";
import {
  efakturaUzOdisla,
  jeChybaEfaktury,
  TEXT_CASU,
  TEXT_DOVODU,
  TEXT_ODPOVEDE,
  TEXT_STAVU,
  TEXT_ZAMIETNUTIA,
  textDovoduEfaktury,
  textOdpovedeEfaktury,
  textStavuEfaktury,
  ukazatDetailEfaktury,
  VSETKY_TEXTY_STAVU,
} from "./stav-efaktury-texty";

const r = (o: Partial<RiadokDorucenia>): RiadokDorucenia => ({
  status: "sent",
  channel: "peppol",
  sent_at: "2026-10-30T10:00:00Z",
  created_at: "2026-10-30T10:00:00Z",
  updated_at: "2026-10-30T10:00:00Z",
  ...o,
});

describe("texty stavu eFaktúry na webe", () => {
  it("zlyhanie od ePoštáka (pending + deliveryFailure) je chyba s dôvodom, nie odoslaná", () => {
    const s = stavEfaktury([
      r({ status: "pending", zlyhanie: { code: "participant_not_found", message: "x" } }),
    ])!;
    expect(textStavuEfaktury(s)).toBe("Odoslanie eFaktúry zlyhalo");
    expect(textDovoduEfaktury(s)).toMatch(/nie je zaregistrovaný v sieti Peppol/);
    expect(jeChybaEfaktury(s)).toBe(true);
    expect(efakturaUzOdisla(s)).toBe(false);
    expect(ukazatDetailEfaktury(s)).toBe(false);
  });

  it("accepted je len prevzatie ePoštákom — odoslaná, nie doručená ani prijatá", () => {
    const s = stavEfaktury([r({ status: "accepted" })])!;
    expect(textStavuEfaktury(s)).toBe("eFaktúra odoslaná");
    expect(jeChybaEfaktury(s)).toBe(false);
    expect(efakturaUzOdisla(s)).toBe(true);
  });

  it("odpoveď odberateľa: AP prijatá, RE zamietnutá s radou, UQ poznámka", () => {
    expect(textStavuEfaktury(stavEfaktury([r({ status: "delivered", odpoved: "AP" })])!)).toBe(
      "Odberateľ eFaktúru prijal",
    );
    const re = stavEfaktury([r({ status: "delivered", odpoved: "RE" })])!;
    expect(textStavuEfaktury(re)).toBe("Odberateľ eFaktúru zamietol");
    expect(textDovoduEfaktury(re)).toBe(TEXT_ZAMIETNUTIA);
    expect(jeChybaEfaktury(re)).toBe(true);
    expect(efakturaUzOdisla(re)).toBe(true);
    const uq = stavEfaktury([r({ status: "delivered", odpoved: "UQ" })])!;
    expect(textStavuEfaktury(uq)).toBe("eFaktúra doručená");
    expect(textOdpovedeEfaktury(uq)).toBe("Odberateľ má k faktúre otázku.");
  });

  it("neznámy dôvod ukáže podrobnosti od služby", () => {
    const s = stavEfaktury([r({ status: "failed", error_message: "Niečo iné" })])!;
    expect(textDovoduEfaktury(s)).toBe(TEXT_DOVODU.neznamy);
    expect(ukazatDetailEfaktury(s)).toBe(true);
  });

  it("vety sú tie isté ako v appke (efs.*)", () => {
    const appka = new Set<string>(Object.values(sk));
    for (const v of VSETKY_TEXTY_STAVU) expect(appka.has(v), v).toBe(true);
  });

  it("každý text má preklad do nemčiny aj češtiny", () => {
    const vsetky = [
      ...VSETKY_TEXTY_STAVU,
      ...Object.values(TEXT_STAVU),
      ...Object.values(TEXT_CASU),
      ...Object.values(TEXT_ODPOVEDE),
      "eFaktúra neodišla",
      "eFaktúra zamietnutá",
      "Odoslať znova",
      "Odoslať eFaktúru znova",
      "eFaktúra {cislo} neodišla",
      "Odberateľ zamietol eFaktúru {cislo}",
    ];
    for (const v of vsetky) {
      expect(slovnikJazyka("de")[v], `de: ${v}`).toBeTruthy();
      expect(slovnikJazyka("cs")[v], `cs: ${v}`).toBeTruthy();
    }
  });
});
