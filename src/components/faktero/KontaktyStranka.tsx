import { JAZYKY_DOKLADU, predvolenyJazykFirmy } from "@/lib/faktero/faktura-jazyk";
import { useKrajinaDane } from "@/lib/faktero/krajina-firmy";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { Plus, Pencil, Trash2, RotateCcw, Upload } from "lucide-react";
import { ImportOdberatelovOkno } from "@/components/faktero/ImportOdberatelovOkno";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/useT";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { useServerFn } from "@tanstack/react-start";
import { triggerEventFn } from "@/lib/faktero/email.functions";
import { IcoLookupButton } from "@/components/faktero/IcoLookupButton";
import { CompanyNameAutocomplete } from "@/components/faktero/CompanyNameAutocomplete";
import { OverenieVies } from "@/components/faktero/OverenieVies";
import { mergeCompanyAutofill } from "@/lib/faktero/company-autofill";
import { findCustomerByIcoFn } from "@/lib/faktero/company-lookup.functions";
import { JobPicker } from "@/components/faktero/JobPicker";
import { usePagedList } from "@/hooks/usePagedList";
import {
  Pagination,
  PageSizeSelect,
  ConfirmDialog,
  BulkBar,
  DeletedToggle,
} from "@/components/faktero/ListControls";

/** Fyzická osoba nemá IČO ani daňové čísla — formulár sa jej prispôsobí. */
function jeFyzicka(c: { typ?: string | null }): boolean {
  return (c.typ ?? "firma") === "fyzicka";
}

type Customer = {
  id?: string;
  name: string;
  ico?: string;
  dic?: string;
  ic_dph?: string;
  street?: string;
  city?: string;
  zip?: string;
  country?: string;
  email?: string;
  phone?: string;
  contact_person?: string;
  notes?: string;
  /** „firma" alebo „fyzicka" — fyzická osoba nemá IČO ani daňové čísla. */
  typ?: string;
  /** Posledné overenie IČ DPH vo VIES. */
  vies_platne?: boolean | null;
  vies_overene_at?: string | null;
  /** Doplní sa do nového dokladu tohto odberateľa. */
  default_job_id?: string | null;
  /** Cenová skupina — jej zľava a dohodnuté ceny sa premietnu do dokladu. */
  price_group_id?: string | null;
  /** Individuálna zľava v %. Prebíja zľavu cenovej skupiny, nesčítava sa s ňou. */
  discount_percent?: number | string | null;
  /** Predvolený jazyk dokladov pre tohto odberateľa. */
  invoice_language?: string | null;
  /** Písomná dohoda o samofakturácii — od kedy smieme vyhotovovať faktúry za neho. */
  samofakturacia_od?: string | null;
  samofakturacia_do?: string | null;
  samofakturacia_dohoda?: string | null;
  /** Role v spoločnom adresári — aspoň jedna musí platiť. */
  odberatel?: boolean;
  dodavatel?: boolean;
  /** Účet dodávateľa — doplní sa do prijatej faktúry. */
  iban?: string | null;
  /** Leitweg-ID nemeckého úradu — ide do XRechnung ako Buyer reference (BT-10). */
  leitweg_id?: string | null;
  swift?: string | null;
  /** Partner chce na dokladoch číslo objednávky — bez neho Faktero upozorní. */
  povinne_cislo_objednavky?: boolean;
};

export type Rola = "odberatel" | "dodavatel";

