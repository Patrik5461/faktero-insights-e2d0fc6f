import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { exportUctovanieFn, programUctovaniaFn } from "@/lib/faktero/uctovanie-export.functions";
import {
  PROGRAMY_UCTOVANIA,
  type AgendaExportu,
  type ProgramUctovania,
} from "@/lib/faktero/uctovanie-programy";
import { downloadFile } from "@/lib/faktero/stiahnut-subor";
import { getActiveCompanyId } from "@/lib/faktero/active-company";

/**
 * Účtovný program firmy a export vybraných dokladov doň. Pri Pohode sa
 * nepoužíva — tá má vlastné XML a konektor.
 */
export function useExportDoProgramu() {
  const nacitaj = useServerFn(programUctovaniaFn);
  const exportuj = useServerFn(exportUctovanieFn);
  const [program, setProgram] = useState<ProgramUctovania | "pohoda">("pohoda");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    nacitaj({ data: { company_id: cid } })
      .then((r) => setProgram(r.program))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nazov = (PROGRAMY_UCTOVANIA.find((p) => p.program === program)?.nazov ?? "").split(
    " — ",
  )[0];

  async function spusti(agenda: AgendaExportu, ids: string[]): Promise<boolean> {
    const cid = getActiveCompanyId();
    if (!cid || program === "pohoda" || !ids.length) return false;
    setBusy(true);
    try {
      const r = await exportuj({ data: { company_id: cid, program, agenda, ids, oznacit: true } });
      downloadFile(r.fileName, r.content, r.mime, r.encoding);
      toast.success(`${nazov}: ${r.pocet} dokladov, označené ako odovzdané`);
      if (r.preskocene.length)
        toast.warning(`Do súboru sa nedostali: ${r.preskocene.join(" · ")}`, { duration: 12000 });
      return true;
    } catch (e: any) {
      toast.error(e?.message ?? "Export zlyhal");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { program, nazov, inyProgram: program !== "pohoda", busy, spusti };
}
