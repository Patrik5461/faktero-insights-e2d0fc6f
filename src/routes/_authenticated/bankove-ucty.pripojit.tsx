import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { startBankConnect } from "@/lib/faktero/tatrabanka.functions";
import {
  zacniRevolut,
  ulozClientIdRevolut,
  stavRevolut,
  synchronizujRevolutUcty,
  synchronizujRevolutPohyby,
} from "@/lib/faktero/revolut.functions";
import {
  zacniWallester,
  dokonciWallester,
  stavWallester,
  synchronizujWallesterUcty,
  synchronizujWallesterPohyby,
} from "@/lib/faktero/wallester.functions";
import {
  pripojWise,
  stavWise,
  synchronizujWiseUcty,
  synchronizujWisePohyby,
} from "@/lib/faktero/wise.functions";
import { pripojFio, stavFio, synchronizujFio, odpojFio } from "@/lib/faktero/fio.functions";
import { useKrajinaDane } from "@/lib/faktero/krajina-firmy";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/useT";
import { preloz, lokalJazyka } from "@/lib/i18n/jazyk";
import {
  Building2,
  ExternalLink,
  Wallet,
  Download,
  CreditCard,
  Landmark,
  Mail,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/bankove-ucty/pripojit")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk ?? "sk", "Pripojiť banku — Faktero") }] }),
  component: ConnectPage,
});

function ConnectPage() {
  const { t } = useT();
  const startFn = useServerFn(startBankConnect);
  // Českej firme je Fio najbližšia banka — ide hneď za Tatra banku.
  const ceska = useKrajinaDane() === "CZ";
  const [busy, setBusy] = useState(false);

  async function connect() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    setBusy(true);
    try {
      const r = await startFn({ data: { company_id: cid } });
      // Break out of the Lovable preview iframe — TB sandbox blocks framing.
      const top = window.top ?? window;
      try {
        top.location.href = r.authorize_url;
      } catch {
        window.open(r.authorize_url, "_blank", "noopener");
        setBusy(false);
      }
    } catch (e: any) {
      setBusy(false);
      if (e?.message === "not_configured") {
        toast.error(t("Chýbajú TB_CLIENT_ID alebo TB_CLIENT_SECRET."));
      } else {
        toast.error(e?.message ?? t("Chyba pri spustení OAuth"));
      }
    }
  }

  return (
    <>
      <PageHeader
        title={t("Pripojiť banku")}
        description={t("Tatra banka, Fio banka, Wise, Wallester a Revolut Business. Všetky iba na čítanie.")}
      />
      <PageBody>
        {/* Dva a dva vedľa seba: štyri panely pod sebou pôsobili rozhádzane. */}
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-900/50 dark:from-emerald-950/40 dark:to-card p-8 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-600 text-white">
                <Building2 className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">
                  Tatra banka <span className="font-normal text-muted-foreground">{t("a ďalšie")}</span>
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t("Premium API. Cez multibanking aj účty vedené v iných bankách.")}
                </p>
              </div>
            </div>
            <ul className="mt-6 space-y-2 text-sm text-foreground/80">
              <li>• {t("Načítanie zoznamu účtov a aktuálnych zostatkov")}</li>
              <li>• {t("Načítanie transakcií za posledných 90 dní")}</li>
              <li>• {t("Automatické párovanie platieb s faktúrami")}</li>
              <li>• {t("Bez platobných príkazov, iba na čítanie")}</li>
            </ul>
            {/*
              Najčastejšia otázka na tejto obrazovke: „a čo keď mám inú banku?".
              Z názvu panela to nikto neuhádne, tak je to napísané rovno pod ním.
            */}
            <div className="mt-4 rounded-xl border border-emerald-300/60 bg-white/70 p-4 text-sm dark:border-emerald-900/40 dark:bg-card/70">
              <p className="font-medium">{t("Máte inú banku?")}</p>
              <p className="mt-1 text-foreground/80">
                {t("Ak ju máte v internetbankingu Tatra banky pripojenú cez multibanking (Slovenská sporiteľňa, VÚB, ČSOB a ďalšie), natiahnu sa aj tieto účty — zostatky aj pohyby. Oficiálne výpisy na stiahnutie vydá banka len pre účty vedené v TB.")}
              </p>
            </div>
            <button
              onClick={connect}
              disabled={busy}
              className="mt-6 inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <ExternalLink className="h-4 w-4" />
              {busy ? t("Presmerovanie…") : t("Pripojiť cez Tatra banku")}
            </button>
            <p className="mt-3 text-xs text-muted-foreground">
              {t("Po pripojení vás presmerujeme späť do Faktera. Prístupové tokeny sa ukladajú bezpečne na serveri a nikdy nie sú dostupné v prehliadači.")}
            </p>
          </div>
          {ceska && <FioPripojenie />}
          <WisePripojenie />
          <WallesterPripojenie />
          <RevolutPripojenie />
          {!ceska && <FioPripojenie />}
          {/* Ktorákoľvek iná banka: pohyby z e-mailových notifikácií. */}
          <div className="rounded-2xl border border-border bg-card p-8 shadow-sm lg:col-span-2">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-sky-600 text-white">
                <Mail className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">{t("Iná banka — e-mailové notifikácie")}</h2>
                <p className="text-sm text-muted-foreground">
                  {t("VÚB, Slovenská sporiteľňa, ČSOB, Prima banka, Česká spořitelna, KB, Air Bank a ďalšie.")}
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm text-foreground/80">
              {t("V internetbankingu si zapnete posielanie e-mailu o každej platbe na tajnú adresu, ktorú vám Faktero vytvorí. Z každého e-mailu vznikne pohyb na účte a spáruje sa s faktúrou.")}
            </p>
            <Link
              to="/bankove-ucty/notifikacie"
              className="mt-6 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              <Mail className="h-4 w-4" /> {t("Nastaviť e-mailové notifikácie")}
            </Link>
          </div>
        </div>
      </PageBody>
    </>
  );
}

