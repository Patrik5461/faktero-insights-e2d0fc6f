import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  BookOpen,
  ChevronRight,
  LifeBuoy,
  Loader2,
  Mail,
  MessageSquarePlus,
  Phone,
  Search,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { zalozPoziadavkuFn } from "@/lib/faktero/podpora.functions";
import {
  KATEGORIE,
  cisloPoziadavky,
  neprecitanaPreZakaznika,
  type KategoriaPoziadavky,
} from "@/lib/faktero/podpora";
import { PodporaStav } from "@/components/faktero/PodporaStav";
import { hladajVManualoch, type Clanok, type Vysledok } from "@/lib/faktero/pomoc-hladanie";

export const Route = createFileRoute("/_authenticated/podpora/")({
  head: () => ({ meta: [{ title: "Pomoc a podpora — Faktero" }] }),
  component: PodporaPage,
});

/** Najčastejšie otázky ľudí — rovno na manuál, bez hľadania. */
const CASTE = [
  { cesta: "/pomoc/faktury", nazov: "Vystavenie a odoslanie faktúry" },
  { cesta: "/pomoc/banka", nazov: "Párovanie platieb z banky" },
  { cesta: "/pomoc/doklady", nazov: "Skenovanie bločkov a dokladov" },
  { cesta: "/pomoc/pohoda", nazov: "Prepojenie s Pohodou" },
  { cesta: "/pomoc/efaktura", nazov: "eFaktúra 2027" },
  { cesta: "/pomoc/woocommerce", nazov: "Faktúry z e-shopu" },
];

type RiadokPoziadavky = {
  id: string;
  cislo: number;
  predmet: string;
  stav: string;
  kategoria: string;
  posledna_sprava_at: string;
  posledna_od: string;
  zakaznik_videl_at: string | null;
  podpora_videla_at: string | null;
};

