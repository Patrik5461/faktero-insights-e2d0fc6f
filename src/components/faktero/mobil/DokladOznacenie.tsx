import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Tag, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { triedaFarby, type StavDokladu } from "@/lib/faktero/doklady-hromadne";
import {
  popisPoznamky,
  poznamkyPreAgendu,
  vlozDoPoznamky,
  type AgendaPoznamky,
  type PreddefinovanaPoznamka,
} from "@/lib/faktero/preddefinovane-poznamky";
import { NAJVIAC_STITKOV, odoberStitok, pridajStitok } from "@/lib/mobile/doklad-oznacenie";
import { usePreklad } from "@/lib/mobile/preklady/hook";
import { Card } from "./ui";

/**
 * Komentár, stav dokladu, štítky a poznámka v appke — to isté ako na webe
 * (`StavDokladu.tsx`, `StitkyDokladu.tsx`, `PreddefinovanaPoznamka.tsx`).
 *
 * Zapisuje sa priamo cez Supabase klientom prihláseného, teda pod tými istými
 * politikami RLS ako web. Komentár, stav a štítky sa do účtovníctva
 * neprenášajú, a tak ich databáza pustí aj na odovzdanom doklade; poznámku
 * nie (`zamok_odovzdaneho_dokladu`), preto sa tam len ukáže.
 */

export type TabulkaDokladu = "expense_documents" | "purchase_invoices" | "invoices";

type Ciselnik = { stavy: StavDokladu[]; stitky: string[] };
/* Číselník firmy sa načíta raz za otvorenie appky — výber v detaile nič ďalšie nesťahuje. */
const pamat = new Map<string, Promise<Ciselnik>>();

function nacitajCiselnik(firmaId: string): Promise<Ciselnik> {
  let p = pamat.get(firmaId);
  if (!p) {
    p = Promise.all([
      supabase
        .from("stavy_dokladov")
        .select("id, nazov, farba, poradie, aktivne")
        .eq("company_id", firmaId)
        .order("poradie")
        .order("nazov"),
      supabase.from("stitky_firmy").select("nazov").eq("company_id", firmaId).order("nazov"),
    ]).then(([s, st]) => {
      if (s.error) throw s.error;
      return {
        stavy: (s.data ?? []) as StavDokladu[],
        stitky: ((st.data ?? []) as { nazov: string }[]).map((x) => x.nazov),
      };
    });
    // Bez signálu sa chyba nezapamätá — pri ďalšom otvorení sa skúsi znova.
    p.catch(() => pamat.delete(firmaId));
    pamat.set(firmaId, p);
  }
  return p;
}

const poznamkyPamat = new Map<string, Promise<PreddefinovanaPoznamka[]>>();

function nacitajPoznamky(firmaId: string): Promise<PreddefinovanaPoznamka[]> {
  let p = poznamkyPamat.get(firmaId);
  if (!p) {
    p = Promise.resolve(
      supabase
        .from("preddefinovane_poznamky")
        .select("id, nazov, text, agendy, poradie")
        .eq("company_id", firmaId)
        .order("poradie")
        .order("created_at")
        .limit(500),
    ).then(({ data, error }) => {
      if (error) throw error;
      return (data ?? []) as PreddefinovanaPoznamka[];
    });
    p.catch(() => poznamkyPamat.delete(firmaId));
    poznamkyPamat.set(firmaId, p);
  }
  return p;
}

const POLE =
  "min-h-[44px] w-full min-w-0 rounded-app-sm border border-app-ramik bg-app-karta px-3 text-[15px]";

/**
 * Výber z preddefinovaných poznámok firmy (Nastavenia na webe). Vráti text,
 * volajúci ho vloží do svojho políčka. Bez poznámok pre agendu sa nekreslí.
 */
export function VyberPoznamky({
  firmaId,
  agenda,
  onVyber,
}: {
  firmaId: string;
  agenda: AgendaPoznamky;
  onVyber: (text: string) => void;
}) {
  const { t } = usePreklad();
  const [poznamky, setPoznamky] = useState<PreddefinovanaPoznamka[]>([]);
  useEffect(() => {
    let zive = true;
    nacitajPoznamky(firmaId)
      .then((z) => zive && setPoznamky(poznamkyPreAgendu(z, agenda)))
      .catch(() => {
        /* bez číselníka sa poznámka píše ručne */
      });
    return () => {
      zive = false;
    };
  }, [firmaId, agenda]);
  if (!poznamky.length) return null;
  return (
    <select
      aria-label={t("dk.vlozitPoznamku")}
      value=""
      onChange={(e) => {
        const p = poznamky.find((x) => x.id === e.target.value);
        if (p) onVyber(p.text);
      }}
      className={`${POLE} mt-2 text-[14px] text-app-text-2`}
    >
      <option value="">{t("dk.vlozitPoznamku")}</option>
      {poznamky.map((p) => (
        <option key={p.id} value={p.id}>
          {popisPoznamky(p, 50)}
        </option>
      ))}
    </select>
  );
}

