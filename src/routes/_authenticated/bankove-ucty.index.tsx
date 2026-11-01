import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  listBankData,
  syncBankAccounts,
  disconnectBank,
  renewBankConsent,
} from "@/lib/faktero/tatrabanka.functions";
import {
  odpojWise,
  synchronizujWiseUcty,
  synchronizujWisePohyby,
} from "@/lib/faktero/wise.functions";
import { synchronizujFio, odpojFio } from "@/lib/faktero/fio.functions";
import {
  odpojWallester,
  synchronizujWallesterUcty,
  synchronizujWallesterPohyby,
} from "@/lib/faktero/wallester.functions";
import {
  odpojRevolut,
  synchronizujRevolutUcty,
  synchronizujRevolutPohyby,
} from "@/lib/faktero/revolut.functions";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/useT";
import { preloz, lokalJazyka } from "@/lib/i18n/jazyk";
import { zostatkyPodlaMien, formatujSumu, zobrazitZauctovany } from "@/lib/faktero/zostatky";
import { stavSuhlasu, datumSuhlasu } from "@/lib/faktero/bank-suhlas";
import {
  Building2,
  Plus,
  Upload,
  RefreshCw,
  Trash2,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Mail,
} from "lucide-react";
import { potvrd } from "@/lib/potvrdenie";
import { NastaveniaBanky } from "@/components/faktero/banka/NastaveniaBanky";
import { pohybyZastarane } from "@/lib/faktero/bank-stav-pohybov";
import { akciePripojenia } from "@/lib/faktero/akcie-pripojenia";
import { StavOdznak, triedaStavu } from "@/components/faktero/web/Stav";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/bankove-ucty/")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk ?? "sk", "Bankové účty — Faktero") }] }),
  component: BankAccountsPage,
});

function fmtMoney(n: number, c = "EUR") {
  return formatujSumu(n, c);
}

