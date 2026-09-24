import {
  maMatIcDph,
  popisSchemy,
  schemyKrajiny,
  zosuladSchemu,
  type SchemaDph,
} from "@/lib/faktero/dph-rezim";
import { krajinaDane } from "@/lib/faktero/vat-rates";

/**
 * Postavenie firmy k DPH.
 *
 * Zaškrtnutie „som platiteľ“ samo nestačí: registrácií je viac a z registra sa
 * ťahá iba IČ DPH, nie paragraf. Preto sa po zaškrtnutí ešte vyberá, podľa
 * čoho je firma registrovaná — a pod výberom je vysvetlené, komu tá možnosť
 * patrí, aby sa to nemuselo hľadať v zákone.
 */
export function VyberRezimuDph({
  krajina,
  platitel,
  schema,
  icDph,
  onZmena,
}: {
  krajina: string | null | undefined;
  platitel: boolean;
  schema: string | null | undefined;
  /** Kvôli upozorneniu, keď registrácii chýba IČ DPH alebo ho má navyše. */
  icDph?: string | null;
  onZmena: (zmena: { platitel: boolean; schema: SchemaDph }) => void;
}) {
  const k = krajinaDane(krajina);
  const vybrana = zosuladSchemu(schema as SchemaDph | null, k, platitel);
  const moznosti = schemyKrajiny(k, platitel);
  const maIc = Boolean(String(icDph ?? "").trim());
  const chybaIc = maMatIcDph(vybrana) && !maIc;
  const icNavyse = !maMatIcDph(vybrana) && maIc;

  return (
    <div className="sm:col-span-2">
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={platitel}
          onChange={(e) =>
            onZmena({
              platitel: e.target.checked,
              schema: zosuladSchemu(vybrana, k, e.target.checked),
            })
          }
          className="mt-0.5 h-4 w-4 rounded border-input"
        />
        <span className="text-sm font-medium">Firma je platiteľ DPH</span>
      </label>

      <label className="mt-3 block">
        <span className="text-sm font-medium">
          {platitel ? "Typ registrácie" : "Postavenie k DPH"}
        </span>
        <select
          value={vybrana}
          onChange={(e) => onZmena({ platitel, schema: e.target.value as SchemaDph })}
          className="input mt-1"
        >
          {moznosti.map((m) => (
            <option key={m.kod} value={m.kod}>
              {m.nazov}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-muted-foreground">{popisSchemy(vybrana)}</span>
      </label>

      {chybaIc && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          K tejto registrácii patrí IČ DPH — doplňte ho vyššie, inak nebude na faktúrach.
        </p>
      )}
      {icNavyse && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          Máte vyplnené IČ DPH, ale firma je vedená bez registrácie. Skontrolujte, či nejde o
          registráciu podľa § 7 alebo § 7a.
        </p>
      )}
    </div>
  );
}
