import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MapPin, Package, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  stavNapojeniFn,
  stavZasielkyFn,
  stitokZasielkyFn,
  vytvorZasielkuFn,
} from "@/lib/faktero/eshop-napojenia.functions";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";

declare global {
  interface Window {
    Packeta?: {
      Widget: {
        pick: (apiKey: string, cb: (p: any) => void, opts?: Record<string, unknown>) => void;
      };
    };
  }
}

const vstup = "mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

/** Načíta widget výdajných miest Zásielkovne (v6) až keď ho treba. */
function nacitajWidget(): Promise<void> {
  if (window.Packeta) return Promise.resolve();
  return new Promise((ok, chyba) => {
    const s = document.createElement("script");
    s.src = "https://widget.packeta.com/v6/www/js/library.js";
    s.onload = () => ok();
    s.onerror = () => chyba(new Error("Mapu výdajných miest sa nepodarilo načítať."));
    document.head.appendChild(s);
  });
}

/**
 * Zásielka Zásielkovne k faktúre: vytvorenie (výdajné miesto alebo adresa,
 * dobierka), štítok a stav. Bez pripojenej Zásielkovne sa neukáže.
 */
export function ZasielkovnaFaktury({ inv, onZmena }: { inv: any; onZmena: () => void }) {
  const stavNapojeni = useServerFn(stavNapojeniFn);
  const stitok = useServerFn(stitokZasielkyFn);
  const stav = useServerFn(stavZasielkyFn);
  const [apiKluc, setApiKluc] = useState<string | null | undefined>(undefined);
  const [okno, setOkno] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    stavNapojeni({ data: { company_id: inv.company_id } })
      .then((s) => setApiKluc(s.zasielkovna?.apiKluc ?? null))
      .catch(() => setApiKluc(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inv.company_id]);
  if (!apiKluc || inv.status === "draft" || inv.type === "proforma" || Number(inv.total) <= 0)
    return null;

  async function stiahnutStitok() {
    setBusy(true);
    try {
      const r = await stitok({ data: { company_id: inv.company_id, invoice_id: inv.id } });
      const b = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([b], { type: "application/pdf" }));
      a.download = r.nazov;
      a.click();
    } catch (e: any) {
      toast.error(e?.message ?? "Štítok sa nepodarilo stiahnuť");
    } finally {
      setBusy(false);
    }
  }

  async function obnovStav() {
    setBusy(true);
    try {
      const r = await stav({ data: { company_id: inv.company_id, invoice_id: inv.id } });
      toast.success(`Stav zásielky: ${r.stav}${r.ulozenaDo ? ` (uložená do ${r.ulozenaDo})` : ""}`);
      onZmena();
    } catch (e: any) {
      toast.error(e?.message ?? "Stav sa nepodarilo zistiť");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Package className="h-4 w-4 text-primary" /> Zásielkovňa
      </div>
      {inv.zasielkovna_id ? (
        <div className="mt-2 space-y-2 text-sm">
          <div>
            Zásielka{" "}
            <a
              href={`https://tracking.packeta.com/sk/?id=${encodeURIComponent(inv.zasielkovna_cislo ?? inv.zasielkovna_id)}`}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary hover:underline"
            >
              {inv.zasielkovna_cislo ?? inv.zasielkovna_id}
            </a>
            {inv.zasielkovna_stav ? (
              <span className="text-muted-foreground"> · {inv.zasielkovna_stav}</span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void stiahnutStitok()}
              disabled={busy}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
            >
              Štítok (PDF)
            </button>
            <button
              onClick={() => void obnovStav()}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Stav
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOkno(true)}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
        >
          Poslať cez Zásielkovňu
        </button>
      )}
      {okno && (
        <OknoZasielky
          inv={inv}
          apiKluc={apiKluc}
          onClose={() => setOkno(false)}
          onHotovo={() => {
            setOkno(false);
            onZmena();
          }}
        />
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Nastavenie v{" "}
        <Link to="/nastavenia/eshop" className="underline">
          E-shop a doprava
        </Link>
        .
      </p>
    </div>
  );
}

function OknoZasielky({
  inv,
  apiKluc,
  onClose,
  onHotovo,
}: {
  inv: any;
  apiKluc: string;
  onClose: () => void;
  onHotovo: () => void;
}) {
  useZatvorNaEscape(onClose);
  const vytvor = useServerFn(vytvorZasielkuFn);
  const [miesto, setMiesto] = useState<{ id: string; nazov: string } | null>(null);
  const [rucne, setRucne] = useState("");
  const [naAdresu, setNaAdresu] = useState(false);
  const [hmotnost, setHmotnost] = useState("1");
  const [dobierka, setDobierka] = useState(inv.payment_method === "cash");
  const [telefon, setTelefon] = useState("");
  const [email, setEmail] = useState(inv.customer_email ?? "");
  const [busy, setBusy] = useState(false);
  const krajina = String(inv.customer_country || "SK").toLowerCase();

  async function vybrat() {
    try {
      await nacitajWidget();
      window.Packeta!.Widget.pick(
        apiKluc,
        (p) => {
          if (p)
            setMiesto({ id: String(p.id), nazov: [p.name, p.city].filter(Boolean).join(", ") });
        },
        { country: krajina, language: "sk" },
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Mapa sa nenačítala");
    }
  }

  const miestoId = Number(miesto?.id ?? rucne);
  async function poslat() {
    setBusy(true);
    try {
      const r = await vytvor({
        data: {
          company_id: inv.company_id,
          invoice_id: inv.id,
          miesto_id: miestoId,
          na_adresu: naAdresu,
          hmotnost: Number(hmotnost.replace(",", ".")),
          dobierka,
          telefon,
          email,
        },
      });
      toast.success(`Zásielka vytvorená: ${r.cislo ?? r.id}`);
      onHotovo();
    } catch (e: any) {
      toast.error(e?.message ?? "Zásielku sa nepodarilo vytvoriť", { duration: 12000 });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Poslať cez Zásielkovňu"
        className="w-full max-w-md rounded-xl border border-border bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">Poslať cez Zásielkovňu</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {inv.customer_name} · faktúra {inv.invoice_number}
        </p>
        <div className="mt-4 space-y-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={naAdresu}
              onChange={(e) => setNaAdresu(e.target.checked)}
            />
            Doručiť na adresu z faktúry (zadajte id dopravcu)
          </label>
          {!naAdresu ? (
            <div>
              <button
                type="button"
                onClick={() => void vybrat()}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 hover:bg-secondary"
              >
                <MapPin className="h-4 w-4" />{" "}
                {miesto ? "Zmeniť výdajné miesto" : "Vybrať výdajné miesto na mape"}
              </button>
              {miesto ? (
                <div className="mt-1 text-xs">
                  {miesto.nazov} (id {miesto.id})
                </div>
              ) : null}
            </div>
          ) : null}
          {!miesto || naAdresu ? (
            <label className="block">
              <span className="text-xs text-muted-foreground">
                {naAdresu
                  ? "Id dopravcu (napr. doručenie na adresu SK)"
                  : "alebo id výdajného miesta"}
              </span>
              <input
                inputMode="numeric"
                value={rucne}
                onChange={(e) => setRucne(e.target.value.replace(/\D/g, ""))}
                className={vstup}
              />
            </label>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-muted-foreground">Hmotnosť (kg)</span>
              <input
                inputMode="decimal"
                value={hmotnost}
                onChange={(e) => setHmotnost(e.target.value)}
                className={vstup}
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">Telefón príjemcu</span>
              <input
                value={telefon}
                onChange={(e) => setTelefon(e.target.value)}
                placeholder="+421…"
                className={vstup}
              />
            </label>
          </div>
          <label className="block">
            <span className="text-xs text-muted-foreground">
              E-mail príjemcu (oznámenie o zásielke)
            </span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} className={vstup} />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={dobierka}
              onChange={(e) => setDobierka(e.target.checked)}
            />
            Dobierka {Math.abs(Number(inv.total)).toFixed(2)} {inv.currency}
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
          >
            Zrušiť
          </button>
          <button
            onClick={() => void poslat()}
            disabled={busy || !(miestoId > 0) || !(Number(hmotnost.replace(",", ".")) > 0)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Vytvoriť zásielku
          </button>
        </div>
      </div>
    </div>
  );
}
