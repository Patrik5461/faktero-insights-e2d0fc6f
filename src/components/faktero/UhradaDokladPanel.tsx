import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowUpRight, FilePlus2, Link2, Loader2 } from "lucide-react";
import {
  kandidatiUhradyFn,
  priradUhraduFn,
  vytvorFakturuSUhradouFn,
  type PrijataNaVyber,
} from "@/lib/faktero/nespracovane-uhrada.functions";
import {
  PREDPONA_INEJ_SUMY,
  sumaSedi,
  type Dovod,
  type UdajeUhrady,
  type ZhodaPrijatej,
} from "@/lib/faktero/nespracovane-uhrada";
import type { UdajeNespracovaneho } from "@/lib/faktero/nespracovane";
import { formatujMenu } from "@/lib/faktero/mena";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { potvrd } from "@/lib/potvrdenie";
import { useT } from "@/lib/i18n/useT";

export type VysledokUhradyUi = {
  purchaseInvoiceId: string;
  cislo: string;
  uhradene: boolean;
  dovod?: Dovod;
};

const SPOSOBY: { kluc: string; nazov: string }[] = [
  { kluc: "", nazov: "— nevedno —" },
  { kluc: "karta", nazov: "Karta" },
  { kluc: "hotovost", nazov: "Hotovosť" },
  { kluc: "prevod", nazov: "Prevod" },
];

/**
 * Druh „Doklad o úhrade“ v detaile nespracovaného dokladu: údaje úhrady
 * (číslo faktúry, suma, deň, spôsob), výber prijatej faktúry (predvolená
 * najlepšia zhoda), priradenie — súbor ide medzi prílohy faktúry a
 * nezaplatená sa označí ako uhradená — a keď faktúra vo Fakteri nie je,
 * založenie faktúry z dokladu s úhradou (len keď súbor nesie aj faktúru).
 */
