import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowUpRight, FileInput, Link2, Loader2 } from "lucide-react";
import {
  navrhUhradyBlockuFn,
  presunBlocekDoOstatnychFn,
  presunBlockyDoOstatnychFn,
  priradBlocekKFaktureFn,
  priradBlockyHromadneFn,
} from "@/lib/faktero/blocek-uhrada.functions";
import { kandidatiUhradyFn, type PrijataNaVyber } from "@/lib/faktero/nespracovane-uhrada.functions";
import { PREDPONA_INEJ_SUMY, sumaSedi, type Dovod, type UdajeUhrady, type ZhodaPrijatej } from "@/lib/faktero/nespracovane-uhrada";
import { jeBlocekUhradou, textSuhrnuBlockov, udajeUhradyBlocku, type RiadokBlocku } from "@/lib/faktero/blocek-uhrada";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { formatujMenu } from "@/lib/faktero/mena";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { potvrd } from "@/lib/potvrdenie";
import { useT } from "@/lib/i18n/useT";

export type RezimPresunuBlocku = "faktura" | "ostatne";

const SPOSOB: Record<string, string> = { karta: "kartou", hotovost: "v hotovosti", prevod: "prevodom" };

/**
 * Pás v detaile bločku, ktorý vyzerá ako úhrada faktúry (METRO „ÚHRADA
 * FAKTÚRY — Faktúra č. …“): ponúkne priradenie k prijatej faktúre alebo
 * presun do Iných dokladov. Pri zamknutom bločku povie prečo nie.
 */
