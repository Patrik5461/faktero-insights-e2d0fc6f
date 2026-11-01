import { describe, expect, it } from "vitest";
import { suborSediSAccept } from "./zona-suboru";

describe("suborSediSAccept (E-12)", () => {
  it("porovná príponu bez ohľadu na veľkosť písmen", () => {
    expect(suborSediSAccept({ name: "export.XML" }, ".xml,.isdoc")).toBe(true);
    expect(suborSediSAccept({ name: "faktura.isdoc" }, ".xml,.isdoc")).toBe(true);
    expect(suborSediSAccept({ name: "foto.jpg" }, ".xml,.isdoc")).toBe(false);
  });
  it("rozumie typom MIME aj zástupnému znaku", () => {
    expect(suborSediSAccept({ name: "a", type: "application/zip" }, "application/zip")).toBe(true);
    expect(suborSediSAccept({ name: "a", type: "image/png" }, "image/*")).toBe(true);
    expect(suborSediSAccept({ name: "a", type: "text/plain" }, "image/*")).toBe(false);
  });
  it("prázdny accept prepustí všetko", () => {
    expect(suborSediSAccept({ name: "cokolvek.bin" }, "")).toBe(true);
    expect(suborSediSAccept({ name: "cokolvek.bin" }, undefined)).toBe(true);
  });
});
