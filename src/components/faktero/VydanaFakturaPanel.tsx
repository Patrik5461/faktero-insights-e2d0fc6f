import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowUpRight, FilePlus2, Link2, Loader2 } from "lucide-react";
import {
  kandidatiVydanychFn,
  priradKVydanejFn,
  vytvorVydanuZNespracovanehoFn,
} from "@/lib/faktero/nespracovane-vydana.functions";
import { sumaSedi, type KandidatVydanej, type NavrhVydanej } from "@/lib/faktero/nespracovane-vydana";
import type { UdajeNespracovaneho } from "@/lib/faktero/nespracovane";
import { formatujMenu } from "@/lib/faktero/mena";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { potvrd } from "@/lib/potvrdenie";
import { useT } from "@/lib/i18n/useT";

/**
 * Druh „Vydaná faktúra“ v detaile nespracovaného dokladu: výber vystavenej
 * faktúry firmy (predvolená tá s rovnakým číslom), priradenie súboru k nej
 * a — keď taká faktúra nie je — založenie vystavenej faktúry z dokladu.
 */
export function VydanaFakturaPanel({
  companyId,
  nespracovanyId,
  navrh,
  udaje,
  onHotovo,
}: {
  companyId: string;
  nespracovanyId: string;
  navrh: NavrhVydanej | null;
  udaje: UdajeNespracovaneho;
  onHotovo: (v: { invoiceId: string; cislo: string }, vytvorena: boolean) => void;
}) {
  const { t } = useT();
  const nacitaj = useServerFn(kandidatiVydanychFn);
  const prirad = useServerFn(priradKVydanejFn);
  const vytvor = useServerFn(vytvorVydanuZNespracovanehoFn);
  const zhoda = navrh?.zhoda?.faktura ?? null;
  const [hladaj, setHladaj] = useState(navrh?.cislo ?? "");
  const [zoznam, setZoznam] = useState<KandidatVydanej[]>(zhoda ? [zhoda] : []);
  const [vybrana, setVybrana] = useState<string | null>(zhoda?.id ?? null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const casovac = setTimeout(() => {
      nacitaj({ data: { company_id: companyId, hladaj } })
        .then((r) => {
          const z = r as KandidatVydanej[];
          // Zhoda podľa čísla ostáva vo výbere, aj keď ju hľadanie nevráti.
          setZoznam(zhoda && !z.some((x) => x.id === zhoda.id) ? [zhoda, ...z] : z);
        })
        .catch(() => setZoznam(zhoda ? [zhoda] : []));
    }, 250);
    return () => clearTimeout(casovac);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hladaj, companyId]);

  const vybranaFaktura = zoznam.find((x) => x.id === vybrana) ?? null;

  async function priradit() {
    if (!vybranaFaktura) return;
    // Suma nesedí — môže to byť iná faktúra s rovnakým číslom; rozhodne človek.
    if (
      sumaSedi(navrh?.suma ?? null, vybranaFaktura.total == null ? null : Number(vybranaFaktura.total)) === false &&
      !(await potvrd(
        t("Suma dokladu {suma} nesedí so sumou faktúry {cislo} ({sumaFaktury}). Priradiť aj tak?", {
          suma: formatujMenu(navrh?.suma ?? 0, udaje.mena || "EUR"),
          cislo: vybranaFaktura.invoice_number,
          sumaFaktury: formatujMenu(vybranaFaktura.total ?? 0, vybranaFaktura.currency ?? "EUR"),
        }),
        { potvrdit: t("Priradiť aj tak"), zrusit: t("Späť"), nebezpecne: true },
      ))
    )
      return;
    setBusy(true);
    try {
      const v = await prirad({ data: { id: nespracovanyId, invoiceId: vybranaFaktura.id } });
      onHotovo(v, false);
    } catch (e: any) {
      toast.error(t(e?.message ?? "Nepodarilo sa"));
    } finally {
      setBusy(false);
    }
  }

  async function vytvorit() {
    if (
      !(await potvrd(
        t(
          "Vytvoriť vystavenú faktúru z údajov dokladu? Dostane číslo z dokladu (číselný rad sa neposunie), stav Vystavená a nič sa neodošle — ani e-mail, ani eFaktúra, ani upomienky. Súbor dokladu bude v jej prílohách.",
        ),
        { potvrdit: t("Vytvoriť vystavenú faktúru") },
      ))
    )
      return;
    setBusy(true);
    try {
      const v = await vytvor({ data: { id: nespracovanyId, udaje: udaje as any } });
      onHotovo(v, true);
    } catch (e: any) {
      toast.error(t(e?.message ?? "Nepodarilo sa"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 text-sm">
      <div className="font-semibold text-foreground">{t("Vaša vystavená faktúra")}</div>
      <p className="mt-1 text-muted-foreground">
        {t(
          "Medzi prijaté faktúry nepatrí. Súbor dokladu sa priloží k vystavenej faktúre vo Fakturácii a doklad z Nespracovaných zmizne.",
        )}
      </p>
      {navrh?.dovody.length ? (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
          {navrh.dovody.map((d) => (
            <li key={d.text}>{t(d.text, d.params)}</li>
          ))}
        </ul>
      ) : null}

      <label className="mt-3 block">
        <span className="text-xs text-muted-foreground">{t("Vystavená faktúra")}</span>
        <input
          value={hladaj}
          onChange={(e) => setHladaj(e.target.value)}
          placeholder={t("Hľadať číslo, odberateľa alebo sumu…")}
          aria-label={t("Hľadať vystavenú faktúru")}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </label>
      <ul
        role="radiogroup"
        aria-label={t("Vystavená faktúra")}
        className="mt-2 max-h-64 divide-y divide-border overflow-auto rounded-md border border-border"
      >
        {zoznam.length === 0 ? (
          <li className="p-3 text-muted-foreground">{t("Nič sa nenašlo.")}</li>
        ) : (
          zoznam.map((x) => (
            <li key={x.id}>
              <button
                type="button"
                role="radio"
                aria-checked={vybrana === x.id}
                disabled={busy}
                onClick={() => setVybrana(x.id)}
                className={`flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-3 py-2 text-left disabled:opacity-50 ${vybrana === x.id ? "bg-primary/10" : "hover:bg-muted/40"}`}
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium">{x.invoice_number}</span>
                  {x.type === "credit_note" ? <span className="text-muted-foreground"> · {t("dobropis")}</span> : null}
                  {x.customer_name ? <span className="text-muted-foreground"> · {x.customer_name}</span> : null}
                  {zhoda?.id === x.id ? (
                    <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                      {t("zhoda čísla")}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {x.issue_date ? datumNaDoklade(x.issue_date) : "—"} · {formatujMenu(x.total ?? 0, x.currency ?? "EUR")}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || !vybranaFaktura}
          onClick={() => void priradit()}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          {t("Priradiť k vystavenej faktúre")}
        </button>
        {vybranaFaktura ? (
          <a
            href={`/faktury/${vybranaFaktura.id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            {t("Otvoriť faktúru")} <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>

      {!zhoda ? (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">
            {navrh?.cislo
              ? t("Faktúra {cislo} vo Fakturácii nie je. Ak ste ju vystavili mimo Faktera, vytvorte ju z tohto dokladu.", {
                  cislo: navrh.cislo,
                })
              : t("Ak faktúru vo Fakturácii nemáte, vytvorte ju z tohto dokladu.")}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void vytvorit()}
            className="mt-2 inline-flex items-center gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm font-semibold hover:bg-secondary disabled:opacity-60"
          >
            <FilePlus2 className="h-4 w-4" /> {t("Vytvoriť vystavenú faktúru z dokladu")}
          </button>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Upozornenie pri doklade zaradenom ako prijatý (alebo bez druhu), ktorý
 * vyzerá ako vlastná vystavená faktúra — s prepnutím na „Vydaná faktúra“.
 */
export function NavrhVydanejUpozornenie({ navrh, onPrepni }: { navrh: NavrhVydanej; onPrepni: () => void }) {
  const { t } = useT();
  return (
    <div role="alert" className="dk-pozor rounded-lg border p-3 text-sm">
      <p className="font-semibold">
        {navrh.zhoda
          ? t("Vyzerá ako vaša vystavená faktúra {cislo}", { cislo: navrh.zhoda.faktura.invoice_number })
          : t("Vyzerá ako vaša vystavená faktúra")}
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
        {navrh.dovody.map((d) => (
          <li key={d.text}>{t(d.text, d.params)}</li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onPrepni}
        className="mt-2 rounded-md border border-input bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary"
      >
        {t("Zmeniť na Vydaná faktúra")}
      </button>
    </div>
  );
}
