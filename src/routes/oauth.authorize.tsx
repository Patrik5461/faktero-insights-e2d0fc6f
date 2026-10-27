import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Bot, Check, Loader2, ShieldCheck, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";
import { oauthNahladFn, oauthSchvalFn, oauthZamietniFn } from "@/lib/faktero/oauth.functions";

type Search = Record<string, string | undefined>;
const POLIA = [
  "client_id",
  "redirect_uri",
  "response_type",
  "state",
  "code_challenge",
  "code_challenge_method",
  "scope",
  "resource",
] as const;

/** Overení AI klienti; ostatným (aj localhost) sa zobrazí varovanie. */
const ZNAME_DOMENY = ["claude.ai", "claude.com", "anthropic.com", "chatgpt.com", "openai.com"];
const znamyKlient = (host: string) =>
  ZNAME_DOMENY.some((d) => host === d || host.endsWith(`.${d}`));

export const Route = createFileRoute("/oauth/authorize")({
  head: ({ match }) => ({
    meta: [
      { title: preloz(match.context.jazyk, "Povoliť prístup — Faktero") },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): Search =>
    Object.fromEntries(POLIA.filter((k) => typeof s[k] === "string").map((k) => [k, String(s[k])])),
  component: Autorizacia,
});

/**
 * Povolenie prístupu AI asistentovi (OAuth pre MCP). Kto nie je prihlásený, ide
 * na prihlásenie a vráti sa sem. Prístup sa vydáva pre jednu firmu.
 */
function Autorizacia() {
  const { t } = useT();
  const search = Route.useSearch();
  const nahlad = useServerFn(oauthNahladFn);
  const schval = useServerFn(oauthSchvalFn);
  const zamietni = useServerFn(oauthZamietniFn);
  const [stav, setStav] = useState<
    | { druh: "cakam" }
    | { druh: "chyba"; text: string }
    | { druh: "otazka"; klient: string; host: string; firmy: { id: string; nazov: string }[] }
  >({ druh: "cakam" });
  const [firma, setFirma] = useState("");
  const [busy, setBusy] = useState(false);
  const ziadost = search as any;

  useEffect(() => {
    let zive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        window.location.assign(
          `/prihlasenie?dalej=${encodeURIComponent(window.location.pathname + window.location.search)}`,
        );
        return;
      }
      try {
        const r = await nahlad({ data: ziadost });
        if (!zive) return;
        if (!r.ok) return setStav({ druh: "chyba", text: r.chyba });
        setStav({ druh: "otazka", klient: r.klient, host: r.host, firmy: r.firmy });
        if (r.firmy.length) setFirma(r.firmy[0]!.id);
      } catch (e: any) {
        if (zive)
          setStav({ druh: "chyba", text: e?.message ?? t("Žiadosť sa nepodarilo overiť.") });
      }
    })();
    return () => {
      zive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function povol() {
    setBusy(true);
    try {
      const r = await schval({ data: { ziadost, company_id: firma } });
      window.location.assign(r.url);
    } catch (e: any) {
      setBusy(false);
      setStav({ druh: "chyba", text: e?.message ?? t("Prístup sa nepodarilo povoliť.") });
    }
  }
  async function odmietni() {
    setBusy(true);
    try {
      const r = await zamietni({ data: ziadost });
      window.location.assign(r.url);
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <ShieldCheck className="h-5 w-5 text-primary" /> Faktero
        </div>
        {stav.druh === "cakam" && (
          <div className="flex justify-center py-8 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
        {stav.druh === "chyba" && (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
          >
            {stav.text}
          </div>
        )}
        {stav.druh === "otazka" && (
          <>
            <h1 className="text-xl font-semibold">
              {t("{klient} žiada prístup k Fakteru", { klient: stav.klient })}
            </h1>
            {/* Meno si klient pri registrácii volí sám — rozhoduje adresa, kam sa vráti. */}
            {stav.host && (
              <p className="mt-1 text-sm">
                {t("Po povolení vás vrátime na")} <strong className="font-mono">{stav.host}</strong>
              </p>
            )}
            {stav.host && !znamyKlient(stav.host) && (
              <div
                role="alert"
                className="mt-3 flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {t(
                    "Neoverená aplikácia. Prístup povoľte len vtedy, ak ste ju pridávali vy a adresu poznáte — inak ho zamietnite.",
                  )}
                </span>
              </div>
            )}
            <div className="mt-4 rounded-lg border border-border bg-background p-3 text-sm">
              <div className="mb-2 flex items-center gap-2 font-medium">
                <Bot className="h-4 w-4" /> {t("AI asistent bude môcť")}
              </div>
              <ul className="space-y-1 text-muted-foreground">
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {t("čítať faktúry, odberateľov, ponuky, prijaté faktúry a bankové pohyby,")}
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {t("vystaviť faktúru, založiť odberateľa a označiť úhradu.")}
                </li>
                <li className="flex gap-2">
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  {t("Nič nemaže a nič neposiela odberateľom.")}
                </li>
              </ul>
            </div>
            {stav.firmy.length ? (
              <label className="mt-4 block text-sm">
                <span className="font-medium">{t("Firma")}</span>
                <select
                  value={firma}
                  onChange={(e) => setFirma(e.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {stav.firmy.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nazov}
                    </option>
                  ))}
                  {/* Kľúč účtu — asistent si firmu vyberie pri každej otázke. */}
                  {stav.firmy.length > 1 && (
                    <option value="*">
                      {t("Všetky moje firmy ({n})", { n: stav.firmy.length })}
                    </option>
                  )}
                </select>
                {firma === "*" && (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {t(
                      "Asistent uvidí všetky firmy, kde ste vlastník alebo správca, aj tie, ktoré pribudnú. Pri otázke sa spýta, o ktorú firmu ide.",
                    )}
                  </span>
                )}
              </label>
            ) : (
              <p className="mt-4 rounded-md bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
                {t(
                  "Prístup môže povoliť len majiteľ alebo správca firmy — vo vašich firmách túto rolu nemáte.",
                )}
              </p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              {t(
                "Prístup uvidíte v Nastaveniach → API kľúče ako „AI asistent (MCP)“ a môžete ho kedykoľvek zrušiť.",
              )}
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => void odmietni()}
                disabled={busy}
                className="h-10 flex-1 rounded-md border border-border text-sm hover:bg-secondary disabled:opacity-50"
              >
                {t("Zamietnuť")}
              </button>
              <button
                type="button"
                onClick={() => void povol()}
                disabled={busy || !firma}
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("Povoliť prístup")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
