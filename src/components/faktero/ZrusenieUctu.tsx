import { useEffect, useState } from "react";
import { useOperacia } from "@/lib/mobile/server-most";
import { toast } from "sonner";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { terminSlovom } from "@/lib/faktero/ucet-zrusenie";
import { prelozit, type Kluc } from "@/lib/mobile/preklady";
import { locale, type Jazyk } from "@/lib/mobile/jazyk";

/**
 * Zrušenie účtu — spoločné pre web aj pre mobilnú aplikáciu.
 *
 * Zámerne je to jedna a tá istá obrazovka: App Store vyžaduje, aby sa účet dal
 * zrušiť z appky, a mať na to dva rôzne texty by znamenalo, že jeden z nich raz
 * prestane hovoriť pravdu.
 *
 * Čo sa deje a čo nie, musí byť napísané **pred** potvrdením — nie v e-maile,
 * ktorý príde potom.
 *
 * Jazyk podáva appka. Kým bol text natvrdo po slovensky, recenzent App Store
 * mal zariadenie v angličtine, celá appka sa mu ukázala anglicky a len toto
 * tlačidlo nie — nespoznal ho a Knihu jázd zamietol pre chýbajúce zmazanie
 * účtu (pravidlo 5.1.1(v)). Web jazyk nepodáva a ostáva po slovensky; vlastný
 * jazyk podľa prehliadača by ho prepol do cudzej reči uprostred slovenskej
 * stránky.
 */

type Stav = {
  email: string | null;
  poziadaneOd: string | null;
  zrusiSa: string | null;
  firmyNaZmazanie: { id: string; name: string }[];
  odkladDni: number;
};

export function ZrusenieUctu({
  onZmena,
  jazyk = "sk",
}: {
  /**
   * Termín zmazania sa zmenil — po žiadosti aj po odvolaní (`null`). Obrazovka
   * pri tom ostáva stáť a sama ukáže nový stav. Predtým appka po potvrdení
   * odskočila na Prehľad a človek potvrdenie, že je účet naplánovaný na
   * zmazanie, vôbec nevidel — čo je presne krok, ktorý App Store chce vidieť.
   */
  onZmena?: (zrusiSa: string | null) => void;
  jazyk?: Jazyk;
}) {
  const t = (kluc: Kluc, premenne?: Record<string, string | number>) =>
    prelozit(jazyk, kluc, premenne);
  const nacitaj = useOperacia("ucet-stav-zrusenia");
  const poziadaj = useOperacia("ucet-poziadaj-o-zrusenie");
  const odvolaj = useOperacia("ucet-odvolaj-zrusenie");

  const [stav, setStav] = useState<Stav | null>(null);
  const [potvrdzujem, setPotvrdzujem] = useState(false);
  const [busy, setBusy] = useState(false);

  async function obnov(): Promise<Stav | null> {
    try {
      const novy = (await nacitaj({ data: undefined })) as Stav;
      setStav(novy);
      return novy;
    } catch (e: any) {
      toast.error(e?.message ?? t("zrus.chybaStavu"));
      return null;
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
      const novy = await obnov();
      setPotvrdzujem(false);
      toast.success(t("zrus.prijate"));
      onZmena?.(novy?.zrusiSa ?? null);
    } catch (e: any) {
      toast.error(e?.message ?? t("zrus.chybaZapisu"));
    } finally {
      setBusy(false);
    }
  }

  async function odvolajZiadost() {
    setBusy(true);
    try {
      await odvolaj({ data: undefined });
      await obnov();
      toast.success(t("zrus.odvolane"));
      onZmena?.(null);
    } catch (e: any) {
      toast.error(e?.message ?? t("zrus.chybaOdvolania"));
    } finally {
      setBusy(false);
    }
  }

  if (!stav) return <p className="text-sm text-muted-foreground">{t("spolocne.nacitavam")}</p>;

  /* --- žiadosť už beží --- */
  if (stav.zrusiSa) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold">{t("zrus.naplanovane")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("zrus.naplanovanePopis", {
                termin: terminSlovom(stav.zrusiSa, locale(jazyk)),
              })}
            </p>
          </div>
        </div>
        <button
          onClick={odvolajZiadost}
          disabled={busy}
          className="mt-4 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60 sm:w-auto"
        >
          {busy ? t("zrus.odvolavam") : t("zrus.odvolat")}
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
            <h3 className="text-[15px] font-semibold">{t("zrus.naozaj")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {/* Odklad je pevný (14 dní), takže tvar „dní“ sedí v každom z jazykov. */}
              {t("zrus.naozajPopis", { email: stav.email ?? "—", dni: stav.odkladDni })}
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3 text-sm">
          <div>
            <div className="font-medium">{t("zrus.zmazeSa")}</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
              <li>{t("zrus.zmazePrihlasenie")}</li>
              <li>{t("zrus.zmazePristup")}</li>
              {stav.firmyNaZmazanie.length > 0 && (
                <li>
                  {t("zrus.zmazeFirmy")}{" "}
                  <strong className="text-foreground">
                    {stav.firmyNaZmazanie.map((f) => f.name).join(", ")}
                  </strong>
                </li>
              )}
            </ul>
          </div>

          <div>
            <div className="font-medium">{t("zrus.ostava")}</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
              <li>{t("zrus.ostavaFirmy")}</li>
              <li>{t("zrus.ostavaDoklady")}</li>
            </ul>
          </div>

          {stav.firmyNaZmazanie.length > 0 && (
            <p className="rounded-lg bg-secondary p-3 text-[13px] text-muted-foreground">
              {t("zrus.stiahnite")}
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button
            onClick={potvrd}
            disabled={busy}
            className="rounded-lg bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground disabled:opacity-60"
          >
            {busy ? t("zrus.zapisujem") : t("zrus.potvrdit", { dni: stav.odkladDni })}
          </button>
          <button
            onClick={() => setPotvrdzujem(false)}
            disabled={busy}
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-secondary"
          >
            {t("zrus.nechat")}
          </button>
        </div>
      </div>
    );
  }

  /* --- prvý krok --- */
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-[15px] font-semibold">{t("zrus.nadpis")}</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("zrus.popis", { dni: stav.odkladDni })}
      </p>
      <button
        onClick={() => setPotvrdzujem(true)}
        className="mt-4 rounded-lg border border-destructive/50 px-4 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/5"
      >
        {t("zrus.chcem")}
      </button>
    </div>
  );
}
