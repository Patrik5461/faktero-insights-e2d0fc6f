import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Hash, Loader2 } from "lucide-react";

/**
 * Vydávanie faktúr bez signálu rovno s číslom.
 *
 * Predvolene je to vypnuté a je to zámer. Bežne stačí, že sa faktúra bez
 * signálu odloží a vystaví sa sama po pripojení — číslo vtedy pridelí server
 * ako vždy. Zapnúť sa to oplatí tomu, kto musí doklad odovzdať priamo na
 * mieste: remeselníkovi po oprave, predajcovi z auta.
 *
 * Cena za to je, že si appka drží zopár čísel dopredu. Nepoužité po dvoch
 * týždňoch prepadnú a číslo sa vráti do rady — Faktero prideľuje najnižšie
 * voľné číslo, takže dieru samo zaplní.
 */
export function CislaDopredu({ firma }: { firma: { id: string; name: string } }) {
  const [zapnute, setZapnute] = useState(false);
  const [volnych, setVolnych] = useState(0);
  const [pracujem, setPracujem] = useState(false);

  async function nacitaj() {
    const { jeCislovanieDopredu, volnychCisel } = await import("@/lib/mobile/faktury-fronta");
    setZapnute(jeCislovanieDopredu(firma.id));
    setVolnych(volnychCisel(firma.id));
  }

  useEffect(() => {
    void nacitaj();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma.id]);

  async function prepni() {
    setPracujem(true);
    try {
      const { nastavCislovanieDopredu, nepouziteCisla, zabudniRezervacie } =
        await import("@/lib/mobile/faktury-fronta");
      const { doplnCisla, isOnline } = await import("@/lib/mobile/offline-queue");

      if (zapnute) {
        // Pri vypnutí sa nepoužité čísla vracajú serveru hneď. Čakať na
        // vypršanie by znamenalo dva týždne dier v rade zadarmo.
        const cisla = nepouziteCisla(firma.id);
        nastavCislovanieDopredu(firma.id, false);
        if (cisla.length && (await isOnline())) {
          const { volajOperaciu } = await import("@/lib/mobile/server-most-volanie");
          await volajOperaciu("cisla-uvolni", { company_id: firma.id, numbers: cisla });
        }
        zabudniRezervacie(firma.id);
        toast.success("Vypnuté. Nepoužité čísla sa vrátili do radu.");
      } else {
        if (!(await isOnline())) {
          toast.error("Na zapnutie treba pripojenie — čísla si vypýta appka od servera.");
          return;
        }
        nastavCislovanieDopredu(firma.id, true);
        const kolko = await doplnCisla(firma.id);
        if (kolko === 0) {
          nastavCislovanieDopredu(firma.id, false);
          toast.error("Čísla sa nepodarilo vypýtať. Skúste to o chvíľu.");
          return;
        }
        toast.success(`Zapnuté. Appka má ${kolko} čísel pripravených.`);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Nepodarilo sa to prepnúť.");
    } finally {
      setPracujem(false);
      await nacitaj();
    }
  }

  return (
    <div className="rounded-2xl border border-border/70 p-4">
      <div className="flex items-start gap-3">
        <Hash className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Vystavovať bez signálu rovno s číslom</p>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            {zapnute
              ? `Pripravených čísel: ${volnych}. Faktúra vystavená bez signálu dostane číslo hneď, takže sa dá odovzdať na mieste.`
              : "Bez toho sa faktúra bez signálu odloží a vystaví sa sama po pripojení — číslo dostane až vtedy."}
          </p>
        </div>
      </div>
      <button
        onClick={prepni}
        disabled={pracujem}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm font-medium active:opacity-80 disabled:opacity-60"
      >
        {pracujem && <Loader2 className="h-4 w-4 animate-spin" />}
        {zapnute ? "Vypnúť" : "Zapnúť"}
      </button>
    </div>
  );
}
