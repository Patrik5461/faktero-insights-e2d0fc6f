import { preloz } from "@/lib/i18n/jazyk";
import { vsPrijatej } from "@/lib/faktero/variabilny-symbol";
import { useT } from "@/lib/i18n/useT";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { OknoZdrojovehoMailu } from "@/components/faktero/ZdrojovyMail";
import { PrilohyFaktury } from "@/components/faktero/PrilohyFaktury";
import { PresunAkoPrilohuOkno } from "@/components/faktero/PresunAkoPrilohuOkno";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageBody } from "@/components/faktero/AppShell";
import {
  DocumentDetailHeader,
  MenuAkcia,
  MenuSkupina,
  MetaRiadok,
  PoTermine,
  PrimarnaAkcia,
  SekundarnaAkcia,
  StavOdznak,
} from "@/components/faktero/DocumentDetailHeader";
import { UpozornenieKontrolyEfaktury } from "@/components/faktero/NalezyKontrolyEfaktury";
import { NahladPdf } from "@/components/faktero/NahladPdf";
import { SamofakturaPanel } from "@/components/faktero/SamofakturaPanel";
import { RegistrPlatcuDph } from "@/components/faktero/RegistrPlatcuDph";
import { PredlzitSplatnost } from "@/components/faktero/PredlzitSplatnost";
import { ZauctovaniePanel } from "@/components/faktero/ZauctovaniePanel";
import { skocNaZauctovanie } from "@/components/faktero/TlacidloZauctovat";
import { SchvalovaniePanel } from "@/components/faktero/SchvalovaniePanel";
import { KomentarePanel } from "@/components/faktero/KomentarePanel";
import { popisSplatnosti, predlzena } from "@/lib/faktero/splatnost";
import { zapocitatelna } from "@/lib/faktero/samofakturacia";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { listBankData } from "@/lib/faktero/tatrabanka.functions";
import { JobPicker } from "@/components/faktero/JobPicker";
import {
  payPurchaseInvoice,
  listPayments,
  refreshPaymentStatus,
} from "@/lib/faktero/tatrabanka-payments.functions";
import { toast } from "sonner";
import { uhradyPrijatych, zrusParovaniePrijatej } from "@/lib/faktero/prijata-parovanie.functions";
import {
  Download,
  CheckCircle2,
  Ban,
  Trash2,
  Wallet,
  Landmark,
  RefreshCw,
  Pencil,
  Lock,
  LockOpen,
  Undo2,
  BookCheck,
  Mail,
  Paperclip,
  SendHorizontal,
  MessageSquare,
  ExternalLink,
  Printer,
} from "lucide-react";
import { usePoslatOpravuDoPohody } from "@/components/faktero/PoslatOpravuDoPohody";
import { prijataDoNespracovanychFn } from "@/lib/faktero/nespracovane.functions";
import { HistoriaDokladu } from "@/components/faktero/HistoriaDokladu";
import { SpracovalDokladu } from "@/components/faktero/SpracovalDokladu";
import { StitkyDokladu } from "@/components/faktero/StitkyDokladu";
import { KomentarDokladu, VyberStavuDokladu } from "@/components/faktero/StavDokladu";
import { DokladPoradie } from "@/components/faktero/DokladPoradie";
import { useCiselnikyDokladov } from "@/hooks/useCiselnikyDokladov";
import { formatovacMeny, formatujCislo } from "@/lib/faktero/mena";
import { potvrd, zadaj } from "@/lib/potvrdenie";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { DetailSNahladom, useNahladVDetaile } from "@/components/faktero/BocnyNahlad";
import { UdajePreUctovnika, useSirokaPreNahlad, type UdajeUctovnika } from "@/components/faktero/UdajePreUctovnika";
import { ZbaleneK } from "@/components/faktero/DetailDokladuKompaktny";
import { rezimDphPrijatej, stavZauctovania } from "@/lib/faktero/udaje-pre-uctovnika";
import { rozpisPrijatej } from "@/lib/faktero/prijate-do-pohody";
import { useDizajn } from "@/hooks/useDizajn";
import { AutomatickyZaradena } from "@/components/faktero/AutomatickyZaradena";
import { PrijataDetailKompaktna } from "@/components/faktero/PrijataDetailKompaktna";
import { KartaUhrady, UhradyOkno, useUhradyPrijatej } from "@/components/faktero/UhradyPrijatej";

const PAYMENT_STATUS_TEXT: Record<string, string> = {
  ACTC: "Pripravená na podpis",
  ACSP: "Banka spracováva",
  ACSC: "Zaplatená",
  ACCC: "Zaplatená",
  PDNG: "Čaká na dátum splatnosti",
  RJCT: "Zamietnutá bankou",
  CANC: "Zrušená",
};

/** Chyby zo servera sú kódy — používateľovi treba povedať, čo s tým. */
const PAY_ERRORS: Record<string, string> = {
  missing_supplier_iban: "Faktúra nemá IBAN dodávateľa. Doplňte ho a skúste znova.",
  invalid_supplier_iban: "IBAN dodávateľa nemá platný tvar.",
  invoice_already_paid: "Faktúra je už označená ako zaplatená.",
  payment_already_in_progress: "Platba tejto faktúry už prebieha.",
  not_approved: "Faktúra ešte nie je schválená — zaplatiť sa dá až po schválení.",
  unsupported_currency: "Cez banku sa dajú platiť len faktúry v eurách.",
  not_configured: "Napojenie na banku nie je nastavené.",
  Forbidden: "Na platby potrebujete rolu vlastníka alebo správcu.",
};

export const Route = createFileRoute("/_authenticated/prijate-faktury/$id/")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Detail prijatej faktúry — Faktero") }] }),
  component: PurchaseInvoiceDetail,
});

const STATUS_LABEL: Record<string, string> = {
  draft: "Koncept",
  received: "Prijaté",
  booked: "Zaúčtované",
  paid: "Zaplatené",
  cancelled: "Stornované",
};
const STATUS_CLASS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  received: "bg-amber-100 text-amber-800",
  booked: "bg-sky-100 text-sky-800",
  paid: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-rose-100 text-rose-800",
};

function fmt(n: number, c = "EUR") {
  return formatovacMeny(c, "sk-SK")(n);
}

