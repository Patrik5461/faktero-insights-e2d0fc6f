import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { odheslujPdf, pripravPdf, stavPdf } from "./pdf-heslo.server";

const QPDF = process.env.QPDF_BIN || "/home/patrik/opt/qpdf/bin/qpdf";

async function obycajnePdf(): Promise<Buffer> {
  const d = await PDFDocument.create();
  d.addPage([200, 200]).drawText("Faktura 2026001");
  return Buffer.from(await d.save());
}

function zaheslovat(pdf: Buffer, heslo: string): Buffer {
  const dir = mkdtempSync(join(tmpdir(), "pdf-test-"));
  try {
    writeFileSync(join(dir, "a.pdf"), pdf);
    execFileSync(QPDF, ["--encrypt", `--user-password=${heslo}`, "--owner-password=vlastnik", "--bits=256", "--", join(dir, "a.pdf"), join(dir, "b.pdf")]);
    return readFileSync(join(dir, "b.pdf"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe.skipIf(!existsSync(QPDF))("zaheslované PDF (qpdf)", () => {
  it("rozpozná heslo a odomkne len správnym heslom", async () => {
    const plain = await obycajnePdf();
    const zah = zaheslovat(plain, "36631124");
    expect(await stavPdf(plain)).toBe("bez_hesla");
    expect(await stavPdf(zah)).toBe("heslo");
    expect(await odheslujPdf(zah, "zle")).toBeNull();
    const ok = await odheslujPdf(zah, "36631124");
    expect(ok).not.toBeNull();
    expect(await stavPdf(ok!)).toBe("bez_hesla");
  });

  it("pripravPdf: bez hesla nechá súbor tak, s heslom od človeka odomkne", async () => {
    const plain = await obycajnePdf();
    const bez = await pripravPdf(null, null, plain);
    expect(bez).toMatchObject({ zaheslovane: false, zmenene: false });
    const zah = zaheslovat(plain, "tajne");
    expect((await pripravPdf(null, null, zah)).zaheslovane).toBe(true);
    const s = await pripravPdf(null, null, zah, { heslo: "tajne" });
    expect(s).toMatchObject({ zaheslovane: false, odomknute: true });
  });
});
