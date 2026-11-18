/*
  P (18. 11.): odovzdaná vystavená faktúra (bager expres 20260012, prenesenie
  § 69 ods. 12) — pole Členenie DPH bolo zamknuté a UDpdp „sa nedalo vybrať“.
  Odovzdaná faktúra teraz kódy mení rovno v poli (oprava zaúčtovania); veta
  nad poľami to povie. Zamknutá a v uzavretom období ostávajú len na čítanie.
*/
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", async (povodny) => ({
  ...(await povodny<typeof import("@tanstack/react-start")>()),
  useServerFn: (fn: unknown) => fn,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {} } }));

import { ZamokZauctovania } from "./OdovzdanieDokladu";
import { JazykProvider } from "@/lib/i18n/useT";

const html = (prvok: ReactNode, jazyk: "sk" | "cs" | "de" = "sk") =>
  renderToStaticMarkup(<JazykProvider jazyk={jazyk}>{prvok}</JazykProvider>);

const odovzdana = {
  id: "a2b8d828-f794-44e3-9345-0e24637b00da",
  company_id: "c",
  type: "regular",
  exported_at: "2026-10-26T15:15:30Z",
  reverse_charge: true,
  pohoda_clenenie_dph: null,
};

describe("ZamokZauctovania — odovzdaná faktúra", () => {
  it("povie, že výber kódu sa uloží hneď a faktúra ostane v Pohode", () => {
    const h = html(<ZamokZauctovania row={odovzdana} druh="faktura" />);
    expect(h).toContain('data-zamok-zauctovania="oprava"');
    expect(h).toContain("členenia DPH");
    expect(h).toContain("uloží hneď");
    expect(h).toContain("v Pohode ostane");
  });

  it("iný program (Money S3) dosadí do vety", () => {
    const h = html(<ZamokZauctovania row={odovzdana} druh="faktura" program="Money S3" />);
    expect(h).toContain("účtovníctva (Money S3)");
    expect(h).not.toContain("{program}");
  });

  it("zamknutý doklad (locked_at) ostane len na čítanie", () => {
    const h = html(
      <ZamokZauctovania row={{ ...odovzdana, locked_at: "2026-11-01T00:00:00Z" }} druh="faktura" />,
    );
    expect(h).toContain('data-zamok-zauctovania="zamknute"');
    expect(h).toContain("až po vrátení z Pohody");
  });

  it("uzavreté obdobie ostane zamknuté s vysvetlením", () => {
    const h = html(<ZamokZauctovania row={odovzdana} druh="faktura" zamknuteObdobie />);
    expect(h).toContain('data-zamok-zauctovania="zamknute"');
    expect(h).toContain("obdobie je uzavreté");
  });

  it("česky a nemecky preložené", () => {
    expect(html(<ZamokZauctovania row={odovzdana} druh="faktura" />, "cs")).toContain(
      "Faktura je předána do Pohody",
    );
    expect(html(<ZamokZauctovania row={odovzdana} druh="faktura" />, "de")).toContain(
      "Die Rechnung wurde an Pohoda übergeben",
    );
  });
});
