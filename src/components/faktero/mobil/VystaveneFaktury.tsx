import { useEffect, useMemo, useState } from "react";
import { useOperacia } from "@/lib/mobile/server-most";
import { toast } from "sonner";
import { BellRing, Check, ExternalLink, FileText, Mail, Search, Share2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FAKTURY, sPoctom } from "@/lib/faktero/mnozne";
import { MobilObrazovka, Pracujem, VelkeTlacidlo } from "./MobilChrome";
import { datum } from "./PrijateDoklady";
import { otvorPdfFaktury, zdielajPdfFaktury } from "./pdf-faktury";

/**
 * Vystavené faktúry v telefóne.
 *
 * Zoznam je zámerne len na čítanie a tri akcie: PDF, odoslať, označiť za
 * uhradenú. Opravovať faktúru na telefóne nemá zmysel — na to je web.
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

function suma(v: unknown, mena = "EUR"): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("sk-SK", { style: "currency", currency: mena }).format(n);
}

function nazovMesiaca(kluc: string): string {
  const [r, m] = kluc.split("-").map(Number);
  return new Date(r, (m || 1) - 1, 1).toLocaleDateString("sk-SK", {
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
function stav(f: Faktura): { text: string; trieda: string } {
  if (f.status === "paid")
    return { text: "Uhradená", trieda: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" };
  if (f.status === "cancelled")
    return { text: "Stornovaná", trieda: "bg-muted text-muted-foreground" };
  if (f.status === "draft") return { text: "Návrh", trieda: "bg-muted text-muted-foreground" };
  if (f.due_date < new Date().toISOString().slice(0, 10))
    return { text: "Po splatnosti", trieda: "bg-destructive/10 text-destructive" };
  return { text: "Neuhradená", trieda: "bg-amber-500/10 text-amber-700 dark:text-amber-300" };
}

export function VystaveneFaktury({
  firma,
  onSpat,
  onNova,
}: {
  firma: { id: string; name: string };
  onSpat: () => void;
  onNova: () => void;
}) {
  const nacitaj = useOperacia("faktury-zoznam");
  const [faktury, setFaktury] = useState<Faktura[] | null>(null);
  const [hladanie, setHladanie] = useState("");
  const [otvorena, setOtvorena] = useState<Faktura | null>(null);

  async function obnov() {
    const { ulozDoPamate, zPamate } = await import("@/lib/mobile/jazdy-lokalne");
    const kluc = `faktury:${firma.id}`;
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
        toast.message("Bez pripojenia — zobrazené naposledy načítané faktúry.", {
          description: new Date(zapamatane.kedy).toLocaleString("sk-SK"),
        });
      } else {
        toast.error(e?.message ?? "Faktúry sa nepodarilo načítať.");
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
    if (!q) return faktury ?? [];
    return (faktury ?? []).filter((f) =>
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
        onZmena={async () => {
          setOtvorena(null);
          setFaktury(null);
          await obnov();
        }}
      />
    );
  }

  if (faktury === null) return <Pracujem text="Načítavam faktúry…" />;

  return (
    <MobilObrazovka title="Vystavené faktúry" subtitle={firma.name} onBack={onSpat}>
      {dlznici.pocet > 0 && (
        <div className="mb-4 rounded-2xl border border-border/70 bg-card p-4 shadow-[var(--shadow-card)]">
          <div className="text-[13px] text-muted-foreground">Neuhradené</div>
          <div className="mt-0.5 text-[26px] font-semibold leading-none tabular-nums">
            {suma(dlznici.spolu, dlznici.mena)}
          </div>
          <div className="mt-1 text-[13px] text-muted-foreground">
            {sPoctom(dlznici.pocet, FAKTURY)}
          </div>
        </div>
      )}

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={hladanie}
          onChange={(e) => setHladanie(e.target.value)}
          placeholder="Hľadať číslo alebo odberateľa"
          className="w-full rounded-2xl border border-border/70 bg-card py-3 pl-9 pr-3 text-[15px] shadow-[var(--shadow-card)]"
        />
      </div>

      {najdene.length === 0 ? (
        <div className="grid place-items-center py-14 text-center">
          <FileText className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm font-medium">
            {hladanie ? "Nič sa nenašlo" : "Zatiaľ žiadne faktúry"}
          </p>
          {!hladanie && (
            <button onClick={onNova} className="mt-3 text-sm font-medium text-primary">
              Vystaviť prvú faktúru
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {mesiace.map(([kluc, riadky]) => {
            const spolu = riadky.reduce((s, f) => s + Number(f.total || 0), 0);
            return (
              <div key={kluc}>
                <div className="mb-2 flex items-baseline justify-between px-1">
                  <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {nazovMesiaca(kluc)}
                  </h2>
                  <span className="text-[13px] font-medium tabular-nums text-muted-foreground">
                    {riadky.length} × · {suma(spolu, riadky[0]?.currency ?? "EUR")}
                  </span>
                </div>
                <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[var(--shadow-card)]">
                  {riadky.map((f, i) => {
                    const s = stav(f);
                    return (
                      <button
                        key={f.id}
                        onClick={() => setOtvorena(f)}
                        className={`flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-secondary ${
                          i > 0 ? "border-t border-border/70" : ""
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-medium leading-tight">
                            {f.customer_name ?? "Bez odberateľa"}
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                            <span className="truncate">{f.invoice_number}</span>
                            <span
                              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${s.trieda}`}
                            >
                              {s.text}
                            </span>
                          </span>
                        </span>
                        <span className="shrink-0 text-[15px] font-semibold tabular-nums">
                          {suma(f.total, f.currency ?? "EUR")}
                        </span>
                      </button>
                    );
                  })}
                </div>
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
}: {
  faktura: Faktura;
  onSpat: () => void;
  onZmena: () => void;
}) {
  const pdfFn = useOperacia("faktura-pdf");
  const mailFn = useOperacia("faktura-email");
  const paidFn = useOperacia("faktury-uhradene");
  const upomienkaFn = useOperacia("faktura-upomienka");
  /* Koľká upomienka je na rade — text sa s každou ďalšou pritvrdzuje. */
  const [poslanych, setPoslanych] = useState(0);

  useEffect(() => {
    supabase
      .from("invoice_reminders")
      .select("reminder_number")
      .eq("invoice_id", faktura.id)
      .eq("status", "sent")
      .then(({ data }) => setPoslanych(Math.max(0, ...(data ?? []).map((r) => r.reminder_number))));
  }, [faktura.id]);
  const [busy, setBusy] = useState<"pdf" | "mail" | "paid" | "zdielam" | "upomienka" | null>(null);

  const mena = faktura.currency ?? "EUR";
  const s = stav(faktura);

  async function otvorPdf() {
    setBusy("pdf");
    try {
      await otvorPdfFaktury(() => pdfFn({ data: { invoiceId: faktura.id } }) as any);
    } catch (e: any) {
      toast.error(e?.message ?? "PDF sa nepodarilo pripraviť.");
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
        `Faktúra ${faktura.invoice_number} na ${suma(faktura.total, mena)}.`,
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Zdieľanie zlyhalo.");
    } finally {
      setBusy(null);
    }
  }

  async function posli() {
    if (!faktura.customer_email) return;
    setBusy("mail");
    try {
      await mailFn({ data: { invoiceId: faktura.id, recipient_email: faktura.customer_email } });
      toast.success(`Odoslané na ${faktura.customer_email}`);
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
      toast.success(`${cislo}. upomienka odoslaná`);
    } catch (e: any) {
      toast.error(e?.message ?? "Upomienku sa nepodarilo odoslať.");
    } finally {
      setBusy(null);
    }
  }

  async function oznacUhradenu() {
    setBusy("paid");
    try {
      await paidFn({ data: { invoiceIds: [faktura.id] } });
      toast.success("Označená ako uhradená");
      onZmena();
    } catch (e: any) {
      toast.error(e?.message ?? "Zmena zlyhala.");
      setBusy(null);
    }
  }

  if (busy)
    return (
      <Pracujem text={busy === "pdf" || busy === "zdielam" ? "Pripravujem PDF…" : "Pracujem…"} />
    );

  return (
    <MobilObrazovka
      title={faktura.invoice_number}
      subtitle={faktura.customer_name ?? undefined}
      onBack={onSpat}
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-[var(--shadow-card)]">
          <div className="text-[32px] font-semibold leading-none tabular-nums">
            {suma(faktura.total, mena)}
          </div>
          <div
            className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[12px] font-medium ${s.trieda}`}
          >
            {s.text}
          </div>
        </div>

        <div className="space-y-2 rounded-2xl border border-border/70 bg-card p-4 text-[14px] shadow-[var(--shadow-card)]">
          <Riadok label="Vystavená" value={datum(faktura.issue_date)} />
          <Riadok label="Splatná" value={datum(faktura.due_date)} />
          {faktura.paid_at && <Riadok label="Uhradená" value={datum(faktura.paid_at)} />}
          {faktura.sent_at && <Riadok label="Odoslaná" value={datum(faktura.sent_at)} />}
        </div>

        <div className="space-y-2">
          <VelkeTlacidlo
            icon={Share2}
            label="Zdieľať faktúru"
            hint="Pošlite ju cez WhatsApp, Messenger alebo uložte do súborov"
            onClick={zdielaj}
          />
          <VelkeTlacidlo
            icon={ExternalLink}
            label="Otvoriť PDF"
            hint="Faktúra na prezretie"
            onClick={otvorPdf}
          />
          {faktura.customer_email && (
            <VelkeTlacidlo
              icon={Mail}
              label="Poslať e-mailom"
              hint={faktura.customer_email}
              onClick={posli}
            />
          )}
          {/*
            Upomienka má zmysel len po splatnosti a len keď je kam písať —
            inak je to tlačidlo, ktoré vždy skončí chybou.
          */}
          {s.text === "Po splatnosti" && faktura.customer_email && poslanych < 3 && (
            <VelkeTlacidlo
              icon={BellRing}
              label={`Poslať ${Math.min(3, poslanych + 1)}. upomienku`}
              hint={poslanych ? `Zatiaľ odoslané: ${poslanych}` : faktura.customer_email}
              onClick={posliUpomienku}
            />
          )}
          {faktura.status !== "paid" && faktura.status !== "cancelled" && (
            <VelkeTlacidlo
              icon={Check}
              label="Označiť ako uhradenú"
              hint="Keď platba prišla mimo párovania s bankou"
              onClick={oznacUhradenu}
            />
          )}
        </div>
      </div>
    </MobilObrazovka>
  );
}

function Riadok({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