function BankAccountsPage() {
  const { t, jazyk } = useT();
  const list = useServerFn(listBankData);
  const syncAcc = useServerFn(syncBankAccounts);
  const wiseUcty = useServerFn(synchronizujWiseUcty);
  const wisePohyby = useServerFn(synchronizujWisePohyby);
  const wiseOdpoj = useServerFn(odpojWise);
  const fioSync = useServerFn(synchronizujFio);
  const fioOdpoj = useServerFn(odpojFio);
  const walUcty = useServerFn(synchronizujWallesterUcty);
  const walPohyby = useServerFn(synchronizujWallesterPohyby);
  const walOdpoj = useServerFn(odpojWallester);
  const revUcty = useServerFn(synchronizujRevolutUcty);
  const revPohyby = useServerFn(synchronizujRevolutPohyby);
  const revOdpoj = useServerFn(odpojRevolut);
  const disconnect = useServerFn(disconnectBank);
  const renew = useServerFn(renewBankConsent);
  const [data, setData] = useState<{ connections: any[]; accounts: any[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function reload() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    setData(await list({ data: { company_id: cid } }));
  }
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("connected")) toast.success(t("Banka pripojená"));
    const err = url.searchParams.get("error");
    if (err) toast.error(t("Pripojenie zlyhalo: {chyba}", { chyba: err }));
    if (url.searchParams.size) window.history.replaceState({}, "", url.pathname);
    reload();
  }, []);

  /**
   * Odpojenie sa nedá vziať späť jedným klikom — Tatra banka chce celý súhlas
   * znova, ostatné aspoň prihlásenie. Preto sa pýta.
   */
  function potvrdOdpojenie(nazov: string): Promise<boolean> {
    return potvrd(
      t(
        "Naozaj odpojiť {nazov}?\n\nZostatky sa prestanú aktualizovať a pripojenie budete musieť nastaviť znova. Už stiahnuté pohyby ostanú.",
        { nazov },
      ),
    );
  }

  /** Revolut: účty, pohyby a odpojenie. Súhlas sa obnovuje potvrdením. */
  async function onRevolut(connId: string, co: "ucty" | "pohyby" | "odpojit") {
    const cid = getActiveCompanyId();
    if (!cid) return;
    // Pýtame sa pred zaneprázdnením tlačidla — inak sa točí, kým človek číta.
    if (co === "odpojit" && !(await potvrdOdpojenie("Revolut"))) return;
    setBusy(connId);
    try {
      if (co === "ucty") {
        const r: any = await revUcty({ data: { company_id: cid } });
        toast.success(t("Načítaných účtov: {n}", { n: r.pocet }));
      } else if (co === "pohyby") {
        const r: any = await revPohyby({ data: { company_id: cid } });
        toast.success(
          r.problemy?.length
            ? t("Načítaných pohybov: {n}. Nepodarilo sa: {problemy}", {
                n: r.vlozenych,
                problemy: r.problemy.join(", "),
              })
            : t("Načítaných pohybov: {n}", { n: r.vlozenych }),
        );
      } else {
        await revOdpoj({ data: { company_id: cid } });
        toast.success(t("Revolut odpojený."));
      }
      reload();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa to."));
    } finally {
      setBusy(null);
    }
  }

  /** Wallester: kartové účty, pohyby a odpojenie. Súhlas tiež nemá. */
  async function onWallester(connId: string, co: "ucty" | "pohyby" | "odpojit") {
    const cid = getActiveCompanyId();
    if (!cid) return;
    // Pýtame sa pred zaneprázdnením tlačidla — inak sa točí, kým človek číta.
    if (co === "odpojit" && !(await potvrdOdpojenie("Wallester"))) return;
    setBusy(connId);
    try {
      if (co === "ucty") {
        const r: any = await walUcty({ data: { company_id: cid } });
        toast.success(t("Načítaných kartových účtov: {n}", { n: r.pocet }));
      } else if (co === "pohyby") {
        const r: any = await walPohyby({ data: { company_id: cid } });
        toast.success(
          r.problemy?.length
            ? t("Načítaných pohybov: {n}. Nepodarilo sa: {problemy}", {
                n: r.vlozenych,
                problemy: r.problemy.join(", "),
              })
            : t("Načítaných pohybov: {n}", { n: r.vlozenych }),
        );
      } else {
        await walOdpoj({ data: { company_id: cid } });
        toast.success(t("Wallester odpojený."));
      }
      reload();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa to."));
    } finally {
      setBusy(null);
    }
  }

  /** Wise: zostatky, pohyby a odpojenie. Súhlas sa tu neobnovuje — nie je aký. */
  async function onWise(connId: string, co: "ucty" | "pohyby" | "odpojit") {
    const cid = getActiveCompanyId();
    if (!cid) return;
    // Pýtame sa pred zaneprázdnením tlačidla — inak sa točí, kým človek číta.
    if (co === "odpojit" && !(await potvrdOdpojenie("Wise"))) return;
    setBusy(connId);
    try {
      if (co === "ucty") {
        const r: any = await wiseUcty({ data: { company_id: cid } });
        toast.success(t("Načítaných zostatkov: {n}", { n: r.pocet }));
      } else if (co === "pohyby") {
        const r: any = await wisePohyby({ data: { company_id: cid } });
        toast.success(
          r.problemy?.length
            ? t("Načítaných pohybov: {n}. Nepodarilo sa: {problemy}", {
                n: r.vlozenych,
                problemy: r.problemy.join(", "),
              })
            : t("Načítaných pohybov: {n}", { n: r.vlozenych }),
        );
      } else {
        await wiseOdpoj({ data: { company_id: cid } });
        toast.success(t("Wise odpojený."));
      }
      reload();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa to."));
    } finally {
      setBusy(null);
    }
  }

  /** Fio: jedno volanie dá zostatok aj pohyby jedného účtu (token = účet). */
  async function onFio(connId: string, co: "sync" | "odpojit") {
    const cid = getActiveCompanyId();
    if (!cid) return;
    if (co === "odpojit" && !(await potvrdOdpojenie("Fio"))) return;
    setBusy(connId);
    try {
      if (co === "sync") {
        const r: any = await fioSync({ data: { company_id: cid, connection_id: connId } });
        toast.success(t("Nových pohybov: {n}", { n: r.vlozenych }));
      } else {
        await fioOdpoj({ data: { company_id: cid, connection_id: connId } });
        toast.success(t("Fio účet odpojený."));
      }
      reload();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa to."));
    } finally {
      setBusy(null);
    }
  }

  async function onSync(connId: string) {
    const cid = getActiveCompanyId();
    if (!cid) return;
    setBusy(connId);
    try {
      const r = await syncAcc({ data: { company_id: cid, connection_id: connId } });
      toast.success(
        r.refresh_requested
          ? t(
              "Synchronizovaných {n} účtov. Dáta z iných bánk banka práve obnovuje, prejavia sa o chvíľu.",
              { n: r.count },
            )
          : t("Synchronizovaných {n} účtov", { n: r.count }),
      );
      reload();
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba synchronizácie"));
    } finally {
      setBusy(null);
    }
  }

  async function onRenew(connId: string) {
    const cid = getActiveCompanyId();
    if (!cid) return;
    setBusy(connId);
    try {
      const { authorize_url } = await renew({ data: { company_id: cid, connection_id: connId } });
      window.location.href = authorize_url;
    } catch (e: any) {
      toast.error(e?.message ?? t("Obnovu súhlasu sa nepodarilo spustiť"));
      setBusy(null);
    }
  }

  async function onDisconnect(connId: string) {
    if (!(await potvrd(t("Naozaj odpojiť banku? Všetky účty a transakcie budú vymazané.")))) return;
    const cid = getActiveCompanyId();
    if (!cid) return;
    try {
      await disconnect({ data: { company_id: cid, connection_id: connId } });
      toast.success(t("Odpojené"));
      reload();
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba"));
    }
  }

  // Meny sa nesčítavajú dokopy — každá má vlastný riadok.
  const zostatky = zostatkyPodlaMien(data?.accounts ?? []);

  return (
    <>
      <PageHeader
        title={t("Bankové účty")}
        description={t("Tatra banka, Fio banka, Wise, Wallester a Revolut. Zostatky a pohyby sa načítavajú automaticky, iba na čítanie.")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {/* Banky bez priameho pripojenia (Akcenta a spol.) sa dostanú dnu
                nahratým výpisom — inak by pre ne nebola žiadna cesta. */}
            <Link
              to="/bankove-ucty/import"
              className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-input bg-background px-3 text-sm font-semibold hover:bg-accent"
            >
              <Upload className="h-4 w-4" /> {t("Nahrať výpis")}
            </Link>
            {/* Banky bez API: pohyby z e-mailových notifikácií banky. */}
            <Link
              to="/bankove-ucty/notifikacie"
              className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-input bg-background px-3 text-sm font-semibold hover:bg-accent"
            >
              <Mail className="h-4 w-4" /> {t("E-mailové notifikácie")}
            </Link>
            <Link
              to="/bankove-ucty/pripojit"
              className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
            >
              <Plus className="h-4 w-4" /> {t("Pripojiť banku")}
            </Link>
          </div>
        }
      />
      <PageBody>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 sm:p-5">
            <div className="text-sm text-muted-foreground">
              {zostatky.length > 1 ? t("Celkový zostatok po menách") : t("Celkový zostatok")}
            </div>
            {zostatky.length === 0 ? (
              <div className="suma mt-1 text-2xl text-foreground">
                {fmtMoney(0)}
              </div>
            ) : (
              zostatky.map((z) => (
                <div
                  key={z.mena}
                  className="suma mt-1 text-2xl text-foreground"
                >
                  {fmtMoney(z.suma, z.mena)}
                </div>
              ))
            )}
          </div>
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="text-sm text-muted-foreground">{t("Počet účtov")}</div>
            <div className="suma mt-1 text-2xl">{data?.accounts.length ?? 0}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="text-sm text-muted-foreground">{t("Pripojenia")}</div>
            <div className="suma mt-1 text-2xl">{data?.connections.length ?? 0}</div>
          </div>
        </div>

        <h2 className="mt-8 text-base font-semibold">
          {t("Pripojené banky")}
        </h2>
        {data && data.connections.length === 0 && (
          <div className="mt-3 rounded-xl border border-dashed border-border bg-card p-8 text-center">
            <Building2 className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">{t("Žiadna banka nie je pripojená.")}</p>
            <Link
              to="/bankove-ucty/pripojit"
              className="mt-3 inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
            >
              <Plus className="h-4 w-4" /> {t("Pripojiť banku")}
            </Link>
          </div>
        )}
        <div className="mt-3 space-y-3">
          {data?.connections.map((c) => (
            <div key={c.id} className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 font-semibold capitalize">
                    {c.provider === "email" ? t("E-mailové notifikácie") : c.provider}
                    {c.status === "connected" ? (
                      <StavOdznak ton="uspech" ikona={<CheckCircle2 />}>
                        {t("Pripojené")}
                      </StavOdznak>
                    ) : (
                      <StavOdznak ton="pozor" ikona={<AlertCircle />}>
                        {c.status}
                      </StavOdznak>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {c.last_synced_at
                      ? t("Posledná synchronizácia: {cas}", {
                          cas: new Date(c.last_synced_at).toLocaleString(
                            lokalJazyka(jazyk),
                          ),
                        })
                      : t("Ešte nesynchronizované")}
                  </div>
                  {c.provider === "tatrabanka" && c.status === "connected" && (
                    <PlatnostSuhlasu platiDo={c.token_expires_at} />
                  )}
                </div>
                {/*
                  Tlačidlá podľa poskytovateľa. Kým tu bola len Tatra banka,
                  volali sa jej funkcie napevno — po pripojení Wise potom
                  „Načítať účty" siahalo do Tatra banky a vracalo jej 401,
                  hoci s Wise nemá nič spoločné. Wise nemá ani súhlas, ktorý by
                  sa dal obnovovať.
                */}
                {c.provider === "email" ? (
                  /* Účet z e-mailových notifikácií: nie je čo sťahovať ani obnovovať. */
                  <Link to="/bankove-ucty/notifikacie" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs font-semibold hover:bg-accent">
                    <Mail className="h-3.5 w-3.5" /> {t("Nastavenie notifikácií")}
                  </Link>
                ) : c.provider === "fio" ? (
                  <>
                    <button
                      onClick={() => onFio(c.id, "sync")}
                      disabled={busy === c.id}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs font-semibold hover:bg-accent disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${busy === c.id ? "animate-spin" : ""}`} />{" "}
                      {t("Stiahnuť pohyby")}
                    </button>
                    <button
                      onClick={() => onFio(c.id, "odpojit")}
                      disabled={busy === c.id}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-destructive/30 bg-background px-2.5 text-xs font-semibold text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> {t("Odpojiť")}
                    </button>
                  </>
                ) : c.provider === "revolut" ? (
                  <>
                    <button
                      onClick={() => onRevolut(c.id, "ucty")}
                      disabled={busy === c.id}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs font-semibold hover:bg-accent disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${busy === c.id ? "animate-spin" : ""}`} />{" "}
                      {t("Načítať účty")}
                    </button>
                    <button
                      onClick={() => onRevolut(c.id, "pohyby")}
                      disabled={busy === c.id}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs font-semibold hover:bg-accent disabled:opacity-50"
                    >
                      <ArrowRight className="h-3.5 w-3.5" /> {t("Stiahnuť pohyby")}
                    </button>
                    <button
                      onClick={() => onRevolut(c.id, "odpojit")}
                      disabled={busy === c.id}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-destructive/30 bg-background px-2.5 text-xs font-semibold text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> {t("Odpojiť")}
                    </button>
                  </>
                ) : c.provider === "wallester" ? (
                  <>
                    <button
                      onClick={() => onWallester(c.id, "ucty")}
                      disabled={busy === c.id}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs font-semibold hover:bg-accent disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${busy === c.id ? "animate-spin" : ""}`} />{" "}
                      {t("Načítať účty")}
                    </button>
                    <button
                      onClick={() => onWallester(c.id, "pohyby")}
                      disabled={busy === c.id}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs font-semibold hover:bg-accent disabled:opacity-50"
                    >
                      <ArrowRight className="h-3.5 w-3.5" /> {t("Stiahnuť pohyby")}
                    </button>
                    <button
                      onClick={() => onWallester(c.id, "odpojit")}
                      disabled={busy === c.id}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-destructive/30 bg-background px-2.5 text-xs font-semibold text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> {t("Odpojiť")}
                    </button>
                  </>
                ) : c.provider === "wise" ? (
                  <>
                    <button
                      onClick={() => onWise(c.id, "ucty")}
                      disabled={busy === c.id}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs font-semibold hover:bg-accent disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${busy === c.id ? "animate-spin" : ""}`} />{" "}
                      {t("Načítať zostatky")}
                    </button>
                    <button
                      onClick={() => onWise(c.id, "pohyby")}
                      disabled={busy === c.id}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs font-semibold hover:bg-accent disabled:opacity-50"
                    >
                      <ArrowRight className="h-3.5 w-3.5" /> {t("Stiahnuť pohyby")}
                    </button>
                    <button
                      onClick={() => onWise(c.id, "odpojit")}
                      disabled={busy === c.id}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-destructive/30 bg-background px-2.5 text-xs font-semibold text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> {t("Odpojiť")}
                    </button>
                  </>
                ) : (
                  <>
                    {/* Nahratý výpis nemá banku ani súhlas — len nahrať ďalší. */}
                    {akciePripojenia(c.provider).nahratVypis && (
                      <Link
                        to="/bankove-ucty/import"
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs font-semibold hover:bg-accent"
                      >
                        <Upload className="h-3.5 w-3.5" /> {t("Nahrať výpis")}
                      </Link>
                    )}
                    {akciePripojenia(c.provider).nacitatUcty && (
                      <button
                        onClick={() => onSync(c.id)}
                        disabled={busy === c.id}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs font-semibold hover:bg-accent disabled:opacity-50"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${busy === c.id ? "animate-spin" : ""}`} />{" "}
                        {t("Načítať účty")}
                      </button>
                    )}
                    {akciePripojenia(c.provider).obnovitSuhlas && (
                      <button
                        onClick={() => onRenew(c.id)}
                        disabled={busy === c.id}
                        title={t("Prihlásite sa znova do banky. Účty, transakcie ani výpisy sa nezmažú.")}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs font-semibold hover:bg-accent disabled:opacity-50"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" /> {t("Obnoviť súhlas")}
                      </button>
                    )}
                    <button
                      onClick={() => onDisconnect(c.id)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-destructive/30 bg-background px-2.5 text-xs font-semibold text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> {t("Odpojiť")}
                    </button>
                  </>
                )}
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {data.accounts
                  .filter((a) => a.bank_connection_id === c.id)
                  .map((a) => (
                    <div key={a.id} className="rounded-lg border border-border bg-muted/40 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{a.account_name ?? a.iban ?? t("Účet")}</div>
                          <div className="break-all font-mono text-xs text-muted-foreground">
                            {a.iban ?? "—"}
                          </div>
                          {/* Účet, ktorý banka odmieta, sa už v noci neťahá —
                              nech to človek vidí a nečaká na pohyby zbytočne. */}
                          {a.unavailable_since && (
                            <div
                              className={cn(triedaStavu("pozor", true), "mt-1 h-auto min-h-[1.125rem] whitespace-normal py-0.5")}
                              title={a.unavailable_reason ?? undefined}
                            >
                              {t("Banka ho nepozná — obnovte súhlas")}
                            </div>
                          )}
                          {/* Zostatok banka vydá aj bez súhlasu na pohyby — inak by účet vyzeral živý. */}
                          {!a.unavailable_since && pohybyZastarane(a) && (
                            <div
                              role="status"
                              className={cn(triedaStavu("chyba", true), "mt-1 h-auto min-h-[1.125rem] whitespace-normal py-0.5")}
                              title={a.pohyby_chyba ?? undefined}
                            >
                              {a.pohyby_ok_at
                                ? t("Pohyby sa nesťahujú od {datum} — obnovte súhlas", {
                                    datum: new Date(a.pohyby_ok_at).toLocaleDateString(lokalJazyka(jazyk)),
                                  })
                                : t("Pohyby sa nesťahujú — obnovte súhlas")}
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="suma text-lg">
                            {fmtMoney(Number(a.balance ?? 0), a.currency)}
                          </div>
                          {(() => {
                            const zauctovany = zobrazitZauctovany(a.balance, a.booked_balance);
                            return zauctovany.zobrazit ? (
                              <div
                                className="whitespace-nowrap text-xs tabular-nums text-muted-foreground"
                                title={t("Suma, ktorú má banka zaúčtovanú. Líši sa o blokácie a nezaúčtované platby.")}
                              >
                                {t("Zaúčtovaný {suma}", { suma: fmtMoney(zauctovany.suma, a.currency) })}
                              </div>
                            ) : null;
                          })()}
                          <Link
                            to="/bankove-ucty/transakcie"
                            search={{ account: a.id } as any}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                          >
                            {t("Transakcie")} <ArrowRight className="h-3 w-3" />
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
                {data.accounts.filter((a) => a.bank_connection_id === c.id).length === 0 && (
                  <div className="text-sm text-muted-foreground">
                    {t("Žiadne účty — kliknite \"Načítať účty\".")}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        {getActiveCompanyId() ? <NastaveniaBanky companyId={getActiveCompanyId()!} /> : null}
      </PageBody>
    </>
  );
}

/**
 * Dokedy platí súhlas Tatra banky. 14 dní pred koncom sa zafarbí — bez toho sa
 * koniec súhlasu prejavil až tak, že pohyby prestali chodiť.
 */
function PlatnostSuhlasu({ platiDo }: { platiDo: string | null }) {
  const { t } = useT();
  const s = stavSuhlasu(platiDo);
  if (!s) return null;
  const datum = datumSuhlasu(s.platiDo);
  if (s.stav === "ok") {
    return (
      <div className="text-xs text-muted-foreground">
        {t("Súhlas banky platí do {datum}", { datum })}
      </div>
    );
  }
  return (
    <div
      className={`mt-0.5 text-xs font-medium ${s.stav === "vyprsal" ? "text-destructive" : "text-warning"}`}
    >
      {s.stav === "vyprsal"
        ? t("Súhlas banky vypršal {datum} — kliknite na Obnoviť súhlas.", { datum })
        : t("Súhlas banky vyprší {datum} — kliknite na Obnoviť súhlas.", { datum })}
    </div>
  );
}
