import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  listBankData,
  listBankStatements,
  getBankStatementUrl,
} from "@/lib/faktero/tatrabanka.functions";
import { zostavVypisZTransakciiFn } from "@/lib/faktero/vypis-z-transakcii.functions";
import { skratkaUctuPohodyFn, vypisPreXmlImportPohodyFn } from "@/lib/faktero/vypis-pohoda-xml.functions";
import { zadaj } from "@/lib/potvrdenie";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";
import { triedaStavu } from "@/components/faktero/web/Stav";
import { NacitavanieStav } from "@/components/faktero/web/StavyObsahu";
import { useListFilters, zoznamSearch } from "@/hooks/useListFilters";
import { useStrankovanie } from "@/hooks/useStrankovanie";
import {
  FileText,
  FileCode2,
  ArrowLeft,
  Download,
  Info,
  Clock,
  AlertCircle,
  Sparkles,
  Wand2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/bankove-ucty/vypisy")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk ?? "sk", "Bankové výpisy — Faktero") }] }),
  validateSearch: (s: Record<string, unknown>) => ({ ...zoznamSearch(s) }),
  component: BankStatementsPage,
});

const MESIACE = [
  "Január",
  "Február",
  "Marec",
  "Apríl",
  "Máj",
  "Jún",
  "Júl",
  "August",
  "September",
  "Október",
  "November",
  "December",
];

/** "2026-07-01" → "Júl 2026" */
function fmtObdobie(periodStart: string, t: (s: string) => string = (s) => s) {
  const [y, m] = periodStart.split("-");
  return `${t(MESIACE[Number(m) - 1])} ${y}`;
}

