import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mic, MicOff, Send, Volume2, VolumeX, X } from "lucide-react";
import { hlasPotvrdFn, hlasPrikazFn } from "@/lib/faktero/hlas.functions";
import {
  hlasyNaVyber,
  jazykReci,
  jeZrusenie,
  naPotvrdenie,
  smiePotvrdit,
  textNaPrecitanie,
  vyberHlas,
  type DokladNaObrazovke,
  type KoloHlasu,
  type NavrhHlasu,
} from "@/lib/faktero/hlas";
import { dajKontextHlasu } from "@/lib/faktero/hlas-kontext";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { useT } from "@/lib/i18n/useT";

/*
  Hlasové ovládanie (TEST, len administrátori platformy — `HLAS_PRE` v hlas.ts).

  Mikrofón v hlavičke: klik spustí počúvanie (Web Speech API, sk-SK / cs-CZ
  podľa jazyka), ticho ho zastaví a veta ide na server. Odpoveď sa ukáže
  v paneli a prečíta ženským hlasom (speechSynthesis). Návrh zaúčtovania
  čaká v tabuľke na Potvrdiť / Zrušiť — alebo „potvrď“ / „zruš“ hlasom.
  Bez podpory reči (Firefox) sa dá príkaz napísať do poľa v paneli.
*/

const KLUC_HLASU = "faktero.hlas.hlas";
const KLUC_TICHO = "faktero.hlas.ticho";

function citaj(k: string): string | null {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
}
function zapis(k: string, v: string | null) {
  try {
    if (v == null) window.localStorage.removeItem(k);
    else window.localStorage.setItem(k, v);
  } catch {
    /* súkromné okno — voľba sa len nezapamätá */
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function konstruktorRozpoznavania(): any {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const fmtSuma = (n: number | null, mena: string | null) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("sk-SK", { style: "currency", currency: mena || "EUR" }).format(n);

export function HlasoveTlacidlo({ className = "" }: { className?: string }) {
  const { t } = useT();
  const [otvorene, setOtvorene] = useState(false);
  const [spustit, setSpustit] = useState(0);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOtvorene(true);
          setSpustit((n) => n + 1);
        }}
        title={t("Hlasové ovládanie (test)")}
        aria-label={t("Hlasové ovládanie")}
        className={`grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground hover:border-primary/40 hover:text-foreground ${className}`}
      >
        <Mic className="h-3.5 w-3.5" />
      </button>
      {otvorene && (
        <HlasovyPanel spustit={spustit} onZavri={() => setOtvorene(false)} />
      )}
    </>
  );
}

type Stav = "pripraveny" | "pocuva" | "mysli" | "zapisuje";

