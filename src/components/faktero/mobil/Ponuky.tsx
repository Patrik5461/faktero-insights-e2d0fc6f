import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRightLeft, FileText, Mail, Plus, Share2 } from "lucide-react";
import { useOperacia } from "@/lib/mobile/server-most";
import { formatovacMeny } from "@/lib/faktero/mena";
import { MobilObrazovka } from "./MobilChrome";
import { otvorPdfFaktury, zdielajPdfFaktury } from "./pdf-faktury";

import { usePreklad } from "@/lib/mobile/preklady/hook";
import type { Kluc } from "@/lib/mobile/preklady";
/**
 * Cenové ponuky v telefóne.
 *
 * Ponuka sa najčastejšie robí priamo u zákazníka — preto je v appke. Zoznam
 * ukazuje, čo sa deje ďalej: či ponuka ešte platí, či už bola odoslaná a či sa
 * z nej stala faktúra. To posledné je celý zmysel ponuky, tak je to aj hlavná
 * akcia na doklade.
 *
 * PDF a odosielanie používajú tie isté serverové funkcie ako web, len cez most.
 */

export type Ponuka = {
  id: string;
  quote_number: string;
  status: string;
  issue_date: string;
  valid_until: string | null;
  currency: string | null;
  total: number | string;
  customer_name: string | null;
  customer_email: string | null;
  converted_invoice_id: string | null;
  sent_at: string | null;
};

function suma(v: unknown, mena = "EUR", loc = "sk-SK"): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return formatovacMeny(mena, loc)(n);
}

function den(d: string | null | undefined, loc: string): string {
  if (!d) return "—";
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? "—" : x.toLocaleDateString(loc);
}

/**
 * Stav ponuky pre zoznam.
 *
 * Platnosť sa počíta z dátumu, nie zo stĺpca `status` — na `expired` sa nikde
 * neprepisuje, takže prepadnutá ponuka by sa tvárila ako živá. Prevedená na
 * faktúru má prednosť pred všetkým: vtedy už na platnosti nezáleží.
 */
export function stavPonuky(p: Ponuka): { kluc: Kluc; trieda: string } {
  if (p.converted_invoice_id) {
    return { kluc: "ponuky.stav.vyfakturovana", trieda: "bg-app-zelena-jemna text-app-zelena" };
  }
  if (p.status === "rejected")
    return { kluc: "ponuky.stav.zamietnuta", trieda: "bg-app-chyba-jemna text-app-chyba" };
  if (p.status === "accepted")
    return { kluc: "ponuky.stav.prijata", trieda: "bg-app-zelena-jemna text-emerald-600" };
  if (p.valid_until && p.valid_until < new Date().toISOString().slice(0, 10)) {
    return {
      kluc: "ponuky.stav.poPlatnosti",
      trieda: "bg-amber-500/15 text-app-text-2",
    };
  }
  if (p.sent_at) return { kluc: "ponuky.stav.odoslana", trieda: "bg-sky-500/10 text-sky-600" };
  return { kluc: "ponuky.stav.navrh", trieda: "bg-app-pozadie text-app-text-2" };
}