/** Posledných 13 mesiacov vrátane aktuálneho, od najnovšieho: ["2026-11", "2026-10", …] */
function poslednychMesiacov(pocet = 13, dnes = new Date()): string[] {
  const out: string[] = [];
  for (let i = 0; i < pocet; i++) {
    const d = new Date(dnes.getFullYear(), dnes.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** "2026-10-26" → "26. 10. 2026" */
function fmtDen(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${Number(d)}. ${Number(m)}. ${y}`;
}

function fmtVelkost(bytes: number | null) {
  if (!bytes) return "";
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} kB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function BankStatementsPage() {
  const { t } = useT();
  const loadData = useServerFn(listBankData);
  const loadStatements = useServerFn(listBankStatements);
  const getUrl = useServerFn(getBankStatementUrl);
  const zostavVypis = useServerFn(zostavVypisZTransakciiFn);
  const pohodaXml = useServerFn(vypisPreXmlImportPohodyFn);
  const skratkaPohody = useServerFn(skratkaUctuPohodyFn);
  const mesiace = poslednychMesiacov();

  const [accounts, setAccounts] = useState<any[]>([]);
  const [statements, setStatements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [vyberUcet, setVyberUcet] = useState("");
  const [vyberMesiac, setVyberMesiac] = useState(mesiace[1] ?? mesiace[0]);
  const [zostavujem, setZostavujem] = useState(false);

  useEffect(() => {
    (async () => {
      const cid = getActiveCompanyId();
      if (!cid) return setLoading(false);
      try {
        const [d, s] = await Promise.all([
          loadData({ data: { company_id: cid } }),
          loadStatements({ data: { company_id: cid } }),
        ]);
        setAccounts(d.accounts ?? []);
        setVyberUcet((v) => v || d.accounts?.[0]?.id || "");
        setStatements(s.statements ?? []);
      } catch (e: any) {
        toast.error(e?.message ?? t("Nepodarilo sa načítať výpisy"));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function onDownload(row: any) {
    const cid = getActiveCompanyId();
    if (!cid) return;
    setBusy(row.id);
    try {
      const { url } = await getUrl({ data: { company_id: cid, statement_id: row.id } });
      /*
        Odkaz je podpísaný (5 minút) a vracia súbor ako prílohu — stiahne sa bez
        opustenia stránky. Nové okno po čakaní na server prehliadač blokoval.
      */
      const a = document.createElement("a");
      a.href = url;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e: any) {
      toast.error(
        e?.message === "not_ready" ? t("Výpis ešte nie je pripravený") : t("Stiahnutie zlyhalo"),
      );
    } finally {
      setBusy(null);
    }
  }

  /*
    Dávka pre POHODU (Súbor → Dátová komunikácia → XML import) s dátumom platby
    pri každom pohybe. camt.053 zostavený Fakterom POHODA načíta s dátumom konca
    mesiaca pri všetkých platbách.
  */
  async function onPohodaXml(row: any) {
    const cid = getActiveCompanyId();
    if (!cid) return;
    const kluc = `faktero:pohoda-banka:${row.bank_account_id}`;
    let predvolene = "";
    try {
      predvolene = localStorage.getItem(kluc) ?? "";
    } catch {
      /* bez úložiska sa len nepamätá */
    }
    try {
      const r = await skratkaPohody({ data: { company_id: cid, bank_account_id: row.bank_account_id } });
      if (r.skratka) predvolene = r.skratka;
    } catch {
      /* ponúkne sa zapamätaná */
    }
    const banka = await zadaj(
      t("Skratka tohto bankového účtu v POHODE presne tak, ako je v Nastavenie → Bankové účty (stĺpec Skratka). Bez nej dá POHODA pohyby na predvolený účet aj s jeho predkontáciou."),
      { predvolene, placeholder: "VUB" },
      { potvrdit: t("Stiahnuť XML") },
    );
    if (banka === null) return;
    try {
      localStorage.setItem(kluc, banka.trim());
    } catch {
      /* nič */
    }
    setBusy(`${row.id}:pohoda`);
    try {
      const r = await pohodaXml({ data: { company_id: cid, statement_id: row.id, banka } });
      const blob = new Blob([r.content], { type: "application/xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success(t("XML pre POHODU je stiahnuté ({n} pohybov). Načítajte ho cez Súbor → Dátová komunikácia → XML import.", { n: r.pocet }));
    } catch (e: any) {
      toast.error(e?.message ? t(e.message) : t("Stiahnutie zlyhalo"));
    } finally {
      setBusy(null);
    }
  }

  async function onZostav() {
    const cid = getActiveCompanyId();
    if (!cid || !vyberUcet || !vyberMesiac) return;
    setZostavujem(true);
    try {
      const r = await zostavVypis({
        data: { company_id: cid, bank_account_id: vyberUcet, mesiac: vyberMesiac },
      });
      const s = await loadStatements({ data: { company_id: cid } });
      setStatements(s.statements ?? []);
      if (r.ciastocny_od) {
        toast.success(
          t("Čiastočný výpis od {datum} je pripravený — skôr Faktero pohyby z banky nemá.", {
            datum: fmtDen(r.ciastocny_od),
          }),
        );
      } else {
        toast.success(t("Výpis za {obdobie} je pripravený (PDF a XML).", {
          obdobie: fmtObdobie(`${vyberMesiac}-01`, t),
        }));
      }
    } catch (e: any) {
      toast.error(e?.message ? t(e.message) : t("Výpis sa nepodarilo zostaviť"));
    } finally {
      setZostavujem(false);
    }
  }

  const uctyPodlaId = new Map(accounts.map((a) => [a.id, a]));

  // Zoskupenie: obdobie → účet → { PDF, XML }
  const obdobia = new Map<string, Map<string, Record<string, any>>>();
  for (const s of statements) {
    if (!obdobia.has(s.period_start)) obdobia.set(s.period_start, new Map());
    const perUcet = obdobia.get(s.period_start)!;
    if (!perUcet.has(s.bank_account_id)) perUcet.set(s.bank_account_id, {});
    perUcet.get(s.bank_account_id)![s.export_type] = s;
  }
  const zoradeneObdobia = [...obdobia.keys()].sort().reverse();
  // Stránkuje sa po mesiacoch (obdobie = skupina účtov); prázdne obdobia sa vynechajú vopred,
  // aby každá strana mala plný počet.
  const obdobiaSVypismi = zoradeneObdobia
    .map((obdobie) => ({
      id: obdobie,
      riadky: [...obdobia.get(obdobie)!.entries()].filter(([, formaty]) =>
        Object.values(formaty).some((s: any) => s.status !== "unsupported"),
      ),
    }))
    .filter((o) => o.riadky.length > 0);
  const lf = useListFilters({ pageSizeKey: "bankove-vypisy" });
  const strankovanie = useStrankovanie(obdobiaSVypismi, lf);

  // Účty, kde výpis nevydala banka a ani my sme ho nedokázali zostaviť —
  // spravidla preto, že nemáme transakcie za celé obdobie.
  const nepodporovane = accounts
    .filter((a) => statements.some((s) => s.bank_account_id === a.id && s.status === "unsupported"))
    .map((a) => ({
      ...a,
      dovod: statements.find((s) => s.bank_account_id === a.id && s.status === "unsupported")
        ?.error,
    }));

  const maVlastne = statements.some((s) => s.source === "faktero" && s.status === "ready");

  return (
    <>
      <PageHeader
        title={t("Bankové výpisy")}
        description={t("Mesačné výpisy v PDF a XML. Sťahujú sa automaticky; pre účty vedené v inej banke ich zostaví Faktero.")}
        action={
          <Link
            to="/bankove-ucty"
            className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-input bg-background px-3 text-sm font-semibold hover:bg-accent"
          >
            <ArrowLeft className="h-4 w-4" /> {t("Späť na účty")}
          </Link>
        }
      />
      <PageBody>
        {loading && <NacitavanieStav className="rounded-xl border border-border bg-card" />}

        {!loading && accounts.length > 0 && (
          <div className="mb-6 rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 shrink-0 text-primary" />
              <h2 className="text-base font-semibold">{t("Zostaviť výpis z pohybov")}</h2>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {t("Faktero zostaví výpis v PDF a XML (camt.053) z pohybov, ktoré z účtu načítalo — pre ktorýkoľvek účet a mesiac. Keď pohyby nesiahajú na začiatok mesiaca, vznikne čiastočný výpis a povie to o sebe.")}
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="block min-w-0 flex-1 basis-64">
                <span className="text-sm font-semibold">{t("Účet")}</span>
                <select
                  value={vyberUcet}
                  onChange={(e) => setVyberUcet(e.target.value)}
                  className="input mt-1 w-full"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {[a.iban, a.account_name].filter(Boolean).join(" · ") || t("Účet")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block min-w-0 basis-40">
                <span className="text-sm font-semibold">{t("Mesiac")}</span>
                <select
                  value={vyberMesiac}
                  onChange={(e) => setVyberMesiac(e.target.value)}
                  className="input mt-1 w-full"
                >
                  {mesiace.map((m, i) => (
                    <option key={m} value={m}>
                      {fmtObdobie(`${m}-01`, t)}
                      {i === 0 ? ` (${t("do dnes")})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={onZostav}
                disabled={zostavujem || !vyberUcet}
                className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <FileText className="h-4 w-4" />
                {zostavujem ? t("Zostavujem…") : t("Zostaviť PDF a XML")}
              </button>
            </div>
          </div>
        )}

        {!loading && zoradeneObdobia.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
            <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              {t("Zatiaľ tu nie sú žiadne výpisy. Sťahujú sa automaticky vždy na začiatku mesiaca za mesiac predchádzajúci.")}
            </p>
          </div>
        )}

        {strankovanie.viditelne.map(({ id: obdobie, riadky }) => {
          return (
            <div key={obdobie} className="mt-6 first:mt-0">
              <h2 className="text-base font-semibold">
                {fmtObdobie(obdobie, t)}
              </h2>
              <div className="mt-3 space-y-2">
                {riadky.map(([ucetId, formaty]) => {
                  const ucet = uctyPodlaId.get(ucetId);
                  const vlastny = Object.values(formaty).some((s: any) => s.source === "faktero");
                  return (
                    <div
                      key={ucetId}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4 sm:px-5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="min-w-0 break-words font-semibold">{ucet?.account_name ?? t("Účet")}</span>
                          {vlastny && (
                            <span
                              className={triedaStavu("informacia")}
                              title={t("Banka pre tento účet výpis nevydáva, zostavilo ho Faktero z načítaných transakcií.")}
                            >
                              <Sparkles /> {t("Zostavené Fakterom")}
                            </span>
                          )}
                        </div>
                        <div className="break-all font-mono text-xs text-muted-foreground">
                          {ucet?.iban ?? "—"}
                        </div>
                      </div>
                      {(["PDF", "XML"] as const).map((typ) => {
                        const s = formaty[typ];
                        if (!s) return null;
                        const Ikona = typ === "PDF" ? FileText : FileCode2;

                        if (s.status === "ready") {
                          return (
                            <button
                              key={typ}
                              onClick={() => onDownload(s)}
                              disabled={busy === s.id}
                              className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-input bg-background px-3 text-sm font-semibold hover:bg-accent disabled:opacity-50"
                            >
                              <Ikona className="h-4 w-4 text-primary" />
                              {typ}
                              <span className="text-xs font-normal tabular-nums text-muted-foreground">
                                {fmtVelkost(s.file_size)}
                              </span>
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          );
                        }
                        if (s.status === "pending") {
                          return (
                            <span
                              key={typ}
                              className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-dashed border-border px-3 text-sm text-muted-foreground"
                              title={t("Banka výpis ešte generuje, skúste neskôr")}
                            >
                              <Clock className="h-4 w-4" /> {t("{typ} sa pripravuje", { typ })}
                            </span>
                          );
                        }
                        return (
                          <span
                            key={typ}
                            className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-destructive/30 bg-destructive/5 px-3 text-sm font-semibold text-destructive"
                            title={s.error ?? undefined}
                          >
                            <AlertCircle className="h-4 w-4" /> {t("{typ} zlyhalo", { typ })}
                          </span>
                        );
                      })}
                      {vlastny && formaty.XML?.status === "ready" && (
                        <button
                          onClick={() => onPohodaXml(formaty.XML)}
                          disabled={busy === `${formaty.XML.id}:pohoda`}
                          title={t("Dávka pre XML import v POHODE — každá platba má svoj dátum platby.")}
                          className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-input bg-background px-3 text-sm font-semibold hover:bg-accent disabled:opacity-50"
                        >
                          <FileCode2 className="h-4 w-4 text-primary" />
                          {t("XML pre POHODU")}
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {strankovanie.stranky()}

        {maVlastne && (
          <div className="mt-8 rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="flex gap-2">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="max-w-3xl text-sm text-muted-foreground">
                <p className="font-semibold text-foreground">{t("Výpisy označené „Zostavené Fakterom“")}</p>
                <p className="mt-1">
                  {t("Pre účty vedené v inej banke Tatra banka výpis nevydáva, preto ho zostavíme z transakcií, ktoré sme z účtu načítali. Formát je rovnaký ako od banky — PDF na čítanie a XML (camt.053) na import do účtovníctva. Nejde však o doklad vydaný bankou a nemusí obsahovať položky, ktoré banka do prehľadu transakcií neposiela (napríklad niektoré poplatky).")}
                </p>
              </div>
            </div>
          </div>
        )}

        {nepodporovane.length > 0 && (
          <div className="mt-4 rounded-xl border border-border bg-muted/40 p-4 sm:p-5">
            <div className="flex gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="text-sm text-muted-foreground">
                <p>
                  {t("Pre tieto účty zatiaľ výpis nemáme — banka ho nevydáva a nemáme ani dosť transakcií na to, aby sme ho zostavili sami. Zostatky a transakcie sa načítavajú normálne.")}
                </p>
                <ul className="mt-2 space-y-0.5 text-xs">
                  {nepodporovane.map((a) => (
                    <li key={a.id} className="break-words">
                      <span className="font-mono">{a.iban ?? a.account_name}</span>
                      {dovodPreLudi(a.dovod) && (
                        <span className="ml-2">— {t(dovodPreLudi(a.dovod)!)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}

/**
 * Dôvod chýbajúceho výpisu bez odpovede banky v JSON-e. Do zoznamu sa
 * dostávalo „tb_statement_task_failed: 403 {"errorCode": …}“.
 */
function dovodPreLudi(dovod: string | null | undefined): string | null {
  if (!dovod || dovod.includes("PRODUCT_UNKNOWN")) return null;
  if (/DATE_F_ACC_NOT_OPEN|precedes account opening/i.test(dovod))
    return "účet bol otvorený až počas mesiaca, banka za celý mesiac výpis nevydá";
  if (/NO_ACCOUNT|Account does not exist/i.test(dovod))
    return "banka účet pod týmto pripojením nepozná";
  if (/tb_statement|errorCode|^\d{3}\b/.test(dovod)) return null;
  return dovod;
}
