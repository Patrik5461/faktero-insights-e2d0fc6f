import { describe, expect, it } from "vitest";
import { jeVnutornaAdresa, overVerejnyServer } from "./odoslanie-mailu.server";

describe("vlastný SMTP smie ísť len na verejný server", () => {
  it("vnútorné adresy", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.1",
      "192.168.1.1",
      "169.254.169.254",
      "0.0.0.0",
      "100.64.0.1",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
    ])
      expect(jeVnutornaAdresa(ip), ip).toBe(true);
    for (const ip of ["8.8.8.8", "172.32.0.1", "193.87.1.1", "2a00:1450::1"])
      expect(jeVnutornaAdresa(ip), ip).toBe(false);
  });

  it("localhost sa odmietne", async () => {
    await expect(overVerejnyServer("localhost")).rejects.toThrow(/verejná adresa/);
  });
});