function HlasovyPanel({ spustit, onZavri }: { spustit: number; onZavri: () => void }) {
  const { t, jazyk } = useT();
  const navigate = useNavigate();
  const cesta = useRouterState({ select: (s) => s.location.pathname });
  const prikaz = useServerFn(hlasPrikazFn);
  const potvrdFn = useServerFn(hlasPotvrdFn);

  const [stav, setStav] = useState<Stav>("pripraveny");
  const [priebezny, setPriebezny] = useState("");
  const [kola, setKola] = useState<KoloHlasu[]>([]);
  const [navrh, setNavrh] = useState<NavrhHlasu | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [ticho, setTicho] = useState(() => citaj(KLUC_TICHO) === "1");
  const [hlasy, setHlasy] = useState<SpeechSynthesisVoice[]>([]);
  const [zvolenyHlas, setZvolenyHlas] = useState<string | null>(() => citaj(KLUC_HLASU));
  const znameRef = useRef<DokladNaObrazovke[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rozpoznavanieRef = useRef<any>(null);
  const kolaRef = useRef<KoloHlasu[]>([]);
  kolaRef.current = kola;
  const navrhRef = useRef<NavrhHlasu | null>(null);
  navrhRef.current = navrh;

  useZatvorNaEscape(onZavri);

  const Rozpoznavanie = konstruktorRozpoznavania();
  const recDostupna = Boolean(Rozpoznavanie);
  const ttsDostupna = typeof window !== "undefined" && "speechSynthesis" in window;

  // Hlasy prehliadač načíta neskôr (Chrome až po `voiceschanged`).
  useEffect(() => {
    if (!ttsDostupna) return;
    const nacitaj = () => setHlasy(window.speechSynthesis.getVoices());
    nacitaj();
    window.speechSynthesis.addEventListener?.("voiceschanged", nacitaj);
    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", nacitaj);
      window.speechSynthesis.cancel();
    };
  }, [ttsDostupna]);

  const { hlas, zensky } = vyberHlas(hlasy, jazyk, zvolenyHlas);
  const naVyber = hlasyNaVyber(hlasy, jazyk);

  const stopniHovor = useCallback(() => {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* nič */
    }
  }, []);

  const povedz = useCallback(
    (veta: string) => {
      if (ticho || !ttsDostupna || !veta) return;
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(textNaPrecitanie(veta));
        u.lang = hlas?.lang ?? jazykReci(jazyk);
        if (hlas) u.voice = hlas;
        u.rate = 1.05;
        window.speechSynthesis.speak(u);
      } catch {
        /* reč je doplnok — text je v paneli */
      }
    },
    [ticho, ttsDostupna, hlas, jazyk],
  );

  const pridajKolo = (k: KoloHlasu) => setKola((p) => [...p, k].slice(-12));

  const odpovedz = useCallback(
    (veta: string) => {
      pridajKolo({ kto: "asistent", text: veta });
      povedz(veta);
    },
    [povedz],
  );

  async function potvrd(args: { klik?: boolean; text?: string }) {
    const n = navrhRef.current;
    const polozky = naPotvrdenie(n);
    if (!smiePotvrdit({ maNavrh: polozky.length > 0, ...args })) return;
    const cid = getActiveCompanyId();
    if (!cid) return;
    setStav("zapisuje");
    setChyba(null);
    try {
      const kontext = dajKontextHlasu(cesta);
      let zapisanych = 0;
      const preskocene: string[] = [];
      const naServer = [];
      for (const p of polozky) {
        // Otvorený nespracovaný doklad: potvrdí sa vo formulári a uloží jeho tlačidlom.
        if (
          p.typ === "nespracovany" &&
          kontext.otvoreny?.id === p.id &&
          kontext.akcie.potvrdNavrh &&
          (await kontext.akcie.potvrdNavrh(p.id))
        ) {
          zapisanych++;
          continue;
        }
        naServer.push({ typ: p.typ, id: p.id, predkontacia: p.predkontacia! });
      }
      if (naServer.length) {
        const r = await potvrdFn({ data: { company_id: cid, polozky: naServer } });
        zapisanych += r.zapisanych;
        preskocene.push(...r.preskocene);
      }
      setNavrh(null);
      kontext.akcie.obnov?.();
      odpovedz(
        preskocene.length
          ? t("Zapísané: {n}. Preskočené: {m} — {dovod}", {
              n: zapisanych,
              m: preskocene.length,
              dovod: preskocene.slice(0, 2).join("; "),
            })
          : t("Hotovo, zapísané: {n}.", { n: zapisanych }),
      );
    } catch (e) {
      setChyba(String((e as Error)?.message ?? e));
    } finally {
      setStav("pripraveny");
    }
  }

  function zrus() {
    setNavrh(null);
    odpovedz(t("Návrh som zrušila, nič sa neuložilo."));
  }

  async function odosli(veta: string) {
    const v = veta.trim();
    if (!v) return;
    const cid = getActiveCompanyId();
    if (!cid) {
      setChyba(t("Vyberte firmu."));
      return;
    }
    setChyba(null);
    const historia = kolaRef.current;
    pridajKolo({ kto: "user", text: v });
    const caka = naPotvrdenie(navrhRef.current).length > 0;
    // Súhlas a odmietnutie čakajúceho návrhu rozhodne prehliadač sám — bez modelu.
    if (caka && smiePotvrdit({ maNavrh: true, text: v })) return potvrd({ text: v });
    if (caka && jeZrusenie(v)) return zrus();

    setStav("mysli");
    try {
      const k = dajKontextHlasu(cesta);
      const r = await prikaz({
        data: {
          company_id: cid,
          text: v,
          jazyk: (jazyk === "cs" || jazyk === "de" ? jazyk : "sk") as "sk" | "cs" | "de",
          kontext: {
            stranka: k.stranka,
            cesta: k.cesta,
            doklady: k.doklady,
            oznacene: k.oznacene,
            otvoreny: k.otvoreny,
          },
          historia,
          caka_navrh: caka,
          zname: znameRef.current,
        },
      });
      znameRef.current = r.zname;
      let potvrdit = false;
      for (const a of r.akcie) {
        if (a.typ === "navigovat")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          void navigate({ to: a.navigacia.to as any, params: a.navigacia.params as any });
        else if (a.typ === "navrh") setNavrh(a.navrh);
        else if (a.typ === "zrusit") setNavrh(null);
        else if (a.typ === "potvrdit") potvrdit = true;
      }
      setStav("pripraveny");
      if (potvrdit) {
        // Model súhlas rozpoznal, ale zapíše sa len po vete, ktorá súhlasom naozaj je.
        if (smiePotvrdit({ maNavrh: caka, text: v })) return potvrd({ text: v });
        return odpovedz(t("Na uloženie povedzte „potvrď“ alebo kliknite Potvrdiť."));
      }
      odpovedz(r.text);
    } catch (e) {
      setStav("pripraveny");
      setChyba(String((e as Error)?.message ?? e));
    }
  }

  function pocuvaj() {
    if (!Rozpoznavanie) return;
    stopniHovor();
    if (rozpoznavanieRef.current) {
      try {
        rozpoznavanieRef.current.stop();
      } catch {
        /* nič */
      }
      return;
    }
    const r = new Rozpoznavanie();
    r.lang = jazykReci(jazyk);
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    let finalny = "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onresult = (e: any) => {
      let docasny = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const x = e.results[i];
        if (x.isFinal) finalny += x[0].transcript;
        else docasny += x[0].transcript;
      }
      setPriebezny((finalny + " " + docasny).trim());
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onerror = (e: any) => {
      const kod = String(e?.error ?? "");
      if (kod === "not-allowed" || kod === "service-not-allowed")
        setChyba(t("Prehliadač nedovolil mikrofón — povoľte ho pri adrese stránky."));
      else if (kod !== "no-speech" && kod !== "aborted") setChyba(t("Rozpoznávanie reči zlyhalo ({kod}).", { kod }));
    };
    r.onend = () => {
      rozpoznavanieRef.current = null;
      setStav((s) => (s === "pocuva" ? "pripraveny" : s));
      setPriebezny("");
      if (finalny.trim()) void odosli(finalny);
    };
    rozpoznavanieRef.current = r;
    setPriebezny("");
    setStav("pocuva");
    try {
      r.start();
    } catch {
      rozpoznavanieRef.current = null;
      setStav("pripraveny");
    }
  }

  // Klik na mikrofón v hlavičke (aj keď je panel otvorený) spustí počúvanie.
  useEffect(() => {
    if (spustit && recDostupna) pocuvaj();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spustit]);

  useEffect(
    () => () => {
      try {
        rozpoznavanieRef.current?.abort();
      } catch {
        /* nič */
      }
    },
    [],
  );

  const polozkyNaPotvrdenie = naPotvrdenie(navrh);
  const zaneprazdneny = stav === "mysli" || stav === "zapisuje";

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={t("Hlasové ovládanie")}
      data-hlasovy-panel=""
      className="fixed bottom-4 right-4 z-50 flex max-h-[min(80vh,640px)] w-[min(40rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-border bg-card text-foreground shadow-xl"
      onClick={stopniHovor}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Mic className="h-4 w-4 text-primary" />
        <strong className="text-sm">{t("Hlasové ovládanie")}</strong>
        <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
          {t("test")}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {ttsDostupna && (
            <button
              type="button"
              onClick={() => {
                const n = !ticho;
                setTicho(n);
                zapis(KLUC_TICHO, n ? "1" : null);
                if (n) window.speechSynthesis.cancel();
              }}
              aria-label={ticho ? t("Zapnúť hlas") : t("Stlmiť hlas")}
              title={ticho ? t("Zapnúť hlas") : t("Stlmiť hlas")}
              className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary"
            >
              {ticho ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          )}
          <button
            type="button"
            onClick={onZavri}
            aria-label={t("Zavrieť")}
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2 text-sm">
        {!recDostupna && (
          <p className="rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">
            {t("Tento prehliadač nevie rozpoznávať reč (funguje v Chrome a Edge). Príkaz môžete napísať do poľa nižšie.")}
          </p>
        )}
        {kola.length === 0 && !priebezny && (
          <p className="text-xs text-muted-foreground">
            {t("Skúste napríklad: „otvor nespracované doklady“, „navrhni zaúčtovanie“, „koľko máme pohľadávok po splatnosti“, „DPH za október“.")}
          </p>
        )}
        {kola.map((k, i) => (
          <p
            key={i}
            className={
              k.kto === "user"
                ? "ml-8 rounded-md bg-primary/10 px-2 py-1.5"
                : "mr-8 rounded-md bg-muted px-2 py-1.5"
            }
          >
            {k.text}
          </p>
        ))}
        {stav === "pocuva" && (
          <p className="ml-8 rounded-md border border-dashed border-primary/40 px-2 py-1.5 italic text-muted-foreground">
            {priebezny || t("Počúvam…")}
          </p>
        )}
        {zaneprazdneny && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {stav === "zapisuje" ? t("Zapisujem…") : t("Premýšľam…")}
          </p>
        )}
        {chyba && <p className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">{chyba}</p>}

        {navrh && navrh.polozky.length > 0 && (
          <div className="rounded-md border border-border">
            <div className="border-b border-border px-2 py-1.5 text-xs font-semibold">
              {t("Návrh zaúčtovania — nič nie je uložené")}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1 font-medium">{t("Doklad")}</th>
                    <th className="px-2 py-1 font-medium">{t("Dodávateľ")}</th>
                    <th className="px-2 py-1 text-right font-medium">{t("Suma")}</th>
                    <th className="px-2 py-1 font-medium">{t("Predkontácia")}</th>
                    <th className="px-2 py-1 font-medium">{t("Členenie DPH")}</th>
                    <th className="px-2 py-1 font-medium">{t("KV")}</th>
                    <th className="px-2 py-1 font-medium">{t("Zdroj")}</th>
                  </tr>
                </thead>
                <tbody>
                  {navrh.polozky.map((p) => (
                    <tr key={p.id} className="border-t border-border align-top" data-navrh-riadok={p.id}>
                      <td className="px-2 py-1 whitespace-nowrap">{p.cislo ?? "—"}</td>
                      <td className="max-w-[9rem] truncate px-2 py-1" title={p.partner ?? ""}>
                        {p.partner ?? "—"}
                      </td>
                      <td className="px-2 py-1 text-right whitespace-nowrap">{fmtSuma(p.suma, p.mena)}</td>
                      {p.nedaSa ? (
                        <td colSpan={4} className="px-2 py-1 text-muted-foreground">
                          {p.nedaSa}
                        </td>
                      ) : (
                        <>
                          <td className="px-2 py-1 font-mono">{p.predkontacia ?? "—"}</td>
                          <td className="px-2 py-1 font-mono">{p.clenenieDph ?? "—"}</td>
                          <td className="px-2 py-1 font-mono">{p.kvClenenie ?? "—"}</td>
                          <td className="px-2 py-1" title={p.upozornenia.join(", ")}>
                            {p.zdroj ? t(NAZVY_ZDROJA[p.zdroj] ?? p.zdroj) : "—"}
                            {p.istota != null && p.zdroj === "ai" ? ` ${p.istota} %` : ""}
                            {p.upozornenia.length > 0 && <span className="ml-1 text-destructive">!</span>}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {navrh.vynechane > 0 && (
              <p className="border-t border-border px-2 py-1 text-xs text-muted-foreground">
                {t("Ďalších {n} dokladov som nestihla — povedzte „navrhni zaúčtovanie“ znova pre ďalšie.", {
                  n: navrh.vynechane,
                })}
              </p>
            )}
            <div className="flex items-center gap-2 border-t border-border px-2 py-1.5">
              <button
                type="button"
                disabled={!polozkyNaPotvrdenie.length || zaneprazdneny}
                onClick={() => void potvrd({ klik: true })}
                className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
              >
                {t("Potvrdiť ({n})", { n: polozkyNaPotvrdenie.length })}
              </button>
              <button
                type="button"
                disabled={zaneprazdneny}
                onClick={zrus}
                className="rounded-md border border-input bg-card px-2.5 py-1 text-xs font-semibold hover:bg-secondary disabled:opacity-50"
              >
                {t("Zrušiť")}
              </button>
            </div>
          </div>
        )}
      </div>

      <form
        className="flex items-center gap-1.5 border-t border-border px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = text;
          setText("");
          void odosli(v);
        }}
      >
        {recDostupna && (
          <button
            type="button"
            onClick={pocuvaj}
            disabled={zaneprazdneny}
            aria-label={stav === "pocuva" ? t("Prestať počúvať") : t("Hovoriť")}
            title={stav === "pocuva" ? t("Prestať počúvať") : t("Hovoriť")}
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
              stav === "pocuva" ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"
            } disabled:opacity-50`}
          >
            {stav === "pocuva" ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
        )}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("Napíšte príkaz…")}
          aria-label={t("Príkaz")}
          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
        />
        <button
          type="submit"
          disabled={zaneprazdneny || !text.trim()}
          aria-label={t("Odoslať príkaz")}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-input hover:bg-secondary disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>

      {ttsDostupna && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
          <span>{t("Hlas:")}</span>
          <select
            value={hlas?.name ?? ""}
            onChange={(e) => {
              setZvolenyHlas(e.target.value || null);
              zapis(KLUC_HLASU, e.target.value || null);
            }}
            aria-label={t("Hlas asistenta")}
            className="h-6 min-w-0 max-w-[16rem] rounded border border-input bg-background px-1 text-[11px]"
          >
            {!hlas && <option value="">{t("žiadny slovenský ani český hlas")}</option>}
            {naVyber.map((h) => (
              <option key={h.name} value={h.name}>
                {h.name} ({h.lang})
              </option>
            ))}
          </select>
          {hlas && !zensky && <span>{t("(ženský hlas v prehliadači nie je)")}</span>}
        </div>
      )}
    </div>
  );
}

const NAZVY_ZDROJA: Record<string, string> = {
  pravidlo: "pravidlo",
  zvyk: "zvyk",
  navyk: "naučené",
  ai: "AI",
  doklad: "doklad",
};
