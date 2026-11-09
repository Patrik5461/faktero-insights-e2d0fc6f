import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Building2, Loader2, RefreshCw } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { IcoLookupButton } from "@/components/faktero/IcoLookupButton";
import { doplnVeritelaZmluvyFn } from "@/lib/faktero/financovanie.functions";
import { doplnZRegistra, type VeritelZmluvy } from "@/lib/faktero/financovanie-veritel";
import { Button } from "@/components/ui/button";

/**
 * Veriteľ zmluvy o financovaní (leasingovka/banka): polia formulára a karta
 * na detaile. Údaje idú do Pohody ako partner záväzku za splátku; IČ DPH
 * potrebuje kontrolný výkaz pri B.2.
 */

export const PRAZDNY_VERITEL: VeritelZmluvy = {
  provider_ico: null,
  provider_dic: null,
  provider_ic_dph: null,
  provider_street: null,
  provider_city: null,
  provider_zip: null,
  provider_country: null,
};

export function veritelZoZmluvy(z: Partial<VeritelZmluvy> | null | undefined): VeritelZmluvy {
  const out = { ...PRAZDNY_VERITEL };
  for (const k of Object.keys(out) as (keyof VeritelZmluvy)[]) out[k] = (z?.[k] as string | null) ?? null;
  return out;
}

/** Polia veriteľa vo formulári zmluvy. */
export function PoliaVeritela({
  hodnota,
  onChange,
  pole,
  popis,
}: {
  hodnota: VeritelZmluvy;
  onChange: (v: VeritelZmluvy) => void;
  /** Triedy políčka a popisu z formulára, nech vyzerajú rovnako. */
  pole: string;
  popis: string;
}) {
  const { t } = useT();
  const nastav = (k: keyof VeritelZmluvy) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...hodnota, [k]: e.target.value || null });
  const v = (k: keyof VeritelZmluvy) => hodnota[k] ?? "";

  return (
    <fieldset className="rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-semibold">{t("Veriteľ (leasingovka alebo banka)")}</legend>
      <p className="mb-3 text-xs text-muted-foreground">
        {t("Údaje leasingovej spoločnosti alebo banky, nie vašej firmy. Do Pohody idú ako partner záväzku; IČ DPH potrebuje kontrolný výkaz (B.2).")}
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="min-w-0">
          <label className={popis}>{t("IČO veriteľa")}</label>
          <div className="flex min-w-0">
            <input
              aria-label={t("IČO veriteľa")}
              className={`${pole} min-w-0 rounded-r-none`}
              inputMode="numeric"
              value={v("provider_ico")}
              onChange={nastav("provider_ico")}
              placeholder="35704713"
            />
            <IcoLookupButton
              ico={v("provider_ico")}
              onResult={(d, { auto }) => {
                // Automaticky len do prázdnych polí; po kliknutí register prebije, čo pozná.
                if (auto) return onChange(doplnZRegistra(hodnota, d));
                const r = doplnZRegistra({ ...PRAZDNY_VERITEL, provider_ico: hodnota.provider_ico }, d);
                const out = { ...hodnota };
                for (const k of Object.keys(out) as (keyof VeritelZmluvy)[]) out[k] = r[k] ?? hodnota[k];
                onChange(out);
              }}
            />
          </div>
        </div>
        <div>
          <label className={popis}>{t("DIČ veriteľa")}</label>
          <input aria-label={t("DIČ veriteľa")} className={pole} value={v("provider_dic")} onChange={nastav("provider_dic")} />
        </div>
        <div>
          <label className={popis}>{t("IČ DPH veriteľa")}</label>
          <input
            aria-label={t("IČ DPH veriteľa")}
            className={pole}
            value={v("provider_ic_dph")}
            onChange={nastav("provider_ic_dph")}
            placeholder="SK2020264818"
          />
        </div>
        <div className="sm:col-span-3">
          <label className={popis}>{t("Ulica a číslo")}</label>
          <input aria-label={t("Ulica a číslo")} className={pole} value={v("provider_street")} onChange={nastav("provider_street")} />
        </div>
        <div>
          <label className={popis}>{t("PSČ")}</label>
          <input aria-label={t("PSČ")} className={pole} value={v("provider_zip")} onChange={nastav("provider_zip")} />
        </div>
        <div>
          <label className={popis}>{t("Obec")}</label>
          <input aria-label={t("Obec")} className={pole} value={v("provider_city")} onChange={nastav("provider_city")} />
        </div>
        <div>
          <label className={popis}>{t("Krajina")}</label>
          <input
            aria-label={t("Krajina")}
            className={pole}
            value={v("provider_country")}
            onChange={nastav("provider_country")}
            placeholder="SK"
            maxLength={2}
          />
        </div>
      </div>
    </fieldset>
  );
}

