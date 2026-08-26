import { KRAJINY_DANE, krajinaDane, sadzbyKrajiny } from "@/lib/faktero/vat-rates";

/**
 * Krajina registrácie firmy.
 *
 * Nie je to len adresný údaj — určuje, aké sadzby DPH firma uplatňuje. Dovtedy
 * to bolo voľné textové pole a sadzby boli natvrdo slovenské, takže česká firma
 * si 21 % nemala kde vybrať. Preto výber, nie písanie: preklep by ticho zapol
 * cudzí daňový režim.
 *
 * Sadzby sú pri výbere vypísané zámerne. Človek tak vidí, čo tou voľbou naozaj
 * mení, a nemusí to zisťovať až na prvej faktúre.
 */
export function VyberKrajiny({
  hodnota,
  onZmena,
  label = "Krajina registrácie",
}: {
  hodnota: string | null | undefined;
  onZmena: (v: string) => void;
  label?: string;
}) {
  const vybrana = krajinaDane(hodnota);
  const sadzby = sadzbyKrajiny(vybrana);

  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <select value={vybrana} onChange={(e) => onZmena(e.target.value)} className="input mt-1">
        {KRAJINY_DANE.map((k) => (
          <option key={k.kod} value={k.kod}>
            {k.nazov}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-xs text-muted-foreground">
        Sadzby DPH: {sadzby.filter((s) => s > 0).join(" %, ")} % a 0 %
      </span>
    </label>
  );
}
