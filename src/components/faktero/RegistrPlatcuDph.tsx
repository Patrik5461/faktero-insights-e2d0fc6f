import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { overPlatceDphFn } from "@/lib/faktero/cz-registr-dph.functions";
import { useKrajinaDane } from "@/lib/faktero/krajina-firmy";
import { dicPreRegister } from "@/lib/faktero/cz-registr-dph";
import { useT } from "@/lib/i18n/useT";

type Vysledok = Awaited<ReturnType<typeof overPlatceDphFn>>;

/**
 * Stav dodávateľa v českom Registri plátců DPH pri prijatej faktúre.
 *
 * Odberateľ ručí za DPH dodávateľa (§ 109 ZDPH), keď zaplatí nespoľahlivému
 * platcovi alebo na účet, ktorý platca nezverejnil. Karta sa ukáže len
 * českej firme a dodávateľovi s českým DIČ.
 */
export function RegistrPlatcuDph({
  companyId,
  dic,
  icDph,
  iban,
}: {
  companyId: string;
  dic?: string | null;
  icDph?: string | null;
  iban?: string | null;
}) {
  const { t, jazyk } = useT();
  const krajina = useKrajinaDane();
  const over = useServerFn(overPlatceDphFn);
  const dicCz = dicPreRegister(icDph) ?? dicPreRegister(dic);
  const [v, setV] = useState<Vysledok>(null);
  const [nacitavam, setNacitavam] = useState(false);

  const nacitaj = useCallback(
    async (obnovit = false) => {
      if (!dicCz) return;
      setNacitavam(true);
      try {
        setV(
          await over({ data: { company_id: companyId, dic: dicCz, iban: iban ?? null, obnovit } }),
        );
      } catch {
        setV(null);
      } finally {
        setNacitavam(false);
      }
    },
    [over, companyId, dicCz, iban],
  );

  useEffect(() => {
    if (krajina === "CZ") nacitaj();
  }, [krajina, nacitaj]);

  if (krajina !== "CZ" || !dicCz) return null;
  if (!v) {
    return nacitavam ? (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />{" "}
        {t("Ověřuji dodavatele v Registru plátců DPH…")}
      </div>
    ) : null;
  }

  const datum = new Date(v.overene_at).toLocaleString(jazyk === "de" ? "de-DE" : "cs-CZ");
  const zle = v.nespolehlivy || v.ucetZverejneny === false;
  const ton = v.chyba
    ? "border-border bg-card"
    : v.nespolehlivy
      ? "border-destructive/50 bg-destructive/5"
      : v.ucetZverejneny === false || !v.nalezen
        ? "border-amber-500/50 bg-amber-500/10"
        : "border-emerald-600/40 bg-emerald-600/5";

  return (
    <div className={`rounded-xl border p-4 text-sm ${ton}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          {v.chyba ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          ) : v.nespolehlivy ? (
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          ) : zle || !v.nalezen ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          )}
          <div>
            <div className="font-medium">
              {t(
                v.chyba
                  ? "Registr plátců DPH se nepodařilo ověřit"
                  : v.nespolehlivy
                    ? "Nespolehlivý plátce!"
                    : !v.nalezen
                      ? "Dodavatel není v Registru plátců DPH"
                      : v.ucetZverejneny === false
                        ? "Účet není zveřejněn — ručení za DPH (§ 109 ZDPH)"
                        : v.ucetZverejneny === true
                          ? "Spolehlivý plátce · účet zveřejněn"
                          : "Spolehlivý plátce",
              )}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {v.chyba
                ? t(v.chyba)
                : v.nespolehlivy
                  ? v.datumNespolehlivosti
                    ? t(
                        "Finanční úřad ho označil za nespolehlivého od {datum}. Při úhradě ručíte za jeho DPH — zvažte zaplatit jen základ a daň odvést za něj (§ 109a).",
                        { datum: v.datumNespolehlivosti },
                      )
                    : t(
                        "Finanční úřad ho označil za nespolehlivého. Při úhradě ručíte za jeho DPH — zvažte zaplatit jen základ a daň odvést za něj (§ 109a).",
                      )
                  : t(
                      !v.nalezen
                        ? "DIČ v registru není — dodavatel nemusí být plátcem DPH. Zkontrolujte, zda smí fakturovat s daní."
                        : v.ucetZverejneny === false
                          ? "Účet z faktury plátce v registru nezveřejnil. Při úhradě nad dvojnásobek limitu pro hotovost (540 000 Kč) za jeho DPH ručíte."
                          : v.ucetZverejneny === null
                            ? "Faktura nemá rozpoznatelný účet — zveřejnění nelze ověřit."
                            : "Plátce není nespolehlivý a účet z faktury je zveřejněn.",
                    )}
              {" · "}
              {t("ověřeno {datum}", { datum })}
            </div>
            {v.zverejneneUcty.length > 0 && v.ucetZverejneny === false && (
              <div className="mt-2 text-xs">
                {t("Zveřejněné účty:")}{" "}
                <span className="font-mono">{v.zverejneneUcty.slice(0, 6).join(", ")}</span>
                {v.zverejneneUcty.length > 6
                  ? ` ${t("a další ({n})", { n: v.zverejneneUcty.length - 6 })}`
                  : ""}
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => nacitaj(true)}
          disabled={nacitavam}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-secondary disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${nacitavam ? "animate-spin" : ""}`} />{" "}
          {t("Ověřit znovu")}
        </button>
      </div>
    </div>
  );
}