function PurchaseInvoiceDetail() {
  const { t } = useT();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  // Vlastné stavy dokladov firmy — kódy predkontácií si načíta panel zaúčtovania sám.
  const ciselnikyFirmy = useCiselnikyDokladov(getActiveCompanyId(), null, false);
  const [presunPrilohy, setPresunPrilohy] = useState(false);
  const [zdrojovyMail, setZdrojovyMail] = useState(false);
  const [row, setRow] = useState<any | null>(null);
  // Náhľad prílohy priamo na stránke — podpísaný odkaz platí 10 minút.
  const [nahlad, setNahlad] = useState<string | null>(null);
  // Doklad stále vľavo vedľa údajov — pri účtovaní ho netreba hľadať pod formulárom.
  const nahladDetail = useNahladVDetaile();
  const sirokaPreNahlad = useSirokaPreNahlad();
  // Kompaktné rozloženie má vlastné usporiadanie detailu (jeden stĺpec kariet).
  const kompaktne = useDizajn() === "kompaktny";
  const [oknoUhrad, setOknoUhrad] = useState(false);
  // Bez tohto ostal na neexistujúcom doklade navždy nápis „Načítavam…".
  const [nenajdene, setNenajdene] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [debtorAccountId, setDebtorAccountId] = useState<string>("");
  const [paying, setPaying] = useState(false);
  const bankData = useServerFn(listBankData);
  const payInvoice = useServerFn(payPurchaseInvoice);
  const loadPayments = useServerFn(listPayments);
  const poslatOpravu = usePoslatOpravuDoPohody();
  const refreshPayment = useServerFn(refreshPaymentStatus);
  const uhradyFaktury = useUhradyPrijatej(row);

  async function load() {
    const { data } = await supabase
      .from("purchase_invoices")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    setNenajdene(!data);
    setRow(data);
    if (data?.id) nacitajUhradu(data.id);
  }
  useEffect(() => {
    load();
  }, [id]);

  async function loadBankStuff() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    try {
      const [b, p] = await Promise.all([
        bankData({ data: { company_id: cid } }),
        loadPayments({ data: { company_id: cid, invoice_id: id } }),
      ]);
      setAccounts(b.accounts ?? []);
      setPayments(p ?? []);
    } catch {
      // Banka nemusí byť pripojená — vtedy sa platobná časť jednoducho neponúkne.
    }
  }
  useEffect(() => {
    loadBankStuff();
  }, [id]);

  // Návrat z banky po podpise. Callback už platbu odoslal, tu len povieme ako dopadla.
  useEffect(() => {
    const url = new URL(window.location.href);
    const stav = url.searchParams.get("platba");
    const chyba = url.searchParams.get("platba_chyba");
    if (stav) {
      const text = t(PAYMENT_STATUS_TEXT[stav] ?? stav);
      if (stav === "RJCT") toast.error(t("Platba zamietnutá bankou"));
      else toast.success(t("Platba odoslaná do banky — {stav}", { stav: text }));
    }
    if (chyba) toast.error(t("Platba zlyhala: {chyba}", { chyba }));
    if (stav || chyba) {
      window.history.replaceState({}, "", url.pathname);
      load();
      loadBankStuff();
    }
  }, []);

  async function payViaBank() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    setPaying(true);
    try {
      const { authorize_url } = await payInvoice({
        data: {
          company_id: cid,
          invoice_id: id,
          debtor_account_id: debtorAccountId || undefined,
        },
      });
      // Z účtu sa zatiaľ nič nestrhlo — platbu vykoná až podpis v banke.
      window.location.href = authorize_url;
    } catch (e: any) {
      toast.error(
        PAY_ERRORS[e?.message]
          ? t(PAY_ERRORS[e?.message])
          : (e?.message ?? t("Platbu sa nepodarilo založiť")),
      );
      setPaying(false);
    }
  }

  async function onRefreshPayment(rowId: string) {
    const cid = getActiveCompanyId();
    if (!cid) return;
    try {
      const r = await refreshPayment({ data: { company_id: cid, payment_row_id: rowId } });
      toast.success(t(PAYMENT_STATUS_TEXT[r.transaction_status] ?? r.transaction_status));
      load();
      loadBankStuff();
    } catch (e: any) {
      toast.error(e?.message ?? t("Stav sa nepodarilo načítať"));
    }
  }

  /*
    Ktorý pohyb na účte túto faktúru uhradil. Bez toho sa z dokladu nedalo
    zistiť, čím bol zaplatený — dátum úhrady sám o sebe nepovie, z ktorej
    platby pochádza.
  */
  const [uhrada, setUhrada] = useState<{
    datum: string;
    transactionId: string;
    suma: number;
    protistrana: string | null;
  } | null>(null);
  const uhradyFn = useServerFn(uhradyPrijatych);
  const rozparujFn = useServerFn(zrusParovaniePrijatej);

  async function nacitajUhradu(fakturaId: string) {
    const cid = getActiveCompanyId();
    if (!cid) return;
    try {
      const u: any = await uhradyFn({ data: { company_id: cid, ids: [fakturaId] } });
      setUhrada(u?.uhrady?.[fakturaId] ?? null);
    } catch {
      setUhrada(null);
    }
  }

  async function zrusVazbu() {
    if (!uhrada) return;
    try {
      await rozparujFn({ data: { transaction_id: uhrada.transactionId } });
      toast.success(t("Väzba na platbu zrušená."));
      setUhrada(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? t("Zrušiť sa to nepodarilo."));
    }
  }

  async function setStatus(status: string, extra: Record<string, any> = {}) {
    const { error } = await supabase
      .from("purchase_invoices")
      .update({ status, ...extra })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(t("Stav aktualizovaný"));
    load();
  }

  async function nastavZakazku(jobId: string) {
    const { error } = await supabase
      .from("purchase_invoices")
      .update({ job_id: jobId || null })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(jobId ? t("Zákazka priradená") : t("Zákazka odobraná"));
    load();
  }

  async function markPaid() {
    const d = await zadaj(
      t("Dátum úhrady"),
      { predvolene: new Date().toISOString().slice(0, 10), typ: "date" },
      { potvrdit: t("Označiť ako uhradenú") },
    );
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    await setStatus("paid", { payment_date: d });
    void uhradyFaktury.nacitaj();
  }

  const doNespracovanych = useServerFn(prijataDoNespracovanychFn);
  async function vratitDoNespracovanych() {
    if (!(await potvrd(t("Vrátiť faktúru do Nespracovaných dokladov? Zmizne odtiaľto a spracujete ju znova.")))) return;
    try {
      const r = await doNespracovanych({ data: { id } });
      toast.success(t("Faktúra je späť v Nespracovaných"));
      navigate({ to: "/nespracovane/$id", params: { id: r.id } });
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa"));
    }
  }

  async function prepniZamok() {
    const zamknut = !(row as any)?.locked_at;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("purchase_invoices")
      .update({ locked_at: zamknut ? new Date().toISOString() : null, locked_by: zamknut ? (u.user?.id ?? null) : null } as any)
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(
      zamknut
        ? t("Faktúra je zamknutá — sumy, dátumy ani zaúčtovanie sa nedajú meniť")
        : t("Faktúra je odomknutá"),
    );
    await load();
  }

  async function del() {
    if (!(await potvrd(t("Naozaj vymazať túto prijatú faktúru?")))) return;
    const { error } = await supabase
      .from("purchase_invoices")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(t("Vymazané"));
    navigate({ to: "/prijate-faktury" });
  }

  async function downloadPdf() {
    if (!row?.file_path) return toast.error(t("Bez prílohy"));
    const { data, error } = await supabase.storage
      .from("purchase-invoices")
      // Bez koncovky sa súbor uloží ako „VS-2026-777" a systém ho nevie otvoriť.
      .createSignedUrl(row.file_path, 60, {
        download: `${(row.invoice_number ?? "faktura").replace(/[^A-Za-z0-9._-]+/g, "_")}.${(
          row.file_path.split(".").pop() ?? "pdf"
        ).toLowerCase()}`,
      });
    if (error || !data) return toast.error(error?.message ?? t("Chyba"));
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  // Odkaz sa pýta až keď doklad existuje a prílohu má.
  useEffect(() => {
    let zrusene = false;
    if (!row?.file_path) {
      setNahlad(null);
      return;
    }
    supabase.storage
      .from("purchase-invoices")
      .createSignedUrl(row.file_path, 600)
      .then(({ data }) => {
        if (!zrusene) setNahlad(data?.signedUrl ?? null);
      });
    return () => {
      zrusene = true;
    };
  }, [row?.file_path]);

  if (nenajdene)
    return (
      <PageBody>
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm">
          <p>{t("Tento doklad v aktívnej firme neexistuje.")}</p>
          <p className="mt-1 text-muted-foreground">
            {t("Ak patrí inej vašej firme, prepnite sa na ňu hore v lište.")}
          </p>
          <Link to="/prijate-faktury" className="mt-4 inline-block text-primary underline">
            {t("Späť na prijaté faktúry")}
          </Link>
        </div>
      </PageBody>
    );
  if (!row) return <PageBody>{t("Načítavam…")}</PageBody>;

  /*
    Samofaktúra pred odsúhlasením je len návrh — prijatou faktúrou sa stane
    až súhlasom dodávateľa. Dovtedy ju nemožno označiť ako prijatú ani platiť.
  */
  const samo = Boolean(row.samofakturacia);
  const navrh = !zapocitatelna(row);
  const poSplatnosti =
    !navrh &&
    row.status !== "paid" &&
    row.status !== "cancelled" &&
    !!row.due_date &&
    new Date(row.due_date) < new Date(new Date().toDateString());

  const menu = (
    <>
      <MenuSkupina label={t("Úpravy a zaúčtovanie")}>
        {row.status !== "cancelled" && !samo && (
          <MenuAkcia asChild>
            <Link to="/prijate-faktury/$id/upravit" params={{ id }}>
              <Pencil className="h-4 w-4" /> {t("Upraviť")}
            </Link>
          </MenuAkcia>
        )}
        {(row as any).type === "regular" && !navrh && (
          <MenuAkcia ikona={BookCheck} onClick={skocNaZauctovanie}>
            {row.zauctovane_at ? t("Zaúčtovanie") : t("Zaúčtovať")}
          </MenuAkcia>
        )}
        {!navrh && !row.zauctovane_at && row.status !== "received" && row.status !== "paid" && row.status !== "cancelled" && (
          <MenuAkcia ikona={CheckCircle2} onClick={() => setStatus("received")}>
            {t("Označiť ako prijaté")}
          </MenuAkcia>
        )}
        {row.exported_at && (
          <MenuAkcia
            ikona={SendHorizontal}
            onClick={async () => {
              if (await poslatOpravu("prijata", row.company_id, row.id)) void load();
            }}
            title={t("Faktúra sa vráti z Pohody, aby sa dala opraviť a odovzdať znova")}
          >
            {t("Poslať opravu do Pohody")}
          </MenuAkcia>
        )}
        {!row.exported_at && !samo && (
          <MenuAkcia ikona={(row as any).locked_at ? LockOpen : Lock} onClick={prepniZamok}>
            {(row as any).locked_at ? t("Odomknúť úpravy") : t("Zamknúť proti úpravám")}
          </MenuAkcia>
        )}
      </MenuSkupina>
      <MenuSkupina label={t("Ostatné")}>
      <MenuAkcia
        ikona={ExternalLink}
        onClick={() => window.open(window.location.href, "_blank", "noopener,noreferrer")}
      >
        {t("Otvoriť v novej karte")}
      </MenuAkcia>
      {row.file_path ? (
        <MenuAkcia ikona={Printer} onClick={downloadPdf}>
          {t("Vytlačiť / stiahnuť PDF")}
        </MenuAkcia>
      ) : null}
        {(row as any).inbox_message_id && (
          <MenuAkcia ikona={Mail} onClick={() => setZdrojovyMail(true)}>
            {t("Zdrojový e-mail")}
          </MenuAkcia>
        )}
        {row.file_path && !row.exported_at && !samo && (
          <MenuAkcia
            ikona={Paperclip}
            onClick={() => setPresunPrilohy(true)}
            title={t("Je to druhá strana či dodací list k inej faktúre — pripojí sa k nej ako príloha")}
          >
            {t("Presunúť ako prílohu")}
          </MenuAkcia>
        )}
        {!row.exported_at && !(row as any).locked_at && !samo && (
          <MenuAkcia
            ikona={Undo2}
            onClick={vratitDoNespracovanych}
            title={t("Zle zaradená faktúra — spracuje sa znova v Nespracovaných dokladoch")}
          >
            {t("Vrátiť do Nespracovaných")}
          </MenuAkcia>
        )}
      </MenuSkupina>
      <MenuSkupina>
        {row.status !== "cancelled" && (
          <MenuAkcia ikona={Ban} onClick={() => setStatus("cancelled")} nebezpecna>
            {t("Storno")}
          </MenuAkcia>
        )}
        <MenuAkcia ikona={Trash2} onClick={del} nebezpecna>
          {t("Vymazať")}
        </MenuAkcia>
      </MenuSkupina>
    </>
  );

  const titulok = t(
    samo
      ? row.opravuje_cislo
        ? "Dobropis (samofaktúra)"
        : "Samofaktúra"
      : (row as any).type === "proforma"
        ? "Prijatá zálohová faktúra"
        : "Prijatá faktúra",
  );
  const stavOdznak = (
    <>
      <StavOdznak className={STATUS_CLASS[row.status] ?? undefined}>
        {t(STATUS_LABEL[row.status] ?? row.status)}
      </StavOdznak>
      {/* Čiastočná úhrada nie je hodnota `status` — počíta sa z úhrad faktúry. */}
      {uhradyFaktury.stav.stav === "ciastocne" &&
      row.status !== "paid" &&
      row.status !== "cancelled" &&
      row.status !== "draft" ? (
        <StavOdznak className="bg-amber-50 text-amber-800">{t("Čiastočne uhradená")}</StavOdznak>
      ) : null}
    </>
  );
  const prepniPolozky = async (vypnut: boolean) => {
    // Položky sa presunú bokom (a späť) — všetko, čo z nich počíta, ich prestane vidieť.
    const zmena = vypnut
      ? { items: [], polozky_vypnute: row.items }
      : { items: row.polozky_vypnute ?? [], polozky_vypnute: null };
    const { error } = await supabase.from("purchase_invoices").update(zmena as any).eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success(
      vypnut
        ? t("Položky sú vypnuté — faktúra sa zaúčtuje podľa súčtov dokladu.")
        : t("Položky sú znova zapnuté."),
    );
    load();
  };

  /* Kompaktné rozloženie: lišta ikon hore a jeden stĺpec kariet. */
  if (kompaktne)
    return (
      <>
        {zdrojovyMail && (
          <OknoZdrojovehoMailu druh="prijata" id={row.id} onClose={() => setZdrojovyMail(false)} />
        )}
        {presunPrilohy && (
          <PresunAkoPrilohuOkno
            companyId={row.company_id}
            zdroj={{ agenda: "prijata", id: row.id }}
            onClose={() => setPresunPrilohy(false)}
          />
        )}
        <DocumentDetailHeader
          title={titulok}
          number={row.invoice_number}
          status={stavOdznak}
          meta={<MetaRiadok polozky={[row.supplier_name]} />}
          secondaryActions={
            <>
              {row.status !== "cancelled" && !samo ? (
                <SekundarnaAkcia
                  ikona={Pencil}
                  label={t("Upraviť")}
                  onClick={() => navigate({ to: "/prijate-faktury/$id/upravit", params: { id } })}
                />
              ) : null}
              {!navrh ? (
                <SekundarnaAkcia
                  ikona={MessageSquare}
                  label={t("Komentáre")}
                  onClick={() =>
                    document.getElementById("komentare")?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                />
              ) : null}
              <SekundarnaAkcia ikona={Trash2} label={t("Vymazať")} onClick={del} />
              {!navrh ? (
                <DokladPoradie
                  tabulka="purchase_invoices"
                  companyId={row.company_id}
                  id={row.id}
                  createdAt={row.created_at}
                  onOtvor={(dalsi) => navigate({ to: "/prijate-faktury/$id", params: { id: dalsi } })}
                />
              ) : null}
            </>
          }
          menuActions={menu}
        />
        <PageBody>
          <PrijataDetailKompaktna
            row={row}
            nahladUrl={nahlad}
            navrh={navrh}
            onZmena={load}
            onStiahni={downloadPdf}
            onPrepniPolozky={prepniPolozky}
            hore={
              <>
                {!navrh ? (
                  <div className="flex flex-wrap items-start gap-3 [&>*]:min-w-0">
                    <StitkyDokladu
                      tabulka="purchase_invoices"
                      id={row.id}
                      stitky={(row as any).stitky ?? []}
                      zamknute={Boolean(row.exported_at || (row as any).locked_at)}
                      companyId={row.company_id}
                    />
                    {ciselnikyFirmy.stavy.length ? (
                      <label className="block w-full sm:w-64">
                        <span className="mb-1 block text-xs text-muted-foreground">{t("Stav dokladu")}</span>
                        <VyberStavuDokladu
                          key={row.id}
                          tabulka="purchase_invoices"
                          id={row.id}
                          stavId={(row as any).stav_id}
                          stavy={ciselnikyFirmy.stavy}
                        />
                      </label>
                    ) : null}
                  </div>
                ) : null}
                {samo && <SamofakturaPanel row={row} onZmena={load} />}
                <AutomatickyZaradena id={row.id} naKontroluAt={(row as any).na_kontrolu_at} />
                <UpozornenieKontrolyEfaktury invoiceId={row.id} />
                <RegistrPlatcuDph
                  companyId={row.company_id}
                  dic={row.supplier_dic}
                  icDph={row.supplier_ic_dph}
                  iban={row.supplier_iban}
                />
                {!navrh && (
                  <SchvalovaniePanel companyId={row.company_id} agenda="prijata" id={row.id} onZmena={load} />
                )}
              </>
            }
            bokom={
              <div className="space-y-3 text-sm">
                <div>
                  {t("Splatnosť:")} {popisSplatnosti(row)}
                </div>
                <PredlzitSplatnost druh="prijata" faktura={row} onZmena={load} />
                {uhrada && (
                  <div className="flex items-center justify-between gap-2 rounded-md bg-muted/60 px-2 py-1.5 text-xs">
                    <span className="min-w-0">
                      <span className="block font-medium">{t("Zaplatené z účtu")}</span>
                      <span className="block truncate text-muted-foreground">
                        {datumNaDoklade(uhrada.datum)}
                        {uhrada.protistrana ? ` · ${uhrada.protistrana}` : ""}
                      </span>
                    </span>
                    <button
                      onClick={zrusVazbu}
                      className="shrink-0 rounded border border-border px-2 py-1 text-muted-foreground hover:bg-background"
                    >
                      {t("Zrušiť väzbu")}
                    </button>
                  </div>
                )}
                <div className="empty:hidden">
                  <JobPicker value={row.job_id ?? ""} onChange={(v) => nastavZakazku(v)} label={t("Zákazka")} />
                </div>
                {accounts.length > 0 && row.status !== "cancelled" && row.status !== "paid" && !navrh && row.supplier_iban ? (
                  <div className="space-y-2 rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Landmark className="h-3.5 w-3.5" /> {t("Zaplatiť cez banku")}
                    </div>
                    <select
                      aria-label={t("Z účtu")}
                      value={debtorAccountId}
                      onChange={(e) => setDebtorAccountId(e.target.value)}
                      className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                    >
                      <option value="">{t("Vyberiem v banke")}</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.account_name ?? a.iban}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={payViaBank}
                      disabled={paying}
                      className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      <Landmark className="h-4 w-4" />
                      {paying ? t("Pripravujem…") : t("Zaplatiť cez banku")}
                    </button>
                  </div>
                ) : null}
              </div>
            }
          />
        </PageBody>
      </>
    );

  /*
    Kúsky detailu. Skladajú sa v dvoch rozloženiach: bez náhľadu (hlavný
    stĺpec + bočný 320 px) a s dokladom vľavo — vtedy je vpravo jeden stĺpec,
    navrchu údaje pre účtovníka a úhrada, a to, čo len opakuje doklad
    (strany, položky, poznámka), je zbalené v „Údajoch faktúry“.
  */
  const pdfRozlozenie = nahladDetail.zapnuty && !!row.file_path && sirokaPreNahlad;
  const udajeUctovnika: UdajeUctovnika = {
    cislo: row.invoice_number,
    druh: titulok,
    stranaNadpis: "Dodávateľ",
    strana: {
      nazov: row.supplier_name,
      ico: row.supplier_ico,
      dic: row.supplier_dic,
      icDph: row.supplier_ic_dph,
    },
    vystavenie: row.issue_date,
    dodanie: row.delivery_date,
    splatnost: row.due_date ? popisSplatnosti(row) : null,
    vs: vsPrijatej(row) || null,
    formaUhrady: row.payment_method ? t(row.payment_method) : null,
    mena: row.currency ?? "EUR",
    kurz: row.exchange_rate,
    rozpis: rozpisPrijatej(row).map((x) => ({
      sadzba: x.sadzba,
      zaklad: x.zaklad,
      dan: x.dph,
      prenesenie: Boolean(x.pdp),
    })),
    zaklad: Number(row.amount_without_vat ?? 0),
    dph: Number(row.vat_amount ?? 0),
    zlava: Number(row.discount_total ?? 0),
    zaloha: Number(row.advance_amount ?? 0) > 0 ? Number(row.advance_amount) : null,
    kUhrade: uhradyFaktury.stav.naUhradu,
    spolu: Number(row.amount_total ?? 0),
    rezimy: rezimDphPrijatej(row),
    uhrada: {
      uhradena: uhradyFaktury.stav.stav === "uhradena",
      datum: row.payment_date,
      zostava: uhradyFaktury.stav.zostava,
      ciastocne: uhradyFaktury.stav.stav === "ciastocne",
      bezUhrady: navrh || row.status === "cancelled" || row.status === "draft",
    },
    zauctovanie:
      row.type === "regular" && !navrh
        ? {
            ...stavZauctovania(row),
            predkontacia: row.pohoda_predkontacia,
            clenenie: row.pohoda_clenenie_dph,
            kv: row.kv_clenenie,
          }
        : null,
  };
  const stitkyAStav = !navrh ? (
    <>
      <StitkyDokladu
        tabulka="purchase_invoices"
        id={row.id}
        stitky={(row as any).stitky ?? []}
        zamknute={Boolean(row.exported_at || (row as any).locked_at)}
        companyId={row.company_id}
      />
      {ciselnikyFirmy.stavy.length ? (
        <label className="mt-3 block sm:max-w-[16rem]">
          <span className="mb-1 block text-sm font-medium">{t("Stav dokladu")}</span>
          <VyberStavuDokladu
            key={row.id}
            tabulka="purchase_invoices"
            id={row.id}
            stavId={(row as any).stav_id}
            stavy={ciselnikyFirmy.stavy}
          />
        </label>
      ) : null}
    </>
  ) : null;
  /* Interná poznámka je v tej istej karte ako komentáre — dva skoro rovnaké názvy mätli. */
  const kartaKomentare = !navrh ? (
    <KomentarePanel companyId={row.company_id} agenda="prijata" id={row.id}>
      <KomentarDokladu tabulka="purchase_invoices" id={row.id} komentar={(row as any).komentar} />
    </KomentarePanel>
  ) : null;
  const vazbaUhrady = uhrada ? (
    <div className="mt-1 flex items-center justify-between gap-2 rounded-md bg-muted/60 px-2 py-1.5 text-xs">
      <span className="min-w-0">
        <span className="block font-medium">{t("Zaplatené z účtu")}</span>
        <span className="block truncate text-muted-foreground">
          {datumNaDoklade(uhrada.datum)}
          {uhrada.protistrana ? ` · ${uhrada.protistrana}` : ""}
        </span>
      </span>
      <button
        onClick={zrusVazbu}
        className="shrink-0 rounded border border-border px-2 py-1 text-muted-foreground hover:bg-background"
      >
        {t("Zrušiť väzbu")}
      </button>
    </div>

  ) : null;
  /* `sVazbou` — väzba na úhradu z banky; pri náhľade je v platbe, inak pri dátumoch. */
  const kartaStrany = (sVazbou: boolean) => (
    <div className="grid min-w-0 gap-6 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 sm:p-6">
      <div className="min-w-0 break-words">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {t("Dodávateľ")}
        </div>
        <div className="mt-1 font-medium">{row.supplier_name}</div>
        {(row.supplier_street || row.supplier_city) && (
          <div className="text-sm text-muted-foreground">
            {[row.supplier_street, [row.supplier_zip, row.supplier_city].filter(Boolean).join(" ")]
              .filter(Boolean)
              .join(", ")}
          </div>
        )}
        <div className="mt-2 text-sm">
          {t("IČO")}: {row.supplier_ico ?? "—"} · {t("DIČ")}: {row.supplier_dic ?? "—"}
        </div>
        {row.supplier_ic_dph && (
          <div className="text-sm">
            {t("IČ DPH")}: {row.supplier_ic_dph}
          </div>
        )}
        {row.supplier_iban && (
          <div className="mt-2 font-mono text-sm">{row.supplier_iban}</div>
        )}
        {vsPrijatej(row) && (
          <div className="text-sm text-muted-foreground">
            {t("VS")}: {vsPrijatej(row)}
          </div>
        )}
      </div>
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("Dátumy")}</div>
        <Row label={t("Vystavenie")} value={datumNaDoklade(row.issue_date)} />
        <Row
          label={t("Dodanie (daňové plnenie)")}
          value={
            row.delivery_date
              ? datumNaDoklade(row.delivery_date)
              : t("{datum} (ako vystavenie)", { datum: datumNaDoklade(row.issue_date) })
          }
        />
        <Row label={t("Prijatie")} value={datumNaDoklade(row.received_date)} />
        <Row label={t("Splatnosť")} value={popisSplatnosti(row)} />
        {row.payment_date && <Row label={t("Úhrada")} value={datumNaDoklade(row.payment_date)} />}
        {sVazbou && vazbaUhrady}
      </div>
    </div>
  );
  const kartaPlatba = (sVazbou: boolean) => (
    <div className="rounded-xl border border-border bg-card p-5 text-sm">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Wallet className="h-3.5 w-3.5" /> {t("Platba")}
      </div>
      <div className="mt-2">
        {t("Spôsob:")} {row.payment_method ? t(row.payment_method) : "—"}
      </div>
      <div>
        {t("Splatnosť:")} {popisSplatnosti(row)}
      </div>
      {predlzena(row) && (
        <div className="text-xs text-muted-foreground">
          {t("Oprava odpočtu podľa § 53b sa počíta od pôvodnej splatnosti.")}
          {row.predlzenie_poznamka
            ? " " + t("Dohoda: {text}", { text: row.predlzenie_poznamka })
            : ""}
        </div>
      )}
      <div className="mt-2">
        <PredlzitSplatnost druh="prijata" faktura={row} onZmena={load} />
      </div>
      {row.payment_date && (
        <div>
          {t("Uhradené:")} {datumNaDoklade(row.payment_date)}
        </div>
      )}
      {sVazbou && vazbaUhrady}
    </div>
  );
  const kartyHore = (
    <>
      {samo && <SamofakturaPanel row={row} onZmena={load} />}
      <RegistrPlatcuDph
        companyId={row.company_id}
        dic={row.supplier_dic}
        icDph={row.supplier_ic_dph}
        iban={row.supplier_iban}
      />
    </>
  );
  const kartaPrilohy = (
    <>
      <PrilohyFaktury druh="purchase_invoice" dokladId={row.id} mozeMenit={!row.exported_at} />
      {presunPrilohy && (
        <PresunAkoPrilohuOkno
          companyId={row.company_id}
          zdroj={{ agenda: "prijata", id: row.id }}
          onClose={() => setPresunPrilohy(false)}
        />
      )}
    </>
  );
  const kartaPolozky = (
    <PolozkyDokladu
      items={row.items}
      vypnute={row.polozky_vypnute}
      mena={row.currency}
      samo={samo}
      mozeMenit={!row.exported_at}
      onPrepni={prepniPolozky}
    />
  );
  const kartaPoznamka = row.note ? (
    <div className="rounded-xl border border-border bg-card p-5 text-sm whitespace-pre-wrap">
      {row.note}
    </div>

  ) : null;
  const kartaUhradyPrijatej = (
    <>
      {!navrh && row.status !== "cancelled" && row.status !== "draft" ? (
        <KartaUhrady
          row={row}
          stav={uhradyFaktury.stav}
          onOznacit={markPaid}
          onPridat={() => setOknoUhrad(true)}
        />
      ) : null}
      {oknoUhrad ? (
        <UhradyOkno
          row={row}
          uhrady={uhradyFaktury.uhrady}
          stav={uhradyFaktury.stav}
          onClose={() => setOknoUhrad(false)}
          onZmena={() => {
            void uhradyFaktury.nacitaj();
            void load();
          }}
        />
      ) : null}
    </>
  );
  const kartaZakazka = (
    <>
      {/* Zákazku sa oplatí dať dodatočne aj na starší nákup — vtedy sa
          náklad prejaví vo vyhodnotení hneď po uložení. */}
      {/* `empty:hidden` — bez zákaziek JobPicker nevykreslí nič a ostávala prázdna biela karta. */}
      <div className="rounded-xl border border-border bg-card p-5 empty:hidden">
        <JobPicker
          value={row.job_id ?? ""}
          onChange={(v) => nastavZakazku(v)}
          label={t("Zákazka")}
        />
      </div>
    </>
  );
  const kartaBanka = (
    <>
      {accounts.length > 0 && row.status !== "cancelled" && !navrh && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 dark:border-emerald-900/40">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
            <Landmark className="h-3.5 w-3.5" /> {t("Zaplatiť cez banku")}
          </div>

          {!row.supplier_iban ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {t("Faktúra nemá IBAN dodávateľa — bez neho sa príkaz nedá zadať.")}
            </p>
          ) : row.status === "paid" ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {t("Faktúra je označená ako zaplatená.")}
            </p>
          ) : (
            <>
              <div className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{t("Príjemca")}</span>
                  <span className="text-right">{row.supplier_name}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{t("IBAN")}</span>
                  <span className="font-mono text-xs">{row.supplier_iban}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{t("Suma")}</span>
                  <span className="font-semibold tabular-nums">
                    {fmt(Number(row.amount_total), row.currency)}
                  </span>
                </div>
                {vsPrijatej(row) && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{t("VS")}</span>
                    <span className="tabular-nums">{vsPrijatej(row)}</span>
                  </div>
                )}
              </div>

              <label className="mt-3 block text-xs text-muted-foreground">
                {t("Z účtu")}
                <select
                  value={debtorAccountId}
                  onChange={(e) => setDebtorAccountId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                >
                  <option value="">{t("Vyberiem v banke")}</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.account_name ?? a.iban}
                    </option>
                  ))}
                </select>
              </label>

              <button
                onClick={payViaBank}
                disabled={paying}
                className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Landmark className="h-4 w-4" />
                {paying ? t("Pripravujem…") : t("Zaplatiť cez banku")}
              </button>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("Presmerujeme vás do Tatra banky na podpis. Z účtu sa nič nestrhne, kým platbu nepodpíšete.")}
              </p>
            </>
          )}

          {payments.length > 0 && (
            <div className="mt-4 border-t border-emerald-200 pt-3 dark:border-emerald-900/40">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("História platieb")}
              </div>
              <ul className="mt-2 space-y-2">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium">
                        {t(
                          PAYMENT_STATUS_TEXT[p.transaction_status] ??
                            p.transaction_status ??
                            p.status,
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(p.created_at).toLocaleString("sk-SK")} ·{" "}
                        {fmt(Number(p.amount), p.currency)}
                      </div>
                      {p.error_message && (
                        <div className="text-xs text-rose-700">{p.error_message}</div>
                      )}
                    </div>
                    <button
                      onClick={() => onRefreshPayment(p.id)}
                      title={t("Načítať aktuálny stav z banky")}
                      className="rounded-md border border-border bg-background p-1.5 hover:bg-secondary"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </>
  );

  return (
    <>
      {zdrojovyMail && (
        <OknoZdrojovehoMailu druh="prijata" id={row.id} onClose={() => setZdrojovyMail(false)} />
      )}
      <DocumentDetailHeader
        title={titulok}
        number={row.invoice_number}
        status={stavOdznak}
        meta={
          <MetaRiadok
            polozky={[
              t("Dodávateľ: {dodavatel}", { dodavatel: row.supplier_name }),
              t("Vystavená {datum}", { datum: datumNaDoklade(row.issue_date) }),
              row.due_date ? (
                <PoTermine aktivne={poSplatnosti}>
                  {t("splatná {splatnost}", { splatnost: popisSplatnosti(row) })}
                </PoTermine>
              ) : null,
              (row as any).type === "proforma"
                ? t("Nie je daňový doklad — daň prinesie ostrá faktúra.")
                : null,
            ]}
          />
        }
        primaryAction={
          !navrh && row.status !== "paid" && row.status !== "cancelled" ? (
            <PrimarnaAkcia onClick={markPaid}>
              <CheckCircle2 /> {t("Označiť ako zaplatené")}
            </PrimarnaAkcia>
          ) : null
        }
        secondaryActions={
          <>
            {row.file_path ? (
              <SekundarnaAkcia ikona={Download} label={t("Stiahnuť PDF")} onClick={downloadPdf} />
            ) : null}
            {!navrh ? (
              <DokladPoradie
                tabulka="purchase_invoices"
                companyId={row.company_id}
                id={row.id}
                createdAt={row.created_at}
                onOtvor={(dalsi) => navigate({ to: "/prijate-faktury/$id", params: { id: dalsi } })}
              />
            ) : null}
          </>
        }
        menuActions={menu}
      />
      <PageBody>
        <div className="mb-4 space-y-3 empty:hidden">
          <AutomatickyZaradena id={row.id} naKontroluAt={(row as any).na_kontrolu_at} />
          <UpozornenieKontrolyEfaktury invoiceId={row.id} />
        </div>
        {!navrh && !pdfRozlozenie && <div className="mb-4">{stitkyAStav}</div>}
        <DetailSNahladom
          zobrazit={nahladDetail.zapnuty && !!row.file_path}
          subor={nahlad ? { url: nahlad, obrazok: (row.file_mime ?? "").startsWith("image/") } : undefined}
          nazov={[row.invoice_number, row.supplier_name].filter(Boolean).join(" · ")}
          onSkryt={() => nahladDetail.prepni(false)}
          akcie={
            <button
              type="button"
              onClick={downloadPdf}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
            >
              <Download className="h-3.5 w-3.5" /> {t("Stiahnuť")}
            </button>
          }
        >
        {pdfRozlozenie ? (
          <div className="min-w-0 space-y-4">
            <UdajePreUctovnika u={udajeUctovnika} />
            {kartaUhradyPrijatej}
            {/* Zaúčtovanie pred platobnými údajmi — je pre účtovníka dôležitejšie. */}
            {row.type === "regular" && !navrh && <ZauctovaniePanel row={row} onZmena={load} />}
            {kartaPlatba(true)}
            {kartaBanka}
            {kartaZakazka}
            {kartyHore}
            {!navrh && (
              <SchvalovaniePanel companyId={row.company_id} agenda="prijata" id={row.id} onZmena={load} />
            )}
            {stitkyAStav && (
              <div className="rounded-xl border border-border bg-card p-4">{stitkyAStav}</div>
            )}
            {kartaPrilohy}
            {kartaKomentare}
            {!navrh && <SpracovalDokladu companyId={row.company_id} agenda="prijata" row={row} />}
            <ZbaleneK nadpis="Údaje faktúry">
              <div className="space-y-4">
                {kartaStrany(false)}
                {kartaPolozky}
                {kartaPoznamka}
              </div>
            </ZbaleneK>
            {!navrh && <HistoriaDokladu companyId={row.company_id} agenda="prijata" id={row.id} />}
          </div>
        ) : (
        /* `grid-cols-1` + `min-w-0`: bez nich stĺpec na mobile rástol podľa najširšej tabuľky a stránka sa orezávala. */
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-6">
            {kartyHore}
            {kartaStrany(true)}

            {!navrh && (
              <SchvalovaniePanel companyId={row.company_id} agenda="prijata" id={row.id} onZmena={load} />
            )}
            {row.type === "regular" && !navrh && <ZauctovaniePanel row={row} onZmena={load} />}
            {kartaKomentare}
            {!navrh && <SpracovalDokladu companyId={row.company_id} agenda="prijata" row={row} />}
            {!navrh && <HistoriaDokladu companyId={row.company_id} agenda="prijata" id={row.id} />}
            {kartaPrilohy}

            {kartaPolozky}

            {/* Na širokej obrazovke je doklad vľavo; tu ostáva pre mobil a pre toho, kto ho skryl. */}
            <div className={nahladDetail.zapnuty ? "lg:hidden" : ""}>
              <NahladPrilohy
                url={nahlad}
                mime={row.file_mime}
                maPrilohu={!!row.file_path}
                stiahni={downloadPdf}
                zobrazitVedla={nahladDetail.zapnuty ? undefined : () => nahladDetail.prepni(true)}
              />
            </div>

            {kartaPoznamka}
          </div>

          <aside className="min-w-0 space-y-4">
            {kartaUhradyPrijatej}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("Sumár")}</div>
              <div className="mt-3 space-y-1 text-sm">
                <Row label={t("Bez DPH")} value={fmt(Number(row.amount_without_vat), row.currency)} />
                <Row label={t("DPH")} value={fmt(Number(row.vat_amount), row.currency)} />
              </div>
              <div className="mt-3 border-t border-border pt-3 text-lg font-semibold">
                {fmt(Number(row.amount_total), row.currency)}
              </div>
            </div>
            {/* Platba hneď pod sumárom — doteraz bola až pod zákazkou. */}
            {kartaPlatba(false)}
            {kartaZakazka}
            {kartaBanka}
          </aside>
        </div>
        )}
        </DetailSNahladom>
      </PageBody>
    </>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="min-w-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right tabular-nums">{value}</span>
    </div>
  );
}

