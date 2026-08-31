import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { pripravKonektorFn, stavKonektoraFn } from "@/lib/faktero/pohoda-konektor.functions";

/**
 * Priame prepojenie s Pohodou.
 *
 * Účtovníčka si nič neinštaluje — POHODA vie XML import spustiť z príkazového
 * riadku, takže balíček je dávkový súbor a naplánovaná úloha Windows. Kľúč sa
 * vyrába až pri stiahnutí a vloží sa rovno do súboru, aby sa nikde nezobrazoval.
 */
type PotvrdenyDoklad = {
  invoice_number: string | null;
  pohoda_cislo: string | null;
  pohoda_stav: string | null;
  error: string | null;
};
type StavKonektora = { kluce: number; naposledy: string | null; potvrdene: PotvrdenyDoklad[] };

export function KonektorPohody({ companyId }: { companyId: string }) {
  const [stav, setStav] = useState<StavKonektora | null>(null);
  const [pracuje, setPracuje] = useState(false);
  const fnPriprav = useServerFn(pripravKonektorFn);
  const fnStav = useServerFn(stavKonektoraFn);

  useEffect(() => {
    fnStav({ data: { companyId } })
      .then((r) => setStav(r as StavKonektora))
      .catch(() => setStav(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  async function stiahni() {
    setPracuje(true);
    try {
      const r = await fnPriprav({ data: { companyId } });
      const bin = atob(r.base64);
      const bajty = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bajty[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bajty], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = r.fileName;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Balíček stiahnutý — pošlite ho účtovníčke.");
      fnStav({ data: { companyId } }).then((r) => setStav(r as StavKonektora));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Balíček sa nepodarilo pripraviť.");
    } finally {
      setPracuje(false);
    }
  }

  return (
    <div className="mt-4 rounded-md border border-border p-4">
      <h4 className="text-sm font-semibold">Priame prepojenie s Pohodou</h4>
      <p className="mt-1 text-xs text-muted-foreground">
        Namiesto posielania súborov mailom si Pohoda vezme doklady sama — raz denne v noci a späť
        nám povie, aké čísla im pridelila. Účtovníčka nič neinštaluje: stiahnutý priečinok skopíruje
        k Pohode, vyplní v ňom cestu a názov databázy a spustí druhý súbor, ktorý založí naplánovanú
        úlohu. Keď vedie viac firiem, ďalšiu pridá jedným riadkom do{" "}
        <code className="rounded bg-secondary px-1">firmy.txt</code> — priečinok ani úlohu už
        nezakladá znova.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={stiahni}
          disabled={pracuje}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {pracuje ? "Pripravujem…" : "Stiahnuť balíček pre účtovníčku"}
        </button>
        {stav?.naposledy ? (
          <span className="text-xs text-muted-foreground">
            Naposledy sa ozval {new Date(stav.naposledy).toLocaleString("sk-SK")}
          </span>
        ) : stav?.kluce ? (
          <span className="text-xs text-muted-foreground">
            Balíček je vydaný, zatiaľ sa neozval.
          </span>
        ) : null}
      </div>
      {stav?.potvrdene?.length ? (
        <div className="mt-3 text-xs">
          <div className="mb-1 font-medium">Naposledy potvrdené Pohodou</div>
          <ul className="space-y-0.5 text-muted-foreground">
            {stav.potvrdene.map((r: PotvrdenyDoklad, i: number) => (
              <li key={i}>
                {r.invoice_number}
                {r.pohoda_cislo ? ` → ${r.pohoda_cislo}` : ""}
                {r.pohoda_stav === "error" ? ` — chyba: ${r.error ?? "neznáma"}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-3 text-xs text-muted-foreground">
        Každé stiahnutie vyrobí nový kľúč; staré ostávajú platné a zrušiť sa dajú v{" "}
        <Link to="/api-kluce" className="underline">
          API kľúčoch
        </Link>
        .
      </p>
    </div>
  );
}
