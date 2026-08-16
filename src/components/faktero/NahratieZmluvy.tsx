import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileUp, Loader2 } from "lucide-react";
import { spustiCitanieZmluvyFn, stavCitaniaZmluvyFn } from "@/lib/faktero/financovanie.functions";
import { spojPrecitane, type PrecitanaZmluva } from "@/lib/faktero/financovanie-citanie";
import type { SplatkaZoZmluvy, ZmluvaNaUpravu } from "./FormularZmluvy";

/**
 * Nahratie zmluvy alebo splátkového kalendára a jeho vyčítanie.
 *
 * Cieľom nie je ušetriť pár klikov — je to jediný spôsob, ako dostať do
 * Faktera **presné** riadky kalendára. Dopočítaný kalendár sa od predpisu
 * banky vždy o pár centov líši a v účtovníctve ten rozdiel visí navždy.
 *
 * Nahrať sa dá viac súborov naraz: zmluva a splátkový kalendár chodia od banky
 * ako dve samostatné PDF a ani jedno z nich nemá všetko. Prečítané sa spoja.
 *
 * Čítanie beží na serveri a stránka sa naň pýta, kým nie je hotové. Držať
 * otvorenú požiadavku sa nedá — dlhý kalendár číta model aj 40 sekúnd a taká
 * požiadavka sa po ceste zavrie.
 *
 * Prečítané údaje sa nikam neukladajú samy: naplnia formulár a človek ich
 * potvrdí. Model sa mýli a zmluva je záväzný dokument.
 */
export type PrecitanyDokument = {
  document_path: string | null;
  predvyplnene: Partial<ZmluvaNaUpravu>;
  splatky: SplatkaZoZmluvy[];
  vyhrady: string[];
};

/** Ako dlho sa oplatí čakať, kým to vzdáme. */
const STROP_MS = 240_000;
const KROK_MS = 2000;

async function naDataUrl(f: File): Promise<string> {
  return await new Promise((hotovo, chyba) => {
    const r = new FileReader();
    r.onload = () => hotovo(String(r.result));
    r.onerror = () => chyba(new Error("Súbor sa nepodarilo načítať."));
    r.readAsDataURL(f);
  });
}

