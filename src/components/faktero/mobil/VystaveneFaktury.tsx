import { useEffect, useMemo, useState } from "react";
import { useOperacia } from "@/lib/mobile/server-most";
import { toast } from "sonner";
import {
  BellRing,
  Check,
  CloudOff,
  ExternalLink,
  FileText,
  Mail,
  Pencil,
  Search,
  Share2,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MobilObrazovka, Pracujem, VelkeTlacidlo } from "./MobilChrome";
import { datum } from "./PrijateDoklady";
import { otvorPdfFaktury, zdielajPdfFaktury } from "./pdf-faktury";
import type { OdlozenaFaktura } from "@/lib/mobile/faktury-fronta";
import { moznoUpravit } from "@/lib/mobile/faktura-uprava";
import { formatovacMeny } from "@/lib/faktero/mena";

import { usePreklad } from "@/lib/mobile/preklady/hook";
import type { Kluc } from "@/lib/mobile/preklady";
import {
  Card,
  datumKratky,
  FilterChips,
  ListCard,
  ListRow,
  PrazdnyStav,
  SectionHeader,
  StatusBadge,
  type Ton,
} from "./ui";
/**
 * Vystavené faktúry v telefóne.
 *
 * Okrem PDF, odoslania a označenia úhrady sa dá faktúra aj **opraviť** a
 * **zmazať** — preklep sa nájde aj vtedy, keď je človek u zákazníka a počítač
 * je ďaleko. Platia rovnaké pravidlá ako na webe (`lib/mobile/faktura-uprava`):
 * stornovaná sa neopravuje, mazanie je mäkké a faktúra hýbuca skladom patrí na
 * počítač.
 */

type Faktura = {
  id: string;
  invoice_number: string;
  customer_name: string | null;
  customer_email: string | null;
  total: number | string;
  currency: string | null;
  issue_date: string;
  due_date: string;
  status: string;
  type: string;
  paid_at: string | null;
  sent_at: string | null;
};

function suma(v: unknown, mena = "EUR", loc = "sk-SK"): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return formatovacMeny(mena, loc)(n);
}

function nazovMesiaca(kluc: string, loc: string): string {
  const [r, m] = kluc.split("-").map(Number);
  return new Date(r, (m || 1) - 1, 1).toLocaleDateString(loc, {
    month: "long",
    year: "numeric",
  });
}

/**
 * Stav faktúry pre zoznam.
 *
 * „Po splatnosti" sa počíta z dátumu, nie zo stĺpca `status` — ten sa na
 * `overdue` nikde v aplikácii neprepisuje a faktúra po termíne by sa tvárila
 * ako bežná vystavená.
 */
/* Vracia kľúč, nie hotový text — funkcia je mimo komponentu a preklad tam
   nedosiahne. Prekladá sa až tam, kde sa odznak kreslí. */
function stav(f: Faktura): { kluc: Kluc; ton: Ton } {
  if (f.status === "paid") return { kluc: "faktury.stav.uhradena", ton: "zelena" };
  if (f.status === "cancelled") return { kluc: "faktury.stav.stornovana", ton: "neutral" };
  if (f.status === "draft") return { kluc: "faktury.stav.navrh", ton: "neutral" };
  if (f.due_date < new Date().toISOString().slice(0, 10))
    return { kluc: "faktury.stav.poSplatnosti", ton: "cervena" };
  return { kluc: "faktury.stav.neuhradena", ton: "neutral" };
}

/** Filter nad zoznamom. Zodpovedá tomu, na čo sa človek pýta najčastejšie. */
type Filter = "vsetky" | "neuhradene" | "poSplatnosti" | "uhradene";

function prejdeFiltrom(f: Faktura, filter: Filter): boolean {
  if (filter === "vsetky") return true;
  const den = new Date().toISOString().slice(0, 10);
  if (filter === "uhradene") return f.status === "paid";
  if (f.status === "paid" || f.status === "cancelled") return false;
  if (filter === "poSplatnosti") return f.due_date < den;
  return true;
}

