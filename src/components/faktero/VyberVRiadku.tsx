import { textMoznosti, type MoznostKodu } from "@/lib/faktero/predkontacie";
import type { MoznostVyberu } from "@/lib/faktero/vyber-kodu";
import { VyberKodu, ZoznamKodov } from "./VyberKodu";

export type { MoznostVyberu };

/** Predkontácie z číselníka ako voľby (názov ako hlavný text, kód a účty pod ním). */
export function moznostiKodov(m: MoznostKodu[]): MoznostVyberu[] {
  return m.map((k) => ({
    hodnota: k.kod,
    text: k.popis?.trim() || k.kod,
    popis: k.popis?.trim() ? [k.kod, k.ucty].filter(Boolean).join(" · ") : k.ucty,
  }));
}

/** Zoznam volieb s hľadaním — v okne hromadnej akcie (bez tlačidla, rovno otvorený). */
export function ZoznamMoznosti({
  moznosti,
  hodnota,
  onVyber,
  prazdne,
  nazov,
}: {
  moznosti: MoznostVyberu[];
  hodnota?: string | null;
  onVyber: (v: string) => void;
  /** Text voľby „bez hodnoty" (napr. „Nedefinované"); bez neho sa vyčistiť nedá. */
  prazdne?: string;
  /** Čo sa vyberá (preložené) — popis hľadania a zoznamu pre čítačku. */
  nazov?: string;
}) {
  return (
    <ZoznamKodov
      moznosti={moznosti}
      hodnota={hodnota}
      onVyber={onVyber}
      prazdne={prazdne}
      nazov={nazov}
    />
  );
}

/**
 * Malý výber s hľadaním priamo v riadku zoznamu. Obsah sa vykreslí až po
 * otvorení — sto riadkov zoznamu drží len tlačidlá. Zamknutý doklad ukáže
 * zámok s dôvodom a hodnotu len na čítanie.
 */
export function VyberVRiadku({
  hodnota,
  moznosti,
  onVyber,
  zamok,
  ariaLabel,
  prazdne,
  nazovPrazdnej,
}: {
  hodnota: string | null | undefined;
  moznosti: MoznostVyberu[];
  onVyber: (v: string) => void | Promise<void>;
  /** Dôvod zámku (preložený) — výber sa neotvorí. */
  zamok?: string | null;
  ariaLabel: string;
  /** Voľba na vyčistenie hodnoty. */
  prazdne?: string;
  /** Text tlačidla bez hodnoty. */
  nazovPrazdnej?: string;
}) {
  return (
    <VyberKodu
      vzhlad="riadok"
      hodnota={hodnota}
      moznosti={moznosti}
      onVyber={onVyber}
      zamok={zamok}
      ariaLabel={ariaLabel}
      prazdne={prazdne}
      nazovPrazdnej={nazovPrazdnej}
    />
  );
}

/** Text predkontácie do bunky, keď sa nedá vyberať (číselník nie je). */
export function textKodu(kod: string | null | undefined, moznosti: MoznostKodu[]): string {
  if (!kod) return "—";
  const m = moznosti.find((x) => x.kod === kod);
  return m ? textMoznosti(m) : kod;
}
