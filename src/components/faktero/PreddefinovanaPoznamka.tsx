import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/useT";
import {
  popisPoznamky,
  poznamkyPreAgendu,
  type AgendaPoznamky,
  type PreddefinovanaPoznamka as Poznamka,
} from "@/lib/faktero/preddefinovane-poznamky";
import { nacitajPoznamky, OknoPreddefinovanychPoznamok } from "./PreddefinovanePoznamkySprava";

const SPRAVOVAT = "__spravovat__";

/**
 * Výber z preddefinovaných poznámok firmy (číselník v Nastaveniach) pri poli
 * poznámky dokladu. Ponúkajú sa len poznámky pre danú agendu; posledná voľba
 * „Spravovať poznámky…“ otvorí číselník rovno tu.
 */
export function PreddefinovanaPoznamka({
  companyId,
  onVyber,
  agenda,
  className,
}: {
  companyId: string | null;
  onVyber: (t: string) => void;
  agenda?: AgendaPoznamky | null;
  className?: string;
}) {
  const { t } = useT();
  const [poznamky, setPoznamky] = useState<Poznamka[]>([]);
  const [okno, setOkno] = useState(false);

  async function obnov() {
    if (!companyId) return;
    try {
      setPoznamky(poznamkyPreAgendu(await nacitajPoznamky(companyId), agenda));
    } catch {
      /* bez číselníka sa pole poznámky použiť dá aj tak */
    }
  }
  useEffect(() => {
    void obnov();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, agenda]);

  if (!companyId) return null;
  return (
    <>
      <select
        aria-label={t("Vložiť preddefinovanú poznámku")}
        value=""
        onChange={(e) => {
          const v = e.target.value;
          if (v === SPRAVOVAT) setOkno(true);
          else {
            const p = poznamky.find((x) => x.id === v);
            if (p) onVyber(p.text);
          }
        }}
        className={
          className ??
          "mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-muted-foreground"
        }
      >
        <option value="">
          {poznamky.length ? t("Vložiť preddefinovanú poznámku…") : t("Preddefinované poznámky…")}
        </option>
        {poznamky.map((p) => (
          <option key={p.id} value={p.id}>
            {popisPoznamky(p)}
          </option>
        ))}
        <option value={SPRAVOVAT}>{t("Spravovať poznámky…")}</option>
      </select>
      {okno && (
        <OknoPreddefinovanychPoznamok
          agenda={agenda}
          onClose={() => setOkno(false)}
          onZmena={() => void obnov()}
        />
      )}
    </>
  );
}
