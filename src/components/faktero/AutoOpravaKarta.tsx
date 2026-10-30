import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bot, Check, Loader2, RotateCcw, Send, X } from "lucide-react";
import {
  adminAutoOpravaFn,
  adminAutoOpravaOdpovedFn,
  adminAutoOpravyFn,
} from "@/lib/faktero/podpora-admin.functions";
import { potvrd } from "@/lib/potvrdenie";

/*
  Automatická oprava nahlásenej chyby v detaile požiadavky (Admin → Podpora).
  Návrh pripraví spúšťač na serveri (scripts/auto-oprava) na samostatnej vetve;
  do main a na web ide až po „Schváliť a nasadiť“.
*/

const POPIS_STAVU: Record<string, { text: string; trieda: string }> = {
  caka: { text: "Čaká na spracovanie", trieda: "bg-secondary text-foreground" },
  bezi: {
    text: "Hľadá príčinu a opravu…",
    trieda: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  },
  navrh: {
    text: "Návrh opravy čaká na schválenie",
    trieda: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  },
  bez_opravy: { text: "Bez zmeny v kóde", trieda: "bg-secondary text-foreground" },
  zlyhala: {
    text: "Nepodarilo sa",
    trieda: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  },
  schvalena: {
    text: "Schválená — pripravuje sa nasadenie",
    trieda: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  },
  zlucuje: {
    text: "Spúšťajú sa testy a zlučuje sa…",
    trieda: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  },
  zlucena: {
    text: "V main — čaká na nasadenie",
    trieda: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  },
  nasadena: {
    text: "Nasadená na web",
    trieda: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  },
  zamietnuta: { text: "Zamietnutá", trieda: "bg-secondary text-muted-foreground" },
};
const BEZI = ["caka", "bezi", "schvalena", "zlucuje", "zlucena"];
const ISTOTA: Record<string, string> = { vysoka: "vysoká", stredna: "stredná", nizka: "nízka" };
/** Pri týchto stavoch má zmysel pripraviť odpoveď zákazníkovi po nasadení. */
const S_ODPOVEDOU = ["navrh", "schvalena", "zlucuje", "zlucena", "nasadena"];