function PodporaPage() {
  const [otazka, setOtazka] = useState("");
  const [clanky, setClanky] = useState<Clanok[] | null>(null);
  const [poziadavky, setPoziadavky] = useState<RiadokPoziadavky[] | null>(null);
  const [nova, setNova] = useState(false);

  const nacitaj = useCallback(async () => {
    const { data, error } = await supabase
      .from("podpora_poziadavky")
      .select(
        "id, cislo, predmet, stav, kategoria, posledna_sprava_at, posledna_od, zakaznik_videl_at, podpora_videla_at",
      )
      .order("posledna_sprava_at", { ascending: false })
      .limit(100);
    if (error) toast.error(error.message);
    setPoziadavky((data ?? []) as unknown as RiadokPoziadavky[]);
  }, []);

  useEffect(() => {
    void nacitaj();
  }, [nacitaj]);

  // Manuály sa načítajú, až keď človek začne písať — je to 150 kB textu.
  useEffect(() => {
    if (clanky || otazka.trim().length < 3) return;
    void import("@/lib/faktero/znalosti-manualy.json").then((m: any) =>
      setClanky((m.default ?? m).clanky as Clanok[]),
    );
  }, [otazka, clanky]);

  const vysledky: Vysledok[] = useMemo(
    () => (clanky ? hladajVManualoch(clanky, otazka) : []),
    [clanky, otazka],
  );
  const hlada = otazka.trim().length >= 3;

  return (
    <>
      <PageHeader
        title="Pomoc a podpora"
        description="Nájdite odpoveď v manuáloch, opýtajte sa Faktero AI alebo napíšte nám — odpoveď uvidíte tu aj v e-maile."
        help="/pomoc/podpora"
      />
      <PageBody>
        <div className="mx-auto max-w-4xl space-y-6">
          <div className="rounded-2xl border border-border bg-card p-5">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={otazka}
                onChange={(e) => setOtazka(e.target.value)}
                placeholder="S čím potrebujete pomôcť? Napríklad „dobropis“ alebo „párovanie platieb“"
                aria-label="Hľadať v pomoci"
                className="h-11 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm"
              />
            </label>

            {hlada ? (
              <div className="mt-4 space-y-2">
                {!clanky ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Hľadám v manuáloch…
                  </div>
                ) : vysledky.length === 0 ? (
                  <p className="text-sm text-muted-foreground">V manuáloch sme nič nenašli.</p>
                ) : (
                  vysledky.map((v, i) => (
                    <a
                      key={`${v.cesta}-${i}`}
                      href={v.cesta}
                      target="_blank"
                      rel="noopener"
                      className="block rounded-lg border border-border p-3 hover:bg-secondary/60"
                    >
                      <div className="text-sm font-medium">
                        {v.titulok} <span className="text-muted-foreground">· {v.nadpis}</span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{v.ukazka}</div>
                    </a>
                  ))
                )}
                <div className="flex flex-wrap gap-2 pt-2">
                  <Link
                    to="/ai-asistent"
                    search={{ otazka: otazka.trim() }}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
                  >
                    <Sparkles className="h-4 w-4 text-primary" /> Opýtať sa Faktero AI
                  </Link>
                  <button
                    onClick={() => setNova(true)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
                  >
                    <MessageSquarePlus className="h-4 w-4 text-primary" /> Napísať podpore
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {CASTE.map((c) => (
                  <a
                    key={c.cesta}
                    href={c.cesta}
                    target="_blank"
                    rel="noopener"
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary/60"
                  >
                    {c.nazov} <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <a
              href="/pomoc"
              target="_blank"
              rel="noopener"
              className="rounded-2xl border border-border bg-card p-4 hover:bg-secondary/40"
            >
              <BookOpen className="h-5 w-5 text-primary" />
              <div className="mt-2 font-medium">Všetky manuály</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Návody ku každej agende, krok za krokom.
              </p>
            </a>
            <Link
              to="/ai-asistent"
              className="rounded-2xl border border-border bg-card p-4 hover:bg-secondary/40"
            >
              <Sparkles className="h-5 w-5 text-primary" />
              <div className="mt-2 font-medium">Faktero AI</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Odpovie na otázky o vašich faktúrach aj o tom, ako čo vo Fakteri spraviť.
              </p>
            </Link>
            <button
              onClick={() => setNova(true)}
              className="rounded-2xl border border-border bg-card p-4 text-left hover:bg-secondary/40"
            >
              <LifeBuoy className="h-5 w-5 text-primary" />
              <div className="mt-2 font-medium">Napísať podpore</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Otázka, chyba alebo nápad — odpovieme v pracovné dni spravidla do 24 hodín.
              </p>
            </button>
          </div>

          <div className="rounded-2xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-4">
              <h2 className="font-semibold">Moje požiadavky</h2>
              <button
                onClick={() => setNova(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <MessageSquarePlus className="h-4 w-4" /> Nová požiadavka
              </button>
            </div>
            {poziadavky === null ? (
              <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Načítavam…
              </div>
            ) : poziadavky.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Zatiaľ ste nám nepísali. Keď niečo nebude jasné, napíšte — odpoveď nájdete tu.
              </p>
            ) : (
              <ul>
                {poziadavky.map((p) => {
                  const nove = neprecitanaPreZakaznika(p);
                  return (
                    <li key={p.id} className="border-b border-border last:border-0">
                      <Link
                        to="/podpora/$id"
                        params={{ id: p.id }}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 p-4 hover:bg-secondary/40"
                      >
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {cisloPoziadavky(p.cislo)}
                        </span>
                        <span
                          className={`min-w-0 flex-1 truncate text-sm ${nove ? "font-semibold" : ""}`}
                        >
                          {p.predmet}
                        </span>
                        {nove && (
                          <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                            Nová odpoveď
                          </span>
                        )}
                        <PodporaStav stav={p.stav} />
                        <span className="text-xs text-muted-foreground">
                          {new Date(p.posledna_sprava_at).toLocaleDateString("sk-SK")}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <a
              href="mailto:podpora@faktero.sk"
              className="inline-flex items-center gap-1.5 hover:text-foreground"
            >
              <Mail className="h-4 w-4" /> podpora@faktero.sk
            </a>
            <a
              href="tel:+421902101967"
              className="inline-flex items-center gap-1.5 hover:text-foreground"
            >
              <Phone className="h-4 w-4" /> +421902101967
            </a>
          </div>
        </div>
      </PageBody>

      {nova && (
        <NovaPoziadavka
          predvolenyText={otazka.trim().length >= 3 ? otazka.trim() : ""}
          onZavri={() => setNova(false)}
          onZalozena={() => {
            setNova(false);
            void nacitaj();
          }}
        />
      )}
    </>
  );
}

function NovaPoziadavka({
  predvolenyText,
  onZavri,
  onZalozena,
}: {
  predvolenyText: string;
  onZavri: () => void;
  onZalozena: () => void;
}) {
  useZatvorNaEscape(onZavri);
  const zaloz = useServerFn(zalozPoziadavkuFn);
  const [kategoria, setKategoria] = useState<KategoriaPoziadavky>("otazka");
  const [predmet, setPredmet] = useState("");
  const [text, setText] = useState(predvolenyText);
  const [posielam, setPosielam] = useState(false);

  async function odosli() {
    if (text.trim().length < 5) return toast.error("Napíšte aspoň vetu, nech vieme, s čím pomôcť.");
    setPosielam(true);
    try {
      const r = await zaloz({
        data: {
          kategoria: kategoria as "otazka" | "chyba" | "napad" | "predplatne",
          predmet: predmet.trim() || undefined,
          text: text.trim(),
          company_id: getActiveCompanyId() ?? undefined,
          url: window.location.href.slice(0, 300),
          user_agent: navigator.userAgent.slice(0, 400),
        },
      });
      toast.success(
        `Požiadavka ${cisloPoziadavky(r.cislo)} je založená. Odpoveď príde aj e-mailom.`,
      );
      onZalozena();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPosielam(false);
    }
  }

  const pole = "mt-1 w-full rounded-md border border-input bg-background px-3 text-sm";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onZavri}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Nová požiadavka"
        className="w-full max-w-lg rounded-xl border border-border bg-card p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">Napísať podpore</h3>
        <label className="mt-4 block text-sm">
          <span className="text-xs font-medium text-muted-foreground">O čo ide</span>
          <select
            value={kategoria}
            onChange={(e) => setKategoria(e.target.value as KategoriaPoziadavky)}
            className={`${pole} h-9`}
          >
            {KATEGORIE.map((k) => (
              <option key={k.kod} value={k.kod}>
                {k.nazov}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 block text-sm">
          <span className="text-xs font-medium text-muted-foreground">Predmet (nepovinné)</span>
          <input
            value={predmet}
            onChange={(e) => setPredmet(e.target.value)}
            maxLength={200}
            placeholder="Krátko, napríklad „Nejde odoslať faktúru e-mailom“"
            className={`${pole} h-9`}
          />
        </label>
        <label className="mt-3 block text-sm">
          <span className="text-xs font-medium text-muted-foreground">Správa</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            maxLength={10000}
            placeholder="Čo ste robili, čo ste čakali a čo sa stalo. Číslo faktúry alebo dokladu nám veľmi pomôže."
            className={`${pole} py-2`}
          />
        </label>
        <p className="mt-2 text-xs text-muted-foreground">
          Pripojíme aj firmu, stránku a prehliadač — nemusíte ich vypisovať.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onZavri}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
          >
            Zrušiť
          </button>
          <button
            onClick={() => void odosli()}
            disabled={posielam}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {posielam && <Loader2 className="h-4 w-4 animate-spin" />}
            Odoslať
          </button>
        </div>
      </div>
    </div>
  );
}
