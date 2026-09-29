import { Link } from "@tanstack/react-router";
import { Hash } from "lucide-react";

/**
 * Odkaz na číselné rady z hlavičky zoznamu dokladov.
 *
 * Číslovanie sa rieši práve vtedy, keď sa človek pozerá na doklady — nie
 * keď blúdi po nastaveniach. Preto je tlačidlo tam, kde sa doklady
 * vystavujú, rovnako ako „Účtovné exporty" pri faktúrach.
 */
export function OdkazNaRady({ label = "Číselné rady" }: { label?: string }) {
  return (
    <Link
      to="/ciselne-rady"
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
    >
      <Hash className="h-4 w-4" /> {label}
    </Link>
  );
}
