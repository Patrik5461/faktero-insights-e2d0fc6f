import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Landmark, RefreshCw } from "lucide-react";
import { bankaPrehladFn } from "@/lib/faktero/mobil-banka.functions";
import { syncBankTransactions } from "@/lib/faktero/tatrabanka.functions";
import { MobilObrazovka, Pracujem } from "./MobilChrome";

/**
 * Bankové pohyby v telefóne.
 *
 * Odpovedá na jedinú otázku, kvôli ktorej človek počas dňa otvára banku:
 * „prišli peniaze?". Preto je to zoznam na čítanie — prepínač účtov, zostatok
 * a pohyby po dňoch. Platby sa odtiaľto nezadávajú.
 *
 * Zoznam sa berie z toho, čo už stiahlo denné sťahovanie, takže je hneď.
 * Tlačidlo hore ťahá naostro z banky a je zámerne ručné — volanie do banky
 * trvá sekundy a pri každom otvorení obrazovky by len zdržovalo.
 */

type Ucet = {
  id: string;
  iban: string | null;
  nazov: string | null;
  mena: string;
  zostatok: number | null;
  synchronizovane: string | null;
};

type Pohyb = {
  id: string;
  ucet_id: string;
  datum: string;
  suma: number;
  mena: string;
  vs: string | null;
  protistrana: string | null;
  popis: string | null;
  faktura: string | null;
};

function suma(v: number, mena = "EUR"): string {
  return new Intl.NumberFormat("sk-SK", { style: "currency", currency: mena }).format(v);
}

/** Z IBAN-u stačí koniec — celý sa do riadka nezmestí a nič nehovorí. */
function koniecIbanu(iban: string | null): string {
  if (!iban) return "účet";
  const t = iban.replace(/\s+/g, "");
  return `…${t.slice(-4)}`;
}

function nazovUctu(u: Ucet): string {
  return u.nazov?.trim() || koniecIbanu(u.iban);
}

