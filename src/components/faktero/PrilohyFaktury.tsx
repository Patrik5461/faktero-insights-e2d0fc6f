import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Paperclip, Download, Trash2, Upload, Loader2 } from "lucide-react";
import {
  MAX_PRILOH,
  PRIPONY_PRE_VYBER,
  chybaPrilohy,
  velkost,
  type DruhSPrilohou,
} from "@/lib/faktero/faktura-prilohy";
import {
  prilohyFakturyFn,
  nahrajPrilohuFn,
  odkazNaPrilohuFn,
  zmazPrilohuFn,
} from "@/lib/faktero/faktura-prilohy.functions";

export type Priloha = {
  id: string;
  name: string;
  mime: string | null;
  size: number | null;
  created_at: string;
};

/** Text chyby pre človeka; server posiela zrozumiteľné hlášky. */
function hlaska(e: unknown, nahrada: string): string {
  return e instanceof Error && e.message ? e.message : nahrada;
}

/** Súbor na base64 bez toho, aby sa celý držal v pamäti dvakrát ako reťazec. */
function naBase64(subor: File): Promise<string> {
  return new Promise((splnit, zamietnut) => {
    const citacka = new FileReader();
    citacka.onerror = () => zamietnut(new Error(`${subor.name}: súbor sa nepodarilo prečítať.`));
    citacka.onload = () => splnit(String(citacka.result).split(",")[1] ?? "");
    citacka.readAsDataURL(subor);
  });
}

/**
 * Prílohy k dokladu — dodací list, zmluva, výkaz prác, fotka, výkres.
 *
 * Pri odoslaní dokladu mailom sa dá zaškrtnúť, že majú ísť s ním; preto
 * stránka o nich vie aj mimo tejto karty (`onZmena`).
 */
export function PrilohyFaktury({
  druh = "invoice",
  dokladId,
  mozeMenit,
  onZmena,
}: {
  /** Faktúra, cenová ponuka alebo prijatá objednávka. */
  druh?: DruhSPrilohou;
  dokladId: string;
  /** Stornovaný alebo odovzdaný doklad sa už needituje. */
  mozeMenit: boolean;
  onZmena?: (pocet: number) => void;
}) {
  const nacitaj = useServerFn(prilohyFakturyFn);
  const nahraj = useServerFn(nahrajPrilohuFn);
  const odkaz = useServerFn(odkazNaPrilohuFn);
  const zmaz = useServerFn(zmazPrilohuFn);

  const [prilohy, setPrilohy] = useState<Priloha[]>([]);
  const [pracujem, setPracujem] = useState(false);
  const [nadSchrankou, setNadSchrankou] = useState(false);
  const vstup = useRef<HTMLInputElement>(null);

  const obnov = useCallback(async () => {
    try {
      const r = await nacitaj({ data: { druh, dokladId } });
      setPrilohy(r.prilohy as Priloha[]);
      onZmena?.(r.prilohy.length);
    } catch {
      /* Zoznam príloh nie je dôvod zhodiť celú stránku dokladu. */
    }
  }, [druh, dokladId, nacitaj, onZmena]);

  useEffect(() => {
    void obnov();
  }, [obnov]);

  async function pridaj(subory: FileList | null) {
    if (!subory?.length) return;
    setPracujem(true);
    let pribudlo = prilohy.length;
    try {
      for (const subor of Array.from(subory)) {
        const chyba = chybaPrilohy(subor, pribudlo);
        if (chyba) {
          toast.error(chyba);
          continue;
        }
        await nahraj({
          data: {
            druh,
            dokladId,
            name: subor.name.slice(0, 200),
            mime: subor.type || "",
            base64: await naBase64(subor),
          },
        });
        pribudlo++;
      }
      await obnov();
    } catch (e) {
      toast.error(hlaska(e, "Prílohu sa nepodarilo nahrať."));
      await obnov();
    } finally {
      setPracujem(false);
    }
  }

  async function stiahni(p: Priloha) {
    try {
      const r = await odkaz({ data: { id: p.id } });
      window.open(r.url, "_blank", "noopener");
    } catch (e) {
      toast.error(hlaska(e, "Prílohu sa nepodarilo otvoriť."));
    }
  }

  async function odstran(p: Priloha) {
    if (!confirm(`Zmazať prílohu ${p.name}?`)) return;
    try {
      await zmaz({ data: { id: p.id } });
      toast.success("Príloha zmazaná.");
      await obnov();
    } catch (e) {
      toast.error(hlaska(e, "Prílohu sa nepodarilo zmazať."));
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <Paperclip className="h-3.5 w-3.5" /> Prílohy
          {prilohy.length > 0 && <span className="normal-case">({prilohy.length})</span>}
        </div>
        {mozeMenit && (
          <button
            type="button"
            onClick={() => vstup.current?.click()}
            disabled={pracujem || prilohy.length >= MAX_PRILOH}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-sm hover:bg-secondary disabled:opacity-50"
          >
            {pracujem ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            Pridať prílohu
          </button>
        )}
      </div>

      <input
        ref={vstup}
        type="file"
        multiple
        accept={PRIPONY_PRE_VYBER}
        className="hidden"
        onChange={(e) => {
          void pridaj(e.target.files);
          e.target.value = "";
        }}
      />

      {prilohy.length === 0 ? (
        mozeMenit ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setNadSchrankou(true);
            }}
            onDragLeave={() => setNadSchrankou(false)}
            onDrop={(e) => {
              e.preventDefault();
              setNadSchrankou(false);
              void pridaj(e.dataTransfer.files);
            }}
            className={`mt-3 rounded-lg border-2 border-dashed p-5 text-center text-sm text-muted-foreground ${
              nadSchrankou ? "border-primary bg-primary/5" : "border-border"
            }`}
          >
            {druh === "invoice"
              ? "Pretiahnite sem dodací list, zmluvu alebo výkaz — alebo ich vyberte tlačidlom."
              : druh === "quote"
                ? "Pretiahnite sem výkres, špecifikáciu alebo fotky — alebo ich vyberte tlačidlom."
                : "Pretiahnite sem objednávku zákazníka alebo podklady — alebo ich vyberte tlačidlom."}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Doklad nemá prílohy.</p>
        )
      ) : (
        <ul className="mt-3 divide-y divide-border/60">
          {prilohy.map((p) => (
            <li key={p.id} className="flex items-center gap-2 py-2">
              <button
                type="button"
                onClick={() => void stiahni(p)}
                className="min-w-0 flex-1 truncate text-left text-sm font-medium text-primary hover:underline"
                title={p.name}
              >
                {p.name}
              </button>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {velkost(p.size)}
              </span>
              <button
                type="button"
                onClick={() => void stiahni(p)}
                aria-label={`Stiahnuť ${p.name}`}
                className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <Download className="h-4 w-4" />
              </button>
              {mozeMenit && (
                <button
                  type="button"
                  onClick={() => void odstran(p)}
                  aria-label={`Zmazať ${p.name}`}
                  className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
