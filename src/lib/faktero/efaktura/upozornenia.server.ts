/*
  Upozornenia o žiadostiach Finančnej správy (PDS) e-mailom pre prevádzku.

  Bez nich sa o žiadosti nikto nedozvedel: 12. 10. 2026 si firma na Portáli FS
  vybrala Faktero, FS to šesťkrát skúsila, všetko skončilo 401 (chýbalo
  tajomstvo) a nikde po tom neostala stopa.

  Adresa: `EFAKTURA_UPOZORNENIA_EMAIL`, inak peppol@faktero.sk. Upozornenie
  nikdy nezhodí spracovanie žiadosti.
*/

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { escapeHtml } from "../ponuka-odpoved.server";

const adresa = () => process.env.EFAKTURA_UPOZORNENIA_EMAIL || "peppol@faktero.sk";
const web = () => (process.env.APP_PUBLIC_URL ?? "https://www.faktero.sk").replace(/\/+$/, "");

export async function upozorniPeppol(predmet: string, riadky: string[]): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  const odkaz = `${web()}/admin/efaktura`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: `Faktero eFaktúra <${process.env.RESEND_FROM_NOREPLY || "noreply@faktero.sk"}>`,
        to: [adresa()],
        subject: `eFaktúra: ${predmet}`,
        text: [...riadky, "", `Admin → eFaktúra: ${odkaz}`].join("\n"),
        html: `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#111;max-width:600px;line-height:1.5">
          ${riadky.map((r) => (r ? `<p style="margin:0 0 6px">${escapeHtml(r)}</p>` : "<br>")).join("")}
          <p style="margin-top:16px"><a href="${odkaz}">Admin → eFaktúra</a></p>
        </div>`,
      }),
    });
    if (!res.ok) console.warn("[efaktura-upozornenie] Resend", res.status);
    return res.ok;
  } catch (e) {
    console.warn("[efaktura-upozornenie]", String((e as Error)?.message ?? e));
    return false;
  }
}

type Firma = { nazov: string | null; dic: string; email?: string | null; telefon?: string | null };

const popisFirmy = (f: Firma) =>
  [
    `${f.nazov || "(bez názvu)"} — DIČ ${f.dic}`,
    f.email ? `e-mail: ${f.email}` : null,
    f.telefon ? `telefón: ${f.telefon}` : null,
  ]
    .filter(Boolean)
    .join(", ");

/** 1) Nové žiadosti FS. */
export function upozorniNoveZiadosti(firmy: Firma[]) {
  if (!firmy.length) return Promise.resolve(false);
  const predmet =
    firmy.length === 1
      ? `${firmy[0].nazov || `DIČ ${firmy[0].dic}`} si vybrala Faktero`
      : `${firmy.length} firmy si vybrali Faktero`;
  return upozorniPeppol(predmet, [
    "Na Portáli finančnej správy si Faktero vybrali ako poskytovateľa doručovacej služby:",
    "",
    ...firmy.map((f) => `• ${popisFirmy(f)}`),
    "",
    "Žiadosť je uložená a registrácia u ePoštáka sa spustila. O výsledku príde ďalší e-mail.",
  ]);
}

const POPIS_STAVU: Record<string, string> = {
  registrovana: "registrácia v Peppole je hotová",
  chyba: "registrácia zlyhala — skúsi sa znova v noci",
  zamietnuta: "registráciu zamietli — opakovanie nepomôže",
  na_kontrolu: "ePošták ju dal na ručnú kontrolu",
};

/** 2) Výsledok registrácie — len pri zmene stavu, nie pri každom pokuse. */
export function upozorniVysledokRegistracie(
  f: Firma & { stav: string; chyba?: string | null; pokusov?: number | null; maFirmu: boolean },
) {
  const popis = POPIS_STAVU[f.stav];
  if (!popis) return Promise.resolve(false);
  const riadky = [`${popisFirmy(f)}: ${popis}.`];
  if (f.chyba) riadky.push("", `Dôvod: ${f.chyba}`);
  if (f.stav === "chyba" && f.pokusov) riadky.push(`Pokus č. ${f.pokusov}.`);
  if (f.stav === "registrovana")
    riadky.push(
      "",
      f.maFirmu
        ? "Firma vo Fakteri existuje — eFaktúra sa jej zapla."
        : "Firma vo Fakteri účet nemá — dostala pozvánku na registráciu.",
    );
  return upozorniPeppol(`${f.nazov || `DIČ ${f.dic}`} — ${popis}`, riadky);
}

