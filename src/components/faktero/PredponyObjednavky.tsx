import { useState } from "react";
import { Plus, X } from "lucide-react";
import {
  MAX_DLZKA_PREDPONY,
  MAX_PREDPON,
  upravPredpony,
} from "@/lib/faktero/nespracovane-nastavenia";
import { useT } from "@/lib/i18n/useT";

/**
 * Predpony čísla objednávky v nastaveniach Nespracovaných — podľa nich sa na
 * doklade spozná číslo objednávky firmy („OBJ-2026-015", „PO 4500123").
 */
export function PredponyObjednavky({
  hodnota,
  onZmena,
}: {
  hodnota: string[];
  onZmena: (predpony: string[]) => void;
}) {
  const { t } = useT();
  const [nova, setNova] = useState("");
  const pridaj = () => {
    const p = nova.trim();
    if (!p) return;
    onZmena(upravPredpony([...hodnota, p]));
    setNova("");
  };
  return (
    <div className="block">
      <span className="text-xs text-muted-foreground">{t("Predpony čísla objednávky")}</span>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {hodnota.map((p) => (
          <span
            key={p}
            className="inline-flex min-w-0 items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 font-mono text-xs"
          >
            {p}
            <button
              type="button"
              aria-label={t("Odobrať predponu {predpona}", { predpona: p })}
              onClick={() => onZmena(hodnota.filter((x) => x !== p))}
              className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {hodnota.length < MAX_PREDPON ? (
          <span className="inline-flex items-center gap-1">
            <input
              aria-label={t("Nová predpona čísla objednávky")}
              placeholder={t("napr. OBJ-")}
              maxLength={MAX_DLZKA_PREDPONY}
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  pridaj();
                }
              }}
              className="w-32 rounded-md border border-input bg-background px-2 py-1 text-sm"
            />
            <button
              type="button"
              disabled={!nova.trim()}
              onClick={pridaj}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> {t("Pridať predponu")}
            </button>
          </span>
        ) : null}
      </div>
      <span className="mt-1 block text-xs text-muted-foreground">
        {t(
          "Číslo začínajúce niektorou predponou sa pri vyťažení dokladu zapíše do čísla objednávky (napr. OBJ-2026-015). Platí pre doklady prečítané po uložení.",
        )}
      </span>
    </div>
  );
}
