/*
  Vykreslenie interného manuálu podpory: pás „Interné“, tabuľky (GFM), kotvy
  nadpisov a odkazy na iné manuály. Prihlásenie admina s 2FA sa v teste
  nerobí — stránku chráni layout /admin a serverová funkcia (manualy-podpory.test.ts).
*/
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { manualZoSuboru, nadpisyManualu } from "@/lib/faktero/manualy-podpory";

vi.mock("@tanstack/react-router", async (povodny) => {
  const m = await povodny<typeof import("@tanstack/react-router")>();
  return {
    ...m,
    Link: ({
      to,
      search,
      children,
      className,
    }: {
      to?: string;
      search?: { m?: string };
      children?: ReactNode;
      className?: string;
    }) => (
      <a href={`${to}${search?.m ? `?m=${search.m}` : ""}`} className={className}>
        {children}
      </a>
    ),
  };
});

const { ManualPodporyObsah } = await import("./ManualPodporyObsah");

// Manuály ležia len na serveri (repozitár je verejný); inde sa test preskočí.
const DOCS = process.env.MANUALY_PODPORY_DIR?.trim() || "/home/patrik/faktero-podpora-manualy";
const nacitaj = (slug: string) =>
  manualZoSuboru(`${slug}.md`, readFileSync(join(DOCS, `${slug}.md`), "utf8"));

describe.skipIf(!existsSync(join(DOCS, "00-index.md")))("ManualPodporyObsah", () => {
  const index = nacitaj("00-index");
  const slugy = new Set(["00-index", "03-vystavene-faktury", "15-predplatne-a-platby"]);
  const html = renderToString(<ManualPodporyObsah manual={index} slugy={slugy} />);

  it("ukáže pás Interné a tlačidlo na PDF", () => {
    expect(html).toContain("Interné — nezdieľať so zákazníkmi");
    expect(html).toContain("Stiahnuť ako PDF");
  });

  it("vykreslí tabuľku zoznamu manuálov", () => {
    expect(html).toContain("<table");
    expect(html).toContain("<th");
    expect(html).toMatch(/<td[^>]*>Tento prehľad a práca s hovorom<\/td>/);
  });

  it("nadpisy majú kotvy zhodné s obsahom manuálu", () => {
    for (const n of nadpisyManualu(index.obsah)) expect(html).toContain(`id="${n.id}"`);
    expect(html).toContain('href="#rychly-prehlad"');
  });

  it("odkaz na iný manuál otvorí manuál v admine", () => {
    expect(html).toContain('href="/admin/podpora/manualy?m=03-vystavene-faktury"');
  });

  it("obrázky z markdownu nekreslí", () => {
    const m = manualZoSuboru("99-test.md", "# T\n\n![x](https://example.com/a.png)\n");
    expect(renderToString(<ManualPodporyObsah manual={m} slugy={slugy} />)).not.toContain("<img");
  });
});
