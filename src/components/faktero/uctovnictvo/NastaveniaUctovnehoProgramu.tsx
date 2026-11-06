/*
  Nastavenia účtovného programu (Omega, Money S3, Flexi, MRP, CSV, DATEV) —
  kódy evidencií, rady, účty. Predtým sa otvárali v Účtovných exportoch, teraz
  sú v Nastaveniach exportu. Načítanie aj uloženie je tá istá serverová
  funkcia ako na /exporty (`programUctovaniaFn`); program si firma pamätá.
*/
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { NastaveniaProgramu } from "@/components/faktero/NastaveniaProgramu";
import { programUctovaniaFn } from "@/lib/faktero/uctovanie-export.functions";
import { PROGRAMY_UCTOVANIA, type ProgramUctovania } from "@/lib/faktero/uctovanie-programy";
import { useT } from "@/lib/i18n/useT";

type Program = ProgramUctovania | "pohoda";

export function jeProgramUctovania(p: unknown): p is Program {
  return typeof p === "string" && PROGRAMY_UCTOVANIA.some((x) => x.program === p);
}

export function NastaveniaUctovnehoProgramu({
  companyId,
  programZAdresy,
}: {
  companyId: string;
  /** `?nastavenia=<program>` — odkaz z Účtovných exportov otvorí rovno ten program. */
  programZAdresy?: string;
}) {
  const { t } = useT();
  const nacitajProgram = useServerFn(programUctovaniaFn);
  /** Program, ktorý má firma zvolený (pamätá sa na serveri). */
  const [programFirmy, setProgramFirmy] = useState<Program | null>(null);
  const [program, setProgram] = useState<Program | null>(null);
  const [nastavenia, setNastavenia] = useState<Record<string, Record<string, unknown>>>({});

  useEffect(() => {
    nacitajProgram({ data: { company_id: companyId } })
      .then((r) => {
        setProgramFirmy(r.program);
        setProgram(jeProgramUctovania(programZAdresy) ? programZAdresy : r.program);
        setNastavenia(r.nastavenia as any);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, programZAdresy]);

  if (!program) return null;

  async function zmenProgram(p: Program) {
    setProgram(p);
    try {
      // Rovnako ako výber v Účtovných exportoch — firma si program zapamätá.
      await nacitajProgram({ data: { company_id: companyId, program: p } });
      setProgramFirmy(p);
    } catch (e: any) {
      toast.error(e?.message ?? t("Program sa nepodarilo uložiť"));
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{t("Nastavenia účtovného programu")}</h3>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            {t(
              "Kódy evidencií, číselných radov a účty, ktoré musia v programe existovať, aby doklad prijal. Zvolený program platí aj pre Účtovné exporty.",
            )}
          </p>
        </div>
        <label className="min-w-0 max-w-full text-sm">
          <span className="block text-sm font-semibold">{t("Účtovný program")}</span>
          <select
            aria-label={t("Účtovný program")}
            value={program}
            onChange={(e) => void zmenProgram(e.target.value as Program)}
            className="mt-1 w-full max-w-full rounded-md border border-input bg-background px-3 py-2 text-sm sm:w-auto"
          >
            {PROGRAMY_UCTOVANIA.map((p) => (
              <option key={p.program} value={p.program}>
                {t(p.nazov)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {program === "pohoda" ? (
        <p className="mt-4 rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
          {t(
            "Pohoda nepotrebuje ďalšie kódy — jej nastavenia sú vyššie v Exporte do účtovného programu a v časti Čo sa do Pohody posiela.",
          )}
        </p>
      ) : (
        <NastaveniaProgramu
          program={program}
          hodnoty={(nastavenia[program] ?? {}) as Record<string, unknown>}
          onUlozit={async (h) => {
            // Server ukladá nastavenia zvoleného programu firmy; iný program z adresy
            // sa pri uložení stane zvoleným (ako výber v Účtovných exportoch).
            const r = await nacitajProgram({
              data: {
                company_id: companyId,
                nastavenia: h,
                ...(program !== programFirmy ? { program } : {}),
              },
            });
            setProgramFirmy(r.program);
            setNastavenia(r.nastavenia as any);
            toast.success(t("Nastavenia sú uložené"));
          }}
        />
      )}
    </div>
  );
}
