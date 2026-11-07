/**
 * Zápis v obchodnom (živnostenskom) registri vlastnej firmy — pole v
 * nastaveniach firmy a upozornenie pri vystavení dokladu, keď ho s.r.o./a.s.
 * nemá (§ 3a Obchodného zákonníka). Len upozorňuje, nič neblokuje.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { nacitajZapisVRegistriFn } from "@/lib/faktero/zapis-v-registri.functions";
import { chybaZapisVRegistri, type FirmaZapis } from "@/lib/faktero/zapis-v-registri";

type Firma = FirmaZapis & { ico?: string | null };

/** Upozornenie — v nastaveniach bez odkazu, pri doklade s odkazom do nastavení firmy. */
export function UpozornenieZapisVRegistri({
  firma,
  odkaz = false,
  className = "",
}: {
  firma: (Firma & Record<string, unknown>) | null | undefined;
  odkaz?: boolean;
  className?: string;
}) {
  const { t } = useT();
  // Kým v databáze stĺpec nie je, `select("*")` ho nevráti — vtedy mlčať.
  if (!firma || !("registracia_text" in firma) || !chybaZapisVRegistri(firma)) return null;
  return (
    <div
      role="status"
      className={`rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground ${className}`}
    >
      {t(
        "Na faktúre obchodnej spoločnosti (s.r.o., a.s.) musí byť zápis v obchodnom registri vrátane čísla vložky (§ 3a Obchodného zákonníka).",
      )}{" "}
      {odkaz ? (
        <Link to="/firma" className="font-semibold text-primary underline-offset-2 hover:underline">
          {t("Doplniť v nastaveniach firmy")}
        </Link>
      ) : (
        t("Doplňte ho alebo ho načítajte z registra.")
      )}
    </div>
  );
}

/** Pole „Zápis v obchodnom registri“ s tlačidlom „Načítať z registra“. */
export function PoleZapisVRegistri({
  firma,
  onZmena,
}: {
  firma: Firma & Record<string, unknown>;
  onZmena: (zmena: {
    registracia_text: string;
    register_sud?: string | null;
    register_oddiel?: string | null;
    register_vlozka?: string | null;
  }) => void;
}) {
  const { t } = useT();
  const nacitaj = useServerFn(nacitajZapisVRegistriFn);
  const [nacitava, setNacitava] = useState(false);
  const ico = String(firma.ico ?? "").replace(/\s+/g, "");
  const cz = /^(CZ|CZE|ČESK|CESK|CZECH)/i.test(String(firma.country ?? ""));
  const de = /^(DE|DEU|NEMEC|GERMAN|DEUTSCH)/i.test(String(firma.country ?? ""));

  async function zRegistra() {
    if (!/^\d{6,8}$/.test(ico)) return toast.error(t("Najprv vyplňte IČO."));
    setNacitava(true);
    try {
      const r = await nacitaj({ data: { ico, country: firma.country ?? null } });
      if (r.stav === "ok") {
        onZmena({
          registracia_text: r.zapis.text,
          register_sud: r.zapis.sud,
          register_oddiel: r.zapis.oddiel,
          register_vlozka: r.zapis.vlozka,
        });
        toast.success(t("Zápis načítaný z registra. Skontrolujte ho a uložte."));
      } else if (r.stav === "nenajdene") {
        toast.warning(t("Register zápis k tomuto IČO nevrátil. Doplňte ho ručne."));
      } else {
        toast.error(t("Register teraz neodpovedá. Skúste to o chvíľu alebo zápis doplňte ručne."));
      }
    } catch {
      toast.error(t("Register teraz neodpovedá. Skúste to o chvíľu alebo zápis doplňte ručne."));
    } finally {
      setNacitava(false);
    }
  }

  return (
    <div className="block min-w-0 sm:col-span-2">
      <label htmlFor="zapis-v-registri" className="text-sm font-semibold">
        {t("Zápis v obchodnom registri")}
      </label>
      <div className="mt-1 flex min-w-0 -space-x-px items-start">
        <input
          id="zapis-v-registri"
          value={String(firma.registracia_text ?? "")}
          onChange={(e) => onZmena({ registracia_text: e.target.value })}
          // Ukážka zápisu v registri krajiny firmy — nie v jazyku rozhrania.
          placeholder={
            cz
              ? "Spisová značka C 12345 vedená u Městského soudu v Praze"
              : de
                ? "Amtsgericht München, HRB 123456"
                : "Obchodný register Mestského súdu Bratislava III, oddiel: Sro, vložka č. 123456/B"
          }
          className="h-10 w-full min-w-0 flex-1 rounded-l-md border border-input bg-background px-3 py-2 text-sm focus:z-10"
        />
        <button
          type="button"
          onClick={zRegistra}
          disabled={nacitava}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-r-md border border-input bg-muted px-3 text-sm font-medium hover:bg-accent disabled:opacity-60"
        >
          {nacitava ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {t("Načítať z registra")}
        </button>
      </div>
      <span className="mt-1 block text-xs text-muted-foreground">
        {t(
          "Tlačí sa na faktúry pod údaje dodávateľa. Živnostník môže uviesť zápis v živnostenskom registri.",
        )}
      </span>
      <UpozornenieZapisVRegistri firma={firma} className="mt-2" />
    </div>
  );
}
