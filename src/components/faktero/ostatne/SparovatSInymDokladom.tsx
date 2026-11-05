import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileText, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { potvrd } from "@/lib/potvrdenie";
import { formatovacMeny } from "@/lib/faktero/mena";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { nazovDruhu } from "@/lib/faktero/ostatne-doklady";
import {
  dokladyNaVyberPohybuFn,
  potvrdParovanieOstatneho,
} from "@/lib/faktero/ostatne-parovanie.functions";

type Doklad = Awaited<ReturnType<typeof dokladyNaVyberPohybuFn>>["doklady"][number];

/**
 * V detaile nespárovaného odchádzajúceho pohybu: výber iného dokladu
 * (predpis, výmer, pokuta…), ktorý tento pohyb uhrádza. Najprv doklady, ktoré
 * sedia sumou a VS či IBAN-om. Spárovanie potvrdzuje človek (`potvrd`).
 */
export function SparovatSInymDokladom({
  companyId,
  pohybId,
  mena,
  onSparovane,
}: {
  companyId: string;
  pohybId: string;
  mena: string;
  onSparovane: () => void | Promise<void>;
}) {
  const { t } = useT();
  const nacitajFn = useServerFn(dokladyNaVyberPohybuFn);
  const sparujFn = useServerFn(potvrdParovanieOstatneho);
  const [doklady, setDoklady] = useState<Doklad[] | null>(null);
  const [nacitavam, setNacitavam] = useState(false);
  const [parujem, setParujem] = useState<string | null>(null);

  async function otvor() {
    setNacitavam(true);
    try {
      const r = await nacitajFn({ data: { company_id: companyId, transaction_id: pohybId } });
      setDoklady(r.doklady);
    } catch (e: any) {
      toast.error(e?.message ?? t("Doklady sa nepodarilo načítať."));
    } finally {
      setNacitavam(false);
    }
  }

  async function vyber(d: Doklad) {
    const ok = await potvrd(
      t("Spárovať pohyb s dokladom „{nazov}“?", { nazov: d.subject || d.sender || t(nazovDruhu(d.kind)) }),
      { potvrdit: t("Spárovať") },
    );
    if (!ok) return;
    setParujem(d.id);
    try {
      await sparujFn({ data: { transaction_id: pohybId, other_document_id: d.id } });
      toast.success(t("Spárované, doklad je zaplatený."));
      await onSparovane();
    } catch (e: any) {
      toast.error(e?.message ?? t("Spárovať sa to nepodarilo."));
    } finally {
      setParujem(null);
    }
  }

  if (!doklady)
    return (
      <div className="mt-2">
        <button
          type="button"
          onClick={() => void otvor()}
          disabled={nacitavam}
          data-sparovat-iny-doklad=""
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-secondary disabled:opacity-50"
        >
          {nacitavam ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          {t("Spárovať s iným dokladom")}
        </button>
      </div>
    );

  return (
    <div className="mt-2 rounded-md border border-border/70 p-2">
      <p className="px-1 text-xs font-medium text-muted-foreground">
        {t("Iný doklad (predpis, výmer, pokuta…), ktorý tento pohyb uhrádza")}
      </p>
      {doklady.length === 0 ? (
        <p className="px-1 py-2 text-sm text-muted-foreground">
          {t("Žiadny nezaplatený iný doklad na úhradu.")}
        </p>
      ) : (
        <ul className="mt-1 max-h-64 divide-y divide-border/60 overflow-y-auto">
          {doklady.map((d) => {
            const sedi = d.poradie >= 10;
            return (
              <li key={d.id}>
                <button
                  type="button"
                  disabled={!!parujem}
                  onClick={() => void vyber(d)}
                  className="flex w-full min-w-0 items-start justify-between gap-2 rounded px-1 py-1.5 text-left text-sm hover:bg-secondary disabled:opacity-50"
                >
                  <span className="min-w-0">
                    <span className="block break-words">
                      {d.subject || d.sender || t(nazovDruhu(d.kind))}
                      {sedi && (
                        <span className="stav stav-maly stav-pozor ml-1.5 align-middle">{t("sedí")}</span>
                      )}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {[
                        d.sender && d.subject ? d.sender : null,
                        d.due_date ? t("lehota {d}", { d: datumNaDoklade(d.due_date) }) : null,
                        d.variable_symbol ? `${t("VS")} ${d.variable_symbol}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {parujem === d.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : d.amount != null ? (
                      formatovacMeny(d.currency || mena, "sk-SK")(Number(d.amount))
                    ) : (
                      "—"
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