function denNazov(iso: string): string {
  const dnes = new Date().toISOString().slice(0, 10);
  if (iso === dnes) return "Dnes";
  const v = new Date();
  v.setDate(v.getDate() - 1);
  if (iso === v.toISOString().slice(0, 10)) return "Včera";
  const [r, m, d] = iso.split("-").map(Number);
  return new Date(r, (m || 1) - 1, d || 1).toLocaleDateString("sk-SK", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function ked(iso: string | null): string {
  if (!iso) return "zatiaľ nesynchronizované";
  const d = new Date(iso);
  return `${d.toLocaleDateString("sk-SK", { day: "numeric", month: "numeric" })} ${d.toLocaleTimeString(
    "sk-SK",
    { hour: "2-digit", minute: "2-digit" },
  )}`;
}

export function Banka({
  firma,
  onSpat,
}: {
  firma: { id: string; name: string };
  onSpat: () => void;
}) {
  const nacitaj = useServerFn(bankaPrehladFn);
  const stiahni = useServerFn(syncBankTransactions);
  const [ucty, setUcty] = useState<Ucet[] | null>(null);
  const [pohyby, setPohyby] = useState<Pohyb[]>([]);
  const [vybrany, setVybrany] = useState<string | null>(null);
  const [tahame, setTahame] = useState(false);

  async function obnov() {
    try {
      const r = (await nacitaj({ data: { company_id: firma.id } })) as {
        ucty: Ucet[];
        pohyby: Pohyb[];
      };
      setUcty(r.ucty);
      setPohyby(r.pohyby);
    } catch (e: any) {
      toast.error(e?.message ?? "Pohyby sa nepodarilo načítať.");
      setUcty([]);
    }
  }

  useEffect(() => {
    obnov();
    // eslint-disable-next-line
  }, [firma.id]);

  /** Ručné stiahnutie z banky — pre vybraný účet, inak pre všetky. */
  async function zBanky() {
    if (!ucty?.length || tahame) return;
    setTahame(true);
    const ciel = vybrany ? ucty.filter((u) => u.id === vybrany) : ucty;
    let nove = 0;
    let zlyhalo = 0;
    for (const u of ciel) {
      try {
        const r = (await stiahni({ data: { company_id: firma.id, account_id: u.id } })) as {
          inserted: number;
        };
        nove += r.inserted ?? 0;
      } catch {
        // Jeden účet nesmie zhodiť ostatné — banka občas vráti chybu aj bez príčiny.
        zlyhalo++;
      }
    }
    await obnov();
    setTahame(false);
    if (zlyhalo && !nove) toast.error("Banka teraz neodpovedala. Skúste to o chvíľu.");
    else if (nove) toast.success(nove === 1 ? "Pribudol 1 pohyb." : `Pribudlo ${nove} pohybov.`);
    else toast.success("Žiadne nové pohyby.");
  }

  const vidno = useMemo(
    () => (vybrany ? pohyby.filter((p) => p.ucet_id === vybrany) : pohyby),
    [pohyby, vybrany],
  );

  /**
   * Zostatok hlavičky. Pri „Všetky" sa sčítava len v rámci jednej meny —
   * spočítať eurá s korunami by dalo číslo, ktoré nič neznamená.
   */
  const zostatky = useMemo(() => {
    const zoznam = vybrany ? (ucty ?? []).filter((u) => u.id === vybrany) : (ucty ?? []);
    const mapa = new Map<string, number>();
    for (const u of zoznam) {
      if (u.zostatok === null) continue;
      mapa.set(u.mena, (mapa.get(u.mena) ?? 0) + u.zostatok);
    }
    return [...mapa.entries()];
  }, [ucty, vybrany]);

  const dni = useMemo(() => {
    const mapa = new Map<string, Pohyb[]>();
    for (const p of vidno) {
      if (!mapa.has(p.datum)) mapa.set(p.datum, []);
      mapa.get(p.datum)!.push(p);
    }
    return [...mapa.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [vidno]);

  const naposledy = useMemo(() => {
    const zoznam = vybrany ? (ucty ?? []).filter((u) => u.id === vybrany) : (ucty ?? []);
    return zoznam.map((u) => u.synchronizovane).filter(Boolean).sort().pop() ?? null;
  }, [ucty, vybrany]);

  if (ucty === null) return <Pracujem text="Načítavam pohyby…" />;

  if (!ucty.length) {
    return (
      <MobilObrazovka title="Banka" subtitle={firma.name} onBack={onSpat}>
        <div className="grid place-items-center py-16 text-center">
          <Landmark className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm font-medium">Firma nemá pripojený bankový účet</p>
          <p className="mt-1 max-w-xs text-[13px] text-muted-foreground">
            Účet sa pripája na webe — banka pri tom vyžaduje prihlásenie a súhlas, ktorý sa v
            telefóne dobre vybaviť nedá.
          </p>
        </div>
      </MobilObrazovka>
    );
  }

  return (
    <MobilObrazovka
      title="Banka"
      subtitle={firma.name}
      onBack={onSpat}
      akcia={
        <button
          onClick={zBanky}
          disabled={tahame}
          aria-label="Stiahnuť z banky"
          className="grid h-9 w-9 place-items-center rounded-full active:bg-secondary disabled:opacity-50"
        >
          <RefreshCw className={`h-[18px] w-[18px] ${tahame ? "animate-spin" : ""}`} />
        </button>
      }
    >
      <div className="mb-4 rounded-2xl border border-border/70 bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="text-[13px] text-muted-foreground">
          {vybrany ? nazovUctu(ucty.find((u) => u.id === vybrany)!) : "Zostatok spolu"}
        </div>
        {zostatky.length === 0 ? (
          <div className="mt-0.5 text-[26px] font-semibold leading-none">—</div>
        ) : (
          zostatky.map(([mena, v]) => (
            <div key={mena} className="mt-0.5 text-[26px] font-semibold leading-none tabular-nums">
              {suma(v, mena)}
            </div>
          ))
        )}
        <div className="mt-1.5 text-[12px] text-muted-foreground">
          {tahame ? "Sťahujem z banky…" : `Aktualizované ${ked(naposledy)}`}
        </div>
      </div>

      {ucty.length > 1 && (
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <Chip aktivny={!vybrany} onClick={() => setVybrany(null)}>
            Všetky
          </Chip>
          {ucty.map((u) => (
            <Chip key={u.id} aktivny={vybrany === u.id} onClick={() => setVybrany(u.id)}>
              {nazovUctu(u)}
            </Chip>
          ))}
        </div>
      )}

      {vidno.length === 0 ? (
        <div className="grid place-items-center py-14 text-center">
          <Landmark className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm font-medium">Zatiaľ žiadne pohyby</p>
        </div>
      ) : (
        <div className="space-y-5">
          {dni.map(([den, riadky]) => (
            <div key={den}>
              <div className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
                {denNazov(den)}
              </div>
              <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[var(--shadow-card)]">
                {riadky.map((p, i) => (
                  <div
                    key={p.id}
                    className={`flex items-start gap-3 px-4 py-3.5 ${
                      i > 0 ? "border-t border-border/70" : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-medium leading-tight">
                        {p.protistrana?.trim() || p.popis?.trim() || "Bankový pohyb"}
                      </div>
                      <div className="mt-0.5 truncate text-[13px] text-muted-foreground">
                        {[p.faktura ? `k faktúre ${p.faktura}` : null, p.vs ? `VS ${p.vs}` : null]
                          .filter(Boolean)
                          .join(" · ") ||
                          p.popis?.trim() ||
                          "—"}
                      </div>
                    </div>
                    <div
                      className={`shrink-0 text-[15px] font-semibold tabular-nums ${
                        p.suma > 0 ? "text-emerald-600 dark:text-emerald-400" : ""
                      }`}
                    >
                      {p.suma > 0 ? "+" : ""}
                      {suma(p.suma, p.mena)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </MobilObrazovka>
  );
}

function Chip({
  aktivny,
  onClick,
  children,
}: {
  aktivny: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[14px] font-medium ${
        aktivny
          ? "border-transparent bg-primary text-primary-foreground"
          : "border-border/70 bg-card text-foreground active:bg-secondary"
      }`}
    >
      {children}
    </button>
  );
}
