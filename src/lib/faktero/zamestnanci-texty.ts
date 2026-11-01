/**
 * Preložiteľný text pripomienky zamestnanca (Z-09). Čistá funkcia — volá ju
 * web cez `t()` aj denný e-mail českej firme cez `preloz("cs", …)`.
 */
import { datumSk, nazovZmluvy, type DruhPripomienky, type Pripomienka } from "./zamestnanci";

const NADPIS_PRIPOMIENKY: Record<DruhPripomienky, string> = {
  sp_prihlaska: "Prihláška do Sociálnej poisťovne",
  zp_prihlaska: "Oznámenie zdravotnej poisťovni",
  sp_odhlaska: "Odhlásenie zamestnanca z ČSSZ",
  zp_odhlaska: "Skončenie oznámiť zdravotnej poisťovni",
  lekarska_prehliadka: "Lekárska prehliadka",
  bozp: "Školenie BOZP",
  skusobna_doba: "Koniec skúšobnej doby",
  koniec_zmluvy: "Koniec zmluvy na dobu určitú",
};

/** Česká firma: iné úrady (ČSSZ, JMHZ) — iné nadpisy. */
const NADPIS_PRIPOMIENKY_CZ: Partial<Record<DruhPripomienky, string>> = {
  sp_prihlaska: "Registrácia zamestnanca na ČSSZ",
};

export type Prekladac = (text: string, p?: Record<string, string | number>) => string;

export function textPripomienky(p: Pripomienka, t: Prekladac): { nadpis: string; text: string } {
  const cz = p.krajina === "CZ";
  const nadpis = t(
    (cz ? NADPIS_PRIPOMIENKY_CZ[p.druh] : undefined) ?? NADPIS_PRIPOMIENKY[p.druh] ?? p.nadpis,
  );
  let vec: string;
  switch (p.druh) {
    case "sp_prihlaska":
      vec = cz
        ? t("{meno}: prihlásiť na ČSSZ najneskôr pred nástupom {datum}", {
            meno: p.meno,
            datum: datumSk(p.nastup ?? p.termin),
          })
        : t("{meno}: prihlásiť pred nástupom {datum}", {
            meno: p.meno,
            datum: datumSk(p.nastup ?? p.termin),
          });
      break;
    case "zp_prihlaska":
      vec = !cz
        ? t("{meno}: oznámiť do 8 dní od nástupu", { meno: p.meno })
        : p.lenDohoda
          ? t("{meno}: pri dohode oznámiť zdravotnej poisťovni do 20. dňa nasledujúceho mesiaca", {
              meno: p.meno,
            })
          : t("{meno}: oznámiť nástup zdravotnej poisťovni do 8 dní", { meno: p.meno });
      break;
    case "sp_odhlaska":
      vec = t("{meno}: odhlásiť z ČSSZ do 8 dní od skončenia {datum}", {
        meno: p.meno,
        datum: datumSk(p.koniec ?? p.termin),
      });
      break;
    case "zp_odhlaska":
      vec = p.lenDohoda
        ? t(
            "{meno}: pri dohode oznámiť skončenie zdravotnej poisťovni do 20. dňa nasledujúceho mesiaca",
            { meno: p.meno },
          )
        : t("{meno}: oznámiť skončenie zdravotnej poisťovni do 8 dní", { meno: p.meno });
      break;
    case "lekarska_prehliadka":
      vec = t("{meno}: preventívna prehliadka", { meno: p.meno });
      break;
    case "bozp":
      vec = t("{meno}: školenie bezpečnosti a ochrany zdravia", { meno: p.meno });
      break;
    default:
      vec = p.zmluva ? `${p.meno}: ${t(nazovZmluvy(p.zmluva, cz ? "CZ" : "SK"))}` : p.meno;
  }
  const kedy =
    p.zostava < 0
      ? t("termín {datum} už uplynul", { datum: datumSk(p.termin) })
      : p.zostava === 0
        ? t("termín je dnes")
        : t("do {datum}", { datum: datumSk(p.termin) });
  return { nadpis, text: `${vec} — ${kedy}` };
}
