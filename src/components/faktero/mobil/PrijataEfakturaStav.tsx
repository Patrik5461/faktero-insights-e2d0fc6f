import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CloudOff, FileDown, FileSearch, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  STLPCE_PRIJATEJ_EFAKTURY,
  maChybyKontroly,
  nalezyNaZobrazenie,
  prijataEfakturaZVyberu,
  type PrijataEfakturaFaktury,
  type RiadokPrijatejEfaktury,
} from "@/lib/faktero/efaktura/prijata-efaktura-faktury";
import { usePreklad } from "@/lib/mobile/preklady/hook";
import type { Kluc } from "@/lib/mobile/preklady";
import { casEfaktury } from "./EfakturaStav";
import { Card } from "./ui";

/*
  „eFaktúra prijatá“ v appke — odznak v zozname prijatých faktúr a sekcia v
  detaile. Obdoba `EfakturaStav.tsx` pri vystavených; údaje skladá spoločná
  `lib/faktero/efaktura/prijata-efaktura-faktury.ts`.
*/

const KANAL: Record<string, Kluc> = {
  peppol: "efr.kanal.peppol",
  digitalny_postar: "efr.kanal.digitalnyPostar",
  email: "efr.kanal.email",
  manual: "efr.kanal.manual",
};

/** Popis odznaku — aj pre čítačku a `title`. */
export function klucOdznakuPrijatej(p: PrijataEfakturaFaktury): Kluc {
  return maChybyKontroly(p) ? "efr.odznakChyby" : "efr.odznak";
}

/**
 * Malý odznak pri čísle faktúry — rovnaký tvar ako pri odoslanej eFaktúre
 * (len ikona, 18 px; text je v popise). Bez eFaktúry sa nekreslí nič.
 */
export function OdznakPrijatejEfaktury({
  efaktura,
}: {
  efaktura: PrijataEfakturaFaktury | null | undefined;
}) {
  const { t } = usePreklad();
  if (!efaktura) return null;
  const cervena = maChybyKontroly(efaktura);
  const popis = t(klucOdznakuPrijatej(efaktura));
  const Ikona = cervena ? AlertTriangle : FileDown;
  return (
    <span
      data-efaktura-prijata={cervena ? "chyby" : "ok"}
      title={popis}
      aria-label={popis}
      role="img"
      className={`inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full ${
        cervena ? "bg-app-chyba-jemna text-app-chyba" : "bg-app-zelena-jemna text-app-zelena"
      }`}
    >
      <Ikona className="h-3 w-3" aria-hidden="true" />
    </span>
  );
}

type Nalez = { kod: string; chyba: boolean; text: string };

/**
 * Sekcia „eFaktúra prijatá“ v detaile prijatej faktúry: od koho a akým
 * kanálom prišla, kedy prišla a kedy sa zaevidovala, výsledok automatickej
 * kontroly a odkaz na náhľad pôvodnej eFaktúry.
 *
 * Pri otvorení sa údaje dopýtajú znova (jeden dotaz, aj s nálezmi kontroly —
 * tie zoznam kvôli veľkosti nenesie). Bez signálu ostane to, čo prišlo so
 * zoznamom, a pod tým poznámka, že ide o posledný známy stav.
 */
