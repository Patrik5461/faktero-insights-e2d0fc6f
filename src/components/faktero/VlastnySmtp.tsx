import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import {
  nacitajSmtpFn,
  ulozSmtpFn,
  vypniSmtpFn,
  type SmtpPrehlad,
} from "@/lib/faktero/smtp-firmy.functions";
import { potvrd } from "@/lib/potvrdenie";

const vstup = "mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

/** Známi poskytovatelia — predvyplnia server a port. */
const PREDVOLBY: { nazov: string; host: string; port: number; zabezpecenie: "ssl" | "starttls" }[] =
  [
    {
      nazov: "Gmail / Google Workspace",
      host: "smtp.gmail.com",
      port: 587,
      zabezpecenie: "starttls",
    },
    {
      nazov: "Microsoft 365 / Outlook",
      host: "smtp.office365.com",
      port: 587,
      zabezpecenie: "starttls",
    },
    { nazov: "WebSupport", host: "smtp.websupport.sk", port: 465, zabezpecenie: "ssl" },
    { nazov: "Seznam", host: "smtp.seznam.cz", port: 465, zabezpecenie: "ssl" },
  ];

/**
 * Odosielanie mailov z vlastnej adresy (ako v Doklado): faktúry, upomienky a
 * ponuky prídu odberateľovi z faktury@firma.sk, nie z Faktera.
 */
