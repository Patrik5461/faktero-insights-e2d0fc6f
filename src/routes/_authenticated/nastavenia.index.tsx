import { createFileRoute } from "@tanstack/react-router";
import { PrepinacDizajnu } from "@/components/faktero/PrepinacDizajnu";
import { VolbaStranyNahladu } from "@/components/faktero/RozlozenieSNahladom";
import { useVzhladNespracovanych } from "@/hooks/useVzhladNespracovanych";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { toast } from "sonner";
import { setActiveProduct } from "@/lib/faktero/active-product";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";
import { ZrusenieUctu } from "@/components/faktero/ZrusenieUctu";
import { StiahnutieDat } from "@/components/faktero/StiahnutieDat";
import { StavOdznak } from "@/components/faktero/web/Stav";
import { NacitavanieStav } from "@/components/faktero/web/StavyObsahu";

export const Route = createFileRoute("/_authenticated/nastavenia/")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk ?? "sk", "Nastavenia — Faktero") }],
  }),
  component: SettingsPage,
});

const MODE_OPTIONS: { value: "invoicing" | "logbook" | "both"; label: string; desc: string }[] = [
  { value: "invoicing", label: "Fakturačný systém", desc: "Faktúry, eFaktúra, API, sklad, banky." },
  { value: "logbook", label: "Kniha jázd", desc: "Jazdy, vozidlá, Commander GPS, Tesla." },
  { value: "both", label: "Oboje", desc: "Fakturácia aj kniha jázd v jednom účte." },
];