/**
 * Poznámka dokladu (ide do účtovníctva) s výberom preddefinovanej poznámky.
 * Na odovzdanom alebo zamknutom doklade len na čítanie.
 */
export function PoznamkaDokladu({
  tabulka,
  id,
  firmaId,
  agenda,
  poznamka,
  zamknute,
  onZmena,
}: {
  tabulka: Exclude<TabulkaDokladu, "invoices">;
  id: string;
  firmaId: string;
  agenda: AgendaPoznamky;
  poznamka: string | null | undefined;
  zamknute: boolean;
  onZmena?: (p: string | null) => void;
}) {
  const { t } = usePreklad();
  const [text, setText] = useState(poznamka ?? "");
  const [ulozena, setUlozena] = useState(poznamka ?? "");
  const [ukladam, setUkladam] = useState(false);
  useEffect(() => {
    setText(poznamka ?? "");
    setUlozena(poznamka ?? "");
  }, [id, poznamka]);

  async function uloz() {
    setUkladam(true);
    const nova = text.trim() || null;
    const { error } = await supabase
      .from(tabulka)
      .update({ note: nova } as any)
      .eq("id", id)
      .then(
        (r) => r,
        (e) => ({ error: e }),
      );
    setUkladam(false);
    if (error) return toast.error(error.message ?? t("dk.chybaUlozenia"));
    setUlozena(text);
    onZmena?.(nova);
    toast.success(t("dk.poznamkaUlozena"));
  }

  if (zamknute) {
    if (!ulozena.trim()) return null;
    return (
      <Card className="p-4">
        <div className="text-[13px] font-medium text-app-text-2">{t("dk.poznamka")}</div>
        <p className="mt-1 whitespace-pre-wrap break-words text-[15px]">{ulozena}</p>
        <p className="mt-2 text-[12px] text-app-text-2">{t("dk.poznamkaZamknuta")}</p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <label className="block">
        <span className="text-[13px] font-medium text-app-text-2">{t("dk.poznamka")}</span>
        <textarea
          rows={2}
          maxLength={1000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("dk.poznamkaPopis")}
          className="mt-1 w-full min-w-0 rounded-app-sm border border-app-ramik bg-app-karta px-3 py-2 text-[15px]"
        />
      </label>
      <VyberPoznamky
        firmaId={firmaId}
        agenda={agenda}
        onVyber={(v) => setText((p) => vlozDoPoznamky(p, v))}
      />
      {text.trim() !== ulozena.trim() && (
        <button
          disabled={ukladam}
          onClick={() => void uloz()}
          className="mt-2 min-h-[44px] w-full rounded-app-sm bg-app-zelena-plocha px-4 text-[15px] font-medium text-white disabled:opacity-50"
        >
          {t("dk.ulozit")}
        </button>
      )}
    </Card>
  );
}

export type OznacenieDokladu = {
  id: string;
  komentar?: string | null;
  stav_id?: string | null;
  stitky?: string[] | null;
};

/**
 * Komentár (do účtovníctva sa neprenáša), vlastný stav dokladu a štítky.
 * Stav sa ukáže len vtedy, keď firma nejaké stavy má.
 */
export function OznacenieDokladu({
  tabulka,
  firmaId,
  doklad,
  onZmena,
}: {
  tabulka: TabulkaDokladu;
  firmaId: string;
  doklad: OznacenieDokladu;
  onZmena?: (zmena: Partial<OznacenieDokladu>) => void;
}) {
  const { t } = usePreklad();
  const [ciselnik, setCiselnik] = useState<Ciselnik>({ stavy: [], stitky: [] });
  const [stav, setStav] = useState(doklad.stav_id ?? "");
  const [stitky, setStitky] = useState<string[]>(doklad.stitky ?? []);
  const [novy, setNovy] = useState("");
  const [komentar, setKomentar] = useState(doklad.komentar ?? "");
  const [ulozeny, setUlozeny] = useState(doklad.komentar ?? "");
  const [ukladam, setUkladam] = useState(false);

  useEffect(() => {
    setStav(doklad.stav_id ?? "");
    setStitky(doklad.stitky ?? []);
    setKomentar(doklad.komentar ?? "");
    setUlozeny(doklad.komentar ?? "");
  }, [doklad.id, doklad.stav_id, doklad.stitky, doklad.komentar]);

  useEffect(() => {
    let zive = true;
    nacitajCiselnik(firmaId)
      .then((c) => zive && setCiselnik(c))
      .catch(() => {
        /* bez číselníka ostanú štítky a komentár */
      });
    return () => {
      zive = false;
    };
  }, [firmaId]);

  async function zapis(zmena: Partial<OznacenieDokladu>): Promise<boolean> {
    const { error } = await supabase
      .from(tabulka)
      .update(zmena as any)
      .eq("id", doklad.id)
      .then(
        (r) => r,
        (e) => ({ error: e }),
      );
    if (error) {
      toast.error(error.message ?? t("dk.chybaUlozenia"));
      return false;
    }
    onZmena?.(zmena);
    return true;
  }

  async function zmenStav(v: string) {
    const pred = stav;
    setStav(v);
    if (!(await zapis({ stav_id: v || null }))) setStav(pred);
  }

  async function ulozStitky(s: string[]) {
    const pred = stitky;
    setStitky(s);
    if (!(await zapis({ stitky: s }))) return setStitky(pred);
    // Nový štítok sa ponúkne aj pri ďalších dokladoch firmy — rovnako ako na webe.
    const pribudol = s.find((x) => !pred.includes(x));
    if (pribudol && !ciselnik.stitky.includes(pribudol)) {
      void Promise.resolve(
        supabase
          .from("stitky_firmy")
          .upsert(
            { company_id: firmaId, nazov: pribudol },
            { onConflict: "company_id,nazov", ignoreDuplicates: true },
          ),
      ).then(
        () => {
          pamat.delete(firmaId);
          setCiselnik((c) => ({ ...c, stitky: [...c.stitky, pribudol].sort() }));
        },
        () => {},
      );
    }
  }

  async function ulozKomentar() {
    setUkladam(true);
    const ok = await zapis({ komentar: komentar.trim() || null });
    setUkladam(false);
    if (ok) {
      setUlozeny(komentar);
      toast.success(t("dk.komentarUlozeny"));
    }
  }

  const vybrany = ciselnik.stavy.find((s) => s.id === stav);
  const ponuka = ciselnik.stitky.filter((x) => !stitky.includes(x));

  return (
    <Card className="space-y-4 p-4">
      {ciselnik.stavy.length > 0 && (
        <label className="block">
          <span className="text-[13px] font-medium text-app-text-2">{t("dk.stav")}</span>
          <select
            value={stav}
            onChange={(e) => void zmenStav(e.target.value)}
            className={`${POLE} mt-1 ${vybrany ? triedaFarby(vybrany.farba) : ""}`}
          >
            <option value="">{t("dk.bezStavu")}</option>
            {ciselnik.stavy
              .filter((s) => s.aktivne || s.id === stav)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nazov}
                </option>
              ))}
          </select>
        </label>
      )}

      <div>
        <div className="flex items-center gap-1.5 text-[13px] font-medium text-app-text-2">
          <Tag className="h-3.5 w-3.5" aria-hidden /> {t("dk.stitky")}
        </div>
        {stitky.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {stitky.map((s) => (
              <span
                key={s}
                className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full bg-app-pozadie py-1 pl-3 pr-1 text-[14px]"
              >
                <span className="min-w-0 truncate">{s}</span>
                <button
                  onClick={() => void ulozStitky(odoberStitok(stitky, s))}
                  aria-label={t("dk.odstranitStitok", { stitok: s })}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-app-text-2 active:bg-app-ramik"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
        {stitky.length < NAJVIAC_STITKOV ? (
          <>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const s = pridajStitok(stitky, novy);
                setNovy("");
                if (s) void ulozStitky(s);
              }}
            >
              <input
                aria-label={t("dk.novyStitok")}
                value={novy}
                maxLength={40}
                onChange={(e) => setNovy(e.target.value)}
                placeholder={t("dk.novyStitok")}
                className={`${POLE} flex-1`}
              />
              <button
                type="submit"
                disabled={!novy.trim()}
                className="min-h-[44px] shrink-0 rounded-app-sm border border-app-ramik px-4 text-[15px] font-medium text-app-zelena disabled:opacity-50"
              >
                {t("dk.pridatStitok")}
              </button>
            </form>
            {ponuka.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {ponuka.slice(0, 12).map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      const z = pridajStitok(stitky, s);
                      if (z) void ulozStitky(z);
                    }}
                    className="min-w-0 max-w-full truncate rounded-full border border-dashed border-app-ramik px-3 py-1 text-[13px] text-app-text-2"
                  >
                    + {s}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="mt-2 text-[12px] text-app-text-2">{t("dk.najviacStitkov")}</p>
        )}
      </div>

      <label className="block">
        <span className="text-[13px] font-medium text-app-text-2">{t("dk.komentar")}</span>
        <textarea
          rows={2}
          maxLength={1000}
          value={komentar}
          onChange={(e) => setKomentar(e.target.value)}
          placeholder={t("dk.komentarPopis")}
          className="mt-1 w-full min-w-0 rounded-app-sm border border-app-ramik bg-app-karta px-3 py-2 text-[15px]"
        />
      </label>
      {komentar.trim() !== ulozeny.trim() && (
        <button
          disabled={ukladam}
          onClick={() => void ulozKomentar()}
          className="min-h-[44px] w-full rounded-app-sm bg-app-zelena-plocha px-4 text-[15px] font-medium text-white disabled:opacity-50"
        >
          {t("dk.ulozit")}
        </button>
      )}
    </Card>
  );
}
