import { useEffect, useMemo, useState } from "react";
import { useOperacia } from "@/lib/mobile/server-most";
import { toast } from "sonner";
import { Landmark, RefreshCw } from "lucide-react";
import { zostatkyPodlaMien } from "@/lib/faktero/zostatky";
import { MobilObrazovka, Pracujem } from "./MobilChrome";
import { formatovacMeny } from "@/lib/faktero/mena";

import { usePreklad } from "@/lib/mobile/preklady/hook";
import type { Kluc } from "@/lib/mobile/preklady";
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

function suma(v: number, mena: string | null | undefined, loc: string): string {
  return formatovacMeny(mena ?? "EUR", loc)(v);
}

/** Z IBAN-u stačí koniec — celý sa do riadka nezmestí a nič nehovorí. */
function koniecIbanu(iban: string | null, nazovBezIbanu: string): string {
  if (!iban) return nazovBezIbanu;
  const cistý = iban.replace(/\s+/g, "");
  return `…${cistý.slice(-4)}`;
}

/**
 * Popis účtu do prepínača.
 *
 * Banka posiela ako názov účtu majiteľa, takže všetkých päť účtov firmy sa volá
 * rovnako a prepínač by bol na nerozoznanie. Rozlišuje ich koniec IBAN-u —
 * podľa neho ich pozná aj človek.
 */
function nazovUctu(u: Ucet, nazovBezIbanu: string): string {
  return koniecIbanu(u.iban, nazovBezIbanu);
}

/** IBAN po štvoriciach — inak sa v ňom oko stratí. */
function ibanCitatelne(iban: string | null, nazovBezIbanu: string): string {
  if (!iban) return nazovBezIbanu;
  return iban
    .replace(/\s+/g, "")
    .replace(/(.{4})/g, "$1 ")
    .trim();
}

/** Porovnanie názvov naslepo — „PALIERA s.r.o." a „PALIERA s. r. o." je tá istá firma. */
function rovnakeMeno(a: string | null | undefined, b: string | null | undefined): boolean {
  const o = (s?: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9á-ž]/gi, "");
  return !!o(a) && o(a) === o(b);
}

/**
 * Nadpis riadka.
 *
 * Dve pasce zo skutočných dát: časť pohybov nemá od banky ani protistranu, ani
 * popis (platby kartou), a pri poplatkoch a dani si banka dáva ako protistranu
 * **samotného majiteľa účtu** — vypísať vlastný názov firmy na každý druhý
 * riadok nehovorí nič, kým popis („Transakčná daň") hovorí všetko.
 */
/* `t` prichádza ako vstup — funkcia je mimo komponentu a hook tam nepatrí. */
function nadpisPohybu(p: Pohyb, firma: string, t: (k: Kluc, p?: Record<string, string | number>) => string): string {
  const protistrana = p.protistrana?.trim();
  const popis = p.popis?.trim();
  if (protistrana && !rovnakeMeno(protistrana, firma)) return protistrana;
  return (
    popis || protistrana || (p.suma > 0 ? t("banka.prijataPlatba") : t("banka.odchadzajucaPlatba"))
  );
}

function podnadpisPohybu(p: Pohyb, firma: string, t: (k: Kluc, p?: Record<string, string | number>) => string): string | null {
  const popis = p.popis?.trim();
  const casti = [
    p.faktura ? t("banka.kFakture", { cislo: p.faktura }) : null,
    p.vs ? `VS ${p.vs}` : null,
    // Popis len vtedy, keď nie je už v nadpise.
    popis && popis !== nadpisPohybu(p, firma, t) ? popis : null,
  ].filter(Boolean);
  return casti.length ? casti.join(" · ") : null;
}