export function UhradaDokladPanel({
  companyId,
  nespracovanyId,
  udaje,
  setUdaje,
  zhody,
  fakturaZUhrady,
  onUloz,
  onHotovo,
}: {
  companyId: string;
  nespracovanyId: string;
  udaje: UdajeNespracovaneho;
  setUdaje: (u: UdajeNespracovaneho) => void;
  zhody: ZhodaPrijatej[];
  fakturaZUhrady: { mozno: boolean; dovod: string | null } | null;
  /** Uloží rozpracované údaje (druh a údaje úhrady) pred priradením. */
  onUloz: () => Promise<void>;
  onHotovo: (v: VysledokUhradyUi, vytvorena: boolean) => void;
}) {
  const { t } = useT();
  const nacitaj = useServerFn(kandidatiUhradyFn);
  const prirad = useServerFn(priradUhraduFn);
  const vytvor = useServerFn(vytvorFakturuSUhradouFn);
  const uhrada: UdajeUhrady = udaje.uhrada ?? { cisloFaktury: "", suma: null, datum: "", sposob: "" };
  const setUhrada = (z: Partial<UdajeUhrady>) => setUdaje({ ...udaje, uhrada: { ...uhrada, ...z } });
  const najlepsia = zhody[0]?.faktura ?? null;
  const zhodaCisla = new Set(zhody.filter((z) => z.cislo >= 2).map((z) => z.faktura.id));
  const [hladaj, setHladaj] = useState(uhrada.cisloFaktury);
  const [zoznam, setZoznam] = useState<PrijataNaVyber[]>(zhody.map((z) => z.faktura as PrijataNaVyber));
  const [vybrana, setVybrana] = useState<string | null>(najlepsia?.id ?? null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const casovac = setTimeout(() => {
      nacitaj({ data: { company_id: companyId, hladaj } })
        .then((r) => {
          const z = r as PrijataNaVyber[];
          // Zhody podľa čísla ostávajú navrchu, aj keď ich hľadanie nevráti.
          const navrhnute = zhody.map((x) => x.faktura as PrijataNaVyber);
          setZoznam([...navrhnute, ...z.filter((x) => !navrhnute.some((n) => n.id === x.id))]);
        })
        .catch(() => setZoznam(zhody.map((z) => z.faktura as PrijataNaVyber)));
    }, 250);
    return () => clearTimeout(casovac);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hladaj, companyId]);

  const vybranaFaktura = zoznam.find((x) => x.id === vybrana) ?? null;

  function hlasenie(v: VysledokUhradyUi) {
    if (!v.uhradene && v.dovod) toast(t(v.dovod.text, v.dovod.params));
  }

  async function priradit() {
    if (!vybranaFaktura) return;
    let ajInuSumu = false;
    // Suma nesedí — môže to byť čiastočná úhrada alebo iná faktúra; rozhodne človek.
    if (sumaSedi(uhrada.suma, vybranaFaktura.amount_total) === false) {
      if (
        !(await potvrd(
          t("Suma dokladu o úhrade {suma} nesedí so sumou faktúry {cislo} ({sumaFaktury}). Priradiť aj tak?", {
            suma: formatujMenu(uhrada.suma ?? 0, udaje.mena || "EUR"),
            cislo: vybranaFaktura.invoice_number ?? "",
            sumaFaktury: formatujMenu(vybranaFaktura.amount_total ?? 0, vybranaFaktura.currency ?? "EUR"),
          }),
          { potvrdit: t("Priradiť aj tak"), zrusit: t("Späť"), nebezpecne: true },
        ))
      )
        return;
      ajInuSumu = true;
    }
    setBusy(true);
    try {
      await onUloz();
      const v = await prirad({ data: { id: nespracovanyId, purchaseInvoiceId: vybranaFaktura.id, ajInuSumu } });
      hlasenie(v);
      onHotovo(v, false);
    } catch (e: any) {
      toast.error(t(String(e?.message ?? "Nepodarilo sa").replace(PREDPONA_INEJ_SUMY, "")));
    } finally {
      setBusy(false);
    }
  }

  async function vytvorit() {
    if (
      !(await potvrd(
        t(
          "Vytvoriť prijatú faktúru z údajov faktúry v súbore a označiť ju ako uhradenú podľa dokladu o úhrade? Faktúra prejde rovnakými kontrolami ako pri Zaúčtovať (duplicita, sadzby DPH).",
        ),
        { potvrdit: t("Vytvoriť faktúru") },
      ))
    )
      return;
    setBusy(true);
    try {
      await onUloz();
      const v = await vytvor({ data: { id: nespracovanyId } });
      hlasenie(v);
      onHotovo(v, true);
    } catch (e: any) {
      toast.error(t(e?.message ?? "Nepodarilo sa"));
    } finally {
      setBusy(false);
    }
  }

  const vstup = "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

  return (
    <section className="rounded-xl border border-border bg-card p-4 text-sm">
      <div className="font-semibold text-foreground">{t("Doklad o úhrade faktúry")}</div>
      <p className="mt-1 text-muted-foreground">
        {t(
          "Nie je to daňový doklad — DPH sa z neho neúčtuje. Súbor sa priloží k prijatej faktúre, nezaplatená faktúra sa označí ako uhradená a doklad z Nespracovaných zmizne.",
        )}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs text-muted-foreground">{t("Číslo uhrádzanej faktúry")}</span>
          <input
            value={uhrada.cisloFaktury}
            onChange={(e) => setUhrada({ cisloFaktury: e.target.value })}
            aria-label={t("Číslo uhrádzanej faktúry")}
            className={vstup}
          />
        </label>
        <label className="block">
          <span className="text-xs text-muted-foreground">{t("Zaplatená suma")}</span>
          <input
            inputMode="decimal"
            value={uhrada.suma ?? ""}
            onChange={(e) => {
              const n = Number(e.target.value.replace(/\s/g, "").replace(",", "."));
              setUhrada({ suma: e.target.value.trim() === "" || !Number.isFinite(n) ? null : n });
            }}
            aria-label={t("Zaplatená suma")}
            className={`${vstup} tabular-nums`}
          />
        </label>
        <label className="block">
          <span className="text-xs text-muted-foreground">{t("Dátum úhrady")}</span>
          <input
            type="date"
            value={uhrada.datum}
            onChange={(e) => setUhrada({ datum: e.target.value })}
            aria-label={t("Dátum úhrady")}
            className={vstup}
          />
        </label>
        <label className="block">
          <span className="text-xs text-muted-foreground">{t("Spôsob úhrady")}</span>
          <select
            value={uhrada.sposob}
            onChange={(e) => setUhrada({ sposob: e.target.value })}
            aria-label={t("Spôsob úhrady")}
            className={vstup}
          >
            {SPOSOBY.map((x) => (
              <option key={x.kluc} value={x.kluc}>
                {t(x.nazov)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="mt-3 block">
        <span className="text-xs text-muted-foreground">{t("Prijatá faktúra")}</span>
        <input
          value={hladaj}
          onChange={(e) => setHladaj(e.target.value)}
          placeholder={t("Hľadať číslo, dodávateľa alebo sumu…")}
          aria-label={t("Hľadať prijatú faktúru")}
          className={vstup}
        />
      </label>
      <ul
        role="radiogroup"
        aria-label={t("Prijatá faktúra")}
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
                  <span className="font-medium">{x.invoice_number || t("bez čísla")}</span>
                  {x.supplier_name ? <span className="text-muted-foreground"> · {x.supplier_name}</span> : null}
                  {x.status === "paid" ? <span className="text-muted-foreground"> · {t("uhradená")}</span> : null}
                  {zhodaCisla.has(x.id) ? (
                    <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                      {t("zhoda čísla")}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {x.issue_date ? datumNaDoklade(x.issue_date) : "—"} ·{" "}
                  {formatujMenu(x.amount_total ?? 0, x.currency ?? "EUR")}
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
          {t("Priradiť k faktúre ako doklad o úhrade")}
        </button>
        {vybranaFaktura ? (
          <a
            href={`/prijate-faktury/${vybranaFaktura.id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            {t("Otvoriť faktúru")} <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>

      {!zhody.length ? (
        <div className="mt-4 border-t border-border pt-3">
          <p className="font-medium text-foreground">{t("Faktúra ešte nie je vo Fakteri")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {uhrada.cisloFaktury
              ? t("Prijatú faktúru {cislo} sme medzi prijatými faktúrami nenašli.", { cislo: uhrada.cisloFaktury })
              : t("Na doklade sme nenašli číslo uhrádzanej faktúry — vyberte faktúru zo zoznamu.")}
          </p>
          {fakturaZUhrady?.mozno ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void vytvorit()}
              className="mt-2 inline-flex items-center gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm font-semibold hover:bg-secondary disabled:opacity-60"
            >
              <FilePlus2 className="h-4 w-4" /> {t("Vytvoriť faktúru z dokladu a pripojiť úhradu")}
            </button>
          ) : fakturaZUhrady?.dovod ? (
            <p className="mt-2 text-xs text-muted-foreground">{t(fakturaZUhrady.dovod)}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** Upozornenie pri doklade iného druhu, ktorý vyzerá ako doklad o úhrade — s prepnutím. */
export function NavrhUhradyUpozornenie({ cislo, onPrepni }: { cislo: string; onPrepni: () => void }) {
  const { t } = useT();
  return (
    <div role="alert" className="dk-pozor rounded-lg border p-3 text-sm">
      <p className="font-semibold">
        {cislo
          ? t("Vyzerá ako doklad o úhrade faktúry {cislo}", { cislo })
          : t("Vyzerá ako doklad o úhrade faktúry")}
      </p>
      <p className="mt-1 text-xs">
        {t("Nie je to bloček ani faktúra — len potvrdenie, že faktúra bola zaplatená. DPH sa z neho neúčtuje.")}
      </p>
      <button
        type="button"
        onClick={onPrepni}
        className="mt-2 rounded-md border border-input bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary"
      >
        {t("Zmeniť na Doklad o úhrade")}
      </button>
    </div>
  );
}