export function Ponuky({
  firma,
  onSpat,
  onNova,
  onFakturaVytvorena,
}: {
  firma: { id: string; name: string };
  onSpat: () => void;
  onNova: () => void;
  /** Po prevode vedieme človeka do faktúr — nech vidí, že doklad existuje. */
  onFakturaVytvorena: () => void;
}) {
  const { t, locale: loc } = usePreklad();
  const zoznamFn = useOperacia("ponuky-zoznam");
  const pdfFn = useOperacia("ponuka-pdf");
  const mailFn = useOperacia("ponuka-email");
  const prevodFn = useOperacia("ponuka-na-fakturu");

  const [ponuky, setPonuky] = useState<Ponuka[] | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [pracujem, setPracujem] = useState<string | null>(null);

  async function nacitaj() {
    setChyba(null);
    try {
      const r = (await zoznamFn({ data: { company_id: firma.id } })) as Ponuka[];
      setPonuky(r);
    } catch (e) {
      setChyba((e as Error).message);
      setPonuky([]);
    }
  }
  useEffect(() => {
    nacitaj();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma.id]);

  async function pdf(p: Ponuka, zdielat: boolean) {
    setPracujem(p.id);
    try {
      const ziskaj = async () => {
        const r: any = await pdfFn({ data: { quoteId: p.id } });
        return { signedUrl: r.signedUrl ?? r.url };
      };
      if (zdielat)
        await zdielajPdfFaktury(ziskaj, p.quote_number, t("ponuky.nazovSuboru", { cislo: p.quote_number }));
      else await otvorPdfFaktury(ziskaj);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPracujem(null);
    }
  }

  async function posli(p: Ponuka) {
    if (!p.customer_email) {
      toast.error(t("ponuky.bezEmailu"));
      return;
    }
    if (!window.confirm(t("ponuky.odoslatOtazka", { cislo: p.quote_number, email: p.customer_email })))
      return;
    setPracujem(p.id);
    try {
      await mailFn({ data: { quoteId: p.id, recipient_email: p.customer_email } });
      toast.success(t("ponuky.odoslana"));
      await nacitaj();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPracujem(null);
    }
  }

  async function naFakturu(p: Ponuka) {
    if (p.converted_invoice_id) {
      toast.info(t("ponuky.uzFakturovana"));
      return;
    }
    if (!window.confirm(t("ponuky.naFakturuOtazka", { cislo: p.quote_number }))) return;
    setPracujem(p.id);
    try {
      await prevodFn({ data: { quoteId: p.id } });
      toast.success(t("ponuky.fakturaVytvorena"));
      onFakturaVytvorena();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPracujem(null);
    }
  }

  return (
    <MobilObrazovka
      title={t("ponuky.nazov")}
      subtitle={firma.name}
      onBack={onSpat}
      akcia={
        <button
          onClick={onNova}
          aria-label={t("ponuky.nova")}
          className="grid h-9 w-9 place-items-center rounded-app-sm bg-app-zelena text-white active:scale-95"
        >
          <Plus className="h-5 w-5" />
        </button>
      }
    >
      {chyba && (
        <p className="rounded-app-sm border border-destructive/30 bg-app-chyba-jemna p-3 text-sm text-app-chyba">
          {chyba}
        </p>
      )}

      {ponuky === null && <p className="text-sm text-app-text-2">{t("spolocne.nacitavam")}</p>}

      {ponuky?.length === 0 && !chyba && (
        <div className="rounded-app border border-dashed border-app-ramik p-6 text-center">
          <p className="text-sm font-medium">{t("ponuky.ziadne")}</p>
          <p className="mt-1 text-xs text-app-text-2">
            {t("ponuky.ziadnePopis2")}
          </p>
          <button
            onClick={onNova}
            className="mt-4 rounded-app-sm bg-app-zelena px-4 py-2.5 text-sm font-medium text-white active:scale-95"
          >
            {t("ponuky.vytvorit")}
          </button>
        </div>
      )}

      <ul className="space-y-3">
        {(ponuky ?? []).map((p) => {
          const s = stavPonuky(p);
          const busy = pracujem === p.id;
          return (
            <li key={p.id} className="rounded-app border border-app-ramik bg-app-karta p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{p.quote_number}</div>
                  <div className="truncate text-xs text-app-text-2">
                    {p.customer_name ?? "—"}
                  </div>
                  <div className="mt-1 text-[11px] text-app-text-2">
                    {den(p.issue_date, loc)}
                    {p.valid_until
                      ? ` · ${t("ponuky.platiDoSkratka", { den: den(p.valid_until, loc) })}`
                      : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-bold tabular-nums">
                    {suma(p.total, p.currency ?? "EUR", loc)}
                  </div>
                  <span
                    className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${s.trieda}`}
                  >
                    {t(s.kluc)}
                  </span>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-4 gap-2">
                <Akcia icon={FileText} label="PDF" onClick={() => pdf(p, false)} disabled={busy} />
                <Akcia icon={Share2} label={t("ponuky.zdielat")} onClick={() => pdf(p, true)} disabled={busy} />
                <Akcia icon={Mail} label={t("ponuky.odoslat")} onClick={() => posli(p)} disabled={busy} />
                <Akcia
                  icon={ArrowRightLeft}
                  label={t("ponuky.naFakturu")}
                  onClick={() => naFakturu(p)}
                  disabled={busy || !!p.converted_invoice_id}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </MobilObrazovka>
  );
}

function Akcia({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1 rounded-app-sm border border-app-ramik px-1 py-2 text-[11px] active:scale-95 disabled:opacity-40"
    >
      <Icon className="h-4 w-4 text-app-text-2" />
      {label}
    </button>
  );
}