/** Texty stránky podľa toho, či je otvorený zoznam odberateľov alebo dodávateľov. */
const TEXTY = {
  odberatel: {
    titulok: "Odberatelia",
    popis: "Vaši zákazníci a ich fakturačné údaje.",
    novy: "Nový odberateľ",
    upravit: "Upraviť odberateľa",
    vymazany: "Odberateľ vymazaný",
    ziadni: "Žiadni odberatelia.",
    ziadniVymazani: "Žiadni vymazaní odberatelia.",
    karta: "Otvoriť kartu odberateľa",
    vymazatJedneho: "Naozaj chcete vymazať tohto odberateľa?",
    vymazatViac: "Vymazať {n} odberateľov?",
    natrvaloViac: "Natrvalo vymazať {n} odberateľov?",
    skryti: "Vybraní odberatelia budú skrytí z rozhrania.",
    natrvaloSprava: "Odberatelia sa odstránia natrvalo. Doklady ostanú — nesú si vlastný odpis údajov.",
    skrytyJeden: "{meno} bude skrytý z rozhrania. Existujúce faktúry ostanú.",
    cesta: "/odberatelia",
  },
  dodavatel: {
    titulok: "Dodávatelia",
    popis: "Firmy, od ktorých nakupujete — vyberajú sa pri prijatej faktúre a objednávke.",
    novy: "Nový dodávateľ",
    upravit: "Upraviť dodávateľa",
    vymazany: "Dodávateľ vymazaný",
    ziadni: "Žiadni dodávatelia.",
    ziadniVymazani: "Žiadni vymazaní dodávatelia.",
    karta: "Otvoriť kartu dodávateľa",
    vymazatJedneho: "Naozaj chcete vymazať tohto dodávateľa?",
    vymazatViac: "Vymazať {n} dodávateľov?",
    natrvaloViac: "Natrvalo vymazať {n} dodávateľov?",
    skryti: "Vybraní dodávatelia budú skrytí z rozhrania.",
    natrvaloSprava: "Dodávatelia sa odstránia natrvalo. Doklady ostanú — nesú si vlastný odpis údajov.",
    skrytyJeden: "{meno} bude skrytý z rozhrania. Existujúce faktúry ostanú.",
    cesta: "/dodavatelia",
  },
} as const;

const EMPTY: Customer = { name: "", country: "SK", typ: "firma" };

/**
 * Spoločný adresár: ten istý zoznam kontaktov raz ako Odberatelia, raz ako
 * Dodávatelia (ako v Pohode). Firma, ktorá je oboje, je v ňom raz.
 */
