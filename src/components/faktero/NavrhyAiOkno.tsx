import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { navrhyAiHromadneFn } from "@/lib/faktero/ai-predkontacia.functions";
import { zauctujPrijateFn } from "@/lib/faktero/zauctovanie.functions";
import { MAX_HROMADNE, type PoleNavrhu, type VysledokNavrhu } from "@/lib/faktero/ai-predkontacia";
import { KATEGORIE_VYDAVKOV } from "@/lib/mobile/kategorie-vydavkov";
import { formatujMenu } from "@/lib/faktero/mena";
import { lokalJazyka } from "@/lib/i18n/jazyk";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { useT } from "@/lib/i18n/useT";
import { NavrhBezCiselnika, StitokNavrhu } from "./NavrhAi";

type Riadok = {
  id: string;
  cislo: string | null;
  dodavatel: string | null;
  suma: number | null;
  mena: string | null;
} & VysledokNavrhu;

const POPIS_STAVU: Record<string, string> = {
  netreba: "už je vyplnená alebo zaúčtovaná",
  prazdny: "AI nič istého nenavrhla",
  bez_ciselnika: "chýba číselník predkontácií",
  nedostupny: "AI teraz neodpovedá — skúste neskôr",
  nepodporovane: "pre túto krajinu firmy sa návrh nerobí",
  bez_prava: "bez oprávnenia",
};

const maNavrh = (r: Riadok) =>
  r.stav === "navrh" &&
  Object.values(r.polia).some((h) => h && (h.zdroj === "ai" || h.zdroj === "navyk"));

/**
 * „Navrhnúť AI pre vybrané" v zozname prijatých faktúr. Návrhy sa počítajú
 * po dávkach (najviac 50 na volanie, server vráti, čo nestihol) a len sa
 * ukážu — zaúčtuje ich až človek tlačidlom, po jednej faktúre, aby si
 * učenie z opráv zapamätalo voľbu pri každom dodávateľovi.
 */
