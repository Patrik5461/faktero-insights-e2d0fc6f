import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { JAZYKY, jeJazyk, nastavJazyk } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";

/**
 * Prepínač jazyka vpravo hore: jedno tlačidlo so skratkou aktuálneho jazyka,
 * po kliknutí sa rozbalí ponuka všetkých jazykov s plným názvom (aktuálny
 * je označený bodkou). Voľba sa uloží do cookie a stránka sa načíta znova.
 *
 * Kedysi tu boli tri tlačidlá SK | CZ | DE vedľa seba (~100 px) a na telefóne
 * natívny `<select>`. Tlačidlo má teraz pevnú šírku (~52 px) na všetkých
 * šírkach, takže sa zmestí aj do hlavičky aplikácie na telefóne a zmena
 * jazyka hlavičku neposunie. Ponuka sa kreslí cez portál ponad stránku, takže
 * ani jej otvorenie rozloženie nemení (a `modal={false}` neschováva posuvník).
 *
 * Klávesnica a čítačky rieši Radix: Enter/medzerník/šípka dole ponuku otvorí,
 * šípky vyberajú, Escape zavrie a vráti fokus na tlačidlo. Položky sú
 * `menuitemradio`, takže čítačka ohlási, ktorý jazyk je zvolený.
 */
export function PrepinacJazyka({ className = "" }: { className?: string }) {
  const { jazyk, t } = useT();
  const aktualny = JAZYKY.find((j) => j.kod === jazyk) ?? JAZYKY[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${t("Jazyk")}: ${aktualny.nazov}`}
        title={aktualny.nazov}
        className={cn(
          "inline-flex h-8 w-[3.25rem] shrink-0 items-center justify-center gap-0.5 rounded-md border border-border text-xs font-semibold text-muted-foreground hover:text-foreground data-[state=open]:text-foreground",
          className,
        )}
      >
        <span lang={aktualny.kod}>{aktualny.skratka}</span>
        <ChevronDown aria-hidden className="h-3.5 w-3.5 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        <DropdownMenuRadioGroup
          value={jazyk}
          onValueChange={(v) => jeJazyk(v) && v !== jazyk && nastavJazyk(v)}
        >
          {JAZYKY.map((j) => (
            <DropdownMenuRadioItem
              key={j.kod}
              value={j.kod}
              lang={j.kod}
              className="min-h-10 gap-2 data-[state=checked]:font-medium sm:min-h-0"
            >
              <span className="w-6 text-xs font-semibold text-muted-foreground">{j.skratka}</span>
              <span>{j.nazov}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
