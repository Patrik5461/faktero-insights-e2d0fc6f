import { describe, expect, it } from "vitest";
import {
  StropNaChat,
  cistyTextTelegramu,
  dataTlacidla,
  kodDoOdkazu,
  menoZTelegramu,
  najvacsiaFotka,
  normalizujKod,
  novyKod,
  rozoberDataTlacidla,
  rozoberPrikaz,
  textPreTelegram,
} from "./telegram";

const ID = "3f2b8c1e-9a4d-4e2f-8b6a-1c2d3e4f5a6b";

describe("text z Telegramu", () => {
  it("vyhodí riadiace a neviditeľné znaky, emoji nechá", () => {
    expect(cistyTextTelegramu("Ahoj‮ gnp.exe\u0000 👍")).toBe("Ahoj gnp.exe 👍");
  });
  it("oreže dĺžku", () => {
    const t = cistyTextTelegramu("a".repeat(5000), 100);
    expect(t).toHaveLength(100);
    expect(t.endsWith("…")).toBe(true);
  });
  it("sendMessage nepresiahne 4096 znakov", () => {
    expect(textPreTelegram("x".repeat(5000))).toHaveLength(4096);
  });
  it("meno s username", () => {
    expect(menoZTelegramu({ first_name: "Ján", last_name: "Novák", username: "jan_n" })).toEqual({
      meno: "Ján Novák (@jan_n)",
      username: "jan_n",
    });
    expect(menoZTelegramu({ username: "x<y" }).meno).toBe("@xy");
    expect(menoZTelegramu(null).meno).toBe("Telegram");
  });
});

describe("príkazy", () => {
  it("rozozná /start s kódom aj deep link admina", () => {
    expect(rozoberPrikaz("/start ABCD2345")).toEqual({ druh: "start", kod: "ABCD-2345" });
    expect(rozoberPrikaz("/start")).toEqual({ druh: "start", kod: null });
    expect(rozoberPrikaz("/start admin_ABCD2345")).toEqual({ druh: "admin", kod: "ABCD-2345" });
    expect(rozoberPrikaz("/admin abcd-2345")).toEqual({ druh: "admin", kod: "ABCD-2345" });
    expect(rozoberPrikaz("/admin@FakteroBot ABCD-2345")).toEqual({
      druh: "admin",
      kod: "ABCD-2345",
    });
  });
  it("chyba, nová, obyčajný text", () => {
    expect(rozoberPrikaz("/chyba Nejde PDF")).toEqual({ druh: "chyba", text: "Nejde PDF" });
    expect(rozoberPrikaz("/nova")).toEqual({ druh: "nova" });
    expect(rozoberPrikaz("Dobrý deň")).toEqual({ druh: "text", text: "Dobrý deň" });
    expect(rozoberPrikaz("/xyz niečo")).toEqual({ druh: "text", text: "/xyz niečo" });
  });
});

describe("párovacie kódy", () => {
  it("nový kód prejde normalizáciou a do odkazu ide bez pomlčky", () => {
    const k = novyKod();
    expect(k).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(normalizujKod(k.toLowerCase().replace("-", " "))).toBe(k);
    expect(kodDoOdkazu(k)).toBe(k.replace("-", ""));
  });
  it("odmietne zlú dĺžku a zameniteľné znaky", () => {
    expect(normalizujKod("ABC")).toBeNull();
    expect(normalizujKod("ABCD-EFG0")).toBeNull();
    expect(normalizujKod(null)).toBeNull();
  });
});

describe("tlačidlá", () => {
  it("dáta tlačidla nesú len akciu a id", () => {
    const d = dataTlacidla("schvalit", ID);
    expect(new TextEncoder().encode(d).length).toBeLessThanOrEqual(64);
    expect(rozoberDataTlacidla(d)).toEqual({ akcia: "schvalit", id: ID });
    expect(rozoberDataTlacidla(dataTlacidla("zamietnut", ID))).toEqual({
      akcia: "zamietnut",
      id: ID,
    });
  });
  it("cudzie dáta odmietne", () => {
    expect(rozoberDataTlacidla(`ao:s:${ID};role=superadmin`)).toBeNull();
    expect(rozoberDataTlacidla("ao:x:" + ID)).toBeNull();
    expect(rozoberDataTlacidla(undefined)).toBeNull();
  });
});

describe("prílohy a strop", () => {
  it("vyberie najväčšiu fotku pod limitom", () => {
    const f = najvacsiaFotka(
      [
        { file_id: "a", file_size: 1000 },
        { file_id: "b", file_size: 50_000 },
        { file_id: "c", file_size: 20_000_000 },
      ],
      10_000_000,
    );
    expect(f?.file_id).toBe("b");
    expect(najvacsiaFotka([{ file_id: "c", file_size: 20_000_000 }], 10)).toBeNull();
  });
  it("strop na chat", () => {
    const s = new StropNaChat(2, 1000);
    expect(s.pusti(1, 0)).toBe(true);
    expect(s.pusti(1, 1)).toBe(true);
    expect(s.pusti(1, 2)).toBe(false);
    expect(s.pusti(2, 2)).toBe(true);
    expect(s.pusti(1, 1500)).toBe(true);
  });
});
