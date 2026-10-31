import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, ShieldCheck, Smartphone } from "lucide-react";
import { MarketingShell } from "@/components/faktero/MarketingShell";
import {
  ANDROID_FAKTERO,
  ANDROID_KNIHA_JAZD,
  ANDROID_PODPIS_SHA256,
  type AndroidApk,
} from "@/lib/faktero/obchody";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";

/*
  Android zatiaľ nie je v Google Play, tak sa appka sťahuje odtiaľto ako APK.
  Inštalácia mimo obchodu chce jedno povolenie navyše — bez návodu by človek
  pri hláške „Z bezpečnostných dôvodov…“ skončil, preto je návod hneď pod
  tlačidlom.
*/
export const Route = createFileRoute("/android")({
  head: ({ match }) => {
    const j = match.context.jazyk;
    return {
      meta: [
        { title: preloz(j, "Faktero pre Android — stiahnuť APK") },
        {
          name: "description",
          content: preloz(
            j,
            "Stiahnite si appku Faktero alebo Kniha jázd pre Android. Kým nie sú v Google Play, inštalujú sa priamo z webu.",
          ),
        },
        { property: "og:title", content: preloz(j, "Faktero pre Android") },
        { property: "og:url", content: "https://www.faktero.sk/android" },
      ],
      links: [{ rel: "canonical", href: "https://www.faktero.sk/android" }],
    };
  },
  component: AndroidPage,
});

function Appka({ a, ikona, popis }: { a: AndroidApk; ikona: string; popis: string }) {
  const { t } = useT();
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-4">
        <img src={ikona} alt="" className="h-14 w-14 shrink-0 rounded-[22%]" />
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{t(a.nazov)}</h2>
          <div className="text-xs text-muted-foreground">
            {t("Verzia {verzia} · {mb} MB · Android 7 a novší", { verzia: a.verzia, mb: a.mb })}
          </div>
        </div>
      </div>
      <p className="mt-4 flex-1 text-sm text-muted-foreground">{popis}</p>
      <a
        href={a.url}
        download={a.subor}
        className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
      >
        <Download className="h-4 w-4" /> {t("Stiahnuť {nazov} (APK)", { nazov: t(a.nazov) })}
      </a>
      <div className="mt-3 break-all font-mono text-[10px] leading-relaxed text-muted-foreground">
        {t("SHA-256:")} {a.sha256}
      </div>
    </div>
  );
}

function AndroidPage() {
  const { t } = useT();
  return (
    <MarketingShell>
      <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary-hover">
          <Smartphone className="h-3.5 w-3.5" /> {t("Android")}
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
          {t("Faktero pre Android")}
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          {t(
            "Kým appky nie sú v Google Play, nainštalujete ich priamo odtiaľto. Je to tá istá appka, ktorá do obchodu pôjde — prihlásite sa rovnakým účtom ako na webe.",
          )}
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Appka
            a={ANDROID_FAKTERO}
            ikona="/faktero-icon.png"
            popis={t(
              "Faktúry, skenovanie bločkov a dokladov aj bez signálu, banka a automatická kniha jázd.",
            )}
          />
          <Appka
            a={ANDROID_KNIHA_JAZD}
            ikona="/kniha-jazd-icon.png"
            popis={t(
              "Samostatná appka len na jazdy — pre vodičov, ktorí s faktúrami nerobia. Jazdu rozpozná a zapíše sama.",
            )}
          />
        </div>

        <div className="mt-10 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">{t("Ako appku nainštalovať")}</h2>
          <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm">
            <li>
              {t("Otvorte túto stránku")} <strong>{t("v telefóne")}</strong>{" "}
              {t(
                "a ťuknite na Stiahnuť. Chrome sa môže opýtať, či súbor naozaj chcete stiahnuť — potvrďte",
              )}{" "}
              <em>{t("Stiahnuť aj tak")}</em>.
            </li>
            <li>
              {t("Po stiahnutí ťuknite na")} <em>{t("Otvoriť")}</em>{" "}
              {t("(alebo na súbor v Stiahnutých súboroch).")}
            </li>
            <li>
              {t(
                "Pri prvej inštalácii mimo Google Play telefón napíše, že inštalácia z tohto zdroja nie je povolená. Ťuknite na",
              )}{" "}
              <em>{t("Nastavenia")}</em>
              {t(", zapnite")} <em>{t("Povoliť z tohto zdroja")}</em> {t("a vráťte sa späť.")}
            </li>
            <li>
              {t("Ťuknite na")} <em>{t("Inštalovať")}</em>
              {t(". Ak sa objaví Play Protect, zvoľte")} <em>{t("Napriek tomu inštalovať")}</em>{" "}
              {t("— appku Google zatiaľ nepozná, lebo nie je v obchode.")}
            </li>
            <li>{t("Otvorte appku a prihláste sa rovnakým e-mailom a heslom ako na webe.")}</li>
          </ol>
          <p className="mt-4 text-sm text-muted-foreground">
            {t("Kniha jázd potrebuje polohu")} <strong>{t("„Povoliť vždy“")}</strong>{" "}
            {t(
              "a na telefónoch Xiaomi, Samsung či Huawei aj vypnuté šetrenie batérie pre appku — inak systém meranie na pozadí zastaví. Appka vás k tomu po spustení navedie.",
            )}
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-4 w-4 text-primary" /> {t("Je to bezpečné?")}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t(
                "APK je podpísané certifikátom Tobify s. r. o. Každá ďalšia verzia musí mať ten istý podpis, inak ju telefón odmietne nainštalovať cez starú. Odtlačok certifikátu:",
              )}
            </p>
            <div className="mt-2 break-all font-mono text-[10px] leading-relaxed text-muted-foreground">
              {ANDROID_PODPIS_SHA256}
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-semibold">{t("Aktualizácie")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t(
                "Appka sa sama neaktualizuje. Keď je tu novšia verzia, Faktero to po spustení ukáže a pošle vás sem — stiahnite ju a nainštalujte cez pôvodnú, údaje ostanú.",
              )}
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              {t("Máte iPhone? Appky sú v")}{" "}
              <Link to="/pomoc/apka" className="text-primary underline underline-offset-2">
                {t("App Store")}
              </Link>
              .
            </p>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
