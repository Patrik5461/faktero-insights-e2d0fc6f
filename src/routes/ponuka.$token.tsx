import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ponukaPodlaTokenuFn, odpovedzNaPonukuFn } from "@/lib/faktero/ponuka-odpoved.functions";
import { datumSlovom } from "@/lib/faktero/ponuka-odpoved";
import { CheckCircle2, FileText, Loader2, XCircle } from "lucide-react";

/**
 * Cenová ponuka očami odberateľa.
 *
 * Verejná stránka bez prihlásenia — jedinou ochranou je náhodný token
 * v odkaze. Odberateľ tu ponuku vidí, stiahne PDF a jedným klikom ju prijme
 * alebo zamietne; dovtedy sa odpovedalo e-mailom a stav prepisoval dodávateľ
 * ručne, takže sa naň často zabudlo.
 */
export const Route = createFileRoute("/ponuka/$token")({
  validateSearch: (s: Record<string, unknown>) => ({
    odpoved: s.odpoved === "prijat" || s.odpoved === "zamietnut" ? s.odpoved : undefined,
  }),
  head: () => ({
    meta: [{ title: "Cenová ponuka — Faktero" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: PonukaPage,
});

function suma(n: unknown, mena: string | null | undefined): string {
  return `${Number(n ?? 0).toLocaleString("sk-SK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${mena ?? "EUR"}`;
}

function PonukaPage() {
  const { token } = Route.useParams();
  const { odpoved } = useSearch({ from: "/ponuka/$token" });
  const nacitaj = useServerFn(ponukaPodlaTokenuFn);
  const odpovedz = useServerFn(odpovedzNaPonukuFn);

  const [data, setData] = useState<Awaited<ReturnType<typeof ponukaPodlaTokenuFn>> | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [posielam, setPosielam] = useState(false);
  const [hotovo, setHotovo] = useState<null | { prijate: boolean }>(null);
  const [zamietam, setZamietam] = useState(odpoved === "zamietnut");
  const [dovod, setDovod] = useState("");

  useEffect(() => {
    nacitaj({ data: { token } })
      .then(setData)
      .catch((e: any) => setChyba(e?.message ?? "Ponuku sa nepodarilo načítať."));
  }, [nacitaj, token]);

  async function posli(akcia: "prijat" | "zamietnut") {
    setPosielam(true);
    setChyba(null);
    try {
      const v = await odpovedz({ data: { token, akcia, dovod: dovod || undefined } });
      setHotovo({ prijate: v.prijate });
    } catch (e: any) {
      setChyba(e?.message ?? "Odpoveď sa nepodarilo zapísať.");
    } finally {
      setPosielam(false);
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
          <Loader2 className="h-4 w-4 animate-spin" /> Načítavam ponuku…
        </p>
      </Stranka>
    );
  }

  const p = data.ponuka as any;
  const uzVybavene = hotovo || data.prekazka;

  return (
    <Stranka>
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Cenová ponuka {p.quote_number}</h1>
          <p className="text-sm text-muted-foreground">
            {data.firma?.name} · vystavená {datumSlovom(p.issue_date)}
            {p.valid_until && ` · platí do ${datumSlovom(p.valid_until)}`}
          </p>
        </div>
        {data.pdf && (
          <a
            href={data.pdf}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
          >
            <FileText className="h-4 w-4" /> Stiahnuť PDF
          </a>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Položka</th>
              <th className="px-4 py-2 text-right font-medium">Množstvo</th>
              <th className="px-4 py-2 text-right font-medium">Cena</th>
              <th className="px-4 py-2 text-right font-medium">Spolu</th>
            </tr>
          </thead>
          <tbody>
            {data.polozky.map((r: any, i: number) => (
              <tr key={i} className="border-t border-border">
                <td className="px-4 py-2">
                  {r.name}
                  {r.description && (
                    <span className="block text-xs text-muted-foreground">{r.description}</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {Number(r.quantity)} {r.unit}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {suma(r.unit_price, p.currency)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{suma(r.total, p.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 space-y-1 text-right text-sm">
        <div className="text-muted-foreground">Základ: {suma(p.subtotal, p.currency)}</div>
        {Number(p.vat_total ?? 0) !== 0 && (
          <div className="text-muted-foreground">DPH: {suma(p.vat_total, p.currency)}</div>
        )}
        <div className="text-lg font-semibold">Spolu: {suma(p.total, p.currency)}</div>
      </div>

      {p.notes && (
        <p className="mt-4 whitespace-pre-wrap text-sm text-muted-foreground">{p.notes}</p>
      )}

      <div className="mt-8">
        {hotovo ? (
          <Odpovedane prijate={hotovo.prijate} />
        ) : data.prekazka ? (
          <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            {data.prekazka.text}
          </p>
        ) : (
          <>
            {chyba && <p className="mb-3 text-sm text-destructive">{chyba}</p>}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => posli("prijat")}
                disabled={posielam}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {posielam ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Prijať ponuku
              </button>
              <button
                onClick={() => (zamietam ? posli("zamietnut") : setZamietam(true))}
                disabled={posielam}
                className="inline-flex items-center gap-2 rounded-md border border-destructive/40 px-5 py-2.5 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-60"
              >
                <XCircle className="h-4 w-4" /> Zamietnuť
              </button>
            </div>
            {zamietam && (
              <label className="mt-4 block max-w-lg">
                <span className="text-sm text-muted-foreground">
                  Dôvod zamietnutia (nepovinné) — pomôže dodávateľovi pripraviť lepšiu ponuku.
                </span>
                <textarea
                  rows={3}
                  value={dovod}
                  onChange={(e) => setDovod(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </label>
            )}
          </>
        )}
      </div>

      <p className="mt-10 text-center text-xs text-muted-foreground">
        Vystavené cez <span className="font-medium">Faktero</span>
      </p>
    </Stranka>
  );
}

function Odpovedane({ prijate }: { prijate: boolean }) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm ${
        prijate
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "border-border bg-muted/40 text-muted-foreground"
      }`}
    >
      {prijate
        ? "Ďakujeme — ponuku ste prijali. Dodávateľ o tom vie a ozve sa vám."
        : "Ponuku ste zamietli. Dodávateľ o tom vie. Ďakujeme za odpoveď."}
    </div>
  );
}

function Stranka({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-3xl">{children}</div>
    </div>
  );
}