export function VlastnySmtp({ companyId }: { companyId: string }) {
  const nacitaj = useServerFn(nacitajSmtpFn);
  const uloz = useServerFn(ulozSmtpFn);
  const vypni = useServerFn(vypniSmtpFn);
  const [stav, setStav] = useState<SmtpPrehlad | undefined>(undefined);
  const [zakazane, setZakazane] = useState(false);
  const [f, setF] = useState({
    host: "",
    port: 587,
    zabezpecenie: "starttls" as "ssl" | "starttls" | "ziadne",
    pouzivatel: "",
    heslo: "",
    od_email: "",
    od_meno: "",
  });
  const [busy, setBusy] = useState(false);
  const [uprava, setUprava] = useState(false);

  async function obnov() {
    try {
      const s = await nacitaj({ data: { company_id: companyId } });
      setStav(s);
      if (s)
        setF({
          host: s.host,
          port: s.port,
          zabezpecenie: s.zabezpecenie,
          pouzivatel: s.pouzivatel,
          heslo: "",
          od_email: s.od_email,
          od_meno: s.od_meno,
        });
    } catch {
      setZakazane(true);
    }
  }
  useEffect(() => {
    void obnov();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  if (zakazane) return null;

  async function ulozit() {
    setBusy(true);
    try {
      const r = await uloz({ data: { company_id: companyId, ...f } });
      toast.success(
        `Funguje — skúšobný mail odišiel na ${r.komu}. Maily firmy odteraz idú z ${f.od_email}.`,
      );
      setUprava(false);
      await obnov();
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa", { duration: 12000 });
      await obnov();
    } finally {
      setBusy(false);
    }
  }

  async function vypnut(zmazat: boolean) {
    if (
      zmazat &&
      !(await potvrd(
        "Zmazať nastavenie vlastného servera?\nMaily firmy budú znova chodiť cez Faktero.",
      ))
    )
      return;
    await vypni({ data: { company_id: companyId, zmazat } });
    toast.success(zmazat ? "Nastavenie zmazané" : "Vlastný server vypnutý — maily idú cez Faktero");
    await obnov();
  }

  const zobrazForm = uprava || !stav;
  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-6">
      <div className="flex items-start gap-3">
        <Mail className="mt-0.5 h-5 w-5 text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">Odosielanie z vlastnej adresy</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Faktúry, upomienky, cenové ponuky a podklady pre účtovníka môžu odberateľom chodiť z
            vašej firemnej adresy (napr. faktury@vasafirma.sk) cez váš poštový server. Bez
            nastavenia chodia z adresy Faktera s vaším menom.
          </p>
          {stav === undefined ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Načítavam…
            </div>
          ) : stav && !uprava ? (
            <div className="mt-3 space-y-2 text-sm">
              <div>
                {stav.aktivne ? (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                    zapnuté
                  </span>
                ) : (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                    vypnuté
                  </span>
                )}{" "}
                {stav.od_meno ? `${stav.od_meno} ` : ""}&lt;{stav.od_email}&gt; cez {stav.host}:
                {stav.port}
              </div>
              {stav.posledna_chyba ? (
                <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-900 dark:text-amber-100">
                  Posledná chyba (
                  {stav.posledna_chyba_at
                    ? new Date(stav.posledna_chyba_at).toLocaleString("sk-SK")
                    : ""}
                  ): {stav.posledna_chyba}
                  {stav.aktivne ? " — ten mail odišiel cez Faktero." : ""}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setUprava(true)}
                  className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
                >
                  Upraviť
                </button>
                {stav.aktivne ? (
                  <button
                    type="button"
                    onClick={() => void vypnut(false)}
                    className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
                  >
                    Vypnúť
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void vypnut(true)}
                  className="rounded-md border border-destructive/40 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                >
                  Zmazať
                </button>
              </div>
            </div>
          ) : null}
          {stav !== undefined && zobrazForm ? (
            <div className="mt-4">
              <div className="flex flex-wrap gap-1.5 text-xs">
                {PREDVOLBY.map((p) => (
                  <button
                    key={p.host}
                    type="button"
                    onClick={() =>
                      setF((x) => ({
                        ...x,
                        host: p.host,
                        port: p.port,
                        zabezpecenie: p.zabezpecenie,
                      }))
                    }
                    className="rounded-full border border-border px-2.5 py-1 hover:bg-secondary"
                  >
                    {p.nazov}
                  </button>
                ))}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="text-xs text-muted-foreground">Adresa odosielateľa</span>
                  <input
                    value={f.od_email}
                    onChange={(e) => setF({ ...f, od_email: e.target.value })}
                    placeholder="faktury@vasafirma.sk"
                    className={vstup}
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-xs text-muted-foreground">Meno odosielateľa</span>
                  <input
                    value={f.od_meno}
                    onChange={(e) => setF({ ...f, od_meno: e.target.value })}
                    placeholder="Vaša firma s.r.o."
                    className={vstup}
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-xs text-muted-foreground">SMTP server</span>
                  <input
                    value={f.host}
                    onChange={(e) => setF({ ...f, host: e.target.value.trim() })}
                    placeholder="smtp.vasafirma.sk"
                    className={vstup}
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm">
                    <span className="text-xs text-muted-foreground">Port</span>
                    <input
                      inputMode="numeric"
                      value={f.port}
                      onChange={(e) =>
                        setF({ ...f, port: Number(e.target.value.replace(/\D/g, "")) || 0 })
                      }
                      className={vstup}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-xs text-muted-foreground">Zabezpečenie</span>
                    <select
                      value={f.zabezpecenie}
                      onChange={(e) => setF({ ...f, zabezpecenie: e.target.value as any })}
                      className={vstup}
                    >
                      <option value="starttls">STARTTLS (587)</option>
                      <option value="ssl">SSL/TLS (465)</option>
                      <option value="ziadne">Bez šifrovania</option>
                    </select>
                  </label>
                </div>
                <label className="block text-sm">
                  <span className="text-xs text-muted-foreground">Prihlasovacie meno</span>
                  <input
                    value={f.pouzivatel}
                    onChange={(e) => setF({ ...f, pouzivatel: e.target.value })}
                    autoComplete="off"
                    placeholder="zvyčajne celá adresa"
                    className={vstup}
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-xs text-muted-foreground">Heslo</span>
                  <input
                    type="password"
                    value={f.heslo}
                    onChange={(e) => setF({ ...f, heslo: e.target.value })}
                    autoComplete="new-password"
                    placeholder={stav?.maHeslo ? "ponechať uložené" : ""}
                    className={vstup}
                  />
                </label>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Pri Gmaile a Microsoft 365 s dvojfaktorovým overením použite{" "}
                <strong>heslo aplikácie</strong>, nie bežné heslo. Heslo je uložené zašifrované a už
                sa nezobrazí. Po uložení pošleme skúšobný mail na vašu adresu — zapne sa, len keď
                prejde.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void ulozit()}
                  disabled={busy || !f.host || !f.od_email}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />} Uložiť a otestovať
                </button>
                {stav ? (
                  <button
                    type="button"
                    onClick={() => setUprava(false)}
                    className="rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
                  >
                    Zrušiť
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
