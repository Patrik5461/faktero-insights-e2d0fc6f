import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { NacitavanieStav } from "@/components/faktero/web/StavyObsahu";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { dokonciRevolut } from "@/lib/faktero/revolut.functions";

/**
 * Návrat z potvrdenia v Revolute.
 *
 * Toto je adresa, ktorú si firma zaregistruje v ich portáli — pre všetkých
 * rovnaká. Revolut sem pošle jednorazový kód, ktorý platí len pár minút, tak
 * sa vymieňa hneď pri načítaní stránky a človek nemusí nič klikať.
 *
 * Je to stránka a nie serverový endpoint zámerne: kód sa musí priradiť
 * k firme, a tú vie prehliadač prihláseného človeka. Posielať ju cez adresu by
 * znamenalo dôverovať tomu, čo príde v odkaze.
 */
export const Route = createFileRoute("/_authenticated/bankove-ucty/revolut")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk ?? "sk", "Revolut — Faktero") }] }),
  validateSearch: (s: Record<string, unknown>): { code?: string } => ({
    code: typeof s.code === "string" && s.code ? s.code : undefined,
  }),
  component: RevolutNavrat,
});

function RevolutNavrat() {
  const { t } = useT();
  const { code } = Route.useSearch();
  const navigate = useNavigate();
  const dokonci = useServerFn(dokonciRevolut);
  const [stav, setStav] = useState<"pracujem" | "hotovo" | "chyba">("pracujem");
  const [chyba, setChyba] = useState<string | null>(null);
  // Kód je jednorazový — druhý pokus by skončil chybou, aj keby prvý prešiel.
  const spustene = useRef(false);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!code || !cid || spustene.current) {
      if (!code) {
        setStav("chyba");
        setChyba(t("V adrese nie je kód z Revolutu. Spustite potvrdenie znova."));
      } else if (!cid && !spustene.current) {
        // Bez vybranej firmy by obrazovka visela na „Vymieňam kód…“ navždy.
        setStav("chyba");
        setChyba(
          t("Nie je vybraná firma. Prihláste sa, vyberte firmu a spustite pripojenie Revolutu znova."),
        );
      }
      return;
    }
    spustene.current = true;
    dokonci({ data: { company_id: cid, code } })
      .then(() => {
        setStav("hotovo");
        toast.success(t("Revolut pripojený."));
        navigate({ to: "/bankove-ucty" });
      })
      .catch((e: any) => {
        setStav("chyba");
        setChyba(e?.message ?? t("Pripojenie sa nepodarilo."));
      });
  }, [code, dokonci, navigate, t]);

  return (
    <>
      <PageHeader title="Revolut" description={t("Dokončujeme pripojenie účtu.")} />
      <PageBody>
        <div className="mx-auto max-w-xl rounded-xl border border-border bg-card p-5 text-sm sm:p-6">
          {stav === "pracujem" && <NacitavanieStav text="Vymieňam kód za prístup…" className="py-6" />}
          {stav === "hotovo" && <p>{t("Hotovo. Presúvam vás na bankové účty.")}</p>}
          {stav === "chyba" && (
            <>
              <p className="break-words font-medium text-destructive" role="alert">{chyba}</p>
              <button
                onClick={() => navigate({ to: "/bankove-ucty/pripojit" })}
                className="mt-4 inline-flex h-9 items-center rounded-md border border-input bg-background px-3 font-semibold hover:bg-accent"
              >
                {t("Späť na pripojenie")}
              </button>
            </>
          )}
        </div>
      </PageBody>
    </>
  );
}
