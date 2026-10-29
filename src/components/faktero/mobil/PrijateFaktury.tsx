import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { vsPrijatej } from "@/lib/faktero/variabilny-symbol";
import { toast } from "sonner";
import { CheckCircle2, FileText, Landmark, Plus, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { potvrd } from "@/lib/potvrdenie";
import {
  dniPoSplatnosti,
  stavUhradyPrijatej,
  zalohaPrijatej,
  zostaneKUhrade,
  type UhradaPrijatej,
} from "@/lib/faktero/uhrady-prijatej";
import { splatnostKluc, sumaZPolicka } from "@/lib/mobile/doklad-oznacenie";
import { usePreklad } from "@/lib/mobile/preklady/hook";
import { MobilObrazovka, Pracujem } from "./MobilChrome";
import { OznacenieDokladu, PoznamkaDokladu } from "./DokladOznacenie";
import { datum } from "./PrijateDoklady";
import {
  Card,
  FilterChips,
  ListCard,
  ListRow,
  PrazdnyStav,
  SectionHeader,
  StatusBadge,
  suma,
  type Ton,
} from "./ui";

/**
 * Prijaté faktúry v telefóne — stav úhrady (zostáva, dni po splatnosti) a
 * pridanie úhrady, aj čiastočnej. To isté ako karta Úhrady na webe
 * (`UhradyPrijatej.tsx`): úhrady sú riadky `purchase_invoice_payments`,
 * stav faktúry z nich prepočíta spúšťač v databáze. Zapisuje sa klientom
 * prihláseného, takže platia tie isté politiky RLS ako na webe.
 */

type Faktura = {
  id: string;
  company_id: string;
  invoice_number: string | null;
  variable_symbol: string | null;
  supplier_name: string | null;
  supplier_ico: string | null;
  issue_date: string | null;
  due_date: string | null;
  amount_total: number | string | null;
  currency: string | null;
  status: string | null;
  type: string | null;
  payment_date: string | null;
  payment_method: string | null;
  advance_invoice_id: string | null;
  note: string | null;
  komentar: string | null;
  stav_id: string | null;
  stitky: string[] | null;
  exported_at: string | null;
  locked_at: string | null;
};

const STLPCE =
  "id, company_id, invoice_number, variable_symbol, supplier_name, supplier_ico, issue_date, due_date, amount_total, currency, status, type, payment_date, payment_method, advance_invoice_id, note, komentar, stav_id, stitky, exported_at, locked_at";

type Filter = "vsetky" | "neuhradene" | "poSplatnosti";

/** Uhrádza sa len platná faktúra — koncept ani storno nie. */
const daSaPlatit = (f: { status: string | null }) =>
  f.status !== "cancelled" && f.status !== "draft";

const dnesIso = () => new Date().toLocaleDateString("sv-SE");

export function PrijateFaktury({
  firma,
  onSpat,
  prepinac,
}: {
  firma: { id: string; name: string };
  onSpat: () => void;
  /** Prepínač Bločky | Prijaté faktúry nad zoznamom. */
  prepinac?: ReactNode;
}) {
  const { t, locale: loc } = usePreklad();
  const [faktury, setFaktury] = useState<Faktura[] | null>(null);
  /** Súčet úhrad neuhradených faktúr — na „čiastočne uhradená“ v zozname. */
  const [uhradene, setUhradene] = useState<Record<string, number>>({});
  const [nedostupne, setNedostupne] = useState(false);
  const [hladanie, setHladanie] = useState("");
  const [filter, setFilter] = useState<Filter>("vsetky");
  const [otvorena, setOtvorena] = useState<Faktura | null>(null);

  const obnov = useCallback(async () => {
    const { data, error } = await supabase
      .from("purchase_invoices")
      .select(STLPCE)
      .eq("company_id", firma.id)
      .is("deleted_at", null)
      .order("issue_date", { ascending: false, nullsFirst: false })
      .limit(300)
      .then(
        (r) => r,
        (e) => ({ data: null, error: e }),
      );
    if (error || !data) {
      const { isOnline } = await import("@/lib/mobile/offline-queue");
      const online = await isOnline();
      setNedostupne(!online);
      if (online) toast.error(error?.message ?? t("pf.chybaNacitania"));
      setFaktury([]);
      return;
    }
    const rows = data as unknown as Faktura[];
    setFaktury(rows);
    // Úhrady len pre neuhradené — zaplatená ani storno čiastočná byť nemôže.
    const ids = rows
      .filter((r) => r.status !== "paid" && daSaPlatit(r))
      .map((r) => r.id)
      .slice(0, 150);
    if (!ids.length) return setUhradene({});
    const { data: u } = await supabase
      .from("purchase_invoice_payments")
      .select("purchase_invoice_id, amount")
      .in("purchase_invoice_id", ids)
      .then(
        (r) => r,
        () => ({ data: null }),
      );
    const sucty: Record<string, number> = {};
    for (const x of (u ?? []) as { purchase_invoice_id: string; amount: number }[])
      sucty[x.purchase_invoice_id] = (sucty[x.purchase_invoice_id] ?? 0) + Number(x.amount || 0);
    setUhradene(sucty);
  }, [firma.id, t]);

  useEffect(() => {
    void obnov();
  }, [obnov]);

  const zobrazene = useMemo(() => {
    const q = hladanie.trim().toLowerCase();
    return (faktury ?? []).filter((f) => {
      if (
        q &&
        ![f.supplier_name, f.invoice_number, f.variable_symbol, f.supplier_ico]
          .filter(Boolean)
          .some((x) => String(x).toLowerCase().includes(q))
      )
        return false;
      if (filter === "vsetky") return true;
      if (f.status === "paid" || !daSaPlatit(f)) return false;
      if (filter === "poSplatnosti") return (dniPoSplatnosti(f.due_date) ?? 0) > 0;
      return true;
    });
  }, [faktury, hladanie, filter]);

  if (otvorena) {
    return (
      <DetailPrijatej
        faktura={otvorena}
        onSpat={() => {
          setOtvorena(null);
          void obnov();
        }}
        onZmena={(z) => {
          setOtvorena((o) => (o ? { ...o, ...z } : o));
          setFaktury((f) => f?.map((x) => (x.id === otvorena.id ? { ...x, ...z } : x)) ?? f);
        }}
      />
    );
  }

  if (faktury === null) return <Pracujem text={t("pf.nacitavam")} />;

  return (
    <MobilObrazovka title={t("pd.nazov")} subtitle={firma.name} onBack={onSpat}>
      {prepinac}
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-text-2" />
        <input
          value={hladanie}
          onChange={(e) => setHladanie(e.target.value)}
          placeholder={t("pf.hladat")}
          className="w-full rounded-app border border-app-ramik bg-app-karta py-3 pl-9 pr-3 text-[15px] shadow-app"
        />
      </div>
      <div className="mb-4">
        <FilterChips
          ariaLabel={t("pf.filter")}
          aktivna={filter}
          onZmen={setFilter}
          moznosti={[
            { kod: "vsetky", popis: t("pf.filterVsetky") },
            { kod: "neuhradene", popis: t("pf.filterNeuhradene") },
            { kod: "poSplatnosti", popis: t("pf.filterPoSplatnosti") },
          ]}
        />
      </div>

      {zobrazene.length === 0 ? (
        <PrazdnyStav
          icon={FileText}
          title={
            nedostupne
              ? t("pf.bezPripojenia")
              : hladanie || filter !== "vsetky"
                ? t("pd.nicSaNenaslo")
                : t("pf.ziadne")
          }
          popis={nedostupne || hladanie || filter !== "vsetky" ? undefined : t("pf.ziadnePopis")}
        />
      ) : (
        <ListCard>
          {zobrazene.map((f) => {
            const s = stitokZoznamu(f, uhradene[f.id] ?? 0);
            return (
              <ListRow
                key={f.id}
                onClick={() => setOtvorena(f)}
                title={f.supplier_name ?? t("pf.bezDodavatela")}
                subtitle={[f.invoice_number, datum(f.due_date ?? f.issue_date, loc)]
                  .filter(Boolean)
                  .join(" · ")}
                right={suma(f.amount_total, f.currency, loc)}
                rightSub={s ? <StatusBadge text={t(s.kluc)} ton={s.ton} /> : undefined}
              />
            );
          })}
        </ListCard>
      )}
    </MobilObrazovka>
  );
}

/** Štítok v zozname: uhradená, čiastočne, po splatnosti — bez načítania úhrad každej faktúry. */
function stitokZoznamu(
  f: Faktura,
  uhradeneSpolu: number,
): {
  kluc: "pf.uhradena" | "pf.ciastocne" | "pf.filterPoSplatnosti" | "pf.zalohova";
  ton: Ton;
} | null {
  if (!daSaPlatit(f)) return null;
  const s = stavUhradyPrijatej({
    amount_total: f.amount_total,
    status: f.status,
    uhrady: uhradeneSpolu ? [{ id: "", amount: uhradeneSpolu, paid_at: "" }] : [],
  });
  if (f.status === "paid" || s.stav === "uhradena") return { kluc: "pf.uhradena", ton: "zelena" };
  if ((dniPoSplatnosti(f.due_date) ?? 0) > 0)
    return { kluc: "pf.filterPoSplatnosti", ton: "cervena" };
  if (s.stav === "ciastocne") return { kluc: "pf.ciastocne", ton: "neutral" };
  if (f.type === "proforma") return { kluc: "pf.zalohova", ton: "neutral" };
  return null;
}

/* ------------------------- Detail ------------------------- */

function DetailPrijatej({
  faktura: f,
  onSpat,
  onZmena,
}: {
  faktura: Faktura;
  onSpat: () => void;
  onZmena: (z: Partial<Faktura>) => void;
}) {
  const { t, mnozne, locale: loc } = usePreklad();
  const mena = f.currency ?? "EUR";
  const [uhrady, setUhrady] = useState<UhradaPrijatej[]>([]);
  const [zaloha, setZaloha] = useState(0);
  const [nacitane, setNacitane] = useState(false);
  const [formular, setFormular] = useState(false);
  const [sumaText, setSumaText] = useState("");
  const [den, setDen] = useState(dnesIso());
  const [pracujem, setPracujem] = useState(false);

  const nacitaj = useCallback(async () => {
    const [u, z, h] = await Promise.all([
      supabase
        .from("purchase_invoice_payments")
        .select("id, amount, paid_at, currency, zdroj, bank_transaction_id, note")
        .eq("purchase_invoice_id", f.id)
        .order("paid_at", { ascending: true })
        .then(
          (r) => r,
          () => ({ data: null }),
        ),
      f.advance_invoice_id
        ? supabase
            .from("purchase_invoices")
            .select("amount_total, status")
            .eq("id", f.advance_invoice_id)
            .maybeSingle()
            .then(
              (r) => r,
              () => ({ data: null }),
            )
        : Promise.resolve({ data: null as any }),
      // Stav faktúry prepočíta spúšťač — po úhrade sa treba dopýtať na nový.
      supabase
        .from("purchase_invoices")
        .select("status, payment_date")
        .eq("id", f.id)
        .maybeSingle()
        .then(
          (r) => r,
          () => ({ data: null }),
        ),
    ]);
    setUhrady(((u as any).data ?? []) as UhradaPrijatej[]);
    const zd = (z as any).data;
    setZaloha(zalohaPrijatej((f as any).advance_amount, zd?.status === "paid" ? Number(zd.amount_total ?? 0) : 0));
    const hd = (h as any).data;
    if (hd && (hd.status !== f.status || hd.payment_date !== f.payment_date))
      onZmena({ status: hd.status, payment_date: hd.payment_date });
    setNacitane(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.id, f.advance_invoice_id]);

  useEffect(() => {
    void nacitaj();
  }, [nacitaj]);

  const stav = stavUhradyPrijatej({
    amount_total: f.amount_total,
    status: f.status,
    uhrady,
    zaloha,
  });
  const dni = dniPoSplatnosti(f.due_date);
  const uhradena = stav.stav === "uhradena";
  const platit = daSaPlatit(f);
  const splatnost = !uhradena ? splatnostKluc(dni) : null;
  const dniText = (n: number) =>
    `${n} ${mnozne(n, { one: t("spolocne.den1"), few: t("spolocne.den2"), other: t("spolocne.den5") })}`;
  const poSplatnosti = platit && !uhradena && (dni ?? 0) > 0;

  async function pridaj(sumaUhrady: number, zdroj: "rucne" | "oznacenie", datumUhrady: string) {
    if (!(sumaUhrady > 0)) return toast.error(t("pf.zadajteSumu"));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datumUhrady)) return toast.error(t("pf.zadajteDatum"));
    setPracujem(true);
    const { error } = await supabase
      .from("purchase_invoice_payments")
      .insert({
        company_id: f.company_id,
        purchase_invoice_id: f.id,
        amount: sumaUhrady,
        paid_at: datumUhrady,
        currency: mena,
        method: f.payment_method ?? null,
        zdroj,
      })
      .then(
        (r) => r,
        (e) => ({ error: e }),
      );
    setPracujem(false);
    if (error) return toast.error(error.message ?? t("dk.chybaUlozenia"));
    toast.success(zdroj === "oznacenie" ? t("pf.oznacenaUhradena") : t("pf.uhradaPridana"));
    setFormular(false);
    await nacitaj();
  }

  async function zmaz(u: UhradaPrijatej) {
    if (u.bank_transaction_id) return;
    if (
      !(await potvrd(t("pf.zmazatUhraduOtazka"), {
        potvrdit: t("pd.zmazatKratke"),
        zrusit: t("spolocne.zrusit"),
        nebezpecne: true,
      }))
    )
      return;
    const { error } = await supabase
      .from("purchase_invoice_payments")
      .delete()
      .eq("id", u.id)
      .then(
        (r) => r,
        (e) => ({ error: e }),
      );
    if (error) return toast.error(error.message ?? t("dk.chybaUlozenia"));
    toast.success(t("pf.uhradaZmazana"));
    await nacitaj();
  }

  const riadok = (popis: string, hodnota: number, silne?: boolean) => (
    <div className="flex items-center justify-between gap-3 py-0.5 text-[14px]">
      <span className="min-w-0 text-app-text-2">{popis}</span>
      <span className={`tabular-nums ${silne ? "font-semibold" : ""}`}>
        {suma(hodnota, mena, loc)}
      </span>
    </div>
  );

  return (
    <MobilObrazovka
      title={f.supplier_name ?? t("pf.bezDodavatela")}
      subtitle={f.invoice_number ?? undefined}
      onBack={onSpat}
    >
      <div className="space-y-4">
        {/* Karta úhrady — pruh hore podľa stavu ako na webe. */}
        <Card className="overflow-hidden">
          <div
            className={`h-1.5 ${uhradena ? "bg-app-zelena-plocha" : poSplatnosti ? "bg-app-chyba" : "bg-app-ramik"}`}
          />
          <div className="space-y-2 p-4">
            <div className="text-[30px] font-bold leading-none tabular-nums">
              {suma(f.amount_total, mena, loc)}
            </div>
            {f.due_date && (
              <div
                className={`text-[14px] ${poSplatnosti ? "font-medium text-app-chyba" : "text-app-text-2"}`}
              >
                {t("pf.splatna", { datum: datum(f.due_date, loc) })}
                {platit && splatnost
                  ? ` · ${t(splatnost.kluc, { dni: dniText(splatnost.n) })}`
                  : ""}
              </div>
            )}
            {!platit ? null : uhradena ? (
              <div className="flex items-center gap-1.5 text-[16px] font-semibold text-app-zelena">
                <CheckCircle2 className="h-5 w-5" />
                {f.payment_date
                  ? t("pf.uhradenaDna", { datum: datum(f.payment_date, loc) })
                  : t("pf.uhradena")}
              </div>
            ) : nacitane ? (
              <div>
                <div className="text-[13px] text-app-text-2">{t("pf.zostava")}</div>
                <div className="text-[22px] font-semibold tabular-nums">
                  {suma(stav.zostava, mena, loc)}
                </div>
                {stav.stav === "ciastocne" && (
                  <div className="text-[13px] text-app-text-2">
                    {t("pf.ciastocneSuma", { suma: suma(stav.uhradene, mena, loc) })}
                  </div>
                )}
              </div>
            ) : null}
            {stav.preplatene > 0 && (
              <div className="text-[13px] text-app-chyba">
                {t("pf.preplatena", { suma: suma(stav.preplatene, mena, loc) })}
              </div>
            )}
            {platit && nacitane && !uhradena && !formular && (
              <div className="grid grid-cols-1 gap-2 pt-1">
                <button
                  disabled={pracujem}
                  onClick={() => void pridaj(stav.zostava, "oznacenie", dnesIso())}
                  className="flex min-h-[48px] items-center justify-center gap-2 rounded-app-sm bg-app-zelena-plocha px-4 text-[15px] font-medium text-white disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" /> {t("pf.oznacitUhradenu")}
                </button>
                <button
                  disabled={pracujem}
                  onClick={() => {
                    setSumaText(stav.zostava ? stav.zostava.toFixed(2).replace(".", ",") : "");
                    setDen(dnesIso());
                    setFormular(true);
                  }}
                  className="flex min-h-[48px] items-center justify-center gap-2 rounded-app-sm border border-app-ramik px-4 text-[15px] font-medium disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" /> {t("pf.pridatUhradu")}
                </button>
              </div>
            )}
          </div>
        </Card>

        {formular && (
          <Card className="p-4">
            <div className="rounded-app-sm bg-app-pozadie px-3 py-2">
              {riadok(t("pf.celkom"), stav.celkom)}
              {stav.zaloha > 0 ? riadok(t("pf.odpocetZalohy"), -stav.zaloha) : null}
              {riadok(t("pf.uzUhradene"), stav.uhradene)}
              <div className="mt-1 border-t border-app-ramik pt-1">
                {riadok(
                  t("pf.zostane"),
                  zostaneKUhrade(stav.zostava, sumaZPolicka(sumaText)),
                  true,
                )}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 [&>*]:min-w-0">
              <label className="block">
                <span className="mb-1 block text-[12px] text-app-text-2">
                  {t("pf.datumUhrady")}
                </span>
                <input
                  type="date"
                  value={den}
                  onChange={(e) => setDen(e.target.value)}
                  className="min-h-[44px] w-full min-w-0 rounded-app-sm border border-app-ramik bg-app-karta px-2 text-[15px]"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] text-app-text-2">
                  {t("pf.sumaUhrady", { mena })}
                </span>
                <input
                  inputMode="decimal"
                  value={sumaText}
                  onChange={(e) => setSumaText(e.target.value)}
                  className="min-h-[44px] w-full min-w-0 rounded-app-sm border border-app-ramik bg-app-karta px-3 text-right text-[15px] tabular-nums"
                />
              </label>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => setFormular(false)}
                className="min-h-[48px] rounded-app-sm border border-app-ramik px-4 text-[15px]"
              >
                {t("spolocne.zrusit")}
              </button>
              <button
                disabled={pracujem}
                onClick={() => void pridaj(sumaZPolicka(sumaText), "rucne", den)}
                className="min-h-[48px] rounded-app-sm bg-app-zelena-plocha px-4 text-[15px] font-medium text-white disabled:opacity-50"
              >
                {t("pf.pridatUhradu")}
              </button>
            </div>
          </Card>
        )}

        {platit && uhrady.length > 0 && (
          <div>
            <SectionHeader title={t("pf.uhrady")} />
            <ListCard>
              {uhrady.map((u) => (
                <div key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                  <span className="text-[14px] tabular-nums">{datum(u.paid_at, loc)}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-app-text-2">
                    {u.bank_transaction_id
                      ? t("pf.zBanky")
                      : u.zdroj === "oznacenie"
                        ? t("pf.oznacena")
                        : t("pf.rucne")}
                  </span>
                  <span className="text-[14px] font-medium tabular-nums">
                    {suma(u.amount, u.currency ?? mena, loc)}
                  </span>
                  {u.bank_transaction_id ? (
                    <span className="p-2 text-app-text-2" title={t("pf.uhradaZBankyNapoveda")}>
                      <Landmark className="h-4 w-4" />
                    </span>
                  ) : (
                    <button
                      onClick={() => void zmaz(u)}
                      aria-label={t("pf.zmazatUhradu")}
                      className="grid h-9 w-9 place-items-center rounded-full text-app-text-2 active:bg-app-ramik"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </ListCard>
          </div>
        )}

        <Card className="space-y-2 p-4 text-[14px]">
          <Riadok label={t("pd.ico")} value={f.supplier_ico ?? "—"} />
          <Riadok label={t("pf.cislo")} value={f.invoice_number ?? "—"} />
          <Riadok label={t("pf.vs")} value={vsPrijatej(f) || "—"} />
          <Riadok label={t("pf.datumVystavenia")} value={datum(f.issue_date, loc)} />
        </Card>

        <PoznamkaDokladu
          tabulka="purchase_invoices"
          id={f.id}
          firmaId={f.company_id}
          agenda="prijata_faktura"
          poznamka={f.note}
          zamknute={!!(f.exported_at || f.locked_at)}
          onZmena={(note) => onZmena({ note })}
        />
        <OznacenieDokladu
          tabulka="purchase_invoices"
          firmaId={f.company_id}
          doklad={f}
          onZmena={onZmena}
        />
      </div>
    </MobilObrazovka>
  );
}

function Riadok({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-app-text-2">{label}</span>
      <span className="min-w-0 break-words text-right font-medium">{value}</span>
    </div>
  );
}
