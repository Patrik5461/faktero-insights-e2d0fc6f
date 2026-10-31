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

  it("IPv4 vnorená do IPv6 v hex zápise (tak ju vráti DNS aj URL)", () => {
    // `new URL("https://[::ffff:127.0.0.1]")` → hostname `[::ffff:7f00:1]` a Node sa naň
    // pripojí ako na 127.0.0.1 — predtým to kontrola pustila (GPS Traccar/Wialon, webhooky).
    for (const ip of [
      "::ffff:7f00:1",
      "::ffff:a9fe:a9fe",
      "::ffff:c0a8:101",
      "[::ffff:127.0.0.1]",
      "::ffff:0:7f00:1",
      "::7f00:1",
      "::127.0.0.1",
      "64:ff9b::a9fe:a9fe",
      "2002:7f00:1::",
      "::",
      "0:0:0:0:0:0:0:1",
      "fe80::1%eth0",
      "fec0::1",
      "ff02::1",
      "198.18.0.1",
      "1:2:3",
      "1::2::3",
    ])
      expect(jeVnutornaAdresa(ip), ip).toBe(true);
    for (const ip of [
      "::ffff:808:808",
      "::ffff:8.8.8.8",
      "2001:4860:4860::8888",
      "64:ff9b::808:808",
    ])
      expect(jeVnutornaAdresa(ip), ip).toBe(false);
  });

  it("localhost sa odmietne", async () => {
    await expect(overVerejnyServer("localhost")).rejects.toThrow(/verejná adresa/);
  });
});
