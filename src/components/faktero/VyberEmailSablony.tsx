import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n/useT";
import { doplnPremenne, sablonyPreDoklad, type EmailSablona } from "@/lib/faktero/email-sablony";

/**
 * Výber e-mailovej šablóny v okne odoslania dokladu. Po načítaní sa sama
 * použije najlepšia šablóna pre typ a jazyk dokladu; človek môže vybrať inú
 * alebo sa vrátiť k predvolenému textu. Kým firma žiadnu vhodnú šablónu nemá,
 * nezobrazí sa nič.
 */
export function VyberEmailSablony({
  companyId,
  typ,
  jazyk,
  hodnoty,
  predvolene,
  onPouzi,
}: {
  companyId: string | null | undefined;
  /** Typ faktúry, `upomienka` alebo `ponuka`. */
  typ: string | null | undefined;
  jazyk: string | null | undefined;
  /** Hodnoty premenných — `hodnotyPremennych(...)`. */
  hodnoty: Record<string, string>;
  /** Text bez šablóny (voľba „Predvolený text“). */
  predvolene: { predmet: string; text: string };
  onPouzi: (m: { predmet: string; text: string }) => void;
}) {
  const { t } = useT();
  const [sablony, setSablony] = useState<EmailSablona[]>([]);
  const [vybrana, setVybrana] = useState("");
  const pouzita = useRef(false);

  useEffect(() => {
    if (!companyId) return;
    let zive = true;
    supabase
      .from("email_sablony")
      .select("id, nazov, typ_dokladu, jazyk, predmet, text")
      .eq("company_id", companyId)
      .limit(500)
      .then(({ data }) => {
        if (zive) setSablony((data ?? []) as EmailSablona[]);
      });
    return () => {
      zive = false;
    };
  }, [companyId]);

  const vhodne = useMemo(() => sablonyPreDoklad(sablony, typ, jazyk), [sablony, typ, jazyk]);

  function pouzi(id: string) {
    setVybrana(id);
    const s = vhodne.find((x) => x.id === id);
    onPouzi(
      s
        ? { predmet: doplnPremenne(s.predmet, hodnoty), text: doplnPremenne(s.text, hodnoty) }
        : predvolene,
    );
  }

  // Najlepšia šablóna sa použije raz, hneď po načítaní.
  useEffect(() => {
    if (pouzita.current || !vhodne.length) return;
    pouzita.current = true;
    pouzi(vhodne[0]!.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vhodne]);

  if (!vhodne.length) return null;
  return (
    <label className="block">
      <span className="text-sm font-medium">{t("Šablóna")}</span>
      <select
        value={vybrana}
        onChange={(e) => pouzi(e.target.value)}
        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        {vhodne.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nazov}
          </option>
        ))}
        <option value="">{t("Predvolený text (bez šablóny)")}</option>
      </select>
    </label>
  );
}
