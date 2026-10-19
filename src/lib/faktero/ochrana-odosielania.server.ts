/*
  Strážca odosielania e-mailov v mene firmy.

  Volá sa pred KAŽDÝM mailom, ktorý firma posiela na ľubovoľnú adresu —
  `posliMailFirmy` (faktúra, dobropis, ponuka, upomienka, samofaktúra, podklady
  účtovníkovi, predĺženie splatnosti) ho volá sám, ostatné cesty (žiadosť
  o schválenie faktúry, skúška šablóny, pozvánka do firmy) priamo. Verejné API
  `/api/v1/invoices/:id/send` aj mobilná appka (server-most → sendInvoiceEmailFn)
  idú cez `sendInvoiceEmail` → `posliMailFirmy`, takže sú chránené tiež.

  Dôvod: 17. 10. 2026 sedem falošných účtov (jednorazové e-maily, cudzie IČO)
  rozposlalo cez odoslanie faktúry ~516 phishingových mailov na ~350 adries.

  Čo strážca robí (v tomto poradí):
    1. firma s pozastaveným odosielaním → odmietne všetko,
    2. strop adresátov na jeden e-mail,
    3. kontrola obsahu (ochrana-obsahu.ts) — predmet, vlastná správa, názov,
    4. pod zámkom firmy v DB (odosielanie_rezervuj): strop rôznych adresátov
       za 24 h, strop adresátov jedného dokladu za 24 h a hodinový prah, nad
       ktorým sa firma sama pozastaví.
  Každý zastavený pokus sa zapíše do `odosielanie_zablokovane`; pri ≥ 3 za
  hodinu sa firma pozastaví a admin dostane e-mail.

  Ak strážca nevie overiť (napr. DB neodpovie), mail NEODÍDE — radšej
  neodoslaná faktúra, ktorú človek pošle znova, než ďalší phishing.
*/
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { popisNalezov, skontrolujObsah, type Nalez } from "./ochrana-obsahu";

/*
  Stropy. Zdôvodnenie (dáta z invoice_email_logs, quote_email_logs
  a invoice_reminders za 90 dní pred 17. 10. 2026, bez 7 útočných firiem):
  legitímna firma poslala najviac 3 rôznym adresátom za 24 h, najviac
  4 e-maily za hodinu a jeden doklad najviac 2 adresátom. Útočníci 106–125
  adresátov za deň, 186 za hodinu, 105 na jednu faktúru.

  - Nová firma (prvých 7 dní): 10 adresátov denne a 3 na jeden mail/doklad
    stačí na rozbeh (prví odberatelia, kópia účtovníčke), útok s ním stratí
    zmysel (namiesto 500 mailov 10).
  - Staršia firma: 20 adresátov na jeden mail/doklad (aj veľký odberateľ
    s viacerými kontaktmi) a 200 za deň — to je mesačná fakturácia
    stredne veľkej firmy za jeden deň, 50× viac ako dnešné maximum.
  - Hodina: nad 30 adresátov sa firma pozastaví (overená nad 300) — ani
    hromadné odoslanie zo zoznamu faktúr dnes nepresiahlo 4 za hodinu.
*/
export const STROPY = {
  /** Firma (alebo účet odosielateľa) mladšia ako toľko dní je „nová". */
  NOVA_DNI: 7,
  NOVA_NA_MAIL: 3,
  NOVA_ZA_DEN: 10,
  NA_MAIL: 20,
  ZA_DEN: 200,
  ZA_HODINU: 30,
  ZA_HODINU_OVERENA: 300,
  /** Toľko zastavených pokusov za hodinu → pozastavenie. */
  BLOKOV_ZA_HODINU: 3,
} as const;

export const ADRESA_PODPORY = "podpora@faktero.sk";