/**
 * Verejný kľúč ako súbor.
 *
 * Wise ho pri nahrávaní pýta ako súbor, nie ako text z schránky — bez tohto
 * tlačidla by si ho človek musel sám vložiť do editora a uložiť s príponou
 * `.pem`, čo je presne to miesto, kde sa nastavenie prestane robiť.
 */
function stiahniKluc(pem: string, nazov = "faktero-wise-public-key.pem") {
  const url = URL.createObjectURL(new Blob([pem], { type: "application/x-pem-file" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nazov;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Bez uvoľnenia by odkaz na obsah ostal v pamäti až do zatvorenia karty.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Pripojenie Fio banky.
 *
 * Token z internetbankingu, jeden na účet — firma s korunovým aj eurovým
 * účtom vloží dva. Pri pripojení sa rovno stiahnu pohyby za 89 dní: Fio
 * pustí ďalšie volanie na ten istý token až o 30 sekúnd.
 */
function FioPripojenie() {
  const { t, jazyk } = useT();
  const loc = lokalJazyka(jazyk);
  const pripoj = useServerFn(pripojFio);
  const stavFn = useServerFn(stavFio);
  const syncFn = useServerFn(synchronizujFio);
  const odpojFn = useServerFn(odpojFio);
  const [token, setToken] = useState("");
  const [ucty, setUcty] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const cid = getActiveCompanyId();

  async function obnov() {
    if (!cid) return;
    try {
      const r: any = await stavFn({ data: { company_id: cid } });
      setUcty(r.ucty ?? []);
    } catch {
      setUcty([]);
    }
  }

  useEffect(() => {
    obnov();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid]);

  async function sprav(co: string, akcia: () => Promise<any>, hlaska: (r: any) => string) {
    if (!cid) return;
    setBusy(co);
    try {
      const r = await akcia();
      toast.success(hlaska(r));
      await obnov();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa to."));
    } finally {
      setBusy(null);
    }
  }

  const platny = /^[A-Za-z0-9]{20,128}$/.test(token.trim());

  return (
    <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-[#0067b1] text-white">
          <Landmark className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Fio banka</h2>
          <p className="text-sm text-muted-foreground">
            {t("Token z internetbankingu, iba na čítanie. Jeden token = jeden účet.")}
          </p>
        </div>
      </div>

      {ucty.length > 0 && (
        <ul className="mt-6 space-y-2">
          {ucty.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3 text-sm">
              <span className="min-w-0 flex-1">
                <span className="font-medium">{u.iban ?? u.cislo}</span>
                {u.mena ? ` · ${u.mena}` : ""}
                <span className="block text-xs text-muted-foreground">
                  {u.last_synced_at
                    ? t("Naposledy {cas}", { cas: new Date(u.last_synced_at).toLocaleString(loc) })
                    : t("Ešte nesynchronizované")}
                </span>
              </span>
              <button
                disabled={busy !== null}
                onClick={() =>
                  sprav(
                    `sync-${u.id}`,
                    () => syncFn({ data: { company_id: cid!, connection_id: u.id } }),
                    (r) => t("Nových pohybov: {n}", { n: r.vlozenych }),
                  )
                }
                className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-xs hover:bg-secondary disabled:opacity-50"
              >
                {busy === `sync-${u.id}` ? t("Sťahujem…") : t("Stiahnuť pohyby")}
              </button>
              <button
                disabled={busy !== null}
                onClick={() =>
                  sprav(
                    `odpoj-${u.id}`,
                    () => odpojFn({ data: { company_id: cid!, connection_id: u.id } }),
                    () => t("Fio účet odpojený. Pohyby ostávajú."),
                  )
                }
                className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                {t("Odpojiť")}
              </button>
            </li>
          ))}
        </ul>
      )}

      <ol className="mt-6 space-y-1 text-sm text-foreground/80">
        <li>{t("1. V internetbankingu Fio otvorte Nastavení → API → Přidat nový token.")}</li>
        <li>{t("2. Vyberte účet a oprávnenie „Pouze sledovat účet“, token potvrďte.")}</li>
        <li>{t("3. Token (64 znakov) vložte sem. Pre ďalší účet pridajte ďalší token.")}</li>
      </ol>
      <input
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder={t("Token z Fio internetbankingu")}
        autoComplete="off"
        className="mt-4 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
      />
      <button
        disabled={busy !== null || !platny}
        onClick={() =>
          sprav(
            "pripojenie",
            () => pripoj({ data: { company_id: cid!, token: token.trim() } }),
            (r) => {
              setToken("");
              return t("Pripojený {ucet}. Stiahnutých pohybov: {n}.", { ucet: r.iban ?? r.ucet, n: r.vlozenych });
            },
          )
        }
        className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {busy === "pripojenie" ? t("Overujem token…") : ucty.length ? t("Pripojiť ďalší účet") : t("Pripojiť Fio")}
      </button>
      <p className="mt-3 text-xs text-muted-foreground">
        {t("Bez ďalšej autorizácie vydá Fio pohyby za posledných 90 dní. Ďalej sa sťahujú každú noc automaticky. Overenie neplatného tokenu môže trvať až pol minúty.")}
      </p>
    </div>
  );
}

/**
 * Pripojenie Wise.
 *
 * Iný postup než pri banke: nie presmerovanie a súhlas, ale osobný token —
 * Wise nie je PSD2 poskytovateľ a certifikáty nepoužíva. Druhý krok je ten,
 * ktorý ľudia prehliadnu: **výpisy sú chránené podpisom**, takže kým človek
 * nenahrá verejný kľúč do Wise, zostatky sa načítajú, ale pohyby nie. Preto je
 * kľúč hneď na obrazovke a nie schovaný v nastaveniach.
 */
function WisePripojenie() {
  const { t, jazyk } = useT();
  const loc = lokalJazyka(jazyk);
  const pripoj = useServerFn(pripojWise);
  const stavFn = useServerFn(stavWise);
  const uctyFn = useServerFn(synchronizujWiseUcty);
  const pohybyFn = useServerFn(synchronizujWisePohyby);
  const [token, setToken] = useState("");
  const [stav, setStav] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const cid = getActiveCompanyId();

  useEffect(() => {
    if (!cid) return;
    stavFn({ data: { company_id: cid } })
      .then(setStav)
      .catch(() => setStav(null));
  }, [stavFn, cid]);

  async function sprav(co: string, akcia: () => Promise<any>, hlaska: (r: any) => string) {
    if (!cid) return;
    setBusy(co);
    try {
      const r = await akcia();
      toast.success(hlaska(r));
      setStav(await stavFn({ data: { company_id: cid } }));
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa to."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-[#163300] text-white">
          <Wallet className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Wise</h2>
          <p className="text-sm text-muted-foreground">
            {t("Osobný token, iba na čítanie. Každá mena je samostatný účet.")}
          </p>
        </div>
      </div>

      {!stav?.pripojene ? (
        <>
          <ol className="mt-6 space-y-1 text-sm text-foreground/80">
            <li>{t("1. Vo Wise otvorte Settings → API tokens a vytvorte token na čítanie.")}</li>
            <li>{t("2. Vložte ho sem.")}</li>
            <li>{t("3. Skopírujte verejný kľúč, ktorý sa objaví, a nahrajte ho vo Wise k tokenu.")}</li>
          </ol>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={t("Token z Wise")}
            autoComplete="off"
            className="mt-4 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
          />
          <button
            disabled={busy !== null || token.trim().length < 20}
            onClick={() =>
              sprav(
                "pripojenie",
                () => pripoj({ data: { company_id: cid!, token: token.trim() } }),
                () => t("Wise pripojený. Nahrajte ešte verejný kľúč."),
              )
            }
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy === "pripojenie" ? t("Overujem token…") : t("Pripojiť Wise")}
          </button>
        </>
      ) : (
        <>
          <p className="mt-6 text-sm">
            {t("Pripojené · profil {profil}", { profil: stav.profil })}
            {stav.last_synced_at
              ? ` · ${t("naposledy {cas}", { cas: new Date(stav.last_synced_at).toLocaleString(loc) })}`
              : ""}
          </p>

          {stav.verejnyKluc && (
            <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
              <p className="text-sm font-medium">{t("Verejný kľúč pre Wise")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("Bez neho Wise nepustí výpisy — zostatky sa načítajú, pohyby nie. Nahrajte ho vo Wise pri tokene (Settings → API tokens → Manage public keys).")}
              </p>
              <textarea
                readOnly
                value={stav.verejnyKluc}
                rows={5}
                onFocus={(e) => e.currentTarget.select()}
                className="mt-2 w-full rounded-md border border-input bg-background p-2 font-mono text-[11px]"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={() => stiahniKluc(stav.verejnyKluc)}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-secondary"
                >
                  <Download className="h-4 w-4" /> {t("Stiahnuť ako súbor")}
                </button>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(stav.verejnyKluc);
                      toast.success(t("Kľúč skopírovaný."));
                    } catch {
                      toast.error(t("Skopírovať sa nepodarilo, označte text a použite Ctrl+C."));
                    }
                  }}
                  className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-secondary"
                >
                  {t("Kopírovať")}
                </button>
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              disabled={busy !== null}
              onClick={() =>
                sprav(
                  "ucty",
                  () => uctyFn({ data: { company_id: cid! } }),
                  (r) => t("Načítaných zostatkov: {n}", { n: r.pocet }),
                )
              }
              className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-secondary disabled:opacity-50"
            >
              {busy === "ucty" ? t("Načítavam…") : t("Načítať zostatky")}
            </button>
            <button
              disabled={busy !== null}
              onClick={() =>
                sprav(
                  "pohyby",
                  () => pohybyFn({ data: { company_id: cid! } }),
                  (r) =>
                    r.problemy?.length
                      ? t("Načítaných pohybov: {n}. Nepodarilo sa: {problemy}", {
                          n: r.vlozenych,
                          problemy: r.problemy.join(", "),
                        })
                      : t("Načítaných pohybov: {n}", { n: r.vlozenych }),
                )
              }
              className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-secondary disabled:opacity-50"
            >
              {busy === "pohyby" ? t("Sťahujem…") : t("Stiahnuť pohyby")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Pripojenie Wallesteru.
 *
 * Dvojkrokové, a nedá sa to inak: Wallester najprv potrebuje verejný kľúč a až
 * potom vydá údaje na volanie. Obrazovka preto najprv vyrobí kľúč na poslanie
 * a čaká; keď od nich príde odpoveď, doplnia sa tri hodnoty a spojenie sa hneď
 * skúsi. Kým sa neskúsi, nedá sa rozoznať preklep v issuer ID od výpadku.
 */
function WallesterPripojenie() {
  const { t, jazyk } = useT();
  const loc = lokalJazyka(jazyk);
  const zacni = useServerFn(zacniWallester);
  const dokonci = useServerFn(dokonciWallester);
  const stavFn = useServerFn(stavWallester);
  const uctyFn = useServerFn(synchronizujWallesterUcty);
  const pohybyFn = useServerFn(synchronizujWallesterPohyby);
  const [stav, setStav] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [udaje, setUdaje] = useState({
    issuer_id: "",
    audience_id: "",
    product_code: "",
    max_exp_seconds: "60",
  });
  const cid = getActiveCompanyId();

  useEffect(() => {
    if (!cid) return;
    stavFn({ data: { company_id: cid } })
      .then(setStav)
      .catch(() => setStav(null));
  }, [stavFn, cid]);

  async function sprav(co: string, akcia: () => Promise<any>, hlaska: (r: any) => string) {
    if (!cid) return;
    setBusy(co);
    try {
      const r = await akcia();
      toast.success(hlaska(r));
      setStav(await stavFn({ data: { company_id: cid } }));
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa to."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-[#1b1b3a] text-white">
          <CreditCard className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Wallester</h2>
          <p className="text-sm text-muted-foreground">
            {t("Firemné karty. Platby sa spárujú s bločkami podľa obchodníka.")}
          </p>
        </div>
      </div>

      {stav?.stav !== "pripojene" && (
        <ol className="mt-6 space-y-1 text-sm text-foreground/80">
          <li>{t("1. Napíšte Wallesteru, že chcete prístup k API (podpora alebo váš kontakt).")}</li>
          <li>{t("2. Nižšie si vyrobte verejný kľúč a pošlite im ho.")}</li>
          <li>
            {t("3. Oni pošlú")} <strong>issuer ID</strong>, <strong>audience ID</strong>,{" "}
            {t("kód produktu a maximálnu platnosť tokenu — doplňte ich sem.")}
          </li>
        </ol>
      )}

      {!stav || stav.stav === "ziadne" ? (
        <button
          disabled={busy !== null}
          onClick={() =>
            sprav(
              "kluc",
              () => zacni({ data: { company_id: cid! } }),
              () => t("Kľúč vyrobený. Pošlite ho Wallesteru."),
            )
          }
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy === "kluc" ? t("Vyrábam kľúč…") : t("Vyrobiť verejný kľúč")}
        </button>
      ) : null}

      {stav?.verejnyKluc && (
        <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="text-sm font-medium">{t("Verejný kľúč pre Wallester")}</p>
          <textarea
            readOnly
            value={stav.verejnyKluc}
            rows={5}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-2 w-full rounded-md border border-input bg-background p-2 font-mono text-[11px]"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={() => stiahniKluc(stav.verejnyKluc, "faktero-wallester-public-key.pem")}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-secondary"
            >
              <Download className="h-4 w-4" /> {t("Stiahnuť ako súbor")}
            </button>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(stav.verejnyKluc);
                  toast.success(t("Kľúč skopírovaný."));
                } catch {
                  toast.error(t("Skopírovať sa nepodarilo, označte text a použite Ctrl+C."));
                }
              }}
              className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-secondary"
            >
              {t("Kopírovať")}
            </button>
          </div>
        </div>
      )}

      {stav?.stav === "caka" && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(
            [
              ["issuer_id", "Issuer ID"],
              ["audience_id", "Audience ID"],
              ["product_code", "Kód produktu"],
              ["max_exp_seconds", "Max. platnosť tokenu (s)"],
            ] as const
          ).map(([kluc, label]) => (
            <label key={kluc} className="block">
              <span className="text-xs font-medium text-muted-foreground">{t(label)}</span>
              <input
                value={(udaje as any)[kluc]}
                onChange={(e) => setUdaje({ ...udaje, [kluc]: e.target.value })}
                autoComplete="off"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
          ))}
          <div className="sm:col-span-2">
            <button
              disabled={busy !== null}
              onClick={() =>
                sprav(
                  "dokoncenie",
                  () =>
                    dokonci({
                      data: {
                        company_id: cid!,
                        issuer_id: udaje.issuer_id.trim(),
                        audience_id: udaje.audience_id.trim(),
                        product_code: udaje.product_code.trim(),
                        max_exp_seconds: Number(udaje.max_exp_seconds) || 60,
                      },
                    }),
                  () => t("Wallester pripojený."),
                )
              }
              className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy === "dokoncenie" ? t("Overujem…") : t("Dokončiť pripojenie")}
            </button>
          </div>
        </div>
      )}

      {stav?.stav === "pripojene" && (
        <>
          <p className="mt-6 text-sm">
            {t("Pripojené · produkt {produkt}", { produkt: stav.product_code })}
            {stav.last_synced_at
              ? ` · ${t("naposledy {cas}", { cas: new Date(stav.last_synced_at).toLocaleString(loc) })}`
              : ""}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              disabled={busy !== null}
              onClick={() =>
                sprav(
                  "ucty",
                  () => uctyFn({ data: { company_id: cid! } }),
                  (r) => t("Načítaných kartových účtov: {n}", { n: r.pocet }),
                )
              }
              className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-secondary disabled:opacity-50"
            >
              {busy === "ucty" ? t("Načítavam…") : t("Načítať účty")}
            </button>
            <button
              disabled={busy !== null}
              onClick={() =>
                sprav(
                  "pohyby",
                  () => pohybyFn({ data: { company_id: cid! } }),
                  (r) =>
                    r.problemy?.length
                      ? t("Načítaných pohybov: {n}. Nepodarilo sa: {problemy}", {
                          n: r.vlozenych,
                          problemy: r.problemy.join(", "),
                        })
                      : t("Načítaných pohybov: {n}", { n: r.vlozenych }),
                )
              }
              className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-secondary disabled:opacity-50"
            >
              {busy === "pohyby" ? t("Sťahujem…") : t("Stiahnuť pohyby")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Pripojenie Revolut Business.
 *
 * Trojkrokové, lebo Revolut to tak vyžaduje: certifikát → client ID (vydá ho
 * až po nahratí certifikátu) → potvrdenie v prehliadači. Obrazovka ukazuje
 * vždy len ten ďalší krok, aby človek nemusel držať poradie v hlave.
 */
function RevolutPripojenie() {
  const { t, jazyk } = useT();
  const loc = lokalJazyka(jazyk);
  const zacni = useServerFn(zacniRevolut);
  const ulozId = useServerFn(ulozClientIdRevolut);
  const stavFn = useServerFn(stavRevolut);
  const uctyFn = useServerFn(synchronizujRevolutUcty);
  const pohybyFn = useServerFn(synchronizujRevolutPohyby);
  const [stav, setStav] = useState<any>(null);
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const cid = getActiveCompanyId();

  useEffect(() => {
    if (!cid) return;
    stavFn({ data: { company_id: cid } })
      .then(setStav)
      .catch(() => setStav(null));
  }, [stavFn, cid]);

  async function sprav(co: string, akcia: () => Promise<any>, hlaska: (r: any) => string) {
    if (!cid) return;
    setBusy(co);
    try {
      const r = await akcia();
      toast.success(hlaska(r));
      setStav(await stavFn({ data: { company_id: cid } }));
      return r;
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa to."));
    } finally {
      setBusy(null);
    }
  }

  const navratova = stav?.redirect_uri ?? "";

  return (
    <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-black text-white">
          <Landmark className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Revolut Business</h2>
          <p className="text-sm text-muted-foreground">
            {t("Účty a pohyby, iba na čítanie. Súhlas platí 90 dní.")}
          </p>
        </div>
      </div>

      {stav?.stav !== "pripojene" && (
        <ol className="mt-6 space-y-1 text-sm text-foreground/80">
          <li>{t("1. Nižšie si vyrobte certifikát a stiahnite ho.")}</li>
          <li>
            {t("2. V Revolut Business otvorte")} <em>Settings → APIs → Business API</em>
            {t(", nahrajte certifikát a ako návratovú adresu zadajte presne túto:")}
          </li>
          <li className="rounded-md bg-secondary px-2 py-1 font-mono text-xs break-words">
            {navratova || "…"}
          </li>
          <li>{t("3. Portál vám ukáže client ID — vložte ho sem a potvrďte prístup.")}</li>
        </ol>
      )}

      {(!stav || stav.stav === "ziadne") && (
        <button
          disabled={busy !== null}
          onClick={() =>
            sprav(
              "cert",
              () => zacni({ data: { company_id: cid!, prostredie: "produkcia" } }),
              () => t("Certifikát vyrobený. Nahrajte ho v Revolute."),
            )
          }
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy === "cert" ? t("Vyrábam certifikát…") : t("Vyrobiť certifikát")}
        </button>
      )}

      {stav?.certifikat && stav.stav !== "pripojene" && (
        <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="text-sm font-medium">{t("Certifikát pre Revolut")}</p>
          <textarea
            readOnly
            value={stav.certifikat}
            rows={5}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-2 w-full rounded-md border border-input bg-background p-2 font-mono text-[11px]"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={() => stiahniKluc(stav.certifikat, "faktero-revolut-certificate.cer")}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-secondary"
            >
              <Download className="h-4 w-4" /> {t("Stiahnuť ako súbor")}
            </button>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(stav.certifikat);
                  toast.success(t("Certifikát skopírovaný."));
                } catch {
                  toast.error(t("Skopírovať sa nepodarilo, označte text a použite Ctrl+C."));
                }
              }}
              className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-secondary"
            >
              {t("Kopírovať")}
            </button>
          </div>
        </div>
      )}

      {stav && stav.stav !== "pripojene" && stav.stav !== "ziadne" && (
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="block flex-1">
            <span className="text-xs font-medium text-muted-foreground">{t("Client ID z portálu")}</span>
            <input
              value={clientId || stav.client_id || ""}
              onChange={(e) => setClientId(e.target.value)}
              autoComplete="off"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <button
            disabled={busy !== null}
            onClick={async () => {
              const r = await sprav(
                "clientid",
                () =>
                  ulozId({
                    data: {
                      company_id: cid!,
                      client_id: (clientId || stav.client_id || "").trim(),
                    },
                  }),
                () => t("Otvárame potvrdenie v Revolute."),
              );
              if (r?.adresa) window.open(r.adresa, "_blank", "noopener");
            }}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            <ExternalLink className="h-4 w-4" />
            {busy === "clientid" ? t("Pripravujem…") : t("Potvrdiť prístup")}
          </button>
        </div>
      )}

      {stav?.stav === "pripojene" && (
        <>
          <p className="mt-6 text-sm">
            {t("Pripojené")}
            {stav.consent_until
              ? ` · ${t("súhlas platí do {datum}", { datum: new Date(stav.consent_until).toLocaleDateString(loc) })}`
              : ""}
            {stav.last_synced_at
              ? ` · ${t("naposledy {cas}", { cas: new Date(stav.last_synced_at).toLocaleString(loc) })}`
              : ""}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              disabled={busy !== null}
              onClick={() =>
                sprav(
                  "ucty",
                  () => uctyFn({ data: { company_id: cid! } }),
                  (r) => t("Načítaných účtov: {n}", { n: r.pocet }),
                )
              }
              className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-secondary disabled:opacity-50"
            >
              {busy === "ucty" ? t("Načítavam…") : t("Načítať účty")}
            </button>
            <button
              disabled={busy !== null}
              onClick={() =>
                sprav(
                  "pohyby",
                  () => pohybyFn({ data: { company_id: cid! } }),
                  (r) =>
                    r.problemy?.length
                      ? t("Načítaných pohybov: {n}. Nepodarilo sa: {problemy}", {
                          n: r.vlozenych,
                          problemy: r.problemy.join(", "),
                        })
                      : t("Načítaných pohybov: {n}", { n: r.vlozenych }),
                )
              }
              className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-secondary disabled:opacity-50"
            >
              {busy === "pohyby" ? t("Sťahujem…") : t("Stiahnuť pohyby")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
