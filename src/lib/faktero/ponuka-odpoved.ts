/**
 * Prijatie a zamietnutie cenovej ponuky odberateľom.
 *
 * Pravidlá sú tu bez databázy, aby sa dali overiť príkladmi — práve pri nich sa
 * dá pomýliť spôsobom, ktorý nikto nevidí: prijatá ponuka, ktorej platnosť už
 * uplynula, alebo druhé kliknutie, ktoré prepíše prvú odpoveď.
 */

export type StavPonuky = "draft" | "sent" | "accepted" | "rejected" | "expired" | "converted";

export type PonukaNaOdpoved = {
  stav: StavPonuky;
  /** Dokedy ponuka platí (`valid_until`). Bez dátumu platí bez obmedzenia. */
  platiDo?: string | null;
  respondedAt?: string | null;
};

export type Prekazka =
  | { kod: "koncept"; text: string }
  | { kod: "uz_vybavena"; text: string }
  | { kod: "vyprsala"; text: string }
  | { kod: "premenena"; text: string };

/** Prečo sa na ponuku už nedá odpovedať. `null` znamená, že sa dá. */
export function prekazkaOdpovede(
  p: PonukaNaOdpoved,
  dnes: string = new Date().toISOString().slice(0, 10),
): Prekazka | null {
  if (p.stav === "draft") {
    return { kod: "koncept", text: "Ponuka ešte nebola odoslaná." };
  }
  if (p.stav === "converted") {
    return { kod: "premenena", text: "Ponuka už bola premenená na faktúru." };
  }
  if (p.stav === "accepted" || p.stav === "rejected") {
    return {
      kod: "uz_vybavena",
      text:
        p.stav === "accepted"
          ? "Ponuka už bola prijatá. Ďakujeme."
          : "Ponuka už bola zamietnutá.",
    };
  }
  if (p.platiDo && String(p.platiDo) < dnes) {
    return {
      kod: "vyprsala",
      text: `Platnosť ponuky uplynula ${datumSlovom(p.platiDo)}. Požiadajte dodávateľa o novú.`,
    };
  }
  return null;
}

/** Stav po odpovedi. Expirovaná ponuka sa odpoveďou neoživuje. */
export function stavPoOdpovedi(akcia: "prijat" | "zamietnut"): StavPonuky {
  return akcia === "prijat" ? "accepted" : "rejected";
}

export function datumSlovom(iso: string | null | undefined): string {
  const s = String(iso ?? "");
  const [r, m, d] = s.split("-");
  return r && m && d ? `${Number(d)}. ${Number(m)}. ${r}` : s;
}

/** Dôvod zamietnutia je dobrovoľný, ale nesmie byť román. */
export const MAX_DOVOD = 2000;

export function upravDovod(v: string | null | undefined): string | null {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, MAX_DOVOD) : null;
}
