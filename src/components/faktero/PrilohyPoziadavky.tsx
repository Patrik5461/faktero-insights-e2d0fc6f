import { useState } from "react";
import { toast } from "sonner";
import { FileText, Image as ImageIcon, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { velkost } from "@/lib/faktero/faktura-prilohy";
import { jeNahladovyObrazok } from "@/lib/faktero/podpora-prilohy";

export type PrilohaPoziadavky = {
  id: string;
  name: string;
  mime: string;
  size: number;
  /** Podpísaný odkaz, keď ho server poslal rovno (administrácia). */
  url?: string | null;
};

/**
 * Prílohy pri správe v help desku. Obrázok s odkazom sa ukáže ako náhľad,
 * ostatné (PDF, HEIC, prípadne bez odkazu) ako dlaždica, ktorá si odkaz
 * vypýta až pri kliknutí — kôš je súkromný a odkaz platí len chvíľu.
 */
export function PrilohyPoziadavky({
  prilohy,
  odkaz,
}: {
  prilohy: PrilohaPoziadavky[];
  /** Vypýta podpísaný odkaz, keď ho príloha nemá. */
  odkaz?: (id: string) => Promise<string>;
}) {
  const { t } = useT();
  const [otvaram, setOtvaram] = useState<string | null>(null);
  if (!prilohy.length) return null;

  async function otvor(p: PrilohaPoziadavky) {
    if (p.url) {
      window.open(p.url, "_blank", "noopener");
      return;
    }
    if (!odkaz) return;
    // Okno sa otvára hneď pri kliknutí — po čakaní na server by ho prehliadač zablokoval.
    const okno = window.open("about:blank", "_blank");
    setOtvaram(p.id);
    try {
      const url = await odkaz(p.id);
      if (okno) {
        okno.opener = null;
        okno.location.href = url;
      } else window.location.assign(url);
    } catch (e) {
      okno?.close();
      toast.error(
        e instanceof Error && e.message ? t(e.message) : t("Prílohu sa nepodarilo otvoriť."),
      );
    } finally {
      setOtvaram(null);
    }
  }

  return (
    <ul className="mt-3 flex flex-wrap gap-2" aria-label={t("Prílohy")}>
      {prilohy.map((p) => {
        const nahlad = p.url && jeNahladovyObrazok(p.mime);
        const Ikona = p.mime.startsWith("image/") ? ImageIcon : FileText;
        return (
          <li key={p.id} className="min-w-0">
            <button
              type="button"
              onClick={() => void otvor(p)}
              title={p.name}
              className="group flex max-w-[14rem] flex-col overflow-hidden rounded-lg border border-border bg-background text-left hover:border-primary/50"
            >
              {nahlad ? (
                <img
                  src={p.url!}
                  alt={p.name}
                  loading="lazy"
                  className="h-28 w-56 max-w-full bg-muted object-cover object-top"
                />
              ) : null}
              <span className="flex min-w-0 items-center gap-1.5 px-2 py-1.5 text-xs">
                {otvaram === p.id ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                ) : (
                  <Ikona className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 truncate group-hover:text-primary">{p.name}</span>
                <span className="shrink-0 text-muted-foreground">{velkost(p.size)}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
