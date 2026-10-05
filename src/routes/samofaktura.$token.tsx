import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Download, Loader2, XCircle } from "lucide-react";
import { vynutSvetlyMotiv } from "@/lib/faktero/motiv";
import {
  pdfSamofakturyPodlaTokenuFn,
  rozhodniSamofakturuFn,
  samofakturaPodlaTokenuFn,
} from "@/lib/faktero/samofakturacia.functions";
import { localeDodavatela, textyDodavatela } from "@/lib/faktero/samofakturacia-texty";

/**
 * Samofaktúra očami dodávateľa.
 *
 * Faktúru za neho vyhotovil odberateľ; zákon chce, aby ju dodávateľ
 * odsúhlasil (§ 72 ods. 4 zákona o DPH). Verejná stránka bez prihlásenia —
 * dodávateľ účet vo Fakteri mať nemusí, chráni ju náhodný token v odkaze.
 */
export const Route = createFileRoute("/samofaktura/$token")({
  validateSearch: (s: Record<string, unknown>) => ({
    odpoved: s.odpoved === "suhlas" || s.odpoved === "nesuhlas" ? s.odpoved : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Faktúra na odsúhlasenie — Faktero" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: SamofakturaPage,
});

function suma(n: unknown, mena: string | null | undefined, locale = "sk-SK"): string {
  return `${Number(n ?? 0).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${mena ?? "EUR"}`;
}

function SamofakturaPage() {
  const { token } = Route.useParams();
  const { odpoved } = useSearch({ from: "/samofaktura/$token" });
  const nacitaj = useServerFn(samofakturaPodlaTokenuFn);
  const rozhodni = useServerFn(rozhodniSamofakturuFn);
  const pdf = useServerFn(pdfSamofakturyPodlaTokenuFn);

  const [data, setData] = useState<Awaited<ReturnType<typeof samofakturaPodlaTokenuFn>> | null>(
    null,
  );
  const [chyba, setChyba] = useState<string | null>(null);
  const [posielam, setPosielam] = useState(false);
  const [stahujem, setStahujem] = useState(false);
  const [hotovo, setHotovo] = useState<null | boolean>(null);
  const [nesuhlasim, setNesuhlasim] = useState(odpoved === "nesuhlas");
  const [poznamka, setPoznamka] = useState("");

  useEffect(() => vynutSvetlyMotiv(), []);

  useEffect(() => {
    nacitaj({ data: { token } })
      .then(setData)
      .catch((e: any) => setChyba(e?.message ?? "Faktúru sa nepodarilo načítať."));
  }, [nacitaj, token]);

  async function posli(suhlas: boolean) {
    setPosielam(true);
    setChyba(null);
    try {
      const v = await rozhodni({ data: { token, suhlas, poznamka: poznamka || undefined } });
      setHotovo(v.suhlas);
    } catch (e: any) {
      setChyba(e?.message ?? "Odpoveď sa nepodarilo zapísať.");
    } finally {
      setPosielam(false);
    }
  }

  async function stiahni() {
    setStahujem(true);
    try {
      const r = await pdf({ data: { token } });
      const bin = atob(r.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = r.fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e: any) {
      setChyba(e?.message ?? "PDF sa nepodarilo stiahnuť.");
    } finally {
      setStahujem(false);
    }
  }

  if (chyba && !data) {
    return (
      <Stranka>
        <p className="text-sm text-destructive">{chyba}</p>
      </Stranka>
    );
  }
  if (!data) {
    return (
      <Stranka>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Načítavam faktúru…
        </p>
      </Stranka>
    );
  }

  const { faktura: f, dodavatel: d, odberatel: o, polozky } = data;
  // Všetko v jazyku faktúry — dodávateľ môže byť zo zahraničia.
  const T = textyDodavatela(f.jazyk);
  const loc = localeDodavatela(f.jazyk);
  const datum = (d: string) =>
    new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString(loc, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  const kc = (n: unknown) => suma(n, f.mena, loc);
  const rozhodnute = hotovo !== null ? hotovo : f.stav === "odsuhlasena" ? true : f.stav === "zamietnuta" ? false : null;

  return (
    <Stranka>
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {T.faktura} {T.naOdsuhlasenie} · {T.vyhotovenieOdberatelom}
        </div>
        <h1 className="mt-1 text-2xl font-semibold">
          {f.opravuje ? T.dobropis : T.faktura} {f.cislo}
        </h1>
        {f.opravuje && (
          <p className="text-sm text-muted-foreground">{T.opravuje(f.opravuje)}</p>
        )}
        <p className="mt-2 text-sm text-muted-foreground">
          {T.uvod(o?.name ?? T.odberatel)}
        </p>

        <div className="mt-6 grid gap-6 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {T.dodavatelVy}
            </div>
            <div className="mt-1 font-medium">{d.nazov}</div>
            {d.ico && <div>IČO: {d.ico}</div>}
            {d.dic && <div>DIČ: {d.dic}</div>}
            {d.icDph ? <div>IČ DPH: {d.icDph}</div> : <div>{T.neplatitel}</div>}
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{T.odberatel}</div>
            <div className="mt-1 font-medium">{o?.name}</div>
            {o?.ico && <div>IČO: {o.ico}</div>}
            {o?.ic_dph && <div>IČ DPH: {o.ic_dph}</div>}
          </div>
        </div>

        <div className="mt-6 grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <span className="text-muted-foreground">{T.vyhotovena}: </span>
            {datum(f.vystavena)}
          </div>
          <div>
            <span className="text-muted-foreground">{T.dodanie}: </span>
            {datum(f.dodanie)}
          </div>
          <div>
            <span className="text-muted-foreground">{T.splatnost}: </span>
            {datum(f.splatnost)}
          </div>
          {f.iban && (
            <div className="sm:col-span-2">
              <span className="text-muted-foreground">{T.naUcet}: </span>
              <span className="font-mono">{f.iban}</span>
            </div>
          )}
          {f.vs && (
            <div>
              <span className="text-muted-foreground">{T.vs}: </span>
              {f.vs}
            </div>
          )}
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[30rem] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2">{T.polozka}</th>
                <th className="py-2 text-right">{T.mnozstvo}</th>
                <th className="py-2 text-right">{T.cenaBezDph}</th>
                <th className="py-2 text-right">{T.dph}</th>
                <th className="py-2 text-right">{T.spoluBezDph}</th>
              </tr>
            </thead>
            <tbody>
              {polozky.map((p: (typeof polozky)[number], i: number) => (
                <tr key={i} className="border-b border-border/60">
                  <td className="py-2">{p.nazov}</td>
                  <td className="py-2 text-right tabular-nums">
                    {p.mnozstvo.toLocaleString(loc)} {p.jednotka ?? ""}
                  </td>
                  <td className="py-2 text-right tabular-nums">{kc(p.cena)}</td>
                  <td className="py-2 text-right tabular-nums">
                    {f.prenesenie ? "PDP" : `${p.sadzba} %`}
                  </td>
                  <td className="py-2 text-right tabular-nums">{kc(p.spolu)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ml-auto mt-4 max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{T.zaklad}</span>
            <span className="tabular-nums">{kc(f.zaklad)}</span>
          </div>
          {f.prenesenie ? (
            <div className="text-xs text-muted-foreground">
              {T.prenesenie}
            </div>
          ) : (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{T.dph}</span>
              <span className="tabular-nums">{kc(f.dan)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-2 text-lg font-semibold">
            <span>{T.spolu}</span>
            <span className="tabular-nums">{kc(f.spolu)}</span>
          </div>
        </div>

        <button
          onClick={stiahni}
          disabled={stahujem}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
        >
          {stahujem ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {T.stiahnutPdf}
        </button>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-card p-6 shadow-sm">
        {rozhodnute === true ? (
          <div className="flex items-start gap-2 text-sm text-emerald-700">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <span>
              {T.odsuhlasene}
            </span>
          </div>
        ) : rozhodnute === false ? (
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>
              {T.vratene}
              {f.poznamka && hotovo === null ? ` ${T.vasaPoznamka}: ${f.poznamka}` : ""}
            </span>
          </div>
        ) : (
          <>
            <h2 className="text-base font-semibold">{T.otazka}</h2>
            {nesuhlasim ? (
              <div className="mt-3">
                <label className="block text-sm">
                  {T.coNesedi}
                  <textarea
                    rows={3}
                    value={poznamka}
                    onChange={(e) => setPoznamka(e.target.value)}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => posli(false)}
                    disabled={posielam || !poznamka.trim()}
                    className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    {posielam && <Loader2 className="h-4 w-4 animate-spin" />}
                    {T.vratit}
                  </button>
                  <button
                    onClick={() => setNesuhlasim(false)}
                    className="rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary"
                  >
                    {T.spat}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => posli(true)}
                  disabled={posielam}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  {posielam ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {T.suhlasim}
                </button>
                <button
                  onClick={() => setNesuhlasim(true)}
                  className="rounded-md border border-border px-5 py-2.5 text-sm hover:bg-secondary"
                >
                  {T.nesuhlasim}
                </button>
              </div>
            )}
            {chyba && <p className="mt-3 text-sm text-destructive">{chyba}</p>}
          </>
        )}
      </div>

      <p className="mt-10 text-center text-xs text-muted-foreground">
        {T.vyhotoveneCez} <span className="font-medium">Faktero</span>
      </p>
    </Stranka>
  );
}

function Stranka({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-3xl">{children}</div>
    </div>
  );
}
