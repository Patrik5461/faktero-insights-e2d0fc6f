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
import { datumSlovom } from "@/lib/faktero/ponuka-odpoved";

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

function suma(n: unknown, mena: string | null | undefined): string {
  return `${Number(n ?? 0).toLocaleString("sk-SK", {
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
  const rozhodnute = hotovo !== null ? hotovo : f.stav === "odsuhlasena" ? true : f.stav === "zamietnuta" ? false : null;

  return (
    <Stranka>
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Faktúra na odsúhlasenie · vyhotovenie faktúry odberateľom
        </div>
        <h1 className="mt-1 text-2xl font-semibold">Faktúra {f.cislo}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {o?.name ?? "Odberateľ"} za Vás podľa dohody o samofakturácii vyhotovil faktúru. Je Vaša
          — za správnosť dane zodpovedáte Vy, preto ju prosím skontrolujte a odsúhlaste.
        </p>

        <div className="mt-6 grid gap-6 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Dodávateľ (Vy)
            </div>
            <div className="mt-1 font-medium">{d.nazov}</div>
            {d.ico && <div>IČO: {d.ico}</div>}
            {d.dic && <div>DIČ: {d.dic}</div>}
            {d.icDph ? <div>IČ DPH: {d.icDph}</div> : <div>Neplatiteľ DPH</div>}
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Odberateľ</div>
            <div className="mt-1 font-medium">{o?.name}</div>
            {o?.ico && <div>IČO: {o.ico}</div>}
            {o?.ic_dph && <div>IČ DPH: {o.ic_dph}</div>}
          </div>
        </div>

        <div className="mt-6 grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <span className="text-muted-foreground">Vyhotovená: </span>
            {datumSlovom(f.vystavena)}
          </div>
          <div>
            <span className="text-muted-foreground">Dodanie: </span>
            {datumSlovom(f.dodanie)}
          </div>
          <div>
            <span className="text-muted-foreground">Splatnosť: </span>
            {datumSlovom(f.splatnost)}
          </div>
          {f.iban && (
            <div className="sm:col-span-2">
              <span className="text-muted-foreground">Na účet: </span>
              <span className="font-mono">{f.iban}</span>
            </div>
          )}
          {f.vs && (
            <div>
              <span className="text-muted-foreground">VS: </span>
              {f.vs}
            </div>
          )}
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[30rem] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2">Položka</th>
                <th className="py-2 text-right">Množstvo</th>
                <th className="py-2 text-right">Cena bez DPH</th>
                <th className="py-2 text-right">DPH</th>
                <th className="py-2 text-right">Spolu bez DPH</th>
              </tr>
            </thead>
            <tbody>
              {polozky.map((p, i) => (
                <tr key={i} className="border-b border-border/60">
                  <td className="py-2">{p.nazov}</td>
                  <td className="py-2 text-right tabular-nums">
                    {p.mnozstvo.toLocaleString("sk-SK")} {p.jednotka ?? ""}
                  </td>
                  <td className="py-2 text-right tabular-nums">{suma(p.cena, f.mena)}</td>
                  <td className="py-2 text-right tabular-nums">{p.sadzba} %</td>
                  <td className="py-2 text-right tabular-nums">{suma(p.spolu, f.mena)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ml-auto mt-4 max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Základ</span>
            <span className="tabular-nums">{suma(f.zaklad, f.mena)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">DPH</span>
            <span className="tabular-nums">{suma(f.dan, f.mena)}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-2 text-lg font-semibold">
            <span>Spolu</span>
            <span className="tabular-nums">{suma(f.spolu, f.mena)}</span>
          </div>
        </div>

        <button
          onClick={stiahni}
          disabled={stahujem}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
        >
          {stahujem ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Stiahnuť PDF
        </button>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-card p-6 shadow-sm">
        {rozhodnute === true ? (
          <div className="flex items-start gap-2 text-sm text-emerald-700">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <span>
              Faktúru ste odsúhlasili. Odberateľ o tom vie — zaeviduje si ju ako prijatú a uhradí
              ju v splatnosti. Zaevidujte si ju aj Vy medzi vydané faktúry.
            </span>
          </div>
        ) : rozhodnute === false ? (
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>
              Faktúru ste vrátili s poznámkou. Odberateľ ju opraví a pošle Vám novú na
              odsúhlasenie.
              {f.poznamka && hotovo === null ? ` Vaša poznámka: ${f.poznamka}` : ""}
            </span>
          </div>
        ) : (
          <>
            <h2 className="text-base font-semibold">Súhlasíte s faktúrou?</h2>
            {nesuhlasim ? (
              <div className="mt-3">
                <label className="block text-sm">
                  Čo na faktúre nesedí?
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
                    Vrátiť na opravu
                  </button>
                  <button
                    onClick={() => setNesuhlasim(false)}
                    className="rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary"
                  >
                    Späť
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
                  Súhlasím s faktúrou
                </button>
                <button
                  onClick={() => setNesuhlasim(true)}
                  className="rounded-md border border-border px-5 py-2.5 text-sm hover:bg-secondary"
                >
                  Nesúhlasím
                </button>
              </div>
            )}
            {chyba && <p className="mt-3 text-sm text-destructive">{chyba}</p>}
          </>
        )}
      </div>

      <p className="mt-10 text-center text-xs text-muted-foreground">
        Vyhotovené cez <span className="font-medium">Faktero</span>
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
