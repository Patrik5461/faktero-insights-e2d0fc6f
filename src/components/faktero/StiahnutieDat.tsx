import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { exportFirmyFn } from "@/lib/faktero/export-firmy.functions";
import { Download, Loader2 } from "lucide-react";

/**
 * Stiahnutie všetkých dát firmy.
 *
 * Dva dôvody, prečo to musí byť na jeden klik: prenositeľnosť údajov (čl. 20
 * GDPR) a povinnosť uchovávať účtovné doklady desať rokov, ktorá zrušením účtu
 * nezaniká. Preto je tlačidlo hneď nad zrušením účtu.
 */
/** Malý balík v megabajtoch vyzerá ako nulový, preto sa pod megabajt píšu kilobajty. */
function velkostSlovom(bajtov: number): string {
  return bajtov < 1024 * 1024
    ? `${Math.max(1, Math.round(bajtov / 1024))} kB`
    : `${(bajtov / 1024 / 1024).toFixed(1)} MB`;
}

export function StiahnutieDat() {
  const exportuj = useServerFn(exportFirmyFn);
  const [sPdf, setSPdf] = useState(true);
  const [bezi, setBezi] = useState(false);
  const [vysledok, setVysledok] = useState<Awaited<ReturnType<typeof exportFirmyFn>> | null>(null);

  async function spusti() {
    const companyId = getActiveCompanyId();
    if (!companyId) return;
    setBezi(true);
    setVysledok(null);
    try {
      const v = await exportuj({ data: { company_id: companyId, s_pdf: sPdf } });
      setVysledok(v);
      if (v.url) window.open(v.url, "_blank", "noopener");
    } catch (e: any) {
      toast.error(e?.message ?? "Balík sa nepodarilo pripraviť.");
    } finally {
      setBezi(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h2 className="text-base font-semibold">Stiahnuť všetky dáta</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Balík ZIP s tabuľkami všetkých agend — faktúry a ich položky, prijaté faktúry, doklady,
        odberatelia, cenník, pokladňa, banka, jazdy a zákazky. Tabuľky sú v CSV, ktoré otvorí Excel
        aj o desať rokov.
      </p>

      <label className="mt-3 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={sPdf}
          onChange={(e) => setSPdf(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-input"
        />
        <span>
          Priložiť aj PDF vystavených faktúr
          <span className="block text-xs text-muted-foreground">
            Balík bude väčší a príprava chvíľu potrvá.
          </span>
        </span>
      </label>

      <button
        onClick={spusti}
        disabled={bezi}
        className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
      >
        {bezi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {bezi ? "Pripravujem balík…" : "Pripraviť a stiahnuť"}
      </button>

      {vysledok && (
        <div className="mt-4 rounded-md border border-border bg-muted/40 p-3 text-sm">
          <div className="font-medium">
            Balík je hotový ({velkostSlovom(vysledok.velkost)})
            {vysledok.pdfka > 0 && `, z toho ${vysledok.pdfka} PDF faktúr`}
          </div>
          <ul className="mt-1 text-xs text-muted-foreground">
            {Object.entries(vysledok.pocty)
              .filter(([, n]) => n > 0)
              .map(([co, n]) => (
                <li key={co}>
                  {co}: {n}
                </li>
              ))}
          </ul>
          {vysledok.orezanePdf && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              PDF je priložených prvých 300 — zvyšok stiahnite zo zoznamu faktúr.
            </p>
          )}
          {vysledok.url && (
            <a
              href={vysledok.url}
              className="mt-2 inline-block text-xs text-primary underline"
              target="_blank"
              rel="noreferrer"
            >
              Stiahnuť znova (odkaz platí sedem dní)
            </a>
          )}
        </div>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Účtovné doklady je potrebné uchovávať desať rokov (§ 76 zákona o DPH, § 35 zákona o
        účtovníctve). Táto povinnosť trvá aj po zrušení účtu — stiahnite si balík skôr, než účet
        zrušíte.
      </p>
    </div>
  );
}