/*
  3) FS posiela niečo, čo Faktero odmieta. Na adresu sa môže dobiť ktokoľvek,
  preto sa upozorní len na telo, ktoré vyzerá ako žiadosť FS, a najviac raz za
  15 minút pre rovnaký dôvod — FS pri neúspechu opakuje.
*/
const naposledy = new Map<string, number>();
const ODSTUP_MS = 15 * 60 * 1000;

type Dovod = "bez_tajomstva" | "zly_podpis" | "zly_obsah" | "chyba_servera";

/**
 * Odmietnutú žiadosť zapíše (bez tokenu), aby ju bolo vidno v Admin → eFaktúra,
 * a ohlási ju e-mailom. Každý pokus sa zapíše, e-mail ide najviac raz za 15 minút.
 */
export async function zapisOdmietnutie(
  dovod: Dovod,
  detail: { firmy?: Firma[]; chyba?: string; ip?: string | null },
) {
  try {
    await (supabaseAdmin as any).from("efaktura_pds_odmietnute").insert({
      dovod,
      overene: dovod === "zly_obsah" || dovod === "chyba_servera",
      firmy: (detail.firmy ?? []).slice(0, 50).map((f) => ({
        nazov: f.nazov,
        dic: f.dic,
        email: f.email ?? null,
        telefon: f.telefon ?? null,
      })),
      chyba: detail.chyba?.slice(0, 500) ?? null,
      ip: detail.ip ?? null,
    });
  } catch (e) {
    console.warn("[efaktura-pds] zápis odmietnutia:", String((e as Error)?.message ?? e));
  }
  await upozorniOdmietnutie(dovod, detail);
}

function upozorniOdmietnutie(dovod: Dovod, detail: { firmy?: Firma[]; chyba?: string }) {
  const t = Date.now();
  if (t - (naposledy.get(dovod) ?? 0) < ODSTUP_MS) return Promise.resolve(false);
  naposledy.set(dovod, t);
  const vysvetlenie = {
    bez_tajomstva:
      "Na serveri chýba EFAKTURA_PDS_SECRET, preto Faktero nevie overiť podpis a žiadosť odmietlo (401).",
    zly_podpis:
      "Podpis X-PDS-Secret nesedí s EFAKTURA_PDS_SECRET (401). Buď FS zmenila verifikačný údaj, alebo to neposlala FS.",
    zly_obsah: "Podpis sedel, ale obsahu Faktero nerozumie (400).",
    chyba_servera: "Podpis sedel, ale pri zápise nastala chyba (500).",
  }[dovod];
  const riadky = [
    "Faktero odmietlo žiadosť Finančnej správy.",
    "",
    vysvetlenie,
    "FS to ešte niekoľko minút skúša znova — keď sa príčina odstráni hneď, žiadosť prejde.",
    "Každý pokus je zapísaný v Admin → eFaktúra (Odmietnuté žiadosti FS).",
  ];
  if (detail.chyba) riadky.push("", `Chyba: ${detail.chyba}`);
  if (detail.firmy?.length) {
    riadky.push(
      "",
      dovod === "zly_podpis" || dovod === "bez_tajomstva"
        ? "Firmy podľa tela žiadosti (neoverené):"
        : "Firmy v žiadosti:",
      ...detail.firmy.slice(0, 20).map((f) => `• ${popisFirmy(f)}`),
    );
  }
  riadky.push("", "Ďalšie odmietnutia z rovnakého dôvodu sa 15 minút neohlasujú.");
  return upozorniPeppol("Faktero odmietlo žiadosť FS", riadky);
}
