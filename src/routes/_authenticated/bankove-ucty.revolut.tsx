import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
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
  head: () => ({ meta: [{ title: "Revolut — Faktero" }] }),
  validateSearch: (s: Record<string, unknown>): { code?: string } => ({
    code: typeof s.code === "string" && s.code ? s.code : undefined,
  }),
  component: RevolutNavrat,
});

function RevolutNavrat() {
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
        setChyba("V adrese nie je kód z Revolutu. Spustite potvrdenie znova.");
      }
      return;
    }
    spustene.current = true;
    dokonci({ data: { company_id: cid, code } })
      .then(() => {
        setStav("hotovo");
        toast.success("Revolut pripojený.");
        navigate({ to: "/bankove-ucty" });
      })
      .catch((e: any) => {
        setStav("chyba");
        setChyba(e?.message ?? "Pripojenie sa nepodarilo.");
      });
  }, [code, dokonci, navigate]);

  return (
    <>
      <PageHeader title="Revolut" description="Dokončujeme pripojenie účtu." />
      <PageBody>
        <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-8 text-sm">
          {stav === "pracujem" && <p>Vymieňam kód za prístup…</p>}
          {stav === "hotovo" && <p>Hotovo. Presúvam vás na bankové účty.</p>}
          {stav === "chyba" && (
            <>
              <p className="text-destructive">{chyba}</p>
              <button
                onClick={() => navigate({ to: "/bankove-ucty/pripojit" })}
                className="mt-4 inline-flex h-9 items-center rounded-md border border-border px-3 hover:bg-secondary"
              >
                Späť na pripojenie
              </button>
            </>
          )}
        </div>
      </PageBody>
    </>
  );
}