/* Hlášky pre človeka — kľúče prekladu v src/lib/i18n/de/ochrana-odosielania.ts. */
export const HLASKY = {
  pozastavene: `Odosielanie e-mailov je pre túto firmu dočasne pozastavené. Ozvite sa nám na ${ADRESA_PODPORY}.`,
  podvod: `E-mail sa nepodarilo odoslať, lebo obsahuje odkaz alebo text, ktorý vyzerá ako podvod. Ak ide o omyl, napíšte nám na ${ADRESA_PODPORY}.`,
  novaDen: `Nová firma môže prvých ${STROPY.NOVA_DNI} dní posielať e-maily najviac ${STROPY.NOVA_ZA_DEN} adresátom denne. Ak potrebujete viac, napíšte nám na ${ADRESA_PODPORY}.`,
  novaMail: `Nová firma môže prvých ${STROPY.NOVA_DNI} dní poslať jeden e-mail či doklad najviac ${STROPY.NOVA_NA_MAIL} adresátom. Ak potrebujete viac, napíšte nám na ${ADRESA_PODPORY}.`,
  den: `Firma môže posielať e-maily najviac ${STROPY.ZA_DEN} adresátom za 24 hodín. Ak potrebujete viac, napíšte nám na ${ADRESA_PODPORY}.`,
  mail: `Jeden e-mail či doklad sa dá poslať najviac ${STROPY.NA_MAIL} adresátom. Ak potrebujete viac, napíšte nám na ${ADRESA_PODPORY}.`,
  nedostupne: `Odosielanie e-mailov je teraz nedostupné. Skúste to o chvíľu znova.`,
} as const;

export type DruhMailu =
  | "faktura"
  | "ponuka"
  | "upomienka"
  | "samofaktura"
  | "podklady"
  | "splatnost"
  | "schvalenie"
  | "test_sablony"
  | "pozvanka";

/** Mail neodišiel kvôli strážcovi — správa je určená človeku. */
export class OdosielanieZastavene extends Error {
  constructor(
    message: string,
    public dovod: string,
  ) {
    super(message);
    this.name = "OdosielanieZastavene";
  }
}

export function jeZastavene(e: unknown): e is OdosielanieZastavene {
  return e instanceof OdosielanieZastavene || (e as any)?.name === "OdosielanieZastavene";
}

export type KontextOdoslania = {
  companyId: string;
  /** Kto odosiela; `null` pre cron a verejné API (vtedy sa berie zakladateľ firmy). */
  userId: string | null;
  druh: DruhMailu;
  /** Faktúra / ponuka / samofaktúra — strop adresátov na doklad. */
  dokladId?: string | null;
  /** Všetci adresáti (to + cc + bcc). */
  adresati: string[];
  predmet: string;
  /** Vlastný text správy (bez podpisu a tlačidiel, ktoré pridáva Faktero). */
  sprava?: string | null;
};

export type Povolenie = {
  /** Zavolať po odoslaní; pri `false` sa adresáti do stropu nerátajú. */
  hotovo: (odoslane: boolean) => Promise<void>;
};

type Firma = {
  id: string;
  name: string | null;
  ico: string | null;
  email: string | null;
  email_sender_name: string | null;
  website: string | null;
  created_at: string | null;
  created_by: string | null;
  odosielanie_overene: boolean | null;
  odosielanie_pozastavene: boolean | null;
};

const DEN_MS = 86_400_000;

function vekDni(iso: string | null | undefined, teraz: number): number | null {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? Math.max(0, (teraz - t) / DEN_MS) : null;
}

async function vekUctu(
  userId: string | null,
): Promise<{ vek: number | null; email: string | null }> {
  if (!userId) return { vek: null, email: null };
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    return {
      vek: vekDni(data?.user?.created_at ?? null, Date.now()),
      email: data?.user?.email ?? null,
    };
  } catch {
    return { vek: null, email: null };
  }
}

/** Stropy podľa veku a overenia firmy — čistá funkcia (testy). */
export function stropyFirmy(v: { vekDni: number; overena: boolean }) {
  const nova = v.vekDni < STROPY.NOVA_DNI && !v.overena;
  return {
    nova,
    naMail: nova ? STROPY.NOVA_NA_MAIL : STROPY.NA_MAIL,
    zaDen: nova ? STROPY.NOVA_ZA_DEN : STROPY.ZA_DEN,
    zaHodinu: v.overena ? STROPY.ZA_HODINU_OVERENA : STROPY.ZA_HODINU,
  };
}