/**
 * Položky prečítané z dokladu.
 *
 * Sú informatívne — needitujú sa a nespájajú so skladom. Zmysel majú v tom, že
 * pri kontrole nemusí človek otvárať PDF, keď chce len vidieť, za čo to je.
 */
function PolozkyDokladu({
  items,
  vypnute,
  mena,
  samo,
  mozeMenit,
  onPrepni,
}: {
  items: unknown;
  /** Položky, ktoré človek vypol (zle vyčítané) — účtuje sa bez nich. */
  vypnute?: unknown;
  mena?: string | null;
  /** Samofaktúru sme písali my — položky nie sú prečítané z prílohy. */
  samo?: boolean;
  /** Odovzdanú faktúru už meniť nemožno. */
  mozeMenit?: boolean;
  onPrepni?: (vypnut: boolean) => void;
}) {
  const { t } = useT();
  const jeVypnute = Array.isArray(vypnute) && vypnute.length > 0 && (!Array.isArray(items) || items.length === 0);
  const zoznam = (jeVypnute ? vypnute : items) as any[];
  if (!Array.isArray(zoznam) || zoznam.length === 0) return null;
  const cena = (n: unknown) =>
    typeof n === "number" && Number.isFinite(n) ? formatovacMeny(mena || "EUR", "sk-SK")(n) : "—";

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
        <h2 className="text-sm font-medium">
          {samo ? t("Položky") : t("Položky z dokladu")}
          {jeVypnute && (
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
              {t("vypnuté")}
            </span>
          )}
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {zoznam.length === 1
              ? t("1 položka")
              : zoznam.length < 5
                ? t("{n} položky", { n: zoznam.length })
                : t("{n} položiek", { n: zoznam.length })}
            {samo ? ` · ${t("ceny bez DPH")}` : ` · ${t("prečítané z prílohy")}`}
          </span>
          {!samo && onPrepni && mozeMenit !== false && (
            <button
              type="button"
              onClick={() => onPrepni(!jeVypnute)}
              className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-secondary"
              title={
                jeVypnute
                  ? t("Vrátiť položky — rozúčtovanie a export ich znova použijú")
                  : t("Zle vyčítané položky — účtovať len podľa súčtov a rozpisu DPH v hlavičke")
              }
            >
              {jeVypnute ? t("Zapnúť položky") : t("Vypnúť položky")}
            </button>
          )}
        </div>
      </div>
      <div className={`overflow-x-auto ${jeVypnute ? "opacity-50" : ""}`}>
        <table className="w-full min-w-[34rem] text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-3">{t("Položka")}</th>
              <th className="p-3 text-right">{t("Množstvo")}</th>
              <th className="p-3 text-right">{t("Cena za kus")}</th>
              <th className="p-3 text-right">{t("DPH")}</th>
              <th className="p-3 text-right">{t("Spolu")}</th>
            </tr>
          </thead>
          <tbody className={`divide-y divide-border ${jeVypnute ? "line-through" : ""}`}>
            {zoznam.map((p, i) => (
              <tr key={i}>
                <td className="p-3">{p?.name ?? "—"}</td>
                <td className="p-3 text-right tabular-nums">
                  {p?.quantity != null ? `${formatujCislo(p.quantity, 0, 4)}${p?.unit ? ` ${p.unit}` : ""}` : "—"}
                </td>
                <td className="p-3 text-right tabular-nums">{cena(p?.unit_price)}</td>
                <td className="p-3 text-right tabular-nums">
                  {p?.vat_rate != null ? `${p.vat_rate} %` : "—"}
                </td>
                <td className="p-3 text-right tabular-nums font-medium">{cena(p?.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
        {samo
          ? t("Položky samofaktúry určujú jej sumy a DPH po sadzbách. Skladové položky sa po odsúhlasení dajú prijať na sklad.")
          : jeVypnute
            ? t("Položky sú vypnuté — zaúčtovanie, export do Pohody aj výkazy k DPH idú len podľa súčtov a rozpisu DPH v hlavičke dokladu.")
            : t("Rozhodujú sumy v hlavičke dokladu. Položky sa použijú pri rozúčtovaní a v exporte do Pohody, ak sedia so súčtami — keď sú vyčítané zle, vypnite ich.")}
      </p>
    </div>
  );
}

/**
 * Náhľad prílohy priamo na stránke. PDF sa vloží cez `object`, fotka ako obrázok
 * — sťahovať sa nemusí nič. Keď to prehliadač nezvládne, ostáva tlačidlo.
 */
function NahladPrilohy({
  url,
  mime,
  maPrilohu,
  stiahni,
  zobrazitVedla,
}: {
  url: string | null;
  mime?: string | null;
  maPrilohu: boolean;
  stiahni: () => void;
  /** Vráti doklad vľavo vedľa údajov (len na širokej obrazovke). */
  zobrazitVedla?: () => void;
}) {
  const { t } = useT();
  if (!maPrilohu) return null;
  const jeObrazok = (mime ?? "").startsWith("image/");

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
        <h2 className="text-sm font-medium">{t("Náhľad dokladu")}</h2>
        {zobrazitVedla && (
          <button
            type="button"
            onClick={zobrazitVedla}
            className="ml-auto hidden items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-secondary lg:inline-flex"
          >
            {t("Zobraziť vedľa údajov")}
          </button>
        )}
        <button
          onClick={stiahni}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-secondary"
        >
          <Download className="h-3.5 w-3.5" /> {t("Stiahnuť")}
        </button>
      </div>
      {!url ? (
        <div className="p-8 text-center text-sm text-muted-foreground">{t("Načítavam náhľad…")}</div>
      ) : jeObrazok ? (
        <img src={url} alt={t("Doklad")} className="max-h-[70vh] w-full bg-muted/20 object-contain" />
      ) : (
        /* Vlastné vykreslenie — na zabudovaný prehliadač PDF sa spoľahnúť nedá. */
        <NahladPdf url={url} />
      )}
    </div>
  );
}
