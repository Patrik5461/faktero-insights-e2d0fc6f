import { describe, expect, it } from "vitest";
import { prekrytieKlavesnicou } from "./NahlasitChybu";

/**
 * Okno na nahlásenie chyby sedí pri spodnom okraji a pole sa hneď zaostrí, takže
 * klávesnica vyskočí okamžite a prekryje presne to miesto, kde sa píše a kde je
 * tlačidlo Odoslať. V zabalenej appke sa stránka pritom nezmenší — o klávesnici
 * vie len `visualViewport`, a tento výpočet je to, čo z neho treba prečítať.
 */
describe("prekrytieKlavesnicou", () => {
  it("klávesnica zaberie spodok obrazovky", () => {
    // iPhone 844 bodov, klávesnica ~336 → viditeľných ostane 508.
    expect(prekrytieKlavesnicou(844, 508, 0)).toBe(336);
  });

  it("počíta aj s posunutím stránky nahor", () => {
    /*
      Keď stránku vytlačí klávesnica, viditeľná časť sa posunie nadol
      (`offsetTop`). Bez neho by prekrytie vyšlo menšie a okno by ostalo
      čiastočne schované.
    */
    expect(prekrytieKlavesnicou(844, 508, 60)).toBe(276);
  });

  it("bez klávesnice je prekrytie nulové", () => {
    expect(prekrytieKlavesnicou(844, 844, 0)).toBe(0);
  });

  it("lišta prehliadača okno neposúva", () => {
    // Pár desiatok bodov je adresný riadok, nie klávesnica — posúvať sa o ne
    // by znamenalo, že okno pri rolovaní poskakuje.
    expect(prekrytieKlavesnicou(844, 800, 0)).toBe(0);
    expect(prekrytieKlavesnicou(844, 764, 0)).toBe(0);
  });

  it("nezáporné aj pri nezmyselných hodnotách", () => {
    expect(prekrytieKlavesnicou(844, 900, 0)).toBe(0);
  });
});
