import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Paperclip, FileText, Trash2 } from "lucide-react";
import { useOperacia } from "@/lib/mobile/server-most";
import { usePreklad } from "@/lib/mobile/preklady/hook";
import {
  MAX_PRILOH,
  PRIPONY_PRE_VYBER,
  chybaPrilohy,
  velkost,
} from "@/lib/faktero/faktura-prilohy";
import { VelkeTlacidlo } from "./MobilChrome";

type Priloha = { id: string; name: string; size: number | null };

function naBase64(subor: File): Promise<string> {
  return new Promise((splnit, zamietnut) => {
    const citacka = new FileReader();
    citacka.onerror = () => zamietnut(new Error(subor.name));
    citacka.onload = () => splnit(String(citacka.result).split(",")[1] ?? "");
    citacka.readAsDataURL(subor);
  });
}

/**
 * Prílohy faktúry v appke — tie isté ako na webe. Pole na výber súboru
 * v telefóne ponúkne fotoaparát, galériu aj súbory, takže dodací list sa dá
 * odfotiť priamo u zákazníka.
 */
export function PrilohyAppka({ invoiceId, mozeMenit }: { invoiceId: string; mozeMenit: boolean }) {
  const { t } = usePreklad();
  const zoznamFn = useOperacia("prilohy-zoznam");
  const nahrajFn = useOperacia("priloha-nahraj");
  const odkazFn = useOperacia("priloha-odkaz");
  const zmazFn = useOperacia("priloha-zmaz");

  const [prilohy, setPrilohy] = useState<Priloha[]>([]);
  const [nahravam, setNahravam] = useState(false);
  const [mazanie, setMazanie] = useState<string | null>(null);
  const vstup = useRef<HTMLInputElement>(null);

  const obnov = useCallback(async () => {
    try {
      const r: any = await zoznamFn({ data: { druh: "invoice", dokladId: invoiceId } });
      setPrilohy(r?.prilohy ?? []);
    } catch {
      /* Bez signálu sa zoznam nenačíta — detail faktúry kvôli tomu nepadne. */
    }
  }, [invoiceId, zoznamFn]);

  useEffect(() => {
    void obnov();
  }, [obnov]);

  async function pridaj(subory: FileList | null) {
    if (!subory?.length) return;
    setNahravam(true);
    let pocet = prilohy.length;
    try {
      for (const subor of Array.from(subory)) {
        const chyba = chybaPrilohy(subor, pocet);
        if (chyba) {
          toast.error(chyba);
          continue;
        }
        await nahrajFn({
          data: {
            druh: "invoice",
            dokladId: invoiceId,
            name: subor.name.slice(0, 200),
            mime: subor.type || "",
            base64: await naBase64(subor),
          },
        });
        pocet++;
      }
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : t("pril.chybaNahratia"));
    } finally {
      setNahravam(false);
      await obnov();
    }
  }

  async function otvor(p: Priloha) {
    try {
      const r: any = await odkazFn({ data: { id: p.id } });
      window.open(r.url, "_blank");
    } catch {
      toast.error(t("pril.chybaOtvorenia"));
    }
  }

  async function zmaz(p: Priloha) {
    try {
      await zmazFn({ data: { id: p.id } });
      toast.success(t("pril.zmazana"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setMazanie(null);
      await obnov();
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1 text-[13px] font-semibold uppercase tracking-wide text-app-text-2">
        <Paperclip className="h-3.5 w-3.5" /> {t("pril.nadpis")}
        {prilohy.length > 0 && <span className="normal-case">({prilohy.length})</span>}
      </div>

      {prilohy.length === 0 && !mozeMenit && (
        <p className="px-1 text-[14px] text-app-text-2">{t("pril.ziadne")}</p>
      )}

      {prilohy.length > 0 && (
        <div className="divide-y divide-app-ramik rounded-app border border-app-ramik bg-app-karta shadow-app">
          {prilohy.map((p) =>
            mazanie === p.id ? (
              <div key={p.id} className="space-y-2 p-3">
                <p className="text-[14px]">{t("pril.naozajZmazat", { nazov: p.name })}</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setMazanie(null)}
                    className="rounded-app-sm border border-app-ramik px-3 py-2 text-sm"
                  >
                    {t("pril.ponechat")}
                  </button>
                  <button
                    onClick={() => void zmaz(p)}
                    className="rounded-app-sm bg-destructive px-3 py-2 text-sm font-medium text-app-chyba-foreground"
                  >
                    {t("pril.zmazat")}
                  </button>
                </div>
              </div>
            ) : (
              <div key={p.id} className="flex items-center gap-3 p-3">
                <button
                  onClick={() => void otvor(p)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <FileText className="h-5 w-5 shrink-0 text-app-zelena" />
                  <span className="min-w-0 flex-1 truncate text-[15px] text-app-text">
                    {p.name}
                  </span>
                  <span className="shrink-0 text-[12px] tabular-nums text-app-text-2">
                    {velkost(p.size)}
                  </span>
                </button>
                {mozeMenit && (
                  <button
                    onClick={() => setMazanie(p.id)}
                    aria-label={`${t("pril.zmazat")} ${p.name}`}
                    className="shrink-0 rounded-app-sm p-2 text-app-text-2"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ),
          )}
        </div>
      )}

      {mozeMenit && prilohy.length < MAX_PRILOH && (
        <VelkeTlacidlo
          icon={Paperclip}
          label={nahravam ? t("pril.nahravam") : t("pril.pridat")}
          hint={t("pril.pridatPopis")}
          disabled={nahravam}
          onClick={() => vstup.current?.click()}
        />
      )}
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
    </div>
  );
}