/** Karta veriteľa na detaile zmluvy s doplnením z registra. */
export function KartaVeritela({
  cid,
  zmluva,
  onZmena,
}: {
  cid: string;
  zmluva: Partial<VeritelZmluvy> & { id: string; provider_name?: string | null; kv_clenenie?: string | null };
  onZmena: () => void | Promise<void>;
}) {
  const { t } = useT();
  const dopln = useServerFn(doplnVeritelaZmluvyFn);
  const [pracujem, setPracujem] = useState(false);
  const [kandidati, setKandidati] = useState<{ ico: string; nazov: string; mesto: string | null }[]>([]);
  const v = veritelZoZmluvy(zmluva);

  async function spusti(ico?: string) {
    setPracujem(true);
    try {
      const r = await dopln({ data: { company_id: cid, id: zmluva.id, ico: ico ?? null } });
      setKandidati(r.kandidati ?? []);
      if (r.doplnene.length) {
        toast.success(t("Údaje veriteľa doplnené z registra."));
        await onZmena();
      } else if (r.sprava) {
        (r.kandidati?.length ? toast.info : toast.error)(t(r.sprava));
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("Nepodarilo sa to."));
    } finally {
      setPracujem(false);
    }
  }

  const adresa = [v.provider_street, [v.provider_zip, v.provider_city].filter(Boolean).join(" "), v.provider_country]
    .filter(Boolean)
    .join(", ");
  const neuplne = !v.provider_ico || !v.provider_ic_dph || !v.provider_street || !v.provider_city;
  const b2BezIcDph = /^B\.?2/i.test(String(zmluva.kv_clenenie ?? "").trim()) && !v.provider_ic_dph;

  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Building2 className="h-4 w-4 text-muted-foreground" /> {t("Veriteľ")}
          </h2>
          <div className="mt-1 text-sm font-medium">{zmluva.provider_name || t("— neuvedený —")}</div>
          <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            {(
              [
                ["IČO", v.provider_ico],
                ["DIČ", v.provider_dic],
                ["IČ DPH", v.provider_ic_dph],
              ] as const
            ).map(([k, h]) => (
              <div key={k} className="flex min-w-0 gap-2">
                <dt className="text-muted-foreground">{t(k)}:</dt>
                <dd className="truncate">{h || "—"}</dd>
              </div>
            ))}
            <div className="flex min-w-0 gap-2 sm:col-span-3">
              <dt className="text-muted-foreground">{t("Adresa")}:</dt>
              <dd className="min-w-0 break-words">{adresa || "—"}</dd>
            </div>
          </dl>
          {b2BezIcDph && (
            <p className="mt-2 text-xs font-medium text-warning">
              {t("Kalendár je v KV DPH B.2 — bez IČ DPH veriteľa Pohoda nezaradí splátky do KV B.2.")}
            </p>
          )}
        </div>
        {neuplne && (
          <Button variant="outline" onClick={() => void spusti()} disabled={pracujem}>
            {pracujem ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {t("Načítať údaje veriteľa")}
          </Button>
        )}
      </div>
      {kandidati.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="mb-2 text-xs text-muted-foreground">{t("Vyberte, ktorá firma je veriteľ:")}</p>
          <div className="flex flex-wrap gap-2">
            {kandidati.map((k) => (
              <Button key={k.ico} variant="outline" size="sm" disabled={pracujem} onClick={() => void spusti(k.ico)}>
                {k.nazov} · {k.ico}
                {k.mesto ? ` · ${k.mesto}` : ""}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