export function BlocekUhradaPas({
  blocek,
  zamok,
  onOtvor,
}: {
  blocek: RiadokBlocku;
  /** Text zámku (odovzdaný, zamknutý, uzavreté obdobie) alebo null. */
  zamok: string | null;
  onOtvor: (rezim: RezimPresunuBlocku) => void;
}) {
  const { t } = useT();
  if (!jeBlocekUhradou(blocek)) return null;
  const u = udajeUhradyBlocku(blocek);
  return (
    <div role="alert" className="dk-pozor mx-auto mb-3 max-w-6xl rounded-xl border p-3 text-sm">
      <p className="font-semibold">
        {u.cisloFaktury
          ? t("Vyzerá to ako úhrada faktúry {cislo}, nie bloček", { cislo: u.cisloFaktury })
          : t("Vyzerá to ako úhrada faktúry, nie bloček")}
      </p>
      <p className="mt-1 text-xs">
        {t(
          "Doklad len potvrdzuje, že faktúra bola zaplatená — nie je to nákup a DPH sa z neho neúčtuje. Ako bloček by sa náklad započítal druhýkrát.",
        )}
      </p>
      {zamok ? (
        <p className="mt-2 text-xs font-medium">{t(zamok)}</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onOtvor("faktura")}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary"
          >
            <Link2 className="h-3.5 w-3.5" /> {t("Priradiť k prijatej faktúre")}
          </button>
          <button
            type="button"
            onClick={() => onOtvor("ostatne")}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary"
          >
            <FileInput className="h-3.5 w-3.5" /> {t("Presunúť do Iných dokladov")}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Okno „Presunúť / priradiť“ bločku: k prijatej faktúre ako doklad o úhrade
 * (súbor medzi prílohy, nezaplatená faktúra sa označí ako uhradená), alebo
 * do Iných dokladov. Bloček potom ide do koša.
 */
export function BlocekPresunOkno({
  blocekId,
  companyId,
  mena,
  rezim: rezimNa,
  onClose,
}: {
  blocekId: string;
  companyId: string;
  mena?: string | null;
  rezim: RezimPresunuBlocku;
  onClose: () => void;
}) {
  const { t } = useT();
  useZatvorNaEscape(onClose);
  const navigate = useNavigate();
  const nacitajNavrh = useServerFn(navrhUhradyBlockuFn);
  const nacitaj = useServerFn(kandidatiUhradyFn);
  const prirad = useServerFn(priradBlocekKFaktureFn);
  const presun = useServerFn(presunBlocekDoOstatnychFn);
  const [rezim, setRezim] = useState<RezimPresunuBlocku>(rezimNa);
  const [navrh, setNavrh] = useState<{
    jeUhrada: boolean;
    uhrada: UdajeUhrady;
    zhody: ZhodaPrijatej[];
    zamok: Dovod | null;
  } | null>(null);
  const [hladaj, setHladaj] = useState<string | null>(null);
  const [zoznam, setZoznam] = useState<PrijataNaVyber[]>([]);
  const [vybrana, setVybrana] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    nacitajNavrh({ data: { id: blocekId } })
      .then((n: any) => {
        setNavrh(n);
        setZoznam(n.zhody.map((z: ZhodaPrijatej) => z.faktura as PrijataNaVyber));
        setVybrana(n.zhody[0]?.faktura.id ?? null);
        setHladaj(n.uhrada.cisloFaktury || "");
      })
      .catch((e: any) => toast.error(t(e?.message ?? "Nepodarilo sa")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocekId]);

  useEffect(() => {
    if (hladaj === null || !navrh) return;
    const casovac = setTimeout(() => {
      nacitaj({ data: { company_id: companyId, hladaj } })
        .then((r) => {
          const navrhnute = navrh.zhody.map((x) => x.faktura as PrijataNaVyber);
          const z = r as PrijataNaVyber[];
          setZoznam([...navrhnute, ...z.filter((x) => !navrhnute.some((n) => n.id === x.id))]);
        })
        .catch(() => undefined);
    }, 250);
    return () => clearTimeout(casovac);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hladaj, companyId, navrh]);

  const uhrada = navrh?.uhrada;
  const zhodaCisla = new Set((navrh?.zhody ?? []).filter((z) => z.cislo >= 2).map((z) => z.faktura.id));
  const vybranaFaktura = zoznam.find((x) => x.id === vybrana) ?? null;
  const menaBlocku = mena || "EUR";

  async function priradit() {
    if (!vybranaFaktura || !uhrada) return;
    let ajInuSumu = false;
    if (sumaSedi(uhrada.suma, vybranaFaktura.amount_total) === false) {
      // Suma nesedí — čiastočná úhrada alebo iná faktúra; rozhodne človek výslovne.
      if (
        !(await potvrd(
          t("Suma bločku {suma} nesedí so sumou faktúry {cislo} ({sumaFaktury}). Priradiť aj tak?", {
            suma: formatujMenu(uhrada.suma ?? 0, menaBlocku),
            cislo: vybranaFaktura.invoice_number ?? "",
            sumaFaktury: formatujMenu(vybranaFaktura.amount_total ?? 0, vybranaFaktura.currency ?? "EUR"),
          }),
          { potvrdit: t("Priradiť aj tak"), zrusit: t("Späť"), nebezpecne: true },
        ))
      )
        return;
      ajInuSumu = true;
    } else if (
      !(await potvrd(
        t(
          "Priložiť bloček k faktúre {cislo} ako doklad o úhrade? Nezaplatená faktúra sa označí ako uhradená a bloček sa presunie do koša (z DPH aj nákladov zmizne).",
          { cislo: vybranaFaktura.invoice_number ?? "" },
        ),
        { potvrdit: t("Priradiť") },
      ))
    )
      return;
    setBusy(true);
    try {
      const v = await prirad({ data: { id: blocekId, purchaseInvoiceId: vybranaFaktura.id, ajInuSumu } });
      if (v.uhradene) toast.success(t("Bloček je pri faktúre {cislo}, faktúra je uhradená", { cislo: v.cislo }));
      else {
        toast.success(t("Bloček je priložený k faktúre {cislo}", { cislo: v.cislo }));
        if (v.dovod) toast(t(v.dovod.text, v.dovod.params));
      }
      onClose();
      navigate({ to: "/prijate-faktury/$id", params: { id: v.purchaseInvoiceId } });
    } catch (e: any) {
      toast.error(t(String(e?.message ?? "Nepodarilo sa").replace(PREDPONA_INEJ_SUMY, "")));
    } finally {
      setBusy(false);
    }
  }

  async function presunut() {
    if (
      !(await potvrd(
        t(
          "Presunúť bloček do Iných dokladov? Vznikne Iný doklad s tým istým súborom, dodávateľom, dátumom a sumou a bloček sa presunie do koša (z DPH aj nákladov zmizne).",
        ),
        { potvrdit: t("Presunúť") },
      ))
    )
      return;
    setBusy(true);
    try {
      const v = await presun({ data: { id: blocekId } });
      toast.success(t("Bloček je presunutý do Iných dokladov"));
      onClose();
      navigate({ to: "/ostatne-doklady/novy", search: { id: v.id } as any });
    } catch (e: any) {
      toast.error(t(e?.message ?? "Nepodarilo sa"));
    } finally {
      setBusy(false);
    }
  }

  const zamknute = Boolean(navrh?.zamok);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dk-prekrytie p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Presunúť / priradiť bloček")}
        className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-xl border border-border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">{t("Presunúť / priradiť bloček")}</h2>
        <div className="mt-3 flex flex-wrap gap-1 text-sm">
          {(
            [
              ["faktura", "Priradiť k prijatej faktúre"],
              ["ostatne", "Presunúť do Iných dokladov"],
            ] as [RezimPresunuBlocku, string][]
          ).map(([k, n]) => (
            <button
              key={k}
              type="button"
              onClick={() => setRezim(k)}
              className={`rounded-md px-3 py-1.5 ${rezim === k ? "bg-primary text-primary-foreground" : "border border-border hover:bg-secondary"}`}
            >
              {t(n)}
            </button>
          ))}
        </div>

        {!navrh ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("Načítavam…")}
          </div>
        ) : navrh.zamok ? (
          <p role="status" className="dk-pozor mt-4 rounded-md border p-3 text-sm">
            {t(navrh.zamok.text, navrh.zamok.params)}
          </p>
        ) : null}

        {navrh && rezim === "faktura" ? (
          <div className="mt-3 text-sm">
            <p className="text-muted-foreground">
              {t(
                "Súbor bločku sa priloží k prijatej faktúre ako doklad o úhrade, nezaplatená faktúra sa označí ako uhradená a bloček sa presunie do koša.",
              )}
            </p>
            {uhrada ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {[
                  uhrada.cisloFaktury ? t("Faktúra č. {cislo}", { cislo: uhrada.cisloFaktury }) : t("Číslo faktúry na bločku nie je"),
                  uhrada.suma != null ? formatujMenu(uhrada.suma, menaBlocku) : null,
                  uhrada.datum ? datumNaDoklade(uhrada.datum) : null,
                  uhrada.sposob && SPOSOB[uhrada.sposob] ? t(SPOSOB[uhrada.sposob]!) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
            <input
              value={hladaj ?? ""}
              onChange={(e) => setHladaj(e.target.value)}
              placeholder={t("Hľadať číslo, dodávateľa alebo sumu…")}
              aria-label={t("Hľadať prijatú faktúru")}
              className="mt-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
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
                      disabled={busy || zamknute}
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
                disabled={busy || zamknute || !vybranaFaktura}
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
          </div>
        ) : null}

        {navrh && rezim === "ostatne" ? (
          <div className="mt-3 text-sm">
            <p className="text-muted-foreground">
              {t(
                "Z bločku vznikne Iný doklad (druh Iné) s tým istým súborom, dodávateľom, dátumom a sumou. Do DPH ani nákladov sa nepočíta. Bloček sa presunie do koša.",
              )}
            </p>
            <button
              type="button"
              disabled={busy || zamknute}
              onClick={() => void presunut()}
              className="mt-3 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileInput className="h-4 w-4" />}
              {t("Presunúť do Iných dokladov")}
            </button>
          </div>
        ) : null}

        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} className="rounded-md border border-border px-3 py-2 text-sm">
            {t("Zavrieť")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Odznak v zozname Bločkov pri bločku, ktorý vyzerá ako úhrada faktúry. */
export function UhradaFakturyOdznak({ blocek }: { blocek: RiadokBlocku }) {
  const { t } = useT();
  if (!jeBlocekUhradou(blocek)) return null;
  return (
    <span
      className="dk-pozor rounded-full border px-1.5 text-[11px] font-semibold"
      title={t("Vyzerá to ako úhrada faktúry, nie bloček — v detaile ho priraďte k prijatej faktúre alebo presuňte do Iných dokladov")}
    >
      {t("úhrada faktúry?")}
    </span>
  );
}

type PreskocenyBlocek = { popis: string; dovod: Dovod };

/**
 * Hromadné akcie v zozname Bločkov: „Priradiť úhrady k faktúram“ (len presná
 * jedinečná zhoda čísla a sumy) a „Presunúť do Iných dokladov“. Preskočené
 * bločky s dôvodom ukáže okno.
 */
export function BlocekUhradaHromadne({
  companyId,
  ids,
  onHotovo,
}: {
  companyId: string;
  ids: string[];
  onHotovo: () => void;
}) {
  const { t } = useT();
  const prirad = useServerFn(priradBlockyHromadneFn);
  const presun = useServerFn(presunBlockyDoOstatnychFn);
  const [busy, setBusy] = useState(false);
  const [vysledok, setVysledok] = useState<{ nadpis: string; preskocene: PreskocenyBlocek[] } | null>(null);
  useZatvorNaEscape(vysledok ? () => setVysledok(null) : null);

  async function priradit() {
    if (
      !(await potvrd(
        t(
          "Priradiť vybrané bločky ({n}) k prijatým faktúram ako doklady o úhrade? Súbor sa priloží k faktúre, nezaplatená faktúra sa označí ako uhradená a bloček sa presunie do koša. Bloček bez presnej zhody čísla a sumy sa preskočí.",
          { n: ids.length },
        ),
        { potvrdit: t("Priradiť") },
      ))
    )
      return;
    setBusy(true);
    try {
      const r = await prirad({ data: { company_id: companyId, ids } });
      const text = textSuhrnuBlockov(r.priradene, r.preskocene.length, "priradenie");
      if (r.priradene) toast.success(t(text.text, text.params));
      else toast(t(text.text, text.params));
      if (r.preskocene.length) setVysledok({ nadpis: t("Niektoré bločky sa nepriradili"), preskocene: r.preskocene });
      onHotovo();
    } catch (e: any) {
      toast.error(t(e?.message ?? "Nepodarilo sa"));
    } finally {
      setBusy(false);
    }
  }

  async function presunut() {
    if (
      !(await potvrd(
        t(
          "Presunúť vybrané bločky ({n}) do Iných dokladov? Z každého vznikne Iný doklad s tým istým súborom a bloček sa presunie do koša (z DPH aj nákladov zmizne). Odovzdané a zamknuté sa preskočia.",
          { n: ids.length },
        ),
        { potvrdit: t("Presunúť"), nebezpecne: true },
      ))
    )
      return;
    setBusy(true);
    try {
      const r = await presun({ data: { company_id: companyId, ids } });
      const text = textSuhrnuBlockov(r.presunute, r.preskocene.length, "presun");
      if (r.presunute) toast.success(t(text.text, text.params));
      else toast(t(text.text, text.params));
      if (r.preskocene.length) setVysledok({ nadpis: t("Niektoré bločky sa nepresunuli"), preskocene: r.preskocene });
      onHotovo();
    } catch (e: any) {
      toast.error(t(e?.message ?? "Nepodarilo sa"));
    } finally {
      setBusy(false);
    }
  }

  const tlacidlo =
    "inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-secondary disabled:opacity-50";
  return (
    <>
      <button type="button" disabled={busy} onClick={() => void priradit()} className={tlacidlo}>
        <Link2 className="h-4 w-4" /> {t("Priradiť úhrady k faktúram")} ({ids.length})
      </button>
      <button type="button" disabled={busy} onClick={() => void presunut()} className={tlacidlo}>
        <FileInput className="h-4 w-4" /> {t("Presunúť do Iných dokladov")} ({ids.length})
      </button>
      {vysledok ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dk-prekrytie p-4" onClick={() => setVysledok(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={vysledok.nadpis}
            className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">{vysledok.nadpis}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("Preskočené bločky ostali v Bločkoch — otvorte ich a rozhodnite v detaile.")}
            </p>
            <ul className="mt-3 max-h-[50vh] space-y-2 overflow-y-auto text-sm">
              {vysledok.preskocene.map((p, i) => (
                <li key={i} className="rounded-md border border-border p-2">
                  <div className="font-medium">{p.popis}</div>
                  <div className="text-xs text-muted-foreground">{t(p.dovod.text, p.dovod.params)}</div>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setVysledok(null)}
                className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
              >
                {t("Zavrieť")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
