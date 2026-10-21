import { useEffect, useState } from "react";
import { Check, Copy, UserRoundPlus, X } from "lucide-react";
import { useOperacia } from "@/lib/mobile/server-most";
import { SERVER } from "@/lib/mobile/operacie";
import { JE_KNIHA_JAZD } from "@/lib/mobile/apka";
import { usePreklad } from "@/lib/mobile/preklady/hook";
import { coZobrazitOznam, jePlatnyEmail } from "@/lib/faktero/efaktura-oznam";

/**
 * Oznam o e-fakturácii 2027 na Prehľade appky.
 *
 * Rovnaká logika ako okno na webe (`coZobrazitOznam`) aj tie isté serverové
 * funkcie cez most. Na celé okno s dvoma kartami je telefón malý — appka
 * ukáže kartu: aktiváciu na Portáli FS otvorí na webe, účtovníka pozve priamo.
 * Keď čaká pozvaný účtovník, karta sa zmení na jednoriadkový pás.
 */
export function OznamEfaktury({ firmaId }: { firmaId: string }) {
  const { t } = usePreklad();
  const nacitaj = useOperacia("efaktura-oznam-stav");
  const zaznamenaj = useOperacia("efaktura-oznam-akcia");
  const pozvi = useOperacia("efaktura-pozvi-uctovnika");
  const [stav, setStav] = useState<any>(null);
  const [skryte, setSkryte] = useState(false);
  const [formular, setFormular] = useState(false);
  const [email, setEmail] = useState("");
  const [bezi, setBezi] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [vysledok, setVysledok] = useState<null | {
    email: string;
    odkaz: string;
    emailOdoslany: boolean;
  }>(null);
  const [skopirovane, setSkopirovane] = useState(false);

  useEffect(() => {
    // Kniha jázd je samostatná appka bez fakturácie — oznam tam nepatrí.
    if (JE_KNIHA_JAZD) return;
    let zrusene = false;
    setStav(null);
    setSkryte(false);
    nacitaj({ data: { company_id: firmaId } })
      .then((s) => !zrusene && setStav(s))
      // Bez signálu oznam jednoducho chýba — nie je to nič súrne.
      .catch(() => {});
    return () => {
      zrusene = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaId]);

  if (!stav?.relevantne || skryte) return null;
  const zobrazenie = vysledok
    ? "okno"
    : coZobrazitOznam({
        rola: stav.rola,
        krajina: stav.krajina,
        aktivovana: stav.aktivovana,
        dismissedAt: stav.dismissedAt,
        ctaClickedAt: stav.ctaClickedAt,
        uctovnikPozvany: !!stav.pozvanka,
        cesta: "/app",
      });
  if (zobrazenie === "nic") return null;

  if (zobrazenie === "pas") {
    return (
      <div
        role="status"
        className="rounded-app bg-app-zelena-jemna px-4 py-3 text-[13px] font-medium text-app-zelena"
      >
        {t("efo.cakame")}
      </div>
    );
  }

  async function zatvor() {
    setSkryte(true);
    if (vysledok) return;
    try {
      await zaznamenaj({ data: { company_id: firmaId, akcia: "zatvorit" } });
    } catch {
      /* odloženie sa zapíše pri ďalšom zatvorení */
    }
  }

  async function aktivuj() {
    window.open(`${SERVER}/efaktura#prepojenie`, "_blank");
    setSkryte(true);
    try {
      await zaznamenaj({ data: { company_id: firmaId, akcia: "pokracovat" } });
    } catch {
      /* nič */
    }
  }

  async function posli() {
    if (!jePlatnyEmail(email)) {
      setChyba(t("efo.zlyEmail"));
      return;
    }
    setBezi(true);
    setChyba(null);
    try {
      const v: any = await pozvi({ data: { company_id: firmaId, email: email.trim() } });
      setVysledok({ email: v.email, odkaz: v.odkaz, emailOdoslany: !!v.emailOdoslany });
    } catch (e: any) {
      setChyba(String(e?.message ?? e));
    } finally {
      setBezi(false);
    }
  }

  return (
    <div className="relative rounded-app border border-app-obrys bg-app-karta p-4">
      <button
        type="button"
        onClick={zatvor}
        aria-label={t("efo.zavriet")}
        className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full text-app-text-2 active:bg-app-pozadie"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-app-zelena px-2.5 py-0.5 text-[11px] font-semibold text-white">
        Peppol
      </div>
      <h3 className="pr-8 text-[16px] font-bold text-app-text">{t("efo.nadpis")}</h3>
      <p className="mt-1 text-[13px] leading-snug text-app-text-2">{t("efo.text")}</p>

      {vysledok ? (
        <div className="mt-3 space-y-2 text-[13px] text-app-text" role="status">
          <p>
            {vysledok.emailOdoslany
              ? t("efo.odoslane", { email: vysledok.email })
              : t("efo.neodislo")}
          </p>
          {!vysledok.emailOdoslany && (
            <p className="break-all rounded-app-sm bg-app-pozadie px-3 py-2 font-mono text-[11px]">
              {vysledok.odkaz}
            </p>
          )}
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(vysledok.odkaz);
                setSkopirovane(true);
              } catch {
                /* nič */
              }
            }}
            className="inline-flex h-10 items-center gap-1.5 rounded-app-sm border border-app-obrys px-3 font-semibold"
          >
            {skopirovane ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {skopirovane ? t("efo.skopirovane") : t("efo.kopirovat")}
          </button>
        </div>
      ) : formular ? (
        <div className="mt-3 space-y-2">
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("efo.emailUctovnika")}
            aria-label={t("efo.emailUctovnika")}
            className="h-11 w-full rounded-app-sm border border-app-obrys bg-app-pozadie px-3 text-[15px] text-app-text outline-none"
          />
          {chyba && <p className="text-[12px] text-app-chyba">{chyba}</p>}
          <button
            type="button"
            onClick={posli}
            disabled={bezi}
            className="h-11 w-full rounded-app-sm bg-orange-500 text-[14px] font-semibold text-white disabled:opacity-60"
          >
            {t("efo.poslat")}
          </button>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
          <button
            type="button"
            onClick={aktivuj}
            className="h-11 rounded-app-sm bg-blue-600 px-3 text-[14px] font-semibold text-white"
          >
            {t("efo.aktivovat")}
          </button>
          <button
            type="button"
            onClick={() => setFormular(true)}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-app-sm bg-orange-500 px-3 text-[14px] font-semibold text-white"
          >
            <UserRoundPlus className="h-4 w-4" /> {t("efo.uctovnik")}
          </button>
        </div>
      )}
    </div>
  );
}
