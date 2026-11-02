import { Download, X } from "lucide-react";
import { NahladPdf } from "@/components/faktero/NahladPdf";
import { PanelNahladu } from "@/components/faktero/PanelNahladu";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { useT } from "@/lib/i18n/useT";

/**
 * PDF v okne nad stránkou — pozrieť si doklad bez sťahovania.
 * Kreslí sa cez pdf.js (`NahladPdf`), takže funguje aj v mobile a v appke.
 * Okno má celú výšku výrezu (mínus okraj), hlavička ostáva hore a roluje sa
 * len obsah — jediný posuvník, pod dokumentom žiadny prázdny pás.
 */
export function NahladPdfOkno({
  url,
  nazov,
  poznamka,
  onClose,
}: {
  url: string;
  nazov: string;
  poznamka?: string | null;
  onClose: () => void;
}) {
  const { t } = useT();
  useZatvorNaEscape(onClose);
  const subor = nazov.endsWith(".pdf") ? nazov : `${nazov}.pdf`;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-6"
      onClick={onClose}
    >
      <PanelNahladu
        role="dialog"
        aria-modal="true"
        aria-label={t("Náhľad {nazov}", { nazov })}
        className="w-full max-w-4xl overflow-hidden rounded-xl bg-card shadow-xl"
        obsahClassName="bg-muted/30 p-3"
        onClick={(e) => e.stopPropagation()}
        toolbar={
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{nazov}</div>
              {poznamka && <div className="text-xs text-muted-foreground">{poznamka}</div>}
            </div>
            <a
              href={url}
              download={subor}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
            >
              <Download className="h-3.5 w-3.5" /> {t("Stiahnuť PDF")}
            </a>
            <button
              onClick={onClose}
              aria-label={t("Zavrieť")}
              className="rounded-md p-1 hover:bg-secondary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        }
      >
        <NahladPdf url={url} />
      </PanelNahladu>
    </div>
  );
}
