import { useEffect, useState } from "react";
import { useOperacia } from "@/lib/mobile/server-most";
import { toast } from "sonner";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { dniDoZrusenia, terminSlovom } from "@/lib/faktero/ucet-zrusenie";
import { DNI, sPoctom } from "@/lib/faktero/mnozne";

/**
 * Zrušenie účtu — spoločné pre web aj pre mobilnú aplikáciu.
 *
 * Zámerne je to jedna a tá istá obrazovka: App Store vyžaduje, aby sa účet dal
 * zrušiť z appky, a mať na to dva rôzne texty by znamenalo, že jeden z nich raz
 * prestane hovoriť pravdu.
 *
 * Čo sa deje a čo nie, musí byť napísané **pred** potvrdením — nie v e-maile,
 * ktorý príde potom.
 */

type Stav = {
  email: string | null;
  poziadaneOd: string | null;
  zrusiSa: string | null;
  firmyNaZmazanie: { id: string; name: string }[];
  odkladDni: number;
};

export function ZrusenieUctu({ onZrusene }: { onZrusene?: () => void }) {
  const nacitaj = useOperacia("ucet-stav-zrusenia");
  const poziadaj = useOperacia("ucet-poziadaj-o-zrusenie");
  const odvolaj = useOperacia("ucet-odvolaj-zrusenie");

  const [stav, setStav] = useState<Stav | null>(null);
  const [potvrdzujem, setPotvrdzujem] = useState(false);
  const [busy, setBusy] = useState(false);

  async function obnov() {
    try {
      setStav((await nacitaj({ data: undefined })) as Stav);
    } catch (e: any) {
      toast.error(e?.message ?? "Stav účtu sa nepodarilo načítať.");
    }
  }

  useEffect(() => {
    obnov();
    // eslint-disable-next-line
  }, []);

  async function potvrd() {
    setBusy(true);
    try {
      await poziadaj({ data: undefined });
      await obnov();
      setPotvrdzujem(false);
      toast.success("Žiadosť sme prijali. Do termínu ju môžete odvolať.");
      onZrusene?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Žiadosť sa nepodarilo zapísať.");
    } finally {
      setBusy(false);
    }
  }

  async function odvolajZiadost() {
    setBusy(true);
    try {
      await odvolaj({ data: undefined });
      await obnov();
      toast.success("Žiadosť je odvolaná, účet ostáva.");
    } catch (e: any) {
      toast.error(e?.message ?? "Žiadosť sa nepodarilo odvolať.");
    } finally {
      setBusy(false);
    }
  }

  if (!stav) return <p className="text-sm text-muted-foreground">Načítavam…</p>;

  /* --- žiadosť už beží --- */
  if (stav.zrusiSa) {
    const dni = dniDoZrusenia(stav.zrusiSa);
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold">Účet je naplánovaný na zrušenie</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Zruší sa <strong>{terminSlovom(stav.zrusiSa)}</strong>, čiže o {sPoctom(dni, DNI)}. Do
              vtedy sa nič nemaže a stačí žiadosť odvolať.
            </p>
          </div>
        </div>
        <button
          onClick={odvolajZiadost}
          disabled={busy}
          className="mt-4 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60 sm:w-auto"
        >
          {busy ? "Ruším žiadosť…" : "Odvolať žiadosť a nechať účet"}
        </button>
      </div>
    );
  }

  /* --- druhý krok: čo presne sa stane --- */
  if (potvrdzujem) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-card p-5">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold">Naozaj zrušiť účet?</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Účet <strong>{stav.email ?? "—"}</strong> sa zruší o {stav.odkladDni} dní. Do vtedy
              stačí sa prihlásiť a žiadosť odvolať — dovtedy sa nemaže nič.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3 text-sm">
          <div>
            <div className="font-medium">Po uplynutí lehoty sa zmaže</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
              <li>prihlásenie, e-mail a meno,</li>
              <li>prístup do všetkých firiem, kde ste členom.</li>
              {stav.firmyNaZmazanie.length > 0 && (
                <li>
                  firmy, kde ste jediným členom, aj so všetkými dokladmi, skladom a prílohami:{" "}
                  <strong className="text-foreground">
                    {stav.firmyNaZmazanie.map((f) => f.name).join(", ")}
                  </strong>
                </li>
              )}
            </ul>
          </div>

          <div>
            <div className="font-medium">Ostáva</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
              <li>firmy, ktoré majú aj iných členov — tým sa nič nestane,</li>
              <li>doklady, ktoré ste už stiahli alebo poslali odberateľom.</li>
            </ul>
          </div>

          {stav.firmyNaZmazanie.length > 0 && (
            <p className="rounded-lg bg-secondary p-3 text-[13px] text-muted-foreground">
              Faktúry a doklady si <strong>stiahnite ešte pred zrušením</strong> — z účtovných
              exportov alebo z prehľadu faktúr. Po zmazaní ich už nemáme odkiaľ obnoviť.
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button
            onClick={potvrd}
            disabled={busy}
            className="rounded-lg bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground disabled:opacity-60"
          >
            {busy ? "Zapisujem…" : `Zrušiť účet o ${stav.odkladDni} dní`}
          </button>
          <button
            onClick={() => setPotvrdzujem(false)}
            disabled={busy}
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-secondary"
          >
            Nechať účet
          </button>
        </div>
      </div>
    );
  }

  /* --- prvý krok --- */
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-[15px] font-semibold">Zrušenie účtu</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Zrušenie má {stav.odkladDni}-dňový odklad. Kým lehota beží, nič sa nemaže a žiadosť sa dá
        odvolať prihlásením.
      </p>
      <button
        onClick={() => setPotvrdzujem(true)}
        className="mt-4 rounded-lg border border-destructive/50 px-4 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/5"
      >
        Chcem zrušiť účet
      </button>
    </div>
  );
}