export function SekciaPrijatejEfaktury({
  fakturaId,
  efaktura: zoZoznamu,
  zPamateKedy,
  onNahlad,
}: {
  fakturaId: string;
  efaktura: PrijataEfakturaFaktury | null | undefined;
  /** Zoznam prišiel z pamäte telefónu (čas uloženia), nie zo servera. */
  zPamateKedy?: number | null;
  /** Otvorí náhľad pôvodnej eFaktúry (obrazovka Prijaté eFaktúry). */
  onNahlad?: (r: RiadokPrijatejEfaktury) => void;
}) {
  const { t, jazyk, locale: loc } = usePreklad();
  const [info, setInfo] = useState<PrijataEfakturaFaktury | null>(zoZoznamu ?? null);
  const [nalezy, setNalezy] = useState<Nalez[]>([]);
  const [nedopytany, setNedopytany] = useState(false);
  const [pripojenie, setPripojenie] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const naPripojenie = () => setPripojenie((n) => n + 1);
    window.addEventListener("online", naPripojenie);
    return () => window.removeEventListener("online", naPripojenie);
  }, []);

  useEffect(() => {
    let zrusene = false;
    /* Bez signálu sa nepýtať — postgrest skúša znova a poznámka by naskočila
       až po pár sekundách (ako pri vystavených). */
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setNedopytany(true);
      return;
    }
    supabase
      .from("efaktura_received_documents")
      .select(`${STLPCE_PRIJATEJ_EFAKTURY}, nalezy:kontrola_vysledok->nalezy`)
      .eq("matched_supplier_invoice_id", fakturaId)
      .then(
        (r) => r,
        (e) => ({ data: null, error: e }),
      )
      .then(({ data, error }) => {
        if (zrusene) return;
        if (error || !data) {
          setNedopytany(true);
          return;
        }
        setNedopytany(false);
        const riadky = data as unknown as (RiadokPrijatejEfaktury & { nalezy?: unknown })[];
        // Riadok eFaktúry mohol medzičasom zmiznúť — faktúra z nej aj tak vznikla.
        const cerstvy = prijataEfakturaZVyberu(riadky, zoZoznamu ? "efaktura" : null);
        setInfo(cerstvy);
        const posledny = cerstvy?.efaktura
          ? riadky.find((r) => r.id === cerstvy.efaktura?.id)
          : null;
        setNalezy(nalezyNaZobrazenie(posledny?.nalezy));
      });
    return () => {
      zrusene = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fakturaId, pripojenie]);

  if (!info) return null;

  const offline =
    nedopytany &&
    (!!zPamateKedy || (typeof navigator !== "undefined" && navigator.onLine === false));
  const cervena = maChybyKontroly(info);
  const kanal = info.kanal ? (KANAL[info.kanal] ?? null) : null;
  const k = info.kontrola;

  return (
    <Card className="p-4">
      <section aria-label={t("efr.nadpis")} data-efaktura-prijata-sekcia={cervena ? "chyby" : "ok"}>
        <div className="text-[13px] font-semibold text-app-text-2">{t("efr.nadpis")}</div>
        <div className="mt-1 flex items-center gap-2 text-[15px] font-semibold text-app-zelena">
          <Inbox className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t("efr.odznak")}
        </div>

        <div className="mt-3 space-y-1.5 text-[13px]">
          {info.odosielatel && <Riadok label={t("efr.od")} value={info.odosielatel} />}
          {info.peppolId && <Riadok label={t("efr.peppolId")} value={info.peppolId} />}
          {info.kanal && <Riadok label={t("efr.kanal")} value={kanal ? t(kanal) : info.kanal} />}
          {info.prisla && <Riadok label={t("efr.prisla")} value={casEfaktury(info.prisla, loc)} />}
          {info.zaevidovana && (
            <Riadok label={t("efr.zaevidovana")} value={casEfaktury(info.zaevidovana, loc)} />
          )}
        </div>

        {!info.efaktura ? (
          <p className="mt-3 text-[13px] text-app-text-2">{t("efr.bezRiadku")}</p>
        ) : k == null ? (
          <p className="mt-3 text-[13px] text-app-text-2">{t("efr.kontrolaNebezala")}</p>
        ) : k.chyby > 0 ? (
          <div
            className="mt-3 rounded-app-sm border border-app-chyba/40 bg-app-chyba-jemna p-3"
            data-efaktura-prijata-kontrola="chyby"
          >
            <p className="flex items-start gap-2 text-[13px] font-medium text-app-text">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-app-chyba"
                aria-hidden="true"
              />
              {t("efr.kontrolaChyby", { chyby: k.chyby, varovania: k.varovania })}
            </p>
            <Nalezy nalezy={nalezy} jazyk={jazyk} />
            <p className="mt-2 text-[12px] text-app-text-2">{t("efr.kontrolaChybyRada")}</p>
          </div>
        ) : (
          <div className="mt-3" data-efaktura-prijata-kontrola={k.varovania ? "varovania" : "ok"}>
            <p className="flex items-center gap-2 text-[13px] text-app-text">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-app-zelena" aria-hidden="true" />
              {k.varovania
                ? t("efr.kontrolaVarovania", { varovania: k.varovania })
                : t("efr.kontrolaOk")}
            </p>
            {k.varovania > 0 && <Nalezy nalezy={nalezy} jazyk={jazyk} />}
          </div>
        )}

        {info.efaktura && onNahlad && (
          <button
            type="button"
            onClick={() => info.efaktura && onNahlad(info.efaktura)}
            className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-app-sm border border-app-ramik bg-app-karta px-4 text-[14px] font-medium active:bg-app-pozadie"
          >
            <FileSearch className="h-4 w-4" aria-hidden="true" />
            {t("efr.zobrazitPovodnu")}
          </button>
        )}

        {offline && (
          <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-snug text-app-text-2">
            <CloudOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {zPamateKedy
              ? t("efr.zPamate", { kedy: casEfaktury(new Date(zPamateKedy).toISOString(), loc) })
              : t("efr.bezPripojenia")}
          </p>
        )}
      </section>
    </Card>
  );
}

/**
 * Nálezy kontroly — kód pravidla vždy, popis len po slovensky a česky
 * (popisy pravidiel sú slovenské šablóny; v iných jazykoch by trčali).
 */
function Nalezy({ nalezy, jazyk }: { nalezy: Nalez[]; jazyk: string }) {
  if (!nalezy.length) return null;
  const sPopisom = jazyk === "sk" || jazyk === "cs";
  return (
    <ul className="mt-2 space-y-1 text-[12px] leading-snug text-app-text">
      {nalezy.map((n, i) => (
        <li key={`${n.kod}-${i}`} className="break-words">
          <span className={`font-mono ${n.chyba ? "text-app-chyba" : "text-app-text-2"}`}>
            {n.kod}
          </span>
          {sPopisom && n.text ? ` — ${n.text}` : ""}
        </li>
      ))}
    </ul>
  );
}

function Riadok({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="shrink-0 text-app-text-2">{label}</span>
      <span className="min-w-0 break-words text-right font-medium tabular-nums">{value}</span>
    </div>
  );
}