/** Zoznam adresátov: malými písmenami, bez prázdnych a duplicít. */
export function upravAdresatov(adresati: string[]): string[] {
  return [
    ...new Set(
      adresati
        .map((a) =>
          String(a ?? "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    ),
  ];
}

function ukazka(k: KontextOdoslania): string {
  return `${k.predmet ?? ""}\n\n${String(k.sprava ?? "")}`.slice(0, 600);
}

/**
 * Overí, či firma smie poslať tento e-mail. Keď nie, vyhodí
 * `OdosielanieZastavene` so zrozumiteľnou hláškou. Keď áno, vráti
 * `hotovo`, ktoré treba zavolať po odoslaní.
 */
export async function strazOdoslanie(k: KontextOdoslania): Promise<Povolenie> {
  const adresati = upravAdresatov(k.adresati);
  const { data: firmaData, error } = await supabaseAdmin
    .from("companies")
    .select(
      "id, name, ico, email, email_sender_name, website, created_at, created_by, odosielanie_overene, odosielanie_pozastavene",
    )
    .eq("id", k.companyId)
    .maybeSingle();
  if (error || !firmaData) {
    console.error("[ochrana-odosielania] firma", k.companyId, error?.message);
    throw new OdosielanieZastavene(HLASKY.nedostupne, "nedostupne");
  }
  const firma = firmaData as unknown as Firma;
  if (firma.odosielanie_pozastavene) {
    throw new OdosielanieZastavene(HLASKY.pozastavene, "pozastavene");
  }

  const teraz = Date.now();
  const ucet = await vekUctu(k.userId ?? firma.created_by);
  const vekFirmy = vekDni(firma.created_at, teraz) ?? 0;
  // Rozhoduje mladší z dvoch: nový účet si môže „požičať" staršiu firmu.
  const vek = Math.min(vekFirmy, ucet.vek ?? vekFirmy);
  const overena = !!firma.odosielanie_overene;
  const s = stropyFirmy({ vekDni: vek, overena });

  const zapisBlok = async (dovod: string, detail: string, lenVystraha = false) => {
    const { data, error: e } = await supabaseAdmin.rpc("odosielanie_zapis_blok", {
      p_company: k.companyId,
      p_user: k.userId,
      p_druh: k.druh,
      p_dovod: dovod,
      p_detail: detail,
      p_predmet: k.predmet ?? "",
      p_pocet: adresati.length,
      p_ukazka: ukazka(k),
      p_len_vystraha: lenVystraha,
      p_prah: STROPY.BLOKOV_ZA_HODINU,
    });
    if (e) console.error("[ochrana-odosielania] zápis bloku", e.message);
    if ((data as any)?.prave_pozastavene) {
      await upozorniAdmina(firma, ucet.email, {
        dovod: `${(data as any)?.pocet ?? STROPY.BLOKOV_ZA_HODINU} zastavených pokusov za hodinu (posledný: ${dovod})`,
        pocet: adresati.length,
        predmet: k.predmet,
        detail,
      });
    }
  };

  if (adresati.length > s.naMail) {
    await zapisBlok(
      "strop_mail",
      `${adresati.length} adresátov v jednom e-maile (strop ${s.naMail})`,
    );
    throw new OdosielanieZastavene(s.nova ? HLASKY.novaMail : HLASKY.mail, "strop_mail");
  }

  const obsah = skontrolujObsah({
    predmet: k.predmet,
    sprava: k.sprava,
    nazovFirmy: [firma.name, firma.email_sender_name],
    vekDni: vek,
    overena,
    webFirmy: firma.website,
  });
  if (obsah.blokuj.length) {
    await zapisBlok(obsah.blokuj[0].kod, popisNalezov(obsah.blokuj));
    throw new OdosielanieZastavene(HLASKY.podvod, obsah.blokuj[0].kod);
  }
  if (obsah.vystrahy.length) {
    await zapisBlok(obsah.vystrahy[0].kod, popisNalezov(obsah.vystrahy), true);
  }

  const { data: rez, error: rezErr } = await supabaseAdmin.rpc("odosielanie_rezervuj", {
    p_company: k.companyId,
    p_user: k.userId,
    p_druh: k.druh,
    p_doklad: k.dokladId ?? null,
    p_adresati: adresati,
    p_predmet: k.predmet ?? "",
    p_max_den: s.zaDen,
    p_max_doklad: s.naMail,
    p_max_hodina: s.zaHodinu,
  });
  if (rezErr || !rez) {
    console.error("[ochrana-odosielania] rezervácia", rezErr?.message);
    throw new OdosielanieZastavene(HLASKY.nedostupne, "nedostupne");
  }
  const r = rez as {
    ok: boolean;
    id?: string;
    dovod?: string;
    pocet?: number;
    prave_pozastavene?: boolean;
  };
  if (!r.ok) {
    switch (r.dovod) {
      case "pozastavene":
        throw new OdosielanieZastavene(HLASKY.pozastavene, "pozastavene");
      case "strop_den":
        await zapisBlok("strop_den", `${r.pocet} rôznych adresátov za 24 h (strop ${s.zaDen})`);
        throw new OdosielanieZastavene(s.nova ? HLASKY.novaDen : HLASKY.den, "strop_den");
      case "strop_doklad":
        await zapisBlok(
          "strop_doklad",
          `${r.pocet} adresátov jedného dokladu za 24 h (strop ${s.naMail})`,
        );
        throw new OdosielanieZastavene(s.nova ? HLASKY.novaMail : HLASKY.mail, "strop_doklad");
      case "hodina": {
        const detail = `${r.pocet} adresátov za hodinu (prah ${s.zaHodinu})`;
        await zapisBlok("hodina", detail);
        if (r.prave_pozastavene) {
          await upozorniAdmina(firma, ucet.email, {
            dovod: detail,
            pocet: r.pocet ?? 0,
            predmet: k.predmet,
            detail,
          });
        }
        throw new OdosielanieZastavene(HLASKY.pozastavene, "hodina");
      }
      default:
        throw new OdosielanieZastavene(HLASKY.nedostupne, String(r.dovod ?? "nedostupne"));
    }
  }

  const id = r.id!;
  return {
    hotovo: async (odoslane: boolean) => {
      const { error: e } = await supabaseAdmin
        .from("odosielanie_mailov")
        .update({ stav: odoslane ? "odoslane" : "zlyhalo" })
        .eq("id", id);
      if (e) console.error("[ochrana-odosielania] dokončenie", e.message);
    },
  };
}

/** E-mail adminovi platformy — rovnaký kanál ako strážca výpadkov (Resend). */
async function upozorniAdmina(
  firma: Firma,
  emailUctu: string | null,
  o: { dovod: string; pocet: number; predmet: string | null | undefined; detail: string },
) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const komu = process.env.ADMIN_ALERT_EMAIL || "info@tobify.sk";
  const web = (process.env.APP_PUBLIC_URL ?? "https://www.faktero.sk").replace(/\/+$/, "");
  const text = [
    "Strážca odosielania pozastavil firme odosielanie e-mailov.",
    "",
    `Firma: ${firma.name ?? "—"}`,
    `IČO: ${firma.ico ?? "—"}`,
    `E-mail účtu: ${emailUctu ?? "—"}`,
    `Firma vznikla: ${firma.created_at ?? "—"}`,
    `Dôvod: ${o.dovod}`,
    `Adresátov v poslednom pokuse: ${o.pocet}`,
    `Predmet: ${String(o.predmet ?? "").slice(0, 200)}`,
    `Detail: ${o.detail.slice(0, 500)}`,
    "",
    `Admin: ${web}/admin/odosielanie`,
    `Firma: ${web}/admin/companies/${firma.id}`,
  ].join("\n");
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: `Faktero <${process.env.RESEND_FROM_NOREPLY || "noreply@faktero.sk"}>`,
        to: [komu],
        subject: `Pozastavené odosielanie: ${(firma.name ?? "firma").slice(0, 80)}`,
        text,
      }),
    });
    if (!r.ok) console.error("[ochrana-odosielania] mail adminovi", r.status, await r.text());
  } catch (e: any) {
    console.error("[ochrana-odosielania] mail adminovi", e?.message ?? e);
  }
}