function SettingsPage() {
  const { t } = useT();
  const [profile, setProfile] = useState<any>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      supabase
        .from("profiles")
        .select("*")
        .eq("id", data.user.id)
        .single()
        .then(({ data }) => setProfile(data));
    });
  }, []);
  if (!profile)
    return (
      <PageBody>
        <NacitavanieStav />
      </PageBody>
    );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: profile.full_name })
      .eq("id", profile.id);
    if (error) return toast.error(error.message);
    toast.success(t("Uložené"));
  }

  async function saveSuhrn(zapnute: boolean) {
    const pred = profile.denny_suhrn;
    setProfile({ ...profile, denny_suhrn: zapnute });
    const { error } = await supabase
      .from("profiles")
      .update({ denny_suhrn: zapnute })
      .eq("id", profile.id);
    if (error) {
      setProfile({ ...profile, denny_suhrn: pred });
      return toast.error(error.message);
    }
    toast.success(t(zapnute ? "Denný súhrn je zapnutý" : "Denný súhrn je vypnutý"));
  }

  async function saveMode(mode: "invoicing" | "logbook" | "both") {
    const { error } = await supabase
      .from("profiles")
      .update({ product_mode: mode })
      .eq("id", profile.id);
    if (error) return toast.error(error.message);
    setActiveProduct(mode === "logbook" ? "logbook" : "invoicing");
    setProfile({ ...profile, product_mode: mode });
    toast.success(t("Produkt aktualizovaný — obnovujem…"));
    setTimeout(() => window.location.reload(), 500);
  }

  return (
    <>
      <PageHeader title={t("Nastavenia účtu")} description={t("Vaše osobné údaje.")} />
      <PageBody>
        <form
          onSubmit={save}
          className="max-w-3xl space-y-4 rounded-xl border border-border bg-card p-5 sm:p-6"
        >
          <label className="block">
            <span className="text-sm font-semibold">{t("Email")}</span>
            <input
              value={profile.email ?? ""}
              disabled
              className="mt-1.5 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold">{t("Meno a priezvisko")}</span>
            <input
              value={profile.full_name ?? ""}
              onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
              className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            {t("Uložiť")}
          </button>
        </form>

        <div className="mt-6 max-w-3xl rounded-xl border border-border bg-card p-6">
          <h2 className="text-base font-semibold">{t("E-mailové upozornenia")}</h2>
          <label className="mt-4 flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
              checked={profile.denny_suhrn !== false}
              onChange={(e) => void saveSuhrn(e.target.checked)}
            />
            <span>
              <span className="block text-sm font-semibold">{t("Denný súhrn úloh")}</span>
              <span className="mt-0.5 block max-w-prose text-sm text-muted-foreground">
                {t(
                  "Každé ráno o 7:00 e-mail s tým, čo na vás čaká v každej vašej firme — doklady na schválenie, komentáre, v ktorých vás označili, nespracované doklady a faktúry po splatnosti. Keď nič nečaká, e-mail nepríde.",
                )}
              </span>
            </span>
          </label>
        </div>

        <div className="mt-6 max-w-3xl rounded-xl border border-border bg-card p-6">
          <h2 className="text-base font-semibold">{t("Rozloženie aplikácie")}</h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            {t(
              "Klasické Faktero, alebo kompaktné — úzky pás ikon, záložky sekcie a popisy polí v rámčeku. Farby ostávajú rovnaké. Voľba platí pre váš účet na každom zariadení a dá sa prepnúť aj v ponuke pod vaším menom.",
            )}
          </p>
          <div className="mt-4">
            <PrepinacDizajnu velky />
          </div>
          <div className="mt-6">
            <div className="text-sm font-semibold">{t("Rozloženie nespracovaných dokladov")}</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("Klasické, alebo kompaktné (veľký náhľad, úzky panel s údajmi).")}
            </p>
            <div className="mt-2">
              <PrepinacRozlozenia />
            </div>
          </div>
          <div className="mt-6">
            <div className="text-sm font-semibold">{t("Strana náhľadu dokladu")}</div>
            <p className="mt-0.5 max-w-prose text-xs text-muted-foreground">
              {t(
                "Či je náhľad dokladu (PDF, sken bločku) naľavo alebo napravo od údajov — pri bločku, prijatej a vystavenej faktúre, v Nespracovaných dokladoch aj pri náhľade vedľa zoznamu. Na úzkej obrazovke znamená vľavo náhľad hore a vpravo dole. Prepnúť sa dá aj tlačidlom priamo v hlavičke náhľadu.",
              )}
            </p>
            <div className="mt-2">
              <VolbaStranyNahladu />
            </div>
          </div>
        </div>

        <div className="mt-6 max-w-3xl rounded-xl border border-border bg-card p-6">
          <h2 className="text-base font-semibold">{t("Používané produkty")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("Vyberte, čo má byť v menu. Voľbu môžete kedykoľvek zmeniť.")}
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {MODE_OPTIONS.map((o) => {
              const active = profile.product_mode === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => saveMode(o.value)}
                  className={`rounded-lg border p-4 text-left transition-colors ${
                    active
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-input hover:border-primary/50 hover:bg-accent"
                  }`}
                >
                  <div className="text-sm font-semibold">{t(o.label)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{t(o.desc)}</div>
                  {active && (
                    <StavOdznak ton="uspech" maly className="mt-2">
                      {t("Aktívne")}
                    </StavOdznak>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-6 max-w-3xl">
          <StiahnutieDat />
        </div>

        <div className="mt-6 max-w-3xl">
          <ZrusenieUctu />
        </div>
      </PageBody>
    </>
  );
}

/** Rozloženie detailu nespracovaného dokladu — tá istá voľba ako prepínač na detaile. */
function PrepinacRozlozenia() {
  const { t } = useT();
  const { vzhlad, zmen } = useVzhladNespracovanych();
  return (
    <div className="inline-flex rounded-lg border border-input bg-background p-0.5 text-sm" role="group" aria-label={t("Rozloženie nespracovaných dokladov")}>
      {(
        [
          ["klasicky", "Klasické"],
          ["kompaktny", "Kompaktné"],
        ] as const
      ).map(([k, n]) => (
        <button
          key={k}
          type="button"
          aria-pressed={vzhlad === k}
          onClick={() => void zmen(k)}
          className={`rounded-md px-3 py-1.5 font-semibold ${vzhlad === k ? "bg-primary text-primary-foreground hover:bg-primary-hover" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
        >
          {t(n)}
        </button>
      ))}
    </div>
  );
}