export function AutoOpravaKarta({ poziadavkaId }: { poziadavkaId: string }) {
  const zoznamFn = useServerFn(adminAutoOpravyFn);
  const akciaFn = useServerFn(adminAutoOpravaFn);
  const [rows, setRows] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [pokyn, setPokyn] = useState("");
  const [pisePokyn, setPisePokyn] = useState(false);

  const nacitaj = useCallback(async () => {
    try {
      setRows(await zoznamFn({ data: { poziadavka_id: poziadavkaId } }));
    } catch {
      setRows([]);
    }
  }, [zoznamFn, poziadavkaId]);

  useEffect(() => {
    void nacitaj();
  }, [nacitaj]);

  const o = rows?.[0];
  // Kým automat pracuje, stav sa obnovuje sám.
  useEffect(() => {
    if (!o || !BEZI.includes(o.stav)) return;
    const t = window.setInterval(() => void nacitaj(), 15_000);
    return () => window.clearInterval(t);
  }, [o, nacitaj]);

  async function akcia(a: "spustit" | "schvalit" | "zamietnut" | "znova") {
    if (
      a === "schvalit" &&
      !(await potvrd(
        "Schváliť opravu a nasadiť ju na faktero.sk? Pred zlúčením sa pustia všetky testy; keď neprejdú, nič sa nenasadí.",
        { potvrdit: "Schváliť a nasadiť" },
      ))
    )
      return;
    setBusy(true);
    try {
      await akciaFn({
        data: {
          poziadavka_id: poziadavkaId,
          id: o?.id,
          akcia: a,
          pokyn: pokyn.trim() || undefined,
        },
      });
      setPokyn("");
      setPisePokyn(false);
      toast.success(
        a === "schvalit"
          ? "Schválené — testy a nasadenie bežia na serveri."
          : a === "zamietnut"
            ? "Návrh zamietnutý."
            : "Zaradené — návrh príde do pár minút aj e-mailom.",
      );
      await nacitaj();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (rows === null) return null;
  const stav = o ? (POPIS_STAVU[o.stav] ?? { text: o.stav, trieda: "bg-secondary" }) : null;

  return (
    <section
      className="rounded-xl border border-border bg-card p-4"
      aria-label="Automatická oprava"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Bot className="h-4 w-4" /> Automatická oprava
        </h2>
        {stav ? (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${stav.trieda}`}
          >
            {BEZI.includes(o.stav) && <Loader2 className="h-3 w-3 animate-spin" />}
            {stav.text}
            {o.pokus > 1 ? ` · pokus ${o.pokus}` : ""}
          </span>
        ) : null}
      </div>

      {!o ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Chyby sa opravujú automaticky. Pri tejto požiadavke návrh nevznikol — dá sa spustiť ručne.
        </p>
      ) : (
        <div className="mt-3 space-y-2 text-sm">
          {o.pricina ? (
            <p>
              <span className="font-medium">Príčina:</span> {o.pricina}
            </p>
          ) : null}
          {o.zmena ? (
            <p className="whitespace-pre-wrap">
              <span className="font-medium">Zmena:</span> {o.zmena}
            </p>
          ) : null}
          {o.istota ? (
            <p className="text-muted-foreground">Istota: {ISTOTA[o.istota] ?? o.istota}</p>
          ) : null}
          {o.subory?.length ? (
            <p className="text-muted-foreground">
              Súbory: <span className="font-mono text-xs">{o.subory.join(", ")}</span>
            </p>
          ) : null}
          {o.vetva ? (
            <p className="text-muted-foreground">
              Vetva: <span className="font-mono text-xs">{o.vetva}</span>
              {o.commit_sha ? (
                <span className="font-mono text-xs"> · {o.commit_sha.slice(0, 8)}</span>
              ) : null}
            </p>
          ) : null}
          {o.chyba ? (
            <p className="whitespace-pre-wrap rounded-md bg-red-50 p-2 text-xs text-red-900 dark:bg-red-950/40 dark:text-red-200">
              {o.chyba}
            </p>
          ) : null}
          {o.kontrola ? (
            <p className="whitespace-pre-wrap text-xs text-muted-foreground">{o.kontrola}</p>
          ) : null}
          {o.diff ? (
            <details>
              <summary className="cursor-pointer text-xs font-medium">
                Zobraziť zmeny v kóde
              </summary>
              <pre className="mt-2 max-h-[32rem] overflow-auto rounded-md bg-secondary p-3 text-[11px] leading-snug">
                {String(o.diff)
                  .split("\n")
                  .map((r: string, i: number) => (
                    <span
                      key={i}
                      className={
                        r.startsWith("+") && !r.startsWith("+++")
                          ? "block text-emerald-700 dark:text-emerald-400"
                          : r.startsWith("-") && !r.startsWith("---")
                            ? "block text-red-700 dark:text-red-400"
                            : "block"
                      }
                    >
                      {r || " "}
                    </span>
                  ))}
              </pre>
            </details>
          ) : null}
        </div>
      )}

      {o && S_ODPOVEDOU.includes(o.stav) ? (
        <OdpovedPoNasadeni o={o} poziadavkaId={poziadavkaId} poZmene={nacitaj} />
      ) : null}

      {pisePokyn ? (
        <textarea
          value={pokyn}
          onChange={(e) => setPokyn(e.target.value)}
          rows={3}
          maxLength={4000}
          aria-label="Pokyn pre automatickú opravu"
          placeholder="Voliteľný pokyn, napr. „chyba je pri dobropise, nie pri faktúre“"
          className="mt-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {o?.stav === "navrh" ? (
          <button
            onClick={() => void akcia("schvalit")}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Check className="h-4 w-4" /> Schváliť a nasadiť
          </button>
        ) : null}
        {!o || !BEZI.includes(o.stav) ? (
          <button
            onClick={() => (pisePokyn ? void akcia(o ? "znova" : "spustit") : setPisePokyn(true))}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" />
            {pisePokyn ? "Spustiť" : o ? "Skúsiť znova" : "Spustiť opravu"}
          </button>
        ) : null}
        {o && ["navrh", "bez_opravy", "zlyhala", "caka"].includes(o.stav) ? (
          <button
            onClick={() => void akcia("zamietnut")}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
          >
            <X className="h-4 w-4" /> Zamietnuť
          </button>
        ) : null}
      </div>
    </section>
  );
}

/*
  Odpoveď zákazníkovi po nasadení: keď je oprava na webe, spúšťač ju pošle sám
  (e-mail, Telegram) a požiadavku uzavrie. Podpora tu text upraví, automatiku
  vypne, alebo po nasadení odpoveď pošle hneď.
*/
function OdpovedPoNasadeni({
  o,
  poziadavkaId,
  poZmene,
}: {
  o: any;
  poziadavkaId: string;
  poZmene: () => Promise<void>;
}) {
  const odpovedFn = useServerFn(adminAutoOpravaOdpovedFn);
  const [text, setText] = useState<string>(o.odpoved_vysledny ?? "");
  const [upravuje, setUpravuje] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!upravuje) setText(o.odpoved_vysledny ?? "");
  }, [o.odpoved_vysledny, upravuje]);

  async function uloz(zmena: { text?: string; auto?: boolean }, odoslat = false) {
    setBusy(true);
    try {
      await odpovedFn({
        data: {
          poziadavka_id: poziadavkaId,
          id: o.id,
          akcia: odoslat ? "odoslat" : "ulozit",
          ...zmena,
        },
      });
      setUpravuje(false);
      toast.success(
        odoslat
          ? "Odpoveď odoslaná, požiadavka uzavretá."
          : zmena.auto === undefined
            ? "Text odpovede uložený."
            : zmena.auto
              ? "Po nasadení sa zákazníkovi odpovie automaticky."
              : "Automatická odpoveď vypnutá.",
      );
      await poZmene();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (o.odpoved_odoslana_at) {
    return (
      <div className="mt-3 rounded-md border border-border p-3 text-sm">
        <p className="font-medium">
          Odpoveď zákazníkovi odoslaná {new Date(o.odpoved_odoslana_at).toLocaleString("sk-SK")}
        </p>
        <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{o.odpoved_text}</p>
      </div>
    );
  }

  const nasadena = o.stav === "nasadena";
  return (
    <div className="mt-3 space-y-2 rounded-md border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">Odpoveď zákazníkovi po nasadení</span>
        <label className="inline-flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={!!o.odpoved_auto}
            disabled={busy}
            onChange={(e) => void uloz({ auto: e.target.checked })}
          />
          Poslať automaticky a uzavrieť požiadavku
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        {o.odpoved_auto
          ? nasadena
            ? "Oprava je nasadená — odpoveď odíde pri najbližšom behu automatu (do 2 minút)."
            : "Keď bude oprava naozaj na faktero.sk, tento text odíde e-mailom (a do Telegramu, ak ho zákazník má spárovaný) a požiadavka sa uzavrie."
          : "Automatika je vypnutá — zákazníkovi sa nič nepošle, kým to nezapnete alebo neodošlete ručne."}
      </p>
      {upravuje ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          maxLength={10000}
          aria-label="Text odpovede zákazníkovi"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      ) : (
        <p className="whitespace-pre-wrap rounded-md bg-secondary p-2 text-xs">{text}</p>
      )}
      {o.odpoved_chyba ? (
        <p className="whitespace-pre-wrap rounded-md bg-red-50 p-2 text-xs text-red-900 dark:bg-red-950/40 dark:text-red-200">
          {o.odpoved_chyba}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {upravuje ? (
          <>
            <button
              onClick={() => void uloz({ text })}
              disabled={busy || !text.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Check className="h-4 w-4" /> Uložiť text
            </button>
            <button
              onClick={() => void uloz({ text: "" })}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" /> Predvolený text
            </button>
            <button
              onClick={() => setUpravuje(false)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
            >
              <X className="h-4 w-4" /> Zrušiť
            </button>
          </>
        ) : (
          <button
            onClick={() => setUpravuje(true)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
          >
            Upraviť text
          </button>
        )}
        {nasadena ? (
          <button
            onClick={async () => {
              if (
                !(await potvrd("Poslať zákazníkovi túto odpoveď a uzavrieť požiadavku?", {
                  potvrdit: "Odoslať",
                }))
              )
                return;
              await uloz(upravuje ? { text } : {}, true);
            }}
            disabled={busy || !text.trim()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
          >
            <Send className="h-4 w-4" /> Odoslať teraz
          </button>
        ) : null}
      </div>
    </div>
  );
}
