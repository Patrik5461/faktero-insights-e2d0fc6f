import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import { zoznamOstatnychFn } from "@/lib/faktero/ostatne-doklady.functions";
import { nazovDruhu, stavLehoty, type DruhOstatneho } from "@/lib/faktero/ostatne-doklady";
import { STAV_DOKLADU_NAZOV } from "@/lib/faktero/doklad-stav";

/**
 * Ostatné doklady priradené k zamestnancovi (exekúcie) alebo k zmluve
 * o leasingu či úvere. Tá istá tabuľka na karte zamestnanca aj v detaile
 * zmluvy, aby sa správali rovnako.
 */
export function PrepojeneOstatneDoklady({
  cid,
  employeeId,
  financingContractId,
  druhNoveho,
  popisPrazdny,
  tlacidlo,
}: {
  cid: string;
  employeeId?: string;
  financingContractId?: string;
  /** Druh, s ktorým sa otvorí „Pridať“. */
  druhNoveho: DruhOstatneho;
  popisPrazdny: string;
  tlacidlo: string;
}) {
  const navigate = useNavigate();
  const zoznamFn = useServerFn(zoznamOstatnychFn);
  const [rows, setRows] = useState<any[] | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const dnes = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    zoznamFn({
      data: {
        company_id: cid,
        stav: "all",
        employee_id: employeeId ?? null,
        financing_contract_id: financingContractId ?? null,
      },
    })
      .then(setRows)
      .catch((e: any) => setChyba(e?.message ?? "Doklady sa nepodarilo načítať."));
    // eslint-disable-next-line
  }, [cid, employeeId, financingContractId]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{popisPrazdny}</p>
        <Link
          to="/ostatne-doklady/novy"
          search={{
            druh: druhNoveho,
            ...(employeeId ? { zamestnanec: employeeId } : {}),
            ...(financingContractId ? { zmluva: financingContractId } : {}),
          }}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-secondary"
        >
          <Plus className="h-4 w-4" /> {tlacidlo}
        </Link>
      </div>
      {chyba ? (
        <p className="text-sm text-destructive">{chyba}</p>
      ) : rows === null ? (
        <p className="text-sm text-muted-foreground">Načítavam…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Zatiaľ žiadne priradené doklady.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Doručené</th>
                <th className="px-3 py-2 text-left">Druh</th>
                <th className="px-3 py-2 text-left">Odosielateľ a predmet</th>
                <th className="px-3 py-2 text-right">Suma</th>
                <th className="px-3 py-2 text-left">Lehota</th>
                <th className="px-3 py-2 text-left">Stav</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const lehota = r.status === "exported" ? null : stavLehoty(r.due_date, dnes);
                return (
                  <tr
                    key={r.id}
                    onClick={() => navigate({ to: "/ostatne-doklady/novy", search: { id: r.id } })}
                    className="cursor-pointer border-t border-border hover:bg-secondary/30"
                  >
                    <td className="px-3 py-2 whitespace-nowrap">{r.received_date}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{nazovDruhu(r.kind)}</td>
                    <td className="px-3 py-2">
                      <div>{r.sender || "—"}</div>
                      {r.subject && <div className="text-xs text-muted-foreground">{r.subject}</div>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                      {r.amount != null ? `${Number(r.amount).toFixed(2)} ${r.currency}` : "—"}
                    </td>
                    <td
                      className={`px-3 py-2 whitespace-nowrap ${
                        lehota === "po"
                          ? "font-medium text-destructive"
                          : lehota === "blizko"
                            ? "font-medium text-amber-700 dark:text-amber-400"
                            : ""
                      }`}
                    >
                      {r.due_date ?? "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {STAV_DOKLADU_NAZOV[r.status as keyof typeof STAV_DOKLADU_NAZOV] ?? r.status}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
