import { describe, expect, it } from "vitest";
import { zdrojVydavku } from "./zdroj-vydavku";

describe("zdrojVydavku", () => {
  it("ručný zápis bez súboru nie je fotka", () => {
    expect(zdrojVydavku("photo", false)).toBe("web");
    expect(zdrojVydavku("upload", false)).toBe("web");
    expect(zdrojVydavku(undefined, false)).toBe("web");
  });

  it("QR ostáva QR aj bez fotky", () => {
    expect(zdrojVydavku("qr", false)).toBe("qr");
    expect(zdrojVydavku("qr", true)).toBe("qr");
  });

  it("so súborom zostane fotka alebo nahratý súbor", () => {
    expect(zdrojVydavku("photo", true)).toBe("photo");
    expect(zdrojVydavku("upload", true)).toBe("upload");
    expect(zdrojVydavku("web", true)).toBe("photo");
  });
});
