import { useEffect, useMemo, useState } from "react";
import { useOperacia } from "@/lib/mobile/server-most";
import { toast } from "sonner";
import { Landmark, RefreshCw } from "lucide-react";
import { zostatkyPodlaMien } from "@/lib/faktero/zostatky";
import { MobilObrazovka, Pracujem } from "./MobilChrome";
import { formatovacMeny } from "@/lib/faktero/mena";

import { usePreklad } from "@/lib/mobile/preklady/hook";
import {
  Card,
  FilterChips,
  ListCard,
  ListRow,
  PrazdnyStav,
  SectionHeader,
  StatusBadge,
} from "./ui";
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
        <PrazdnyStav
          icon={Landmark}
          title={nedostupne ? t("banka.bezPripojenia") : t("banka.bezUctu")}
          popis={nedostupne ? t("banka.lenSoSignalom") : t("banka.pripojenieNaWebe")}
        />
      </MobilObrazovka>
    );
  }

  return (
    <MobilObrazovka
      velkyNadpis
      title={t("banka.nazov")}
      subtitle={firma.name}
      onBack={onSpat}
      akcia={
        <button
          onClick={zBanky}
          disabled={tahame}
          aria-label={t("banka.stiahnut")}
          className="grid h-11 w-11 place-items-center rounded-full text-app-text active:bg-app-ramik disabled:opacity-50"
        >
          <RefreshCw className={`h-[18px] w-[18px] ${tahame ? "animate-spin" : ""}`} />
        </button>
      }
    >
      <Card className="mb-4 p-4">
        <div className="text-[13px] text-app-text-2">
          {vybrany
            ? ibanCitatelne(ucty.find((u) => u.id === vybrany)!.iban, t("banka.ucetVelke"))
            : t("banka.zostatokSpolu")}
        </div>
        {zostatky.length === 0 ? (
          <div className="mt-1.5 text-[30px] font-bold leading-none text-app-text">—</div>
        ) : (
          zostatky.map((z) => (
            <div
              key={z.mena}
              className="mt-1.5 text-[30px] font-bold leading-none tabular-nums text-app-text"
            >
              {suma(z.suma, z.mena, locale)}
            </div>
          ))
        )}
        <div className="mt-1.5 text-[13px] text-app-text-2">
          {tahame ? t("banka.stahujem") : t("banka.aktualizovane", { ked: ked(naposledy, t, locale) })}
        </div>
      </Card>

      {ucty.length > 1 && (
        <div className="mb-4">
          <FilterChips
            ariaLabel={t("banka.ucet")}
            aktivna={vybrany ?? "vsetky"}
            onZmen={(kod) => setVybrany(kod === "vsetky" ? null : kod)}
            moznosti={[
              { kod: "vsetky", popis: t("banka.vsetkyUcty") },
              ...ucty.map((u) => ({ kod: u.id, popis: nazovUctu(u, t("banka.ucetSkratka")) })),
            ]}
          />
        </div>
      )}

      {vidno.length === 0 ? (
        <PrazdnyStav icon={Landmark} title={t("banka.ziadnePohyby")} />
      ) : (
        <div className="space-y-5">
          {dni.map(([den, riadky]) => (
            <div key={den}>
              <SectionHeader title={denNazov(den, t, locale)} />
              <ListCard>
                {riadky.map((p) => (
                  <ListRow
                    key={p.id}
                    title={nadpisPohybu(p, firma.name, t)}
                    subtitle={podnadpisPohybu(p, firma.name, t) ?? undefined}
                    right={`${p.suma > 0 ? "+" : ""}${suma(p.suma, p.mena, locale)}`}
                    rightTon={p.suma > 0 ? "zelena" : "neutral"}
                    /* Stav párovania patrí pod sumu — je to vlastnosť platby,
                       nie samostatný riadok. */
                    rightSub={
                      p.faktura ? <StatusBadge text={t("banka.sparovane")} ton="zelena" /> : undefined
                    }
                  />
                ))}
              </ListCard>
            </div>
          ))}
        </div>
      )}
    </MobilObrazovka>
  );
}

