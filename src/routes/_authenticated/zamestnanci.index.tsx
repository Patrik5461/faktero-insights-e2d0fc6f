import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, IdCard, Plus } from "lucide-react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { listZamestnancov } from "@/lib/faktero/zamestnanci.functions";
import { celeMeno, datumSk, DRUH_ZMLUVY, type DruhZmluvy, type Pripomienka } from "@/lib/faktero/zamestnanci";
import { ChybaModulu, tlacidlo } from "@/components/faktero/zamestnanci/ui";
import { useT } from "@/lib/i18n/useT";
import { StavOdznak } from "@/components/faktero/web/Stav";
import { NacitavanieStav } from "@/components/faktero/web/StavyObsahu";
import { preloz } from "@/lib/i18n/jazyk";

export const Route = createFileRoute("/_authenticated/zamestnanci/")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Zamestnanci — Faktero") }] }),
  component: ZamestnanciPage,
});

const FARBA: Record<Pripomienka["zavaznost"], string> = {
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  warning: "border-warning/30 bg-warning/10 text-warning",
  info: "border-border bg-muted/40 text-foreground",
};

function ZamestnanciPage() {
  const { t } = useT();
  const nacitajZoznam = useServerFn(listZamestnancov);
  const [stav, setStav] = useState<"active" | "ended" | "vsetci">("active");
  const [data, setData] = useState<{ zamestnanci: any[]; zmluvy: any[]; pripomienky: Pripomienka[] } | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [nacitava, setNacitava] = useState(true);

  const nacitaj = useCallback(() => {
    const cid = getActiveCompanyId();
    if (!cid) return setNacitava(false);
    setNacitava(true);
    setChyba(null);
    nacitajZoznam({ data: { company_id: cid, stav } })
      .then((d: any) => setData(d))
      .catch((e: any) => setChyba(e?.message ?? t("Zoznam sa nepodarilo načítať.")))
      .finally(() => setNacitava(false));
  }, [nacitajZoznam, stav]);
  useEffect(nacitaj, [nacitaj]);

  const zmluvaZamestnanca = (id: string) => data?.zmluvy.find((k) => k.employee_id === id);

  return (
    <>
      <PageHeader
        title={t("Zamestnanci")}
        description={t(
          "Karty zamestnancov, zmluvy, dokumenty, neprítomnosti a dochádzka. Mzdy sa tu nepočítajú.",
        )}
        action={
          <Link to="/zamestnanci/novy" className={tlacidlo}>
            <Plus className="h-4 w-4" /> {t("Nový zamestnanec")}
          </Link>
        }
      />
      <PageBody>
        {chyba ? (
          <ChybaModulu sprava={chyba} />
        ) : (
          <>
            {data && data.pripomienky.length > 0 && (
              <section className="mb-4 space-y-2" aria-label={t("Pripomienky")}>
                {data.pripomienky.map((p) => (
                  <Link
                    key={p.kluc}
                    to="/zamestnanci/$id"
                    params={{ id: p.employee_id }}
                    className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm transition-colors hover:border-current ${FARBA[p.zavaznost]}`}
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="min-w-0">
                      <strong>{p.nadpis}</strong> — {p.text}
                    </span>
                  </Link>
                ))}
              </section>
            )}

            <div className="mb-4 inline-flex rounded-lg border border-border bg-muted p-1 text-sm">
              {(
                [
                  ["active", "Aktívni"],
                  ["ended", "Ukončení"],
                  ["vsetci", "Všetci"],
                ] as const
              ).map(([k, nazov]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setStav(k)}
                  aria-pressed={stav === k}
                  className={`rounded-md px-3 py-1.5 font-semibold transition-colors ${stav === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {t(nazov)}
                </button>
              ))}
            </div>

            {nacitava ? (
              <NacitavanieStav className="rounded-xl border border-border bg-card" />
            ) : !data || data.zamestnanci.length === 0 ? (
              <div className="flex flex-col items-center rounded-xl border border-border bg-card px-6 py-12 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-xl border border-border bg-card text-primary shadow-sm">
                  <IdCard className="h-5 w-5" />
                </div>
                <div className="mt-4 text-[15px] font-semibold">
                  {stav === "active"
                    ? t("Zatiaľ tu nie je žiadny aktívny zamestnanec.")
                    : t("Žiadny zamestnanec v tomto zozname.")}
                </div>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                  {t(
                    "Na karte zamestnanca vediete zmluvy, dokumenty, dovolenky a dochádzku. Faktero vám pripomenie prihlášku do poisťovní, koniec skúšobnej doby aj lekárske prehliadky.",
                  )}
                </p>
                <Link to="/zamestnanci/novy" className={`${tlacidlo} mt-4`}>
                  <Plus className="h-4 w-4" /> {t("Pridať prvého zamestnanca")}
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border bg-card">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-muted/60 text-left text-xs font-semibold text-muted-foreground">
                    <tr>
                      <th className="whitespace-nowrap px-4 py-2.5">{t("Meno")}</th>
                      <th className="whitespace-nowrap px-4 py-2.5">{t("Pozícia")}</th>
                      <th className="whitespace-nowrap px-4 py-2.5">{t("Zmluva")}</th>
                      <th className="whitespace-nowrap px-4 py-2.5">{t("Nástup")}</th>
                      <th className="whitespace-nowrap px-4 py-2.5">{t("Stav")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.zamestnanci.map((z) => {
                      const k = zmluvaZamestnanca(z.id);
                      return (
                        <tr key={z.id} className="transition-colors hover:bg-muted/40">
                          <td className="px-4 py-3 font-semibold">
                            <Link to="/zamestnanci/$id" params={{ id: z.id }} className="hover:text-primary hover:underline">
                              {celeMeno(z)}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{z.position || "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground">{k ? t(DRUH_ZMLUVY[k.kind as DruhZmluvy] ?? k.kind) : "—"}</td>
                          <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">{datumSk(z.start_date)}</td>
                          <td className="px-4 py-3">
                            <StavOdznak ton={z.status === "active" ? "uspech" : "neutralny"}>
                              {z.status === "active" ? t("Aktívny") : t("Ukončený")}
                            </StavOdznak>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </PageBody>
    </>
  );
}