/* Aj tu `t` ako vstup — a locale, aby sa dátum písal v jazyku appky. */
function denNazov(iso: string, t: (k: Kluc, p?: Record<string, string | number>) => string, loc: string): string {
  const dnes = new Date().toISOString().slice(0, 10);
  if (iso === dnes) return t("banka.dnes");
  const v = new Date();
  v.setDate(v.getDate() - 1);
  if (iso === v.toISOString().slice(0, 10)) return t("banka.vcera");
  const [r, m, d] = iso.split("-").map(Number);
  return new Date(r, (m || 1) - 1, d || 1).toLocaleDateString(loc, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function ked(iso: string | null, t: (k: Kluc, p?: Record<string, string | number>) => string, loc: string): string {
  if (!iso) return t("banka.nesynchronizovane");
  const d = new Date(iso);
  return `${d.toLocaleDateString(loc, { day: "numeric", month: "numeric" })} ${d.toLocaleTimeString(
    loc,
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
  const { t, locale } = usePreklad();
  const nacitaj = useOperacia("banka-prehlad");
  const stiahni = useOperacia("banka-stiahni");
  const [ucty, setUcty] = useState<Ucet[] | null>(null);
  const [pohyby, setPohyby] = useState<Pohyb[]>([]);
  const [vybrany, setVybrany] = useState<string | null>(null);
  const [tahame, setTahame] = useState(false);
  /** Účty sa nedali načítať, lebo nie je signál. */
  const [nedostupne, setNedostupne] = useState(false);

  async function obnov() {
    try {
      const r = (await nacitaj({ data: { company_id: firma.id } })) as {
        ucty: Ucet[];
        pohyby: Pohyb[];
      };
      setUcty(r.ucty);
      setPohyby(r.pohyby);
    } catch (e: any) {
      // Bez signálu nevieme, či firma účet má — tvrdiť, že nemá, je nepravda a
      // človek by šiel zbytočne pripájať banku, ktorú už pripojenú má.
      const { isOnline } = await import("@/lib/mobile/offline-queue");
      const online = await isOnline();
      setNedostupne(!online);
      if (online) toast.error(e?.message ?? t("banka.chybaNacitania"));
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
    if (zlyhalo && !nove) toast.error(t("banka.neodpovedala"));
    else if (nove) toast.success(nove === 1 ? "Pribudol 1 pohyb." : `Pribudlo ${nove} pohybov.`);
    else toast.success(t("banka.ziadneNove"));
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
    return zostatkyPodlaMien(
      zoznam
        .filter((u) => u.zostatok !== null)
        .map((u) => ({ currency: u.mena, balance: u.zostatok })),
    );
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
    return (
      zoznam
        .map((u) => u.synchronizovane)
        .filter(Boolean)
        .sort()
        .pop() ?? null
    );
  }, [ucty, vybrany]);

  if (ucty === null) return <Pracujem text={t("banka.nacitavam")} />;

  if (!ucty.length) {
    return (
      <MobilObrazovka title={t("banka.nazov")} subtitle={firma.name} onBack={onSpat}>
        <div className="grid place-items-center py-16 text-center">
          <Landmark className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm font-medium">
            {nedostupne ? t("banka.bezPripojenia") : t("banka.bezUctu")}
          </p>
          <p className="mt-1 max-w-xs text-[13px] text-muted-foreground">
            {nedostupne ? t("banka.lenSoSignalom") : t("banka.pripojenieNaWebe")}
          </p>
        </div>
      </MobilObrazovka>
    );
  }

  return (
    <MobilObrazovka
      title={t("banka.nazov")}
      subtitle={firma.name}
      onBack={onSpat}
      akcia={
        <button
          onClick={zBanky}
          disabled={tahame}
          aria-label={t("banka.stiahnut")}
          className="grid h-9 w-9 place-items-center rounded-full active:bg-secondary disabled:opacity-50"
        >
          <RefreshCw className={`h-[18px] w-[18px] ${tahame ? "animate-spin" : ""}`} />
        </button>
      }
    >
      <div className="mb-4 rounded-2xl border border-border/70 bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="text-[13px] text-muted-foreground">
          {vybrany
            ? ibanCitatelne(ucty.find((u) => u.id === vybrany)!.iban, t("banka.ucetVelke"))
            : t("banka.zostatokSpolu")}
        </div>
        {zostatky.length === 0 ? (
          <div className="mt-0.5 text-[26px] font-semibold leading-none">—</div>
        ) : (
          zostatky.map((z) => (
            <div
              key={z.mena}
              className="mt-0.5 text-[26px] font-semibold leading-none tabular-nums"
            >
              {suma(z.suma, z.mena, locale)}
            </div>
          ))
        )}
        <div className="mt-1.5 text-[12px] text-muted-foreground">
          {tahame ? t("banka.stahujem") : t("banka.aktualizovane", { ked: ked(naposledy, t, locale) })}
        </div>
      </div>

      {ucty.length > 1 && (
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <Chip aktivny={!vybrany} onClick={() => setVybrany(null)}>
            {t("banka.vsetkyUcty")}
          </Chip>
          {ucty.map((u) => (
            <Chip key={u.id} aktivny={vybrany === u.id} onClick={() => setVybrany(u.id)}>
              {nazovUctu(u, t("banka.ucetSkratka"))}
            </Chip>
          ))}
        </div>
      )}

      {vidno.length === 0 ? (
        <div className="grid place-items-center py-14 text-center">
          <Landmark className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm font-medium">{t("banka.ziadnePohyby")}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {dni.map(([den, riadky]) => (
            <div key={den}>
              <div className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
                {denNazov(den, t, locale)}
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
                        {nadpisPohybu(p, firma.name, t)}
                      </div>
                      {podnadpisPohybu(p, firma.name, t) && (
                        <div className="mt-0.5 truncate text-[13px] text-muted-foreground">
                          {podnadpisPohybu(p, firma.name, t)}
                        </div>
                      )}
                    </div>
                    <div
                      className={`shrink-0 text-[15px] font-semibold tabular-nums ${
                        p.suma > 0 ? "text-emerald-600 dark:text-emerald-400" : ""
                      }`}
                    >
                      {p.suma > 0 ? "+" : ""}
                      {suma(p.suma, p.mena, locale)}
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
