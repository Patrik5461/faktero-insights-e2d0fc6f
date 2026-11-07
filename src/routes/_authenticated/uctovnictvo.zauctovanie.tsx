import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { AutopilotKarta } from "@/components/faktero/AutopilotKarta";
import { PredlohyUctovania } from "@/components/faktero/PredlohyUctovania";
import { ZalozkyStranky } from "@/components/faktero/ZalozkyStranky";
import { ZauctovanieNaKontrolu } from "@/components/faktero/uctovnictvo/ZauctovanieNaKontrolu";
import {
  KLUCE_HLADANIA_PRAVIDIEL,
  ZauctovaniePravidla,
  ocistiHladaniePravidiel,
  type HladaniePravidiel,
} from "@/components/faktero/uctovnictvo/ZauctovaniePravidla";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";

type Tab = "kontrola" | "pravidla" | "predlohy";
type Hladanie = HladaniePravidiel & { tab?: Tab };

/**
 * Automatické účtovanie — jedna stránka namiesto „Zaúčtovanie na kontrolu“
 * a „Pravidlá“ (2026-11). AutopilotKarta je raz navrchu, pod ňou záložky.
 */
export const Route = createFileRoute("/_authenticated/uctovnictvo/zauctovanie")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk, "Automatické účtovanie — Faktero") }],
  }),
  validateSearch: (s: Record<string, unknown>): Hladanie => {
    const pravidla = ocistiHladaniePravidiel(s);
    // Predvyplnenie pravidla (z dokladu, pohybu, nespracovaného) nesmie
    // prepadnúť na inej záložke — vždy otvorí Pravidlá.
    const predvyplnenie = Boolean(pravidla.novy || pravidla.upravit);
    const tab: Tab | undefined = predvyplnenie
      ? "pravidla"
      : s.tab === "pravidla" || s.tab === "predlohy" || s.tab === "kontrola"
        ? s.tab
        : undefined;
    return { ...pravidla, tab };
  },
  component: ZauctovaniePage,
});

function ZauctovaniePage() {
  const { t } = useT();
  const cid = useMemo(() => getActiveCompanyId(), []);
  const { tab = "kontrola" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [pocet, setPocet] = useState<number | null>(null);
  const naPocet = useCallback((n: number | null) => setPocet(n), []);

  const zmenZalozku = (kod: Tab) =>
    void navigate({
      to: "/uctovnictvo/zauctovanie",
      // Predvyplnenie pravidla patrí len k Pravidlám; inak by validateSearch záložku vrátil.
      search: (s: Hladanie) => ({
        ...Object.fromEntries(
          Object.entries(s).filter(
            ([k]) => !(KLUCE_HLADANIA_PRAVIDIEL as readonly string[]).includes(k),
          ),
        ),
        tab: kod,
      }),
      replace: true,
    });

  return (
    <>
      <PageHeader
        title={t("Automatické účtovanie")}
        description={t(
          "Automatické účtovanie: bloček, prijatá aj vystavená faktúra či pohyb v banke dostane predkontáciu, členenie DPH a KV sám — hneď, ako vznikne.",
        )}
      />
      <PageBody>
        {cid && (
          <div className="mb-4">
            <AutopilotKarta companyId={cid} />
          </div>
        )}
        <ZalozkyStranky<Tab>
          popis="Časti automatického účtovania"
          aktivna={tab}
          onZmena={zmenZalozku}
          className="mb-4"
          zalozky={[
            { kod: "kontrola", nazov: "Na kontrolu", pocet: pocet ?? undefined },
            { kod: "pravidla", nazov: "Pravidlá" },
            { kod: "predlohy", nazov: "Predlohy" },
          ]}
        />
        <div role="tabpanel" aria-labelledby={`zalozka-${tab}`}>
          {tab === "kontrola" ? (
            <ZauctovanieNaKontrolu onPocet={naPocet} />
          ) : tab === "pravidla" ? (
            <ZauctovaniePravidla />
          ) : cid ? (
            <PredlohyUctovania companyId={cid} />
          ) : null}
        </div>
      </PageBody>
    </>
  );
}