export function VystaveneFaktury({
  firma,
  onSpat,
  onNova,
  onUprav,
}: {
  firma: { id: string; name: string };
  onSpat: () => void;
  onNova: () => void;
  /** Otvorí opravu faktúry — obrazovku vlastní `MobilApp`, nie tento zoznam. */
  onUprav: (faktura: { id: string; invoice_number: string }) => void;
}) {
  const { t, mnozne, locale: loc } = usePreklad();
  const nacitaj = useOperacia("faktury-zoznam");
  const [faktury, setFaktury] = useState<Faktura[] | null>(null);
  const [hladanie, setHladanie] = useState("");
  const [filter, setFilter] = useState<Filter>("vsetky");
  const [hladanieOtvorene, setHladanieOtvorene] = useState(false);
  const [otvorena, setOtvorena] = useState<Faktura | null>(null);
  /** Zoznam sa nepodarilo načítať a nebolo z čoho vziať starší. */
  const [nedostupne, setNedostupne] = useState(false);
  /** Faktúry vystavené bez signálu, ktoré ešte len čakajú na odoslanie. */
  const [cakajuce, setCakajuce] = useState<OdlozenaFaktura[]>([]);

  async function obnov() {
    const { ulozDoPamate, zPamate } = await import("@/lib/mobile/jazdy-lokalne");
    const kluc = `faktury:${firma.id}`;

    // Najprv sa skúsi odoslať, čo leží v telefóne — človek sem po návrate
    // signálu chodí prvý a čaká, že sa to pohne, kým sa pozerá.
    try {
      const { posliFaktury } = await import("@/lib/mobile/offline-queue");
      const odoslane = await posliFaktury(firma.id);
      if (odoslane > 0) {
        toast.success(
          odoslane === 1
            ? t("faktury.odlozenaVystavena")
            : t("faktury.vystavenychPocet", { pocet: odoslane }),
        );
      }
    } catch {
      /* zoznam sa aj tak načíta; fronta to skúsi znova */
    }
    try {
      const { cakajuceFaktury } = await import("@/lib/mobile/faktury-fronta");
      setCakajuce(cakajuceFaktury(firma.id));
    } catch {
      setCakajuce([]);
    }

    try {
      const zoznam = (await nacitaj({ data: { company_id: firma.id } })) as Faktura[];
      setFaktury(zoznam);
      void ulozDoPamate(kluc, zoznam);
    } catch (e: any) {
      // Bez pripojenia sa ukáže posledný známy zoznam. Vystaviť ani odoslať sa
      // offline nedá, ale pozrieť sa, kto nezaplatil, áno — a to je v teréne
      // najčastejšia otázka.
      const zapamatane = await zPamate<Faktura[]>(kluc);
      if (zapamatane?.hodnota?.length) {
        setFaktury(zapamatane.hodnota);
        toast.message(t("faktury.bezPripojenia"), {
          description: new Date(zapamatane.kedy).toLocaleString(loc),
        });
      } else {
        // Tvrdiť „zatiaľ žiadne faktúry" by bola nepravda — vieme len to, že
        // sme sa ich nedopýtali. Kto to prvýkrát otvorí bez signálu, by inak
        // uveril, že o doklady prišiel.
        const { isOnline } = await import("@/lib/mobile/offline-queue");
        setNedostupne(!(await isOnline()));
        if (await isOnline()) toast.error(e?.message ?? t("faktury.chybaNacitania"));
        setFaktury([]);
      }
    }
  }

  useEffect(() => {
    obnov();
    // eslint-disable-next-line
  }, [firma.id]);

  const najdene = useMemo(() => {
    const q = hladanie.trim().toLowerCase();
    const podlaFiltra = (faktury ?? []).filter((f) => prejdeFiltrom(f, filter));
    if (!q) return podlaFiltra;
    return podlaFiltra.filter((f) =>
      [f.invoice_number, f.customer_name]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(q)),
    );
  }, [faktury, hladanie]);

  const mesiace = useMemo(() => {
    const mapa = new Map<string, Faktura[]>();
    for (const f of najdene) {
      const kluc = f.issue_date.slice(0, 7);
      if (!mapa.has(kluc)) mapa.set(kluc, []);
      mapa.get(kluc)!.push(f);
    }
    return [...mapa.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [najdene]);

  /* Neuhradené sú jediné číslo, ktoré človek v telefóne naozaj hľadá. */
  const dlznici = useMemo(() => {
    const otvorene = (faktury ?? []).filter(
      (f) => f.status !== "paid" && f.status !== "cancelled" && f.status !== "draft",
    );
    return {
      pocet: otvorene.length,
      spolu: otvorene.reduce((s, f) => s + Number(f.total || 0), 0),
      mena: otvorene[0]?.currency ?? "EUR",
    };
  }, [faktury]);

  if (otvorena) {
    return (
      <DetailFaktury
        faktura={otvorena}
        onSpat={() => setOtvorena(null)}
        onUprav={onUprav}
        onZmena={async () => {
          setOtvorena(null);
          setFaktury(null);
          await obnov();
        }}
      />
    );
  }

  if (faktury === null) return <Pracujem text={t("faktury.nacitavam")} />;

  return (
    <MobilObrazovka
      velkyNadpis
      title={t("tab.faktury")}
      subtitle={firma.name}
      onBack={onSpat}
      akcia={
        <button
          onClick={() => setHladanieOtvorene((v) => !v)}
          aria-label={t("faktury.hladatKratke")}
          aria-pressed={hladanieOtvorene}
          className="grid h-11 w-11 place-items-center rounded-full text-app-text active:bg-app-ramik"
        >
          <Search className="h-5 w-5" />
        </button>
      }
    >
      <div className="mb-4">
        <FilterChips
          ariaLabel={t("faktury.filtre")}
          aktivna={filter}
          onZmen={setFilter}
          moznosti={[
            { kod: "vsetky", popis: t("faktury.filterVsetky") },
            { kod: "neuhradene", popis: t("faktury.filterNeuhradene") },
            { kod: "poSplatnosti", popis: t("faktury.filterPoSplatnosti") },
            { kod: "uhradene", popis: t("faktury.filterUhradene") },
          ]}
        />
      </div>

      {cakajuce.length > 0 && (
        <div className="mb-4 rounded-app border border-app-ramik bg-app-zelena-jemna p-4">
          <div className="flex items-center gap-2 text-[14px] font-medium">
            <CloudOff className="h-4 w-4 shrink-0" />
            {t("faktury.cakaNaOdoslanie", {
              pocet: `${cakajuce.length} ${mnozne(cakajuce.length, {
                one: t("spolocne.faktura1"),
                few: t("spolocne.faktura2"),
                other: t("spolocne.faktura5"),
              })}`,
            })}
          </div>
          <div className="mt-2 space-y-1.5">
            {cakajuce.map((f) => (
              <div key={f.id} className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="min-w-0 truncate">
                  {/* Bez rezervovaného čísla ho faktúra ešte nemá — vypísať
                      hocijaké by znamenalo, že si ho niekto poznačí. */}
                  {f.cislo ? `${f.cislo} · ` : ""}
                  {f.odberatel}
                </span>
                <span className="shrink-0 tabular-nums">{suma(f.spolu, dlznici.mena, loc)}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[12px] leading-snug text-app-text-2">
            {t("faktury.odosluSaSamy2")}
          </p>
        </div>
      )}

      {(hladanieOtvorene || hladanie) && (
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-text-3" />
          <input
            autoFocus
            value={hladanie}
            onChange={(e) => setHladanie(e.target.value)}
            placeholder={t("faktury.hladat")}
            className="w-full rounded-app border border-app-ramik bg-app-karta py-3 pl-9 pr-3 text-[15px] text-app-text shadow-app"
          />
        </div>
      )}

      {najdene.length === 0 ? (
        <PrazdnyStav
          icon={FileText}
          title={
            hladanie
              ? t("faktury.nicSaNenaslo")
              : nedostupne
                ? t("faktury.bezPripojeniaNacitanie")
                : t("faktury.ziadne")
          }
          popis={nedostupne && !hladanie ? t("faktury.bezZoznamu") : undefined}
          akcia={
            !hladanie && !nedostupne ? (
              <button
                onClick={onNova}
                className="text-[15px] font-medium text-app-zelena"
              >
                {t("faktury.vystavPrvu")}
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-5">
          {mesiace.map(([kluc, riadky]) => {
            const spolu = riadky.reduce((s, f) => s + Number(f.total || 0), 0);
            return (
              <div key={kluc}>
                <SectionHeader
                  title={nazovMesiaca(kluc, loc)}
                  right={`${riadky.length} × · ${suma(spolu, riadky[0]?.currency ?? "EUR", loc)}`}
                />
                <ListCard>
                  {riadky.map((f) => {
                    const s = stav(f);
                    return (
                      <ListRow
                        key={f.id}
                        title={f.customer_name ?? t("faktury.bezOdberatela")}
                        subtitle={
                          <span className="flex items-center gap-1.5">
                            <span className="truncate">{f.invoice_number}</span>
                            {/* Uhradenej sa na splatnosť už nikto nepýta. */}
                            {f.status === "paid" || f.status === "cancelled" ? (
                              <StatusBadge text={t(s.kluc)} ton={s.ton} />
                            ) : s.ton === "cervena" ? (
                              <StatusBadge text={t(s.kluc)} ton="cervena" />
                            ) : (
                              <span className="shrink-0">
                                {t("faktury.splatnostSkratka", { den: datumKratky(f.due_date, loc) })}
                              </span>
                            )}
                          </span>
                        }
                        right={suma(f.total, f.currency ?? "EUR", loc)}
                        onClick={() => setOtvorena(f)}
                      />
                    );
                  })}
                </ListCard>
              </div>
            );
          })}
        </div>
      )}
    </MobilObrazovka>
  );
}

/* ------------------------- Detail faktúry ------------------------- */

function DetailFaktury({
  faktura,
  onSpat,
  onZmena,
  onUprav,
}: {
  faktura: Faktura;
  onSpat: () => void;
  onZmena: () => void;
  onUprav: (faktura: { id: string; invoice_number: string }) => void;
}) {
  const { t, mnozne, locale: loc } = usePreklad();
  const pdfFn = useOperacia("faktura-pdf");
  const mailFn = useOperacia("faktura-email");
  const paidFn = useOperacia("faktury-uhradene");
  const upomienkaFn = useOperacia("faktura-upomienka");
  /* Koľká upomienka je na rade — text sa s každou ďalšou pritvrdzuje. */
  const [poslanych, setPoslanych] = useState(0);

  /** Má faktúra položky viazané na sklad? Vtedy sa opravuje na počítači. */
  const [skladove, setSkladove] = useState<boolean | null>(null);
  const [mazem, setMazem] = useState(false);

  useEffect(() => {
    supabase
      .from("invoice_reminders")
      .select("reminder_number")
      .eq("invoice_id", faktura.id)
      .eq("status", "sent")
      .then(({ data }) => setPoslanych(Math.max(0, ...(data ?? []).map((r) => r.reminder_number))));
    supabase
      .from("invoice_items")
      .select("stock_item_id")
      .eq("invoice_id", faktura.id)
      .then(({ data, error }) =>
        // Bez signálu to nevieme; vtedy sa oprava radšej neponúka, než by mala
        // rozhádzať sklad.
        setSkladove(error ? true : (data ?? []).some((r) => r.stock_item_id)),
      );
  }, [faktura.id]);
  const [busy, setBusy] = useState<
    "pdf" | "mail" | "paid" | "zdielam" | "upomienka" | "mazem" | null
  >(null);

  /**
   * Mäkké zmazanie — presne ako na webe. Doklad nezmizne z histórie a jeho
   * číslo ostáva obsadené, takže v číselnom rade nevznikne diera.
   */
  async function zmaz() {
    setBusy("mazem");
    try {
      const { error } = await supabase
        .from("invoices")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", faktura.id);
      if (error) throw new Error(error.message);
      toast.success(t("faktury.zmazana", { cislo: faktura.invoice_number }));
      onZmena();
    } catch (e: any) {
      toast.error(e?.message ?? t("faktury.chybaMazania"));
    } finally {
      setBusy(null);
      setMazem(false);
    }
  }

  const mena = faktura.currency ?? "EUR";
  const s = stav(faktura);

  async function otvorPdf() {
    setBusy("pdf");
    try {
      await otvorPdfFaktury(() => pdfFn({ data: { invoiceId: faktura.id } }) as any);
    } catch (e: any) {
      toast.error(e?.message ?? t("faktury.chybaPdf"));
    } finally {
      setBusy(null);
    }
  }

  async function zdielaj() {
    setBusy("zdielam");
    try {
      await zdielajPdfFaktury(
        () => pdfFn({ data: { invoiceId: faktura.id } }) as any,
        faktura.invoice_number,
        `${t("nf.fakturaCislo", { cislo: faktura.invoice_number })} — ${suma(faktura.total, mena, loc)}.`,
      );
    } catch (e: any) {
      toast.error(e?.message ?? t("faktury.chybaZdielania"));
    } finally {
      setBusy(null);
    }
  }

  async function posli() {
    if (!faktura.customer_email) return;
    setBusy("mail");
    try {
      await mailFn({ data: { invoiceId: faktura.id, recipient_email: faktura.customer_email } });
      toast.success(t("nf.odoslaneNa", { email: faktura.customer_email ?? "" }));
      onZmena();
    } catch (e: any) {
      toast.error(e?.message ?? "Odoslanie zlyhalo.");
      setBusy(null);
    }
  }

  async function posliUpomienku() {
    if (!faktura.customer_email) return;
    const cislo = Math.min(3, poslanych + 1) as 1 | 2 | 3;
    setBusy("upomienka");
    try {
      await upomienkaFn({
        data: {
          invoiceId: faktura.id,
          reminderNumber: cislo,
          recipient_email: faktura.customer_email,
        },
      });
      setPoslanych(cislo);
      toast.success(t("faktury.upomienkaOdoslana", { n: cislo }));
    } catch (e: any) {
      toast.error(e?.message ?? t("faktury.chybaUpomienky"));
    } finally {
      setBusy(null);
    }
  }

  async function oznacUhradenu() {
    setBusy("paid");
    try {
      await paidFn({ data: { invoiceIds: [faktura.id] } });
      toast.success(t("faktury.oznacenaUhradena"));
      onZmena();
    } catch (e: any) {
      toast.error(e?.message ?? "Zmena zlyhala.");
      setBusy(null);
    }
  }

  if (busy)
    return (
      <Pracujem
        text={
          busy === "pdf" || busy === "zdielam"
            ? t("faktury.pripravujemPdf")
            : t("faktury.pracujem")
        }
      />
    );

  return (
    <MobilObrazovka
      title={faktura.invoice_number}
      subtitle={faktura.customer_name ?? undefined}
      onBack={onSpat}
    >
      <div className="space-y-4">
        <Card className="p-4">
          <div className="text-[30px] font-bold leading-none tabular-nums text-app-text">
            {suma(faktura.total, mena, loc)}
          </div>
          <div className="mt-2">
            <StatusBadge text={t(s.kluc)} ton={s.ton} />
          </div>
        </Card>

        <div className="space-y-2 rounded-app border border-app-ramik bg-app-karta p-4 text-[14px] shadow-app">
          <Riadok label={t("faktury.vystavena")} value={datum(faktura.issue_date, loc)} />
          <Riadok label={t("faktury.splatna")} value={datum(faktura.due_date, loc)} />
          {faktura.paid_at && <Riadok label={t("faktury.uhradena")} value={datum(faktura.paid_at, loc)} />}
          {faktura.sent_at && <Riadok label={t("faktury.odoslana")} value={datum(faktura.sent_at, loc)} />}
        </div>

        <div className="space-y-2">
          <VelkeTlacidlo
            icon={Share2}
            label={t("faktury.zdielat")}
            hint={t("faktury.zdielatPopis")}
            onClick={zdielaj}
          />
          <VelkeTlacidlo
            icon={ExternalLink}
            label={t("faktury.otvoritPdf")}
            hint={t("faktury.naPrezretie")}
            onClick={otvorPdf}
          />
          {faktura.customer_email && (
            <VelkeTlacidlo
              icon={Mail}
              label={t("faktury.poslatEmailom")}
              hint={faktura.customer_email}
              onClick={posli}
            />
          )}
          {/*
            Upomienka má zmysel len po splatnosti a len keď je kam písať —
            inak je to tlačidlo, ktoré vždy skončí chybou.
          */}
          {s.kluc === "faktury.stav.poSplatnosti" && faktura.customer_email && poslanych < 3 && (
            <VelkeTlacidlo
              icon={BellRing}
              label={t("faktury.poslatUpomienku", { n: Math.min(3, poslanych + 1) })}
              hint={
                poslanych ? t("faktury.zatialOdoslane", { pocet: poslanych }) : faktura.customer_email
              }
              onClick={posliUpomienku}
            />
          )}
          {faktura.status !== "paid" && faktura.status !== "cancelled" && (
            <VelkeTlacidlo
              icon={Check}
              label={t("faktury.oznacitUhradenu")}
              hint={t("faktury.oznacitPopis")}
              onClick={oznacUhradenu}
            />
          )}

          {/*
            Oprava a zmazanie. Pravidlá sú spoločné s webom, preto sedia v
            `faktura-uprava` a nie tu — obrazovka len ukáže, čo z nich vyšlo.
          */}
          {(() => {
            const moze = moznoUpravit({
              status: faktura.status,
              maSkladovePolozky: skladove ?? true,
            });
            if (moze.ok)
              return (
                <VelkeTlacidlo
                  icon={Pencil}
                  label={t("faktury.upravit")}
                  hint={t("faktury.upravitPopis")}
                  onClick={() =>
                    onUprav({ id: faktura.id, invoice_number: faktura.invoice_number })
                  }
                />
              );
            // Keď sa ešte len zisťuje, či faktúra hýbe skladom, netreba o tom
            // písať — dôvod sa objaví až vtedy, keď je naozaj známy.
            return skladove === null ? null : (
              <p className="px-1 pt-1 text-[13px] text-app-text-2">{moze.dovod}</p>
            );
          })()}
        </div>

        {mazem ? (
          <div className="rounded-app border border-destructive/40 bg-destructive/5 p-4">
            <p className="text-sm font-medium">
              {t("faktury.naozajZmazat", { cislo: faktura.invoice_number })}
            </p>
            <p className="mt-1 text-xs text-app-text-2">
              {t("faktury.cisloOstava")}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => setMazem(false)}
                className="rounded-app-sm border border-app-ramik px-4 py-2.5 text-sm"
              >
                {t("faktury.ponechat")}
              </button>
              <button
                onClick={zmaz}
                disabled={busy === "mazem"}
                className="rounded-app-sm bg-destructive px-4 py-2.5 text-sm font-medium text-app-chyba-foreground disabled:opacity-50"
              >
                {busy === "mazem" ? t("faktury.mazem") : t("faktury.zmazatKratke")}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setMazem(true)}
            className="flex w-full items-center justify-center gap-2 rounded-app-sm px-4 py-3 text-sm text-app-text-2"
          >
            <Trash2 className="h-4 w-4" /> {t("faktury.zmazat")}
          </button>
        )}
      </div>
    </MobilObrazovka>
  );
}

function Riadok({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-app-text-2">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
