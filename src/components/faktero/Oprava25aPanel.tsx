import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Scale } from "lucide-react";
import { stav25aFn, vystavOpravu25aFn, type Stav25a } from "@/lib/faktero/oprava-25a.functions";

/**
 * Nezaplatená faktúra po splatnosti — oprava DPH podľa § 25a.
 *
 * Ukáže sa len pri faktúre, ktorej sa to týka: nezaplatená po splatnosti,
 * alebo už opravená (vtedy ponúkne vrátenie opravy, keď odberateľ zaplatil).
 */
export function Oprava25aPanel({ invoice }: { invoice: any }) {
  const navigate = useNavigate();
  const nacitaj = useServerFn(stav25aFn);
  const vystav = useServerFn(vystavOpravu25aFn);
  const [stav, setStav] = useState<Stav25a | null>(null);
  const [potvrdene, setPotvrdene] = useState(false);
  const [busy, setBusy] = useState(false);

  const relevantna =
    invoice?.type === "regular" &&
    !invoice?.reverse_charge &&
    Number(invoice?.vat_total ?? 0) > 0 &&
    invoice?.due_date &&
    String(invoice.due_date) < new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!relevantna) return;
    nacitaj({ data: { invoice_id: invoice.id } })
      .then(setStav)
      .catch(() => setStav(null));
  }, [invoice?.id, invoice?.status, relevantna, nacitaj]);

  if (!relevantna || !stav) return null;
  const opravena = stav.znizenie.length > 0;
  if (!opravena && stav.nezaplatene <= 0) return null;
  // Pred nárokom stačí tichá informácia, kedy vznikne.
  const mena = invoice.currency ?? "EUR";

  async function vytvor(druh: "znizenie" | "vratenie") {
    setBusy(true);
    try {
      const r = await vystav({
        data: { invoice_id: invoice.id, druh, potvrdenieZaloby: potvrdene || undefined },
      });
      toast.success(`Opravný doklad ${r.cislo} je vystavený — pošlite ho odberateľovi.`);
      navigate({ to: "/faktury/$id", params: { id: r.id } });
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-5 text-sm dark:border-amber-900/40 dark:bg-amber-950/20">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-amber-800 dark:text-amber-200">
        <Scale className="h-3.5 w-3.5" /> DPH z nezaplatenej faktúry (§ 25a)
      </div>

      {opravena ? (
        <div className="mt-2 space-y-2">
          <p>
            Základ dane je opravený dokladom{" "}
            {stav.znizenie.map((z, i) => (
              <span key={z.id}>
                {i > 0 && ", "}
                <Link to="/faktury/$id" params={{ id: z.id }} className="font-medium underline">
                  {z.cislo}
                </Link>{" "}
                ({z.datum})
              </span>
            ))}
            .
          </p>
          {stav.naVratenie > 0 && (
            <>
              <p className="text-amber-900 dark:text-amber-200">
                Odberateľ po oprave zaplatil {stav.naVratenie.toFixed(2)} {mena}. Opravu treba v
                období úhrady vrátiť dokladom podľa § 25a ods. 10 — je to povinnosť.
              </p>
              <button
                onClick={() => vytvor("vratenie")}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Vystaviť doklad o vrátení opravy
              </button>
            </>
          )}
        </div>
      ) : stav.narok ? (
        <div className="mt-2 space-y-2">
          <p>
            Pohľadávka {stav.nezaplatene.toFixed(2)} {mena} je 150 dní po splatnosti. Daň z nej si
            môžete od štátu vrátiť opravným dokladom — vo výkaze ide do r. 26 a 27 a do časti C.1.
            Doklad musíte odberateľovi aj odoslať do lehoty na podanie priznania.
          </p>
          {stav.trebaPotvrditZalobu && (
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={potvrdene}
                onChange={(e) => setPotvrdene(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Potvrdzujem, že pohľadávku vymáham žalobou podanou na súd alebo exekúciou (nad 1 000 € je
                to podmienka nevymožiteľnosti).
              </span>
            </label>
          )}
          <button
            onClick={() => vytvor("znizenie")}
            disabled={busy || (stav.trebaPotvrditZalobu && !potvrdene)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Vystaviť opravný doklad (§ 25a)
          </button>
        </div>
      ) : (
        <p className="mt-2 text-muted-foreground">{stav.dovod}</p>
      )}
    </div>
  );
}
