import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { startBankConnect } from "@/lib/faktero/tatrabanka.functions";
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
import { toast } from "sonner";
import { Building2, ArrowLeft, ExternalLink, Wallet, Download, CreditCard } from "lucide-react";

export const Route = createFileRoute("/_authenticated/bankove-ucty/pripojit")({
  head: () => ({ meta: [{ title: "Pripojiť banku — Faktero" }] }),
  component: ConnectPage,
});

function ConnectPage() {
  const startFn = useServerFn(startBankConnect);
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
        toast.error("Chýbajú TB_CLIENT_ID alebo TB_CLIENT_SECRET.");
      } else {
        toast.error(e?.message ?? "Chyba pri spustení OAuth");
      }
    }
  }

  return (
    <>
      <PageHeader
        title="Pripojiť banku"
        description="Tatra banka cez Premium API, Wise cez osobný token. Obe iba na čítanie."
        action={
          <Link
            to="/bankove-ucty"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-secondary"
          >
            <ArrowLeft className="h-4 w-4" /> Späť
          </Link>
        }
      />
      <PageBody>
        <div className="mx-auto max-w-2xl rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-8 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-600 text-white">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Tatra banka</h2>
              <p className="text-sm text-muted-foreground">Premium API Accounts v3.2.1 (sandbox)</p>
            </div>
          </div>
          <ul className="mt-6 space-y-2 text-sm text-foreground/80">
            <li>• Načítanie zoznamu účtov a aktuálnych zostatkov</li>
            <li>• Načítanie transakcií za posledných 90 dní</li>
            <li>• Príprava na automatický párovanie platieb s faktúrami</li>
            <li>• Bez platobných príkazov, iba na čítanie</li>
          </ul>
          <button
            onClick={connect}
            disabled={busy}
            className="mt-6 inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <ExternalLink className="h-4 w-4" />
            {busy ? "Presmerovanie…" : "Pripojiť cez Tatra banku"}
          </button>
          <p className="mt-3 text-xs text-muted-foreground">
            Po pripojení vás presmerujeme späť do Faktera. Prístupové tokeny sa ukladajú bezpečne na
            serveri a nikdy nie sú dostupné v prehliadači.
          </p>
        </div>
        <WisePripojenie />
        <WallesterPripojenie />
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
 * Pripojenie Wise.
 *
 * Iný postup než pri banke: nie presmerovanie a súhlas, ale osobný token —
 * Wise nie je PSD2 poskytovateľ a certifikáty nepoužíva. Druhý krok je ten,
 * ktorý ľudia prehliadnu: **výpisy sú chránené podpisom**, takže kým človek
 * nenahrá verejný kľúč do Wise, zostatky sa načítajú, ale pohyby nie. Preto je
 * kľúč hneď na obrazovke a nie schovaný v nastaveniach.
 */
function WisePripojenie() {
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
      toast.error(e?.message ?? "Nepodarilo sa to.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto mt-6 max-w-2xl rounded-2xl border border-border bg-card p-8 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-[#163300] text-white">
          <Wallet className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Wise</h2>
          <p className="text-sm text-muted-foreground">
            Osobný token, iba na čítanie. Každá mena je samostatný účet.
          </p>
        </div>
      </div>

      {!stav?.pripojene ? (
        <>
          <ol className="mt-6 space-y-1 text-sm text-foreground/80">
            <li>1. Vo Wise otvorte Settings → API tokens a vytvorte token na čítanie.</li>
            <li>2. Vložte ho sem.</li>
            <li>3. Skopírujte verejný kľúč, ktorý sa objaví, a nahrajte ho vo Wise k tokenu.</li>
          </ol>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Token z Wise"
            autoComplete="off"
            className="mt-4 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <button
            disabled={busy !== null || token.trim().length < 20}
            onClick={() =>
              sprav(
                "pripojenie",
                () => pripoj({ data: { company_id: cid!, token: token.trim() } }),
                () => "Wise pripojený. Nahrajte ešte verejný kľúč.",
              )
            }
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy === "pripojenie" ? "Overujem token…" : "Pripojiť Wise"}
          </button>
        </>
      ) : (
        <>
          <p className="mt-6 text-sm">
            Pripojené · profil {stav.profil}
            {stav.last_synced_at
              ? ` · naposledy ${new Date(stav.last_synced_at).toLocaleString("sk-SK")}`
              : ""}
          </p>

          {stav.verejnyKluc && (
            <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
              <p className="text-sm font-medium">Verejný kľúč pre Wise</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Bez neho Wise nepustí výpisy — zostatky sa načítajú, pohyby nie. Nahrajte ho vo Wise
                pri tokene (Settings → API tokens → Manage public keys).
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
                  <Download className="h-4 w-4" /> Stiahnuť ako súbor
                </button>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(stav.verejnyKluc);
                      toast.success("Kľúč skopírovaný.");
                    } catch {
                      toast.error("Skopírovať sa nepodarilo, označte text a použite Ctrl+C.");
                    }
                  }}
                  className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-secondary"
                >
                  Kopírovať
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
                  (r) => `Načítaných zostatkov: ${r.pocet}`,
                )
              }
              className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-secondary disabled:opacity-50"
            >
              {busy === "ucty" ? "Načítavam…" : "Načítať zostatky"}
            </button>
            <button
              disabled={busy !== null}
              onClick={() =>
                sprav(
                  "pohyby",
                  () => pohybyFn({ data: { company_id: cid! } }),
                  (r) =>
                    r.problemy?.length
                      ? `Načítaných pohybov: ${r.vlozenych}. Nepodarilo sa: ${r.problemy.join(", ")}`
                      : `Načítaných pohybov: ${r.vlozenych}`,
                )
              }
              className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-secondary disabled:opacity-50"
            >
              {busy === "pohyby" ? "Sťahujem…" : "Stiahnuť pohyby"}
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
      toast.error(e?.message ?? "Nepodarilo sa to.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto mt-6 max-w-2xl rounded-2xl border border-border bg-card p-8 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-[#1b1b3a] text-white">
          <CreditCard className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Wallester</h2>
          <p className="text-sm text-muted-foreground">
            Firemné karty. Platby sa spárujú s bločkami podľa obchodníka.
          </p>
        </div>
      </div>

      {stav?.stav !== "pripojene" && (
        <ol className="mt-6 space-y-1 text-sm text-foreground/80">
          <li>1. Napíšte Wallesteru, že chcete prístup k API (podpora alebo váš kontakt).</li>
          <li>2. Nižšie si vyrobte verejný kľúč a pošlite im ho.</li>
          <li>
            3. Oni pošlú <strong>issuer ID</strong>, <strong>audience ID</strong>, kód produktu a
            maximálnu platnosť tokenu — doplňte ich sem.
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
              () => "Kľúč vyrobený. Pošlite ho Wallesteru.",
            )
          }
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy === "kluc" ? "Vyrábam kľúč…" : "Vyrobiť verejný kľúč"}
        </button>
      ) : null}

      {stav?.verejnyKluc && (
        <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="text-sm font-medium">Verejný kľúč pre Wallester</p>
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
              <Download className="h-4 w-4" /> Stiahnuť ako súbor
            </button>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(stav.verejnyKluc);
                  toast.success("Kľúč skopírovaný.");
                } catch {
                  toast.error("Skopírovať sa nepodarilo, označte text a použite Ctrl+C.");
                }
              }}
              className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-secondary"
            >
              Kopírovať
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
              <span className="text-xs font-medium text-muted-foreground">{label}</span>
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
                  () => "Wallester pripojený.",
                )
              }
              className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy === "dokoncenie" ? "Overujem…" : "Dokončiť pripojenie"}
            </button>
          </div>
        </div>
      )}

      {stav?.stav === "pripojene" && (
        <>
          <p className="mt-6 text-sm">
            Pripojené · produkt {stav.product_code}
            {stav.last_synced_at
              ? ` · naposledy ${new Date(stav.last_synced_at).toLocaleString("sk-SK")}`
              : ""}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              disabled={busy !== null}
              onClick={() =>
                sprav(
                  "ucty",
                  () => uctyFn({ data: { company_id: cid! } }),
                  (r) => `Načítaných kartových účtov: ${r.pocet}`,
                )
              }
              className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-secondary disabled:opacity-50"
            >
              {busy === "ucty" ? "Načítavam…" : "Načítať účty"}
            </button>
            <button
              disabled={busy !== null}
              onClick={() =>
                sprav(
                  "pohyby",
                  () => pohybyFn({ data: { company_id: cid! } }),
                  (r) =>
                    r.problemy?.length
                      ? `Načítaných pohybov: ${r.vlozenych}. Nepodarilo sa: ${r.problemy.join(", ")}`
                      : `Načítaných pohybov: ${r.vlozenych}`,
                )
              }
              className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-secondary disabled:opacity-50"
            >
              {busy === "pohyby" ? "Sťahujem…" : "Stiahnuť pohyby"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