export function NahratieZmluvy({
  companyId,
  onPrecitane,
}: {
  companyId: string;
  onPrecitane: (d: PrecitanyDokument) => void;
}) {
  const spusti = useServerFn(spustiCitanieZmluvyFn);
  const stav = useServerFn(stavCitaniaZmluvyFn);
  const vstup = useRef<HTMLInputElement>(null);
  const [pracujem, setPracujem] = useState(false);
  const [sekundy, setSekundy] = useState(0);
  const [kolko, setKolko] = useState({ hotovych: 0, spolu: 0 });

  useEffect(() => {
    if (!pracujem) return;
    const t = setInterval(() => setSekundy((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [pracujem]);

  /** Pýta sa servera, kým výsledok nie je na svete. */
  async function pockajNaVysledok(cesta: string): Promise<PrecitanaZmluva> {
    const koniec = Date.now() + STROP_MS;
    while (Date.now() < koniec) {
      await new Promise((r) => setTimeout(r, KROK_MS));
      const s: any = await stav({ data: { company_id: companyId, document_path: cesta } });
      if (!s?.hotovo) continue;
      if (!s.ok) throw new Error(s.chyba ?? "Dokument sa nepodarilo prečítať.");
      return s.zmluva as PrecitanaZmluva;
    }
    throw new Error("Čítanie trvá príliš dlho. Súbor je uložený, údaje vyplňte ručne.");
  }

  async function spracuj(subory: File[]) {
    if (!subory.length) return;
    setPracujem(true);
    setSekundy(0);
    setKolko({ hotovych: 0, spolu: subory.length });
    try {
      const precitane: { zmluva: PrecitanaZmluva; cesta: string | null }[] = [];
      const zlyhane: string[] = [];
      for (const f of subory) {
        try {
          const subor = await naDataUrl(f);
          const zaciatok: any = await spusti({
            data: { company_id: companyId, subor, nazov: f.name },
          });
          const zmluva = await pockajNaVysledok(zaciatok.document_path);
          precitane.push({ zmluva, cesta: zaciatok.document_path });
        } catch (e: unknown) {
          // Jeden nečitateľný dokument nesmie zahodiť aj ten, ktorý sa
          // prečítal — kalendár býva ten druhý a je z nich cennejší.
          zlyhane.push(`${f.name}: ${e instanceof Error ? e.message : "nepodarilo sa prečítať"}`);
        }
        setKolko((k) => ({ ...k, hotovych: k.hotovych + 1 }));
      }
      if (precitane.length === 0) {
        throw new Error(zlyhane[0] ?? "Dokument sa nepodarilo prečítať.");
      }

      const r = spojPrecitane(precitane.map((p) => p.zmluva));
      if (zlyhane.length) r.vyhrady = [...r.vyhrady, ...zlyhane];
      // Do zmluvy sa ukladá jeden dokument — nech je to ten s kalendárom.
      const sKalendarom = precitane.reduce((a, b) =>
        b.zmluva.splatky.length > a.zmluva.splatky.length ? b : a,
      );

      onPrecitane({
        document_path: sKalendarom.cesta,
        splatky: r.splatky,
        vyhrady: r.vyhrady,
        predvyplnene: {
          kind: r.kind ?? "leasing",
          // Názov v zmluve nebýva — nech je aspoň podľa čoho ju v zozname spoznať.
          name:
            [r.provider_name, r.contract_number].filter(Boolean).join(" ") ||
            subory[0]?.name ||
            "",
          provider_name: r.provider_name,
          contract_number: r.contract_number,
          variable_symbol: r.variable_symbol,
          principal: r.principal ?? "",
          interest_rate: r.interest_rate ?? "",
          term_months: r.term_months ?? r.splatky.length,
          /*
           * Žiadny dnešok. Keď sa splatnosť v dokumente nenájde, pole ostane
           * prázdne a človek ho doplní — dosadený dnešok vyzeral ako údaj zo
           * zmluvy a pri spätne zapísanej zmluve posunul celý kalendár.
           */
          first_due_date: r.first_due_date ?? "",
          payment_amount: r.payment_amount,
          vat_rate: r.vat_rate ?? 0,
          down_payment: r.down_payment ?? 0,
          residual_value: r.residual_value ?? 0,
          interest_from: r.interest_from,
        },
      });
      toast.success(
        r.splatky.length
          ? `Prečítané, kalendár má ${r.splatky.length} splátok. Skontrolujte údaje a uložte.`
          : "Údaje sú prečítané. Kalendár v dokumente nebol — Faktero ho dopočíta.",
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Dokument sa nepodarilo prečítať.");
    } finally {
      setPracujem(false);
      if (vstup.current) vstup.current.value = "";
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-dashed bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">Máte zmluvu v PDF?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Nahrajte zmluvu aj splátkový kalendár — pokojne naraz, aj keď sú to dva súbory. Faktero
            z nich vyčíta údaje a kalendár prevezme riadok po riadku, presne tak, ako ho predpísala
            banka.
          </p>
        </div>
        <button
          onClick={() => vstup.current?.click()}
          disabled={pracujem}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {pracujem ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
          {pracujem ? "Čítam dokument…" : "Nahrať zmluvu"}
        </button>
        <input
          ref={vstup}
          type="file"
          multiple
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => void spracuj(Array.from(e.target.files ?? []))}
        />
      </div>
      {pracujem && (
        <p className="mt-3 text-xs text-muted-foreground">
          {kolko.spolu > 1 ? `Dokument ${kolko.hotovych + 1} z ${kolko.spolu}. ` : ""}
          Čítam už {sekundy} s — viacstranový kalendár trvá aj minútu. Stránku nezatvárajte.
        </p>
      )}
    </div>
  );
}
