import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Paperclip, Download, Trash2, Upload, Loader2, FileText } from "lucide-react";
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
  zipPrilohFn,
} from "@/lib/faktero/faktura-prilohy.functions";
import { potvrd } from "@/lib/potvrdenie";
import { useT } from "@/lib/i18n/useT";

export type Priloha = {
  id: string;
  name: string;
  mime: string | null;
  size: number | null;
  created_at: string;
};

/** Text chyby pre človeka; server posiela zrozumiteľné hlášky. */
function hlaska(e: unknown, nahrada: string): string {
  const sprava = e instanceof Error ? e.message : "";
  // nginx odmietne priveľké telo vlastnou HTML stránkou — tá do hlášky nepatrí.
  if (/413|Request Entity Too Large/i.test(sprava)) return "Súbor je väčší než 15 MB.";
  if (/^\s*</.test(sprava)) return nahrada;
  return sprava || nahrada;
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
  kompaktne,
  hlavny,
}: {
  /** Faktúra, cenová ponuka alebo prijatá objednávka. */
  druh?: DruhSPrilohou;
  dokladId: string;
  /** Stornovaný alebo odovzdaný doklad sa už needituje. */
  mozeMenit: boolean;
  onZmena?: (pocet: number) => void;
  /**
   * Kompaktné rozloženie detailu: pole na pretiahnutie súborov ostáva vždy,
   * súbory ako dlaždice s náhľadom a tlačidlo Stiahnuť všetky.
   */
  kompaktne?: boolean;
  /** Súbor samotného dokladu — v kompaktnom rozložení prvá dlaždica. */
  hlavny?: { nazov: string; url: string | null; mime: string | null; stiahni: () => void } | null;
}) {
  const { t } = useT();
  const nacitaj = useServerFn(prilohyFakturyFn);
  const nahraj = useServerFn(nahrajPrilohuFn);
  const odkaz = useServerFn(odkazNaPrilohuFn);
  const zmaz = useServerFn(zmazPrilohuFn);
  const zip = useServerFn(zipPrilohFn);

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
          toast.error(t(chyba));
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
      toast.error(t(hlaska(e, "Prílohu sa nepodarilo nahrať.")));
      await obnov();
    } finally {
      setPracujem(false);
    }
  }

  async function stiahni(p: Priloha) {
    try {
      const r = await odkaz({ data: { id: p.id, druh } });
      window.open(r.url, "_blank", "noopener");
    } catch (e) {
      toast.error(t(hlaska(e, "Prílohu sa nepodarilo otvoriť.")));
    }
  }

  async function odstran(p: Priloha) {
    if (!(await potvrd(t("Zmazať prílohu {nazov}?", { nazov: p.name })))) return;
    try {
      await zmaz({ data: { id: p.id, druh } });
      toast.success(t("Príloha zmazaná."));
      await obnov();
    } catch (e) {
      toast.error(t(hlaska(e, "Prílohu sa nepodarilo zmazať.")));
    }
  }

  /** Jeden ZIP so súborom dokladu aj prílohami — nie kopa nových kariet. */
  async function stiahniVsetky() {
    setPracujem(true);
    try {
      const bez = (n: string) => n.replace(/\.[^.]+$/, "");
      const r = await zip({
        data: { druh, dokladId, nazovDokladu: hlavny?.nazov ? bez(hlavny.nazov) : undefined },
      });
      const bin = atob(r.base64);
      const bajty = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bajty[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bajty], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      toast.error(t(hlaska(e, "Prílohy sa nepodarilo stiahnuť.")));
    } finally {
      setPracujem(false);
    }
  }

  if (kompaktne) {
    const dlazdica =
      "group relative flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-background";
    return (
      <section
        aria-label={t("Prílohy")}
        className="rounded-xl border border-border bg-card p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            {t("Prílohy")}
            {prilohy.length + (hlavny ? 1 : 0) > 0 ? (
              <span className="text-sm font-normal text-muted-foreground">
                ({prilohy.length + (hlavny ? 1 : 0)})
              </span>
            ) : null}
          </h2>
          {prilohy.length + (hlavny ? 1 : 0) > 1 ? (
            <button
              type="button"
              onClick={() => void stiahniVsetky()}
              disabled={pracujem}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-secondary"
            >
              {pracujem ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}{" "}
              {t("Stiahnuť všetky prílohy")}
            </button>
          ) : null}
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
        {mozeMenit ? (
          <div
            role="button"
            tabIndex={0}
            onClick={() => vstup.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") vstup.current?.click();
            }}
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
            className={`mt-3 flex cursor-pointer flex-wrap items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-center text-sm text-muted-foreground ${
              nadSchrankou ? "border-primary bg-primary/5" : "border-border hover:bg-secondary/40"
            }`}
          >
            {pracujem ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {t("Pretiahnite sem súbor alebo ho vyberte (najviac {n} príloh)", { n: MAX_PRILOH })}
          </div>
        ) : null}
        {hlavny || prilohy.length ? (
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {hlavny ? (
              <li className={dlazdica}>
                <button
                  type="button"
                  onClick={hlavny.stiahni}
                  className="block h-28 w-full bg-muted/30"
                  title={hlavny.nazov}
                >
                  {hlavny.url && (hlavny.mime ?? "").startsWith("image/") ? (
                    <img src={hlavny.url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
                  )}
                </button>
                <span className="truncate px-2 py-1.5 text-xs font-medium" title={hlavny.nazov}>
                  {hlavny.nazov}
                </span>
              </li>
            ) : null}
            {prilohy.map((p) => (
              <li key={p.id} className={dlazdica}>
                <button
                  type="button"
                  onClick={() => void stiahni(p)}
                  className="grid h-28 w-full place-items-center bg-muted/30"
                  title={p.name}
                >
                  <FileText className="h-10 w-10 text-muted-foreground" />
                </button>
                <span className="flex min-w-0 items-center gap-1 px-2 py-1.5 text-xs">
                  <span className="min-w-0 flex-1 truncate font-medium" title={p.name}>
                    {p.name}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {velkost(p.size)}
                  </span>
                </span>
                {mozeMenit ? (
                  <button
                    type="button"
                    onClick={() => void odstran(p)}
                    aria-label={t("Zmazať {nazov}", { nazov: p.name })}
                    className="absolute right-1 top-1 rounded-md bg-card/90 p-1 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : !mozeMenit ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("Doklad nemá prílohy.")}</p>
        ) : null}
      </section>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <Paperclip className="h-3.5 w-3.5" /> {t("Prílohy")}
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
            {t("Pridať prílohu")}
          </button>
        )}
      </div>

      {druh === "invoice" && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t(
            "Prílohy sa odošlú s faktúrou e-mailom aj s eFaktúrou — pri odoslaní si vyberiete, ktoré. eFaktúra prijme PDF, PNG, JPG, CSV, XLSX a ODS, každý súbor do 10 MB a spolu do 15 MB.",
          )}
        </p>
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
            {t(
              druh === "invoice"
                ? "Pretiahnite sem dodací list, zmluvu alebo výkaz — alebo ich vyberte tlačidlom."
                : druh === "quote"
                  ? "Pretiahnite sem výkres, špecifikáciu alebo fotky — alebo ich vyberte tlačidlom."
                  : druh === "purchase_invoice" || druh === "expense"
                    ? "Pretiahnite sem dodací list, druhú stranu alebo výkaz — alebo ich vyberte tlačidlom."
                    : "Pretiahnite sem objednávku zákazníka alebo podklady — alebo ich vyberte tlačidlom.",
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{t("Doklad nemá prílohy.")}</p>
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
                aria-label={t("Stiahnuť {nazov}", { nazov: p.name })}
                className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <Download className="h-4 w-4" />
              </button>
              {mozeMenit && (
                <button
                  type="button"
                  onClick={() => void odstran(p)}
                  aria-label={t("Zmazať {nazov}", { nazov: p.name })}
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
