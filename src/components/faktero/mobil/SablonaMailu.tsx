import { useEffect, useMemo, useState } from "react";
import { Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sablonyPreDoklad, type EmailSablona } from "@/lib/faktero/email-sablony";
import { jazykFaktury } from "@/lib/faktero/email-jazyk";
import { usePreklad } from "@/lib/mobile/preklady/hook";

/** Predmet a text vybranej šablóny; `null` = nech server vyberie sám. */
export type VybranaSablona = { subject: string; message: string } | null;

/**
 * E-mailová šablóna pri odoslaní faktúry z appky.
 *
 * Appka predmet ani text neposiela, takže server sám použije najlepšiu
 * šablónu firmy pre typ a jazyk faktúry (`email.server.ts` →
 * `sablonaPreDoklad`). Tu sa vyberá tým istým pravidlom (`sablonyPreDoklad`
 * a `jazykFaktury`), aby bolo vidieť, ktorá to bude. Keď si človek vyberie
 * inú, pošle sa jej predmet a text — premenné [CISLO_FAKTURY]… doplní server.
 * Firma bez šablón nevidí nič; platí jej predvolený text.
 */
export function SablonaMailu({
  fakturaId,
  onZmena,
}: {
  fakturaId: string;
  onZmena: (s: VybranaSablona) => void;
}) {
  const { t } = usePreklad();
  const [sablony, setSablony] = useState<EmailSablona[]>([]);
  const [doklad, setDoklad] = useState<{ typ: string | null; jazyk: string } | null>(null);
  const [vybrana, setVybrana] = useState("");

  useEffect(() => {
    let zive = true;
    (async () => {
      const { data: f } = await supabase
        .from("invoices")
        .select("company_id, type, language")
        .eq("id", fakturaId)
        .maybeSingle()
        .then(
          (r) => r,
          () => ({ data: null }),
        );
      if (!f || !zive) return;
      const [firma, s] = await Promise.all([
        supabase
          .from("companies")
          .select("country")
          .eq("id", f.company_id)
          .maybeSingle()
          .then(
            (r) => r,
            () => ({ data: null }),
          ),
        supabase
          .from("email_sablony")
          .select("id, nazov, typ_dokladu, jazyk, predmet, text")
          .eq("company_id", f.company_id)
          .limit(500)
          .then(
            (r) => r,
            () => ({ data: null }),
          ),
      ]);
      if (!zive) return;
      setDoklad({ typ: f.type, jazyk: jazykFaktury(f as any, (firma as any).data) });
      setSablony(((s as any).data ?? []) as EmailSablona[]);
    })();
    return () => {
      zive = false;
    };
  }, [fakturaId]);

  const vhodne = useMemo(
    () => (doklad ? sablonyPreDoklad(sablony, doklad.typ, doklad.jazyk) : []),
    [sablony, doklad],
  );

  useEffect(() => {
    setVybrana(vhodne[0]?.id ?? "");
    onZmena(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vhodne]);

  if (!vhodne.length) return null;

  if (vhodne.length === 1) {
    return (
      <p className="flex items-start gap-2 px-1 text-[13px] text-app-text-2">
        <Mail className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="min-w-0">{t("mail.pouzijeSa", { nazov: vhodne[0]!.nazov })}</span>
      </p>
    );
  }

  return (
    <label className="block px-1">
      <span className="mb-1 block text-[13px] font-medium text-app-text-2">
        {t("mail.sablona")}
      </span>
      <select
        value={vybrana}
        onChange={(e) => {
          const id = e.target.value;
          setVybrana(id);
          const s = vhodne.find((x) => x.id === id);
          // Najlepšiu použije server aj bez nej — posiela sa len iná voľba.
          onZmena(s && s.id !== vhodne[0]!.id ? { subject: s.predmet, message: s.text } : null);
        }}
        className="min-h-[44px] w-full min-w-0 rounded-app-sm border border-app-ramik bg-app-karta px-3 text-[15px]"
      >
        {vhodne.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nazov}
          </option>
        ))}
      </select>
    </label>
  );
}
