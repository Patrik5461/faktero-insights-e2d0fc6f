import { popisRoly } from "@/lib/faktero/rola-popis";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { CreateCompanyDialog } from "@/components/faktero/CreateCompanyDialog";
import { getActiveCompanyId, setActiveCompanyId } from "@/lib/faktero/active-company";
import {
  Plus,
  Check,
  Trash2,
  Search,
  Inbox,
  Landmark,
  Receipt,
  FileWarning,
  Mail,
  Send,
} from "lucide-react";
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
import { RozdelovacMailov } from "@/components/faktero/RozdelovacMailov";
import {
  ODKAZY_PREHLADU,
  STITOK_EFAKTURY,
  kusy,
  stavBanky,
  stavZRiadku,
  ukazatEfakturu,
  type StavFirmy,
  type Ton,
} from "@/lib/faktero/prehlad-firiem";

export const Route = createFileRoute("/_authenticated/firmy")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk ?? "sk", "Správa firiem — Faktero") }],
  }),
  component: CompanyManagementPage,
});

type Row = {
  id: string;
  name: string;
  ico: string | null;
  country: string | null;
  role: string;
  created_at: string;
};

/** Farby štítkov podľa vážnosti — rovnaké ako doteraz pri banke. */
const TON: Record<Ton, string> = {
  ok: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  pozor: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  chyba: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  neutralny: "bg-secondary text-foreground",
};

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
  /** Stav firiem (eFaktúra, počty, banka); `null` = ešte sa načítava. */
  const [stav, setStav] = useState<Map<string, StavFirmy> | null>(null);

  async function load() {
    // Bez filtra na seba vráti RLS aj členstvá kolegov a firma sa v zozname
    // zopakuje toľkokrát, koľko má členov.
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { data, error } = await supabase
      .from("company_users")
      .select("role, company:companies(id, name, ico, country, created_at)")
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
        country: r.company.country ?? null,
        created_at: r.company.created_at,
      })),
    );
  }

  useEffect(() => {
    load();
  }, []);

  /*
    Stav všetkých firiem naraz — eFaktúra, nespracované, neodovzdané bločky,
    faktúry po splatnosti a banka. Jedna funkcia v databáze
    (`prehlad_firiem_stav`) kontroluje členstvo aj vlastný prístup; čo
    človek v danej firme nesmie vidieť, vráti prázdne. Po 500 firmách na
    volanie, aby výsledok nenarazil na strop 1 000 riadkov.
  */
  useEffect(() => {
    if (!rows?.length) return;
    let zrusene = false;
    (async () => {
      const out = new Map<string, StavFirmy>();
      for (const kus of kusy(rows.map((r) => r.id))) {
        const { data, error } = await (supabase.rpc as any)("prehlad_firiem_stav", {
          p_company_ids: kus,
        });
        if (error) throw error;
        for (const x of (data ?? []) as Record<string, unknown>[])
          out.set(x.company_id as string, stavZRiadku(x));
      }
      if (!zrusene) setStav(out);
    })().catch(() => {
      // Počty sú len pomôcka — bez nich ostanú bunky prázdne.
      if (!zrusene) setStav(new Map());
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

  /**
   * Počet ako odkaz — prepne do firmy rovno na príslušný zoznam. Nula je
   * šedá, `null` (nesmie vidieť) bunku vynechá, `…` ešte sa načítava.
   */
  const pocet = (
    r: Row,
    n: number | null | undefined,
    kam: string,
    titulok: string,
    ikona: ReactNode,
    ton: Ton = "neutralny",
  ) => {
    if (!stav) return <span className="text-muted-foreground">…</span>;
    if (n === null || n === undefined) return <span className="text-muted-foreground">—</span>;
    if (!n) return <span className="text-muted-foreground">0</span>;
    return (
      <button
        type="button"
        onClick={() => switchTo(r.id, kam)}
        title={titulok}
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums hover:opacity-80 ${TON[ton]}`}
      >
        {ikona} {n}
      </button>
    );
  };

  const pocetNespracovanych = (r: Row) =>
    pocet(
      r,
      stav?.get(r.id)?.nespracovane,
      ODKAZY_PREHLADU.nespracovane,
      t("Otvoriť Nespracované v tejto firme"),
      <Inbox className="h-3 w-3" />,
      "pozor",
    );

  /** Bločky spracované, ale ešte neodovzdané do účtovníctva — odkaz do Dokladov firmy. */
  const neexportovaneBlocky = (r: Row) =>
    pocet(
      r,
      stav?.get(r.id)?.neodovzdaneBlocky,
      ODKAZY_PREHLADU.neodovzdaneBlocky,
      t("Bločky spracované, ale ešte neodovzdané do účtovníctva"),
      <Receipt className="h-3 w-3" />,
    );

  const poSplatnosti = (r: Row) =>
    pocet(
      r,
      stav?.get(r.id)?.poSplatnosti,
      ODKAZY_PREHLADU.poSplatnosti,
      t("Neuhradené faktúry po splatnosti"),
      <FileWarning className="h-3 w-3" />,
      "chyba",
    );

  /** Stav registrácie na eFaktúre a počet prijatých eFaktúr, ktoré ešte nie sú zaevidované. */
  const efaktura = (r: Row) => {
    if (!stav) return <span className="text-muted-foreground">…</span>;
    const s = stav.get(r.id);
    if (!s || !ukazatEfakturu(r.country, s) || !s.efaktura)
      return <span className="text-muted-foreground">—</span>;
    const st = STITOK_EFAKTURY[s.efaktura.rozsah];
    const prijate = s.efakturyNezaevidovane ?? 0;
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => switchTo(r.id, ODKAZY_PREHLADU.efaktura)}
          title={
            s.efaktura.poskytovatel
              ? t("Príjem u: {poskytovatel}", { poskytovatel: s.efaktura.poskytovatel })
              : t("Otvoriť eFaktúru v tejto firme")
          }
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium hover:opacity-80 ${TON[st.ton]}`}
        >
          <Send className="h-3 w-3" /> {t(st.text)}
        </button>
        {prijate > 0 && (
          <button
            type="button"
            onClick={() => switchTo(r.id, ODKAZY_PREHLADU.efakturyNezaevidovane)}
            title={t("Prijaté eFaktúry, ktoré ešte nie sú zaevidované")}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums hover:opacity-80 ${TON.pozor}`}
          >
            <Inbox className="h-3 w-3" /> {prijate}
          </button>
        )}
      </span>
    );
  };

  /** Napojené / všetky bankové účty a či niektorému vypršal súhlas alebo pripojenie zlyhalo. */
  const banka = (r: Row) => {
    if (!stav) return <span className="text-muted-foreground">…</span>;
    const b = stav.get(r.id)?.banka;
    if (!b) return <span className="text-muted-foreground">—</span>;
    const sb = stavBanky(b);
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => switchTo(r.id, ODKAZY_PREHLADU.banka)}
          title={sb.text ? t(sb.text) : t("Napojené na banku / všetky bankové účty firmy")}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums hover:opacity-80 ${TON[sb.ton]}`}
        >
          <Landmark className="h-3 w-3" /> {b.napojene}/{b.spolu}
        </button>
        {sb.ton === "chyba" && sb.text ? (
          <span className="text-xs text-rose-700 dark:text-rose-300">{t(sb.text)}</span>
        ) : null}
        {/* Napojiť banku smie len správa firmy — účtovník k banke prístup nemá. */}
        {sb.ton !== "ok" && (r.role === "owner" || r.role === "admin") ? (
          <button
            type="button"
            onClick={() => switchTo(r.id, ODKAZY_PREHLADU.pripojitBanku)}
            title={t("Napojiť bankový účet tejto firmy")}
            className="text-xs font-medium text-primary hover:underline"
          >
            {b.suhlas > 0 || b.problem > 0 ? t("Obnoviť") : t("Napojiť")}
          </button>
        ) : null}
      </span>
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
      {/* Adresa na príjem dokladov e-mailom — len kto smie doklady. */}
      {stav?.get(r.id)?.nespracovane !== null && stav?.get(r.id) && (
        <button
          type="button"
          onClick={() => switchTo(r.id, ODKAZY_PREHLADU.dokladyMailom)}
          title={t("Doklady e-mailom — adresa na príjem dokladov")}
          aria-label={t("Doklady e-mailom")}
          className="inline-flex items-center rounded-md border border-border px-2 py-1.5 text-xs hover:bg-secondary"
        >
          <Mail className="h-3.5 w-3.5" />
        </button>
      )}
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
        {/* Jedna adresa a nahratie pre všetky firmy — doklad sa zaradí sám podľa odberateľa. */}
        {rows && rows.length > 1 && <RozdelovacMailov />}
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
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary-hover">
                    <Check className="h-3 w-3" /> {t("Aktívna")}
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-muted-foreground">
                {r.ico && <span>{t("IČO {ico}", { ico: r.ico })} ·</span>}
                <span>
                  {t(popisRoly(r.role))} · {t("vytvorené")} {datum(r.created_at)}
                </span>
              </div>
              {/* Stav firmy: každé číslo prepne do firmy na príslušný zoznam. */}
              <dl className="mt-3 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 text-xs">
                <dt className="text-muted-foreground">{t("eFaktúra")}</dt>
                <dd className="min-w-0">{efaktura(r)}</dd>
                <dt className="text-muted-foreground">{t("Nespracované")}</dt>
                <dd className="min-w-0">{pocetNespracovanych(r)}</dd>
                <dt className="text-muted-foreground">{t("Neexportované bločky")}</dt>
                <dd className="min-w-0">{neexportovaneBlocky(r)}</dd>
                <dt className="text-muted-foreground">{t("Po splatnosti")}</dt>
                <dd className="min-w-0">{poSplatnosti(r)}</dd>
                <dt className="text-muted-foreground">{t("Banka")}</dt>
                <dd className="min-w-0">{banka(r)}</dd>
              </dl>
              <div className="mt-3 flex justify-start [&>div]:justify-start">{akcie(r)}</div>
            </div>
          ))}
        </div>
        <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">{t("Firma")}</th>
                <th className="px-4 py-3">{t("Rola")}</th>
                <th className="px-4 py-3">{t("eFaktúra")}</th>
                <th className="px-4 py-3">{t("Nespracované")}</th>
                <th className="px-4 py-3">{t("Neexportované bločky")}</th>
                <th className="px-4 py-3">{t("Po splatnosti")}</th>
                <th className="px-4 py-3">{t("Banka")}</th>
                <th className="px-4 py-3 text-right">{t("Akcie")}</th>
              </tr>
            </thead>
            <tbody>
              {rows === null && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                    {t("Načítavam…")}
                  </td>
                </tr>
              )}
              {rows?.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                    {t("Žiadne firmy.")}
                  </td>
                </tr>
              )}
              {rows && rows.length > 0 && zobrazene.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
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
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary-hover">
                          <Check className="h-3 w-3" /> {t("Aktívna")}
                        </span>
                      )}
                    </div>
                    {/* IČO a dátum založenia pod názvom — stĺpce uvoľnili miesto stavu firmy. */}
                    <div className="mt-0.5 pl-8 text-xs text-muted-foreground">
                      {r.ico ? `${t("IČO {ico}", { ico: r.ico })} · ` : ""}
                      {t("vytvorené")} {datum(r.created_at)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{t(popisRoly(r.role))}</td>
                  <td className="px-4 py-3">{efaktura(r)}</td>
                  <td className="px-4 py-3">{pocetNespracovanych(r)}</td>
                  <td className="px-4 py-3">{neexportovaneBlocky(r)}</td>
                  <td className="px-4 py-3">{poSplatnosti(r)}</td>
                  <td className="px-4 py-3">{banka(r)}</td>
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