export function NavrhyAiOkno({
  companyId,
  ids,
  onClose,
  onHotovo,
}: {
  companyId: string;
  ids: string[];
  onClose: () => void;
  onHotovo: () => void;
}) {
  const { t, jazyk } = useT();
  const loc = lokalJazyka(jazyk);
  useZatvorNaEscape(onClose);
  const navrhni = useServerFn(navrhyAiHromadneFn);
  const zauctuj = useServerFn(zauctujPrijateFn);
  const [riadky, setRiadky] = useState<Riadok[]>([]);
  const [oznacene, setOznacene] = useState<Set<string>>(new Set());
  const [pocita, setPocita] = useState(true);
  const [busy, setBusy] = useState(false);
  const zrusene = useRef(false);

  useEffect(() => {
    zrusene.current = false;
    void (async () => {
      const fronta = [...ids];
      while (fronta.length && !zrusene.current) {
        let davka = fronta.splice(0, MAX_HROMADNE);
        // Server vráti, čo do svojho rozpočtu času nestihol — dopýtame sa.
        for (let pokus = 0; davka.length && pokus < 8 && !zrusene.current; pokus++) {
          try {
            const r = await navrhni({ data: { company_id: companyId, ids: davka } });
            const nove = r.vysledky as Riadok[];
            setRiadky((p) => [...p, ...nove]);
            setOznacene((p) => {
              const n = new Set(p);
              for (const x of nove) if (maNavrh(x)) n.add(x.id);
              return n;
            });
            if (r.zostava.length >= davka.length) break;
            davka = r.zostava;
          } catch (e: any) {
            toast.error(t(e?.message ?? "Nepodarilo sa"));
            zrusene.current = true;
          }
        }
      }
      setPocita(false);
    })();
    return () => {
      zrusene.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nazovKategorie = (kod: string) => {
    const k = KATEGORIE_VYDAVKOV.find((x) => x.kod === kod);
    return k ? t(k.nazov) : kod;
  };
  const bunka = (r: Riadok, pole: PoleNavrhu) => {
    const h = r.polia[pole];
    if (!h || (h.zdroj !== "ai" && h.zdroj !== "navyk"))
      return <span className="text-muted-foreground">—</span>;
    return (
      <span className="whitespace-nowrap">
        <span className="font-mono">
          {pole === "kategoria" ? nazovKategorie(h.hodnota) : h.hodnota}
        </span>
        <StitokNavrhu zdroj={h.zdroj} />
      </span>
    );
  };

  async function potvrd(lenUlozit: boolean) {
    const vybrane = riadky.filter((r) => oznacene.has(r.id) && maNavrh(r));
    if (!vybrane.length) return;
    setBusy(true);
    let ok = 0;
    const preskocene: string[] = [];
    try {
      // Po jednej — zaúčtovanie jednej faktúry si učenie zapamätá pri dodávateľovi.
      for (const r of vybrane) {
        const kod = (p: PoleNavrhu) => {
          const h = r.polia[p];
          return h && (h.zdroj === "ai" || h.zdroj === "navyk") ? h.hodnota : undefined;
        };
        try {
          const v = await zauctuj({
            data: {
              company_id: companyId,
              ids: [r.id],
              predkontacia: kod("predkontacia"),
              clenenie: kod("clenenie"),
              kv: kod("kv"),
              kategoria: kod("kategoria"),
              lenUlozit,
            },
          });
          ok += lenUlozit ? v.ulozenych : v.zauctovanych;
          preskocene.push(...v.preskocene);
        } catch (e: any) {
          preskocene.push(`${r.cislo ?? ""}: ${t(e?.message ?? "Nepodarilo sa")}`);
        }
      }
      if (ok)
        toast.success(
          lenUlozit
            ? t("Kódy uložené na {n} faktúrach", { n: ok })
            : t("Zaúčtovaných {n} faktúr", { n: ok }),
        );
      if (preskocene.length)
        toast.error(t("Vynechané: {zoznam}", { zoznam: preskocene.join(" · ") }));
      onHotovo();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const sNavrhom = riadky.filter(maNavrh);
  const bezCiselnika = riadky.some((r) => r.stav === "bez_ciselnika");
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Návrhy AI pre vybrané faktúry")}
        className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border border-border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Sparkles className="h-5 w-5 text-violet-600" /> {t("Návrhy AI pre vybrané faktúry")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(
            "AI vyberá len z vášho číselníka predkontácií a z kódov, ktoré už používate. Pravidlo účtovania a naučené voľby dodávateľa majú prednosť. Nič sa nezaúčtuje, kým to nepotvrdíte.",
          )}
        </p>
        {pocita && (
          <p className="mt-3 flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("Navrhujem… {hotove} z {spolu}", { hotove: riadky.length, spolu: ids.length })}
          </p>
        )}
        <div className="mt-3 min-h-0 flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-8 py-1.5" />
                <th className="py-1.5 pr-2">{t("Faktúra")}</th>
                <th className="py-1.5 pr-2 text-right">{t("Suma")}</th>
                <th className="py-1.5 pr-2">{t("Predkontácia")}</th>
                <th className="py-1.5 pr-2">{t("Členenie DPH")}</th>
                <th className="py-1.5 pr-2">{t("KV")}</th>
                <th className="py-1.5 pr-2">{t("Kategória")}</th>
              </tr>
            </thead>
            <tbody>
              {riadky.map((r) => (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="py-1.5">
                    <input
                      type="checkbox"
                      aria-label={t("Označiť")}
                      disabled={!maNavrh(r)}
                      checked={oznacene.has(r.id)}
                      onChange={(e) =>
                        setOznacene((p) => {
                          const n = new Set(p);
                          if (e.target.checked) n.add(r.id);
                          else n.delete(r.id);
                          return n;
                        })
                      }
                    />
                  </td>
                  <td className="min-w-0 py-1.5 pr-2">
                    <div className="font-medium">{r.cislo || "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.dodavatel || "—"}</div>
                    {r.dovod && (
                      <div className="text-xs text-violet-700 dark:text-violet-300">{r.dovod}</div>
                    )}
                    {!maNavrh(r) && (
                      <div className="text-xs text-muted-foreground">
                        {t(POPIS_STAVU[r.stav] ?? r.stav)}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-1.5 pr-2 text-right tabular-nums">
                    {r.suma === null ? "—" : formatujMenu(r.suma, r.mena ?? "EUR", loc)}
                  </td>
                  <td className="py-1.5 pr-2">{bunka(r, "predkontacia")}</td>
                  <td className="py-1.5 pr-2">{bunka(r, "clenenie")}</td>
                  <td className="py-1.5 pr-2">{bunka(r, "kv")}</td>
                  <td className="py-1.5 pr-2">{bunka(r, "kategoria")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {bezCiselnika && <NavrhBezCiselnika />}
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-xs text-muted-foreground">
            {t("S návrhom: {n} · označené: {m}", { n: sNavrhom.length, m: oznacene.size })}
          </span>
          <button
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
          >
            {t("Zrušiť")}
          </button>
          <button
            onClick={() => void potvrd(true)}
            disabled={busy || pocita || !oznacene.size}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
          >
            {t("Len uložiť kódy")}
          </button>
          <button
            onClick={() => void potvrd(false)}
            disabled={busy || pocita || !oznacene.size}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("Zaúčtovať označené")}
          </button>
        </div>
      </div>
    </div>
  );
}