export function KontaktyStranka({ rola, otvoritNovy }: { rola: Rola; otvoritNovy?: boolean }) {
  const T = TEXTY[rola];
  const { t } = useT();
  const PRAZDNY: Customer = {
    ...EMPTY,
    odberatel: rola === "odberatel",
    dodavatel: rola === "dodavatel",
  };
  const list = usePagedList({
    resource: "customers",
    searchColumns: ["name", "ico", "email"],
    equals: { [rola]: true },
  });
  const [editing, setEditing] = useState<Customer | null>(null);
  const [rowDelete, setRowDelete] = useState<any | null>(null);
  const [bulkDelete, setBulkDelete] = useState(false);
  const [bulkHardDelete, setBulkHardDelete] = useState(false);
  const [importOtvoreny, setImportOtvoreny] = useState(false);
  async function confirmBulkHardDelete() {
    const pocet = list.selectedIds.length;
    try {
      await list.hardDelete(list.selectedIds);
      toast.success(t("Natrvalo vymazaných: {n}", { n: pocet }));
      list.clearSelection();
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba"));
    } finally {
      setBulkHardDelete(false);
    }
  }
  const triggerEvt = useServerFn(triggerEventFn);

  // Príchod z menu cez `?new=1`. Parameter hneď odstránime, aby sa formulár
  // po zavretí neotvoril znova pri obnovení stránky alebo návrate späť.
  const navigate = useNavigate();
  useEffect(() => {
    if (!otvoritNovy) return;
    setEditing(PRAZDNY);
    navigate({ to: T.cesta, search: {} as any, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otvoritNovy, navigate]);

  async function save(c: Customer) {
    const cid = getActiveCompanyId();
    if (!cid) return;
    if (!c.odberatel && !c.dodavatel)
      return toast.error(t("Kontakt musí byť odberateľ, dodávateľ alebo oboje."));
    // Zľava príde z políčka ako reťazec; číselný stĺpec ho neprijme a prázdne
    // pole musí ísť ako NULL, nie ako "".
    const zlava =
      c.discount_percent === "" || c.discount_percent == null ? null : Number(c.discount_percent);
    const payload = {
      ...c,
      company_id: cid,
      discount_percent: Number.isFinite(zlava as number) ? (zlava as number) : null,
      typ: c.typ ?? "firma",
      // Prázdny dátum do date stĺpca nejde — musí to byť NULL.
      samofakturacia_od: c.samofakturacia_od || null,
      samofakturacia_do: c.samofakturacia_od ? c.samofakturacia_do || null : null,
      samofakturacia_dohoda: c.samofakturacia_od ? c.samofakturacia_dohoda?.trim() || null : null,
      /*
        Fyzická osoba IČO ani daňové čísla nemá. Keby sa po prepnutí typu
        nevyčistili, ostali by na karte skryté a vyšli by na faktúre.
      */
      ...(jeFyzicka(c) ? { ico: null, dic: null, ic_dph: null } : {}),
      // Prázdne Leitweg-ID ako NULL; kľúč len keď ho formulár pozná (stĺpec existuje).
      ...("leitweg_id" in c ? { leitweg_id: c.leitweg_id?.trim() || null } : {}),
    };
    if (c.id) {
      const { error } = await supabase.from("customers").update(payload).eq("id", c.id);
      if (error) return toast.error(error.message);
    } else {
      const { data: created, error } = await supabase
        .from("customers")
        .insert(payload)
        .select()
        .single();
      if (error || !created) {
        const { friendlyError } = await import("@/lib/faktero/plan-error");
        return toast.error(friendlyError(error));
      }
      try {
        await triggerEvt({
          data: {
            companyId: cid,
            event: "customer.created",
            data: {
              customer_id: created.id,
              name: created.name,
              email: created.email,
              ico: created.ico,
            },
          },
        });
      } catch (e) {
        console.warn("[webhook] customer.created trigger zlyhal", e);
      }
    }
    toast.success(t("Uložené"));
    setEditing(null);
    list.reload();
  }

  async function confirmRow() {
    if (!rowDelete) return;
    try {
      await list.softDelete([rowDelete.id]);
      toast.success(t(T.vymazany));
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba"));
    } finally {
      setRowDelete(null);
    }
  }
  async function confirmBulk() {
    try {
      await list.softDelete(list.selectedIds);
      toast.success(t("Vymazaných {n}", { n: list.selectedIds.length }));
      list.clearSelection();
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba"));
    } finally {
      setBulkDelete(false);
    }
  }

  /** Ikony Upraviť / Zmazať / Obnoviť — rovnaké v tabuľke aj v mobilných kartách. */
  const akcie = (c: (typeof list.rows)[number]) => (
    <>
      {!list.showDeleted && (
        <button
          aria-label={t("Upraviť")}
          title={t("Upraviť")}
          onClick={() => setEditing(c)}
          className="rounded p-1.5 hover:bg-muted"
        >
          <Pencil className="h-4 w-4" />
        </button>
      )}
      {list.showDeleted ? (
        <button
          aria-label={t("Obnoviť")}
          title={t("Obnoviť")}
          onClick={async () => {
            try {
              await list.restore([c.id]);
              toast.success(t("Obnovené"));
            } catch (e: any) {
              toast.error(e?.message ?? t("Chyba"));
            }
          }}
          className="rounded p-1.5 text-primary hover:bg-primary/10"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      ) : (
        <button
          aria-label={t("Zmazať")}
          title={t("Zmazať")}
          onClick={() => setRowDelete(c)}
          className="rounded p-1.5 text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </>
  );

  return (
    <>
      <PageHeader
        title={t(T.titulok)}
        description={t(T.popis)}
        action={
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setImportOtvoreny(true)}
              className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary"
            >
              <Upload className="h-4 w-4" /> {t("Importovať")}
            </button>
            <button
              onClick={() => setEditing(PRAZDNY)}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> {t(T.novy)}
            </button>
          </div>
        }
      />
      {importOtvoreny && getActiveCompanyId() && (
        <ImportOdberatelovOkno
          rola={rola}
          companyId={getActiveCompanyId()!}
          onClose={() => setImportOtvoreny(false)}
          onHotovo={() => list.reload()}
        />
      )}
      <PageBody>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <input
            value={list.search}
            onChange={(e) => list.setSearch(e.target.value)}
            placeholder={t("Hľadať názov, IČO, email…")}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm sm:w-64"
          />
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <DeletedToggle value={list.showDeleted} onChange={list.setShowDeleted} />
            <PageSizeSelect value={list.pageSize} onChange={list.setPageSize} />
          </div>
        </div>
        <BulkBar
          onHardDelete={() => setBulkHardDelete(true)}
          count={list.selectedIds.length}
          showDeleted={list.showDeleted}
          onDelete={() => setBulkDelete(true)}
          onRestore={async () => {
            try {
              await list.restore(list.selectedIds);
              toast.success(t("Obnovené"));
              list.clearSelection();
            } catch (e: any) {
              toast.error(e?.message ?? t("Chyba"));
            }
          }}
          onClear={list.clearSelection}
        />
        <div className="mt-3 rounded-xl border border-border bg-card">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-10 p-3">
                    <input
                      type="checkbox"
                      aria-label={t("Vybrať všetko")}
                      checked={list.allOnPageSelected}
                      onChange={(e) => list.toggleAllOnPage(e.target.checked)}
                    />
                    <span className="sr-only">{t("Výber")}</span>
                  </th>
                  <th className="p-3">{t("Názov")}</th>
                  <th className="p-3">{t("IČO")}</th>
                  <th className="p-3">{t("DIČ")}</th>
                  <th className="p-3">{t("Email")}</th>
                  <th className="p-3"><span className="sr-only">{t("Akcie")}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.loading && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      {t("Načítavam…")}
                    </td>
                  </tr>
                )}
                {!list.loading && list.rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      {t(list.showDeleted ? T.ziadniVymazani : T.ziadni)}
                    </td>
                  </tr>
                )}
                {list.rows.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/30">
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={t("Vybrať riadok")}
                        checked={!!list.selected[c.id]}
                        onChange={(e) => list.toggleSelect(c.id, e.target.checked)}
                      />
                    </td>
                    {/*
                    Otvoriť kartu sa dalo len ceruzkou na opačnom konci riadka.
                    Meno je to, na čo človek ťukne — v zozname faktúr to tak je
                    tiež.
                  */}
                    <td className="p-3 font-medium">
                      <button
                        onClick={() => setEditing(c)}
                        className="text-left hover:underline"
                        title={t(T.karta)}
                      >
                        {c.name}
                      </button>
                      {jeFyzicka(c) && (
                        <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          {t("fyzická osoba")}
                        </span>
                      )}
                    </td>
                    <td className="p-3">{c.ico ?? "—"}</td>
                    <td className="p-3">{c.dic ?? "—"}</td>
                    <td className="p-3">{c.email ?? "—"}</td>
                    <td className="p-3 text-right">{akcie(c)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Na mobile karty — v tabuľke by ikony Upraviť/Zmazať ostali mimo obrazovky. */}
          <ul className="divide-y divide-border md:hidden">
            {list.loading && <li className="p-6 text-center text-muted-foreground">{t("Načítavam…")}</li>}
            {!list.loading && list.rows.length === 0 && (
              <li className="p-6 text-center text-muted-foreground">
                {t(list.showDeleted ? T.ziadniVymazani : T.ziadni)}
              </li>
            )}
            {list.rows.map((c) => (
              <li key={c.id} className="flex items-start gap-3 p-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  aria-label={t("Vybrať {meno}", { meno: c.name })}
                  checked={!!list.selected[c.id]}
                  onChange={(e) => list.toggleSelect(c.id, e.target.checked)}
                />
                <div className="min-w-0 flex-1">
                  <button
                    onClick={() => setEditing(c)}
                    className="break-words text-left font-medium hover:underline"
                    title={t(T.karta)}
                  >
                    {c.name}
                  </button>
                  {jeFyzicka(c) && (
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {t("fyzická osoba")}
                    </span>
                  )}
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    {c.ico && <span>{t("IČO")} {c.ico}</span>}
                    {c.dic && <span>{t("DIČ")} {c.dic}</span>}
                    {c.email && <span className="min-w-0 break-all">{c.email}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center">{akcie(c)}</div>
              </li>
            ))}
          </ul>
          <Pagination
            page={list.page}
            pageSize={list.pageSize}
            total={list.total}
            onPageChange={list.setPage}
          />
        </div>
      </PageBody>

      {editing && (
        <CustomerDialog
          rola={rola}
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}
      <ConfirmDialog
        open={!!rowDelete}
        title={t(T.vymazatJedneho)}
        message={
          rowDelete ? t(T.skrytyJeden, { meno: rowDelete.name }) : ""
        }
        onCancel={() => setRowDelete(null)}
        onConfirm={confirmRow}
      />
      <ConfirmDialog
        open={bulkDelete}
        title={t(T.vymazatViac, { n: list.selectedIds.length })}
        message={t(T.skryti)}
        onCancel={() => setBulkDelete(false)}
        onConfirm={confirmBulk}
      />
      <ConfirmDialog
        open={bulkHardDelete}
        title={t(T.natrvaloViac, { n: list.selectedIds.length })}
        message={t(T.natrvaloSprava)}
        confirmLabel={t("Vymazať natrvalo")}
        onCancel={() => setBulkHardDelete(false)}
        onConfirm={confirmBulkHardDelete}
      />
    </>
  );
}

function CustomerDialog({
  rola,
  initial,
  onClose,
  onSave,
}: {
  rola: Rola;
  initial: Customer;
  onClose: () => void;
  onSave: (c: Customer) => void;
}) {
  useZatvorNaEscape(onClose);
  const { t: tr } = useT();
  const krajinaFirmy = useKrajinaDane();
  const jazykFirmy = predvolenyJazykFirmy(krajinaFirmy);
  const [c, setC] = useState<Customer>(initial);
  /*
    Leitweg-ID len pre nemeckú firmu — a až keď stĺpec v databáze existuje
    (migrácia PENDING_erechnung), inak by uloženie kontaktu zlyhalo.
  */
  const [maLeitweg, setMaLeitweg] = useState(false);
  useEffect(() => {
    if (krajinaFirmy !== "DE") return;
    (supabase as any)
      // aj-zmazane: len skúška, či stĺpec existuje
      .from("customers")
      .select("leitweg_id")
      .limit(1)
      .then(({ error }: { error: unknown }) => setMaLeitweg(!error));
  }, [krajinaFirmy]);
  const [dup, setDup] = useState<null | { id: string; name: string }>(null);
  const findDup = useServerFn(findCustomerByIcoFn);

  // Výber cenovej skupiny sa zobrazí až vtedy, keď firma nejakú má — inak by
  // vo formulári visel prázdny zoznam.
  const [skupiny, setSkupiny] = useState<any[]>([]);
  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    supabase
      .from("price_groups")
      .select("id, name, discount_percent")
      .eq("company_id", cid)
      .is("deleted_at", null)
      .order("name")
      .then(({ data }) => setSkupiny(data ?? []));
  }, []);

  function f<K extends keyof Customer>(k: K, v: any) {
    setC((p) => ({ ...p, [k]: v }));
  }
  useEffect(() => {
    const cid = getActiveCompanyId();
    const ico = (c.ico ?? "").replace(/\s+/g, "");
    if (!cid || !/^\d{6,8}$/.test(ico)) {
      setDup(null);
      return;
    }
    const h = setTimeout(async () => {
      try {
        const r = await findDup({ data: { ico, companyId: cid } });
        if (r.match && r.match.id !== c.id) setDup({ id: r.match.id, name: r.match.name });
        else setDup(null);
      } catch {
        setDup(null);
      }
    }, 500);
    return () => clearTimeout(h);
  }, [c.ico, c.id]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tr(c.id ? TEXTY[rola].upravit : TEXTY[rola].novy)}
        className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">{tr(c.id ? TEXTY[rola].upravit : TEXTY[rola].novy)}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave(c);
          }}
          className="mt-4 grid gap-4 sm:grid-cols-2"
        >
          {/* Spoločný adresár: ten istý kontakt môže byť odberateľ aj dodávateľ. */}
          <div className="sm:col-span-2 flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={c.odberatel !== false}
                onChange={(e) => f("odberatel", e.target.checked)}
              />
              {tr("Odberateľ")}
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(c.dodavatel)}
                onChange={(e) => f("dodavatel", e.target.checked)}
              />
              {tr("Dodávateľ")}
            </label>
            {c.odberatel === false && !c.dodavatel && (
              <span className="text-xs text-destructive">{tr("Vyberte aspoň jedno.")}</span>
            )}
          </div>
          {/* Firma alebo súkromná osoba. Rozhoduje to o tom, čo sa vypĺňa:
              fyzická osoba nemá IČO ani daňové čísla a v registri sa nenájde. */}
          <div className="sm:col-span-2 flex flex-wrap gap-2">
            {[
              { kod: "firma", popis: "Firma alebo živnostník" },
              { kod: "fyzicka", popis: "Fyzická osoba (nepodnikateľ)" },
            ].map((t) => (
              <button
                key={t.kod}
                type="button"
                onClick={() => setC((prev) => ({ ...(prev as Customer), typ: t.kod }))}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  (c.typ ?? "firma") === t.kod
                    ? "border-primary bg-primary/10 font-medium text-primary-hover"
                    : "border-border hover:bg-secondary"
                }`}
              >
                {tr(t.popis)}
              </button>
            ))}
          </div>

          <label className="block sm:col-span-2">
            <span className="text-sm font-medium">
              {tr(jeFyzicka(c) ? "Meno a priezvisko *" : "Názov *")}
            </span>
            <div className="mt-1">
              {jeFyzicka(c) ? (
                <input
                  value={c.name}
                  onChange={(e) => f("name", e.target.value)}
                  placeholder={tr("Ján Novák")}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              ) : (
                <CompanyNameAutocomplete
                  value={c.name}
                  onChange={(v) => f("name", v)}
                  onPick={(d, { auto }) =>
                    setC(
                      (prev) =>
                        mergeCompanyAutofill(prev, d, {
                          mode: auto ? "fill-empty" : "overwrite",
                        }) as Customer,
                    )
                  }
                />
              )}
            </div>
          </label>
          {dup && (
            <div className="sm:col-span-2 rounded-md border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/40 dark:text-amber-200">
              {tr("Kontakt s týmto IČO už v adresári je:")} <strong>{dup.name}</strong>.{" "}
              {tr(
                rola === "dodavatel"
                  ? "Ak je to ten istý, otvorte radšej jeho kartu a zaškrtnite mu Dodávateľ."
                  : "Ak je to ten istý, otvorte radšej jeho kartu a zaškrtnite mu Odberateľ.",
              )}
            </div>
          )}
          {!jeFyzicka(c) && (
            <label className="block">
              <span className="text-sm font-medium">{tr("IČO")}</span>
              <div className="mt-1 flex -space-x-px items-start">
                <input
                  value={c.ico ?? ""}
                  onChange={(e) => f("ico", e.target.value)}
                  className="w-full min-w-0 rounded-l-md border border-input bg-background px-3 py-2 text-sm focus:z-10"
                />
                <IcoLookupButton
                  ico={c.ico ?? ""}
                  onResult={(d, { auto }) =>
                    setC(
                      (prev) =>
                        mergeCompanyAutofill(prev, d, {
                          mode: auto ? "fill-empty" : "overwrite",
                        }) as Customer,
                    )
                  }
                />
              </div>
            </label>
          )}
          {!jeFyzicka(c) && <In label={tr("DIČ")} value={c.dic ?? ""} onChange={(v) => f("dic", v)} />}
          {!jeFyzicka(c) && (
            <div>
              <In label={tr("IČ DPH")} value={c.ic_dph ?? ""} onChange={(v) => f("ic_dph", v)} />
              <OverenieVies
                companyId={getActiveCompanyId()}
                icDph={c.ic_dph}
                customerId={c.id ?? null}
                posledne={{ platne: c.vies_platne ?? null, kedy: c.vies_overene_at ?? null }}
                onOverene={(v) =>
                  setC(
                    (prev) =>
                      ({
                        ...(prev ?? {}),
                        vies_platne: v.platne,
                        vies_overene_at: v.overene,
                        // Register vie aj názov — keď je pole prázdne, doplní sa.
                        name: prev?.name || v.nazov || "",
                      }) as Customer,
                  )
                }
              />
            </div>
          )}
          <In
            label={tr("Kontaktná osoba")}
            value={c.contact_person ?? ""}
            onChange={(v) => f("contact_person", v)}
          />
          <In label={tr("Ulica")} value={c.street ?? ""} onChange={(v) => f("street", v)} full />
          <In label={tr("Mesto")} value={c.city ?? ""} onChange={(v) => f("city", v)} />
          <In label={tr("PSČ")} value={c.zip ?? ""} onChange={(v) => f("zip", v)} />
          <In label={tr("Krajina")} value={c.country ?? "SK"} onChange={(v) => f("country", v)} />
          <In label={tr("Email")} type="email" value={c.email ?? ""} onChange={(v) => f("email", v)} />
          <In label={tr("Telefón")} value={c.phone ?? ""} onChange={(v) => f("phone", v)} />
          {maLeitweg && c.odberatel !== false && !jeFyzicka(c) && (
            <In
              label={tr("Leitweg-ID (len pre úrady — do XRechnung)")}
              value={c.leitweg_id ?? ""}
              onChange={(v) => f("leitweg_id", v)}
            />
          )}
          {c.dodavatel && (
            <>
              <label className="block">
                <span className="text-sm font-medium">IBAN</span>
                <input
                  value={c.iban ?? ""}
                  onChange={(e) =>
                    f("iban", e.target.value.toUpperCase().replace(/\s+/g, "") || null)
                  }
                  placeholder="SK.."
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <span className="mt-1 block text-xs text-muted-foreground">
                  {tr("Doplní sa do prijatej faktúry od tohto dodávateľa.")}
                </span>
              </label>
              <label className="block">
                <span className="text-sm font-medium">SWIFT/BIC</span>
                <input
                  value={c.swift ?? ""}
                  onChange={(e) => f("swift", e.target.value.toUpperCase().trim() || null)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </label>
            </>
          )}
          {/* Zákazka, ceny, zľava a jazyk dokladov patria k predaju — len odberateľovi. */}
          {c.odberatel !== false && (
            <>
              <JobPicker
                className="sm:col-span-2"
                label={tr("Predvolená zákazka")}
                value={c.default_job_id ?? ""}
                // Prázdny výber musí ísť do databázy ako NULL — prázdny reťazec
                // nie je platné UUID a uloženie by padlo.
                onChange={(v) => f("default_job_id", v || null)}
              />
              {skupiny.length > 0 && (
                <label className="block">
                  <span className="text-sm font-medium">{tr("Cenová skupina")}</span>
                  <select
                    value={c.price_group_id ?? ""}
                    onChange={(e) => f("price_group_id", e.target.value || null)}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">{tr("— bez skupiny —")}</option>
                    {skupiny.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {Number(s.discount_percent) > 0
                          ? ` (−${Number(s.discount_percent)} %)`
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="block">
                <span className="text-sm font-medium">{tr("Individuálna zľava (%)")}</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={c.discount_percent ?? ""}
                  // Prázdne pole musí ísť ako NULL, nie ako "" — číselný stĺpec
                  // prázdny reťazec neprijme.
                  onChange={(e) =>
                    f("discount_percent", e.target.value === "" ? null : e.target.value)
                  }
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <span className="mt-1 block text-xs text-muted-foreground">
                  {tr("Prebíja zľavu cenovej skupiny. Dohodnutá cena v cenníku prebíja obe.")}
                </span>
              </label>
              <label className="block">
                <span className="text-sm font-medium">{tr("Jazyk dokladov")}</span>
                {/* Prázdne = jazyk podľa krajiny firmy (nemecká firma po nemecky, inak slovensky). */}
                <select
                  value={c.invoice_language ?? jazykFirmy}
                  onChange={(e) =>
                    f("invoice_language", e.target.value === jazykFirmy ? null : e.target.value)
                  }
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {JAZYKY_DOKLADU.map((j) => (
                    <option key={j.kod} value={j.kod}>
                      {j.nazov}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {tr("Predvolí sa na jeho faktúrach; prekladajú sa popisky v PDF, nie názvy položiek.")}
                </span>
              </label>
            </>
          )}
          <label className="sm:col-span-2 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!c.povinne_cislo_objednavky}
              onChange={(e) => f("povinne_cislo_objednavky", e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-input"
            />
            <span>
              <span className="font-medium">{tr("Povinné číslo objednávky")}</span>
              <span className="block text-xs text-muted-foreground">
                {tr("Keď doklad od tohto partnera alebo preňho nemá číslo objednávky, Faktero upozorní pri vystavení faktúry aj v Nespracovaných.")}
              </span>
            </span>
          </label>
          {/* Samofakturácia je dohoda s dodávateľom; staršie dohody ostávajú viditeľné. */}
          {(c.dodavatel || c.samofakturacia_od) && <SamofakturaciaDohoda c={c} f={f} />}
          <label className="sm:col-span-2 block">
            <span className="text-sm font-medium">{tr("Poznámky")}</span>
            <textarea
              value={c.notes ?? ""}
              onChange={(e) => f("notes", e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border bg-card px-4 py-2 text-sm hover:bg-secondary"
            >
              {tr("Zrušiť")}
            </button>
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              {tr("Uložiť")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Dohoda o samofakturácii (§ 72 ods. 4 zákona o DPH). Kým nie je zapísaná,
 * samofaktúra pre tohto dodávateľa nejde vyhotoviť.
 */
function SamofakturaciaDohoda({
  c,
  f,
}: {
  c: Customer;
  f: <K extends keyof Customer>(k: K, v: any) => void;
}) {
  const { t } = useT();
  const [otvorena, setOtvorena] = useState(Boolean(c.samofakturacia_od));
  if (!otvorena) {
    return (
      <div className="sm:col-span-2">
        <button
          type="button"
          onClick={() => setOtvorena(true)}
          className="text-sm text-primary hover:underline"
        >
          {t("+ Dohoda o samofakturácii (faktúry za tohto dodávateľa vyhotovujete vy)")}
        </button>
      </div>
    );
  }
  return (
    <fieldset className="sm:col-span-2 rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-medium">{t("Dohoda o samofakturácii")}</legend>
      <p className="mb-3 text-xs text-muted-foreground">
        {t(
          "Faktúry za tohto dodávateľa vyhotovujete vy a on ich odsúhlasí. Zákon chce písomnú dohodu uzavretú vopred — zapíšte, od kedy platí.",
        )}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">{t("Platí od")}</span>
          <input
            type="date"
            value={c.samofakturacia_od ?? ""}
            onChange={(e) => f("samofakturacia_od", e.target.value || null)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">{t("Platí do (nepovinné)")}</span>
          <input
            type="date"
            value={c.samofakturacia_do ?? ""}
            min={c.samofakturacia_od ?? undefined}
            onChange={(e) => f("samofakturacia_do", e.target.value || null)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium">{t("Dohoda (číslo, dátum podpisu, poznámka)")}</span>
          <input
            value={c.samofakturacia_dohoda ?? ""}
            placeholder={t("napr. Zmluva o samofakturácii č. 3/2026 zo dňa 1. 10. 2026")}
            onChange={(e) => f("samofakturacia_dohoda", e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
      </div>
      {c.samofakturacia_od ? null : (
        <button
          type="button"
          onClick={() => {
            f("samofakturacia_do", null);
            f("samofakturacia_dohoda", null);
            setOtvorena(false);
          }}
          className="mt-2 text-xs text-muted-foreground hover:underline"
        >
          {t("Bez dohody")}
        </button>
      )}
    </fieldset>
  );
}

function In({
  label,
  value,
  onChange,
  type = "text",
  required,
  full,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  full?: boolean;
}) {
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="text-sm font-medium">{label}</span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}
