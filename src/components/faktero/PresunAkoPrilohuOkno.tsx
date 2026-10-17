import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { kandidatiPrilohyFn, presunAkoPrilohuFn } from "@/lib/faktero/priloha-presun.functions";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { potvrd } from "@/lib/potvrdenie";
import { formatujMenu } from "@/lib/faktero/mena";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { useT } from "@/lib/i18n/useT";

type Druh = "purchase_invoice" | "expense" | "invoice";
const DRUHY: [Druh, string][] = [
  ["purchase_invoice", "Prijaté faktúry"],
  ["expense", "Doklady"],
  ["invoice", "Vystavené faktúry"],
];

/**
 * Presun dokladu medzi prílohy iného (ako v Doklado): súbor sa pripojí
 * k vybranému dokladu a pôvodný záznam ide do koša.
 */
export function PresunAkoPrilohuOkno({
  companyId,
  zdroj,
  onClose,
}: {
  companyId: string;
  zdroj: { agenda: "doklad" | "prijata"; id: string };
  onClose: () => void;
}) {
  const { t } = useT();
  useZatvorNaEscape(onClose);
  const navigate = useNavigate();
  const nacitaj = useServerFn(kandidatiPrilohyFn);
  const presun = useServerFn(presunAkoPrilohuFn);
  const [druh, setDruh] = useState<Druh>(
    zdroj.agenda === "doklad" ? "purchase_invoice" : "purchase_invoice",
  );
  const [hladaj, setHladaj] = useState("");
  const [zoznam, setZoznam] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const casovac = setTimeout(() => {
      nacitaj({ data: { company_id: companyId, druh, hladaj } })
        .then((r) =>
          setZoznam(
            (r as any[]).filter(
              (x) =>
                !(
                  (druh === "expense" && zdroj.agenda === "doklad") ||
                  (druh === "purchase_invoice" && zdroj.agenda === "prijata")
                ) || x.id !== zdroj.id,
            ),
          ),
        )
        .catch(() => setZoznam([]));
    }, 250);
    return () => clearTimeout(casovac);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [druh, hladaj, companyId]);

  async function vyber(x: any) {
    if (
      !(await potvrd(
        t("Priložiť súbor k dokladu {doklad}? Tento doklad sa presunie do koša.", {
          doklad: x.popis,
        }),
      ))
    )
      return;
    setBusy(true);
    try {
      await presun({ data: { zdroj, ciel: { druh, id: x.id } } });
      toast.success(t("Súbor je priložený, pôvodný doklad je v koši"));
      onClose();
      if (druh === "purchase_invoice")
        navigate({ to: "/prijate-faktury/$id", params: { id: x.id } });
      else if (druh === "invoice") navigate({ to: "/faktury/$id", params: { id: x.id } });
      else navigate({ to: "/doklady/novy", search: { id: x.id } as any });
    } catch (e: any) {
      toast.error(t(e?.message ?? "Nepodarilo sa"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Presunúť medzi prílohy iného dokladu")}
        className="w-full max-w-xl rounded-xl border border-border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">{t("Presunúť medzi prílohy iného dokladu")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(
            "Súbor tohto dokladu sa pripojí ako príloha k dokladu, ktorý vyberiete. Tento záznam sa presunie do koša (dá sa obnoviť).",
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-1 text-sm">
          {DRUHY.map(([k, n]) => (
            <button
              key={k}
              type="button"
              onClick={() => setDruh(k)}
              className={`rounded-md px-3 py-1.5 ${druh === k ? "bg-primary text-primary-foreground" : "border border-border hover:bg-secondary"}`}
            >
              {t(n)}
            </button>
          ))}
        </div>
        <input
          value={hladaj}
          onChange={(e) => setHladaj(e.target.value)}
          placeholder={t("Hľadať číslo alebo partnera…")}
          className="mt-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <ul className="mt-3 max-h-72 divide-y divide-border overflow-auto rounded-md border border-border text-sm">
          {zoznam.length === 0 ? (
            <li className="p-3 text-muted-foreground">{t("Nič sa nenašlo.")}</li>
          ) : (
            zoznam.map((x) => (
              <li key={x.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void vyber(x)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/40 disabled:opacity-50"
                >
                  <span className="min-w-0 truncate">{x.popis}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {datumNaDoklade(x.datum)} · {formatujMenu(x.suma ?? 0, x.mena)}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-2 text-sm"
          >
            {t("Zavrieť")}
          </button>
        </div>
      </div>
    </div>
  );
}
