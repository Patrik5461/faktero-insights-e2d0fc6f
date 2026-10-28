import { popisRoly } from "@/lib/faktero/rola-popis";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { CreateCompanyDialog } from "@/components/faktero/CreateCompanyDialog";
import { getActiveCompanyId, setActiveCompanyId } from "@/lib/faktero/active-company";
import { Plus, Check, Trash2, Search, Inbox } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { zmazFirmuFn } from "@/lib/faktero/firma-zmazanie.functions";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { preloz, lokalJazyka } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";
import { HLADANIE_OD } from "@/lib/faktero/hladanie-firiem";
import { citajPosledneFirmy, zoradFirmy } from "@/lib/faktero/poradie-firiem";
import { riadkyPreIds } from "@/lib/faktero/strankovanie";
import { AvatarFirmy } from "@/components/faktero/PrepinacFiriem";

export const Route = createFileRoute("/_authenticated/firmy")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk ?? "sk", "Správa firiem — Faktero") }],
  }),
  component: CompanyManagementPage,
});

type Row = { id: string; name: string; ico: string | null; role: string; created_at: string };

function CompanyManagementPage() {
  const { t, jazyk } = useT();
  const datum = (d: string) => new Date(d).toLocaleDateString(lokalJazyka(jazyk));
  const [rows, setRows] = useState<Row[] | null>(null);
  const [activeId, setAid] = useState<string | null>(getActiveCompanyId());
  const [open, setOpen] = useState(false);
  const [mazem, setMazem] = useState<Row | null>(null);
  const zmazFirmu = useServerFn(zmazFirmuFn);
  const [hladanie, setHladanie] = useState("");
  const [rola, setRola] = useState("");
  const [posledne] = useState(citajPosledneFirmy);
  /** Nespracované doklady a neskontrolované bločky po firmách; `null` = ešte sa načítava alebo sa nedalo. */
  const [nespracovane, setNespracovane] = useState<Map<string, number> | null>(null);

  async function load() {
    // Bez filtra na seba vráti RLS aj členstvá kolegov a firma sa v zozname
    // zopakuje toľkokrát, koľko má členov.
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { data, error } = await supabase
      .from("company_users")
      .select("role, company:companies(id, name, ico, created_at)")
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: true });
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows(
      (data ?? []).map((r: any) => ({
        role: r.role,
        id: r.company.id,
        name: r.company.name,
        ico: r.company.ico ?? null,
        created_at: r.company.created_at,
      })),
    );
  }

  useEffect(() => {
    load();
  }, []);

  /*
    Počet nespracovaných pri každej firme — to isté číslo, aké ukazuje menu
    pri Nespracovaných (doklady v Nespracovaných + nové bločky). Takých riadkov
    je málo, tak sa načítajú len stĺpce `company_id` pre všetky firmy naraz
    namiesto dvoch dotazov na každú firmu.
  */
  useEffect(() => {
    if (!rows?.length) return;
    let zrusene = false;
    const ids = rows.map((r) => r.id);
    (async () => {
      const [a, b] = await Promise.all([
        riadkyPreIds<{ company_id: string }>(
          ids,
          (kus, od, po) =>
            supabase
              .from("nespracovane_doklady" as any)
              .select("id, company_id")
              .in("company_id", kus)
              .order("id")
              .range(od, po) as any,
        ),
        riadkyPreIds<{ company_id: string }>(
          ids,
          (kus, od, po) =>
            supabase
              .from("expense_documents")
              .select("id, company_id")
              .in("company_id", kus)
              .eq("status", "new")
              .order("id")
              .range(od, po) as any,
        ),
      ]);
      const pocty = new Map<string, number>();
      for (const r of [...a, ...b]) pocty.set(r.company_id, (pocty.get(r.company_id) ?? 0) + 1);
      if (!zrusene) setNespracovane(pocty);
    })().catch(() => {
      // Počty sú len pomôcka — bez nich sa stĺpec nezobrazí.
    });
    return () => {
      zrusene = true;
    };
  }, [rows]);

  const roly = useMemo(() => [...new Set((rows ?? []).map((r) => r.role))], [rows]);
  const zobrazene = useMemo(() => {
    const podlaRoly = (rows ?? []).filter((r) => !rola || r.role === rola);
    return zoradFirmy(podlaRoly, hladanie, activeId, posledne).vsetky;
  }, [rows, rola, hladanie, activeId, posledne]);
  const sNastrojmi = (rows?.length ?? 0) >= HLADANIE_OD;

  /**
   * Po zmazaní firmy sa treba prepnúť inam — inak by celá aplikácia ukazovala
   * na firmu, ktorá už neexistuje, a každá stránka by skončila prázdna.
   */
  async function poZmazani(zmazana: Row) {
    setMazem(null);
    toast.success(t("Firma {nazov} je zmazaná.", { nazov: zmazana.name }));
    if (zmazana.id === activeId) {
      const ina = (rows ?? []).find((r) => r.id !== zmazana.id);
      if (ina) {
        setActiveCompanyId(ina.id);
        window.location.assign("/dashboard");
        return;
      }
    }
    await load();
  }

  function switchTo(id: string, kam = "/dashboard") {
    setActiveCompanyId(id);
    setAid(id);
    toast.success(t("Firma prepnutá"));
    window.location.assign(kam);
  }

  /** Počet nespracovaných ako odkaz — prepne do firmy rovno na Nespracované. */
  const pocetNespracovanych = (r: Row) => {
    if (!nespracovane) return <span className="text-muted-foreground">…</span>;
    const n = nespracovane.get(r.id) ?? 0;
    if (!n) return <span className="text-muted-foreground">0</span>;
    return (
      <button
        type="button"
        onClick={() => switchTo(r.id, "/nespracovane")}
        title={t("Otvoriť Nespracované v tejto firme")}
        className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-500/25 dark:text-amber-300"
      >
        <Inbox className="h-3 w-3" /> {n}
      </button>
    );
  };

  const nazovFirmy = (r: Row) =>
    r.id === activeId ? (
      <span className="min-w-0 break-words font-medium">{r.name}</span>
    ) : (
      <button
        type="button"
        onClick={() => switchTo(r.id)}
        className="min-w-0 break-words text-left font-medium hover:text-primary hover:underline"
      >
        {r.name}
      </button>
    );

  const akcie = (r: Row) => (
    <div className="inline-flex flex-wrap justify-end gap-2">
      {r.id !== activeId && (
        <button
          onClick={() => switchTo(r.id)}
          className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-secondary"
        >
          {t("Prepnúť")}
        </button>
      )}
      <a
        href="/firma"
        className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-secondary"
      >
        {t("Upraviť")}
      </a>
      {/* Pozvánky žijú v nastaveniach firmy — tu bolo roky
          zašednuté tlačidlo s poznámkou „Onedlho". */}
      <Link
        to="/firma"
        className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
      >
        {t("Pozvať")}
      </Link>
      {/* Skúšobná firma sa dala doteraz len založiť. Mazať smie
          majiteľ a len keď mu ostane iná — poslednú firmu rieši
          zrušenie účtu, ktoré má odklad. */}
      {r.role === "owner" && (rows?.length ?? 0) > 1 && (
        <button
          onClick={() => setMazem(r)}
          className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5" /> {t("Zmazať")}
        </button>
      )}
    </div>
  );

  return (
    <>
      <PageHeader
        title={t("Správa firiem")}
        description={t("Firmy, ku ktorým máte prístup.")}
        action={
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> {t("Pridať firmu")}
          </button>
        }
      />
      <PageBody>
        {/* Pri desiatkach firiem (účtovná kancelária) hľadanie a filter podľa roly. */}
        {sNastrojmi && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 basis-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                value={hladanie}
                onChange={(e) => setHladanie(e.target.value)}
                onKeyDown={(e) => {
                  // Jediná nájdená firma — Enter do nej prepne.
                  if (e.key === "Enter" && zobrazene.length === 1 && zobrazene[0].id !== activeId)
                    switchTo(zobrazene[0].id);
                  if (e.key === "Escape") setHladanie("");
                }}
                placeholder={t("Hľadať firmu alebo IČO…")}
                aria-label={t("Hľadať firmu")}
                className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm"
              />
            </div>
            {roly.length > 1 && (
              <select
                value={rola}
                onChange={(e) => setRola(e.target.value)}
                aria-label={t("Rola")}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">{t("Všetky roly")}</option>
                {roly.map((r) => (
                  <option key={r} value={r}>
                    {t(popisRoly(r))}
                  </option>
                ))}
              </select>
            )}
            <span className="text-xs text-muted-foreground">
              {t("Zobrazené {n} z {spolu}", { n: zobrazene.length, spolu: rows?.length ?? 0 })}
            </span>
          </div>
        )}
        {/* Mobil: karty — stĺpec Akcie bol mimo obrazovky. */}
        <div className="space-y-2 md:hidden">
          {rows === null && (
            <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              {t("Načítavam…")}
            </div>
          )}
          {rows?.length === 0 && (
            <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              {t("Žiadne firmy.")}
            </div>
          )}
          {rows && rows.length > 0 && zobrazene.length === 0 && (
            <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              {t("Nič sa nenašlo.")}
            </div>
          )}
          {zobrazene.map((r) => (
            <div key={r.id} className="rounded-xl border border-border bg-card p-4 text-sm">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <AvatarFirmy nazov={r.name} />
                {nazovFirmy(r)}
                {r.id === activeId && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    <Check className="h-3 w-3" /> {t("Aktívna")}
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-muted-foreground">
                {r.ico && <span>{t("IČO {ico}", { ico: r.ico })} ·</span>}
                <span>
                  {t(popisRoly(r.role))} · {t("vytvorené")} {datum(r.created_at)}
                </span>
                {nespracovane && (nespracovane.get(r.id) ?? 0) > 0 && (
                  <span className="ml-1">{pocetNespracovanych(r)}</span>
                )}
              </div>
              <div className="mt-3 flex justify-start [&>div]:justify-start">{akcie(r)}</div>
            </div>
          ))}
        </div>
        <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">{t("Firma")}</th>
                <th className="px-4 py-3">{t("IČO")}</th>
                <th className="px-4 py-3">{t("Rola")}</th>
                <th className="px-4 py-3">{t("Nespracované")}</th>
                <th className="px-4 py-3">{t("Vytvorené")}</th>
                <th className="px-4 py-3 text-right">{t("Akcie")}</th>
              </tr>
            </thead>
            <tbody>
              {rows === null && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                    {t("Načítavam…")}
                  </td>
                </tr>
              )}
              {rows?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                    {t("Žiadne firmy.")}
                  </td>
                </tr>
              )}
              {rows && rows.length > 0 && zobrazene.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                    {t("Nič sa nenašlo.")}
                  </td>
                </tr>
              )}
              {zobrazene.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <AvatarFirmy nazov={r.name} />
                      {nazovFirmy(r)}
                      {r.id === activeId && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                          <Check className="h-3 w-3" /> {t("Aktívna")}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{r.ico ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t(popisRoly(r.role))}</td>
                  <td className="px-4 py-3">{pocetNespracovanych(r)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{datum(r.created_at)}</td>
                  <td className="px-4 py-3 text-right">{akcie(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageBody>
      <CreateCompanyDialog open={open} onOpenChange={setOpen} onCreated={load} />
      {mazem && (
        <ZmazanieFirmyDialog
          firma={mazem}
          onClose={() => setMazem(null)}
          onZmazat={async (potvrdenie) => {
            await zmazFirmu({ data: { company_id: mazem.id, potvrdenie } });
            await poZmazani(mazem);
          }}
        />
      )}
    </>
  );
}

/**
 * Zmazanie firmy je nevratné a berie so sebou doklady, sklad aj prílohy —
 * preto sa názov prepisuje ručne. Server ho kontroluje ešte raz.
 */
function ZmazanieFirmyDialog({
  firma,
  onClose,
  onZmazat,
}: {
  firma: Row;
  onClose: () => void;
  onZmazat: (potvrdenie: string) => Promise<void>;
}) {
  const { t } = useT();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  useZatvorNaEscape(onClose);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Zmazať firmu {nazov}", { nazov: firma.name })}
        className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold">
          {t("Zmazať firmu {nazov}?", { nazov: firma.name })}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t(
            "Zmažú sa všetky doklady, sklad, jazdy aj prílohy tejto firmy. Vrátiť sa to nedá. Ak si to chcete nechať, firmu len prestaňte používať.",
          )}
        </p>
        <label className="mt-4 block text-xs font-medium text-muted-foreground">
          {t("Prepíšte názov firmy")}
        </label>
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={firma.name}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            {t("Späť")}
          </button>
          <button
            disabled={busy || text.trim() !== firma.name.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await onZmazat(text);
              } catch (e: any) {
                toast.error(e?.message ?? t("Firmu sa nepodarilo zmazať."));
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-md bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy ? t("Mažem…") : t("Zmazať natrvalo")}
          </button>
        </div>
      </div>
    </div>
  );
}
