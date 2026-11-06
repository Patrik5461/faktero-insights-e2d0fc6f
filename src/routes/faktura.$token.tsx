import { useEffect } from "react";
import { vsVystavenej } from "@/lib/faktero/variabilny-symbol";
import { vynutSvetlyMotiv } from "@/lib/faktero/motiv";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { domacaMena, krajinaKurzu, textPrepoctu } from "@/lib/faktero/kurzy";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { formatujMenu, formatujMnozstvo } from "@/lib/faktero/mena";
import { datumNaDoklade, localeDokladu, popisky } from "@/lib/faktero/faktura-jazyk";
import { krajinaDane } from "@/lib/faktero/vat-rates";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";
import { pomenovanieDobropisu } from "@/lib/i18n/dobropis-de";
import { polozkyPaty } from "@/lib/faktero/pata-dokladu";
import { PataDokladu } from "@/components/faktero/PataDokladu";

/**
 * Faktúra otvorená z QR kódu na doklade.
 *
 * Odberateľ ju vidí bez prihlásenia — doklad aj tak drží v ruke. Token je
 * náhodných 32 znakov a sprístupňuje výhradne ten jeden doklad; nič iné z
 * firmy sa cez neho dostať nedá.
 */

const Vstup = z.object({ token: z.string().min(16).max(128) });

const nacitajFakturu = createServerFn({ method: "POST" })
  .validator((i) => Vstup.parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: f } = await supabaseAdmin
      .from("invoices")
      .select(
        "id, company_id, invoice_number, type, status, language, issue_date, delivery_date, due_date, currency, subtotal, vat_total, total, exchange_rate, exchange_rate_date, exchange_rate_source, vat_total_eur, variable_symbol, customer_name, customer_street, customer_city, customer_zip, customer_ico, customer_dic, customer_ic_dph, notes, reverse_charge, osobitna_uprava, de_hinweis_aufbewahrung, deleted_at, payment_iban, payment_swift, oprava_25a, created_by",
      )
      .eq("public_token", data.token)
      .maybeSingle();
    // Zmazaný doklad sa nesmie dať otvoriť ani starým odkazom.
    if (!f || (f as any).deleted_at) throw notFound();

    const [{ data: polozky }, { data: firma }] = await Promise.all([
      supabaseAdmin
        .from("invoice_items")
        .select("name, description, quantity, unit, unit_price, vat_rate, total")
        .eq("invoice_id", (f as any).id)
        .order("position", { ascending: true }),
      supabaseAdmin
        .from("companies")
        .select(
          "name, street, city, zip, country, ico, dic, ic_dph, vat_payer, vat_scheme, iban, email, phone",
        )
        .eq("id", (f as any).company_id)
        .maybeSingle(),
    ]);

    /*
      Zápis v OR a web do pätičky — ako na PDF. Cez `*`, aby stránka nespadla,
      kým nový stĺpec `registracia_text` nie je v databáze; von ide len
      hotový text, nie celý riadok firmy.
    */
    const [{ data: firmaVsetko }, { menoAutora }] = await Promise.all([
      supabaseAdmin
        .from("companies")
        .select("*")
        .eq("id", (f as any).company_id)
        .maybeSingle(),
      import("@/lib/faktero/invoice-pdf.server"),
    ]);
    const { textZapisuVRegistri } = await import("@/lib/faktero/zapis-v-registri");
    const pata = {
      zapis: textZapisuVRegistri(firmaVsetko as any),
      website: ((firmaVsetko as any)?.website as string | null) ?? null,
      farba: ((firmaVsetko as any)?.invoice_accent_color as string | null) ?? null,
      vystavil: (await menoAutora((f as any).created_by)) || ((firma as any)?.name ?? null),
    };

    // `id` ani `company_id` sa von neposielajú — návštevník ich nepotrebuje.
    const {
      id: _id,
      company_id: _c,
      created_by: _cb,
      deleted_at: _d,
      payment_iban: _pi,
      payment_swift: _ps,
      ...doklad
    } = f as any;
    // Účet, ktorý si faktúra zapamätala, má prednosť pred účtom firmy.
    const { sUctomFaktury } = await import("@/lib/faktero/platobny-ucet");
    // Prečo na doklade nie je daň — rovnaká veta ako v PDF. Doklad s vyčíslenou
    // daňou ju nedostane ani vtedy, keď je firma dnes vedená ako neplatiteľ.
    const { rezimFirmy } = await import("@/lib/faktero/dph-rezim");
    const textDph = Number((f as any).vat_total ?? 0) > 0 ? null : rezimFirmy(firma).textNaDoklad;
    const { vetyNaDoklad } = await import("@/lib/faktero/faktura-nalezitosti");
    // Stránka hovorí jazykom dokladu — nemeckú faktúru odberateľ otvorí po nemecky.
    const { jazykFaktury } = await import("@/lib/faktero/email-jazyk");
    // Dobropis je v databáze záporný — odberateľ ho vidí bez mínusu ako v PDF.
    const { dokladNaZobrazenie, polozkaNaZobrazenie } =
      await import("@/lib/faktero/dobropis-zobrazenie");
    /*
      Rekapitulácia DPH so súčtovým riadkom a veta o prenesení — ako v PDF.
      Celé riadky (`*`) sa čítajú len tu na serveri; von ide hotový rozpis
      a text, nie stĺpce faktúry ani položiek.
    */
    const [{ data: fakturaVsetko }, { data: polozkyVsetko }] = await Promise.all([
      supabaseAdmin
        .from("invoices")
        .select("*")
        .eq("id", (f as any).id)
        .maybeSingle(),
      supabaseAdmin
        .from("invoice_items")
        .select("*")
        .eq("invoice_id", (f as any).id)
        .order("position", { ascending: true }),
    ]);
    const { rozpisPodlaSadzieb } = await import("@/lib/faktero/rozpis-dph");
    const { riadkySoZlavou } = await import("@/lib/faktero/zlavy");
    const { textPreneseniaDokladu } = await import("@/lib/faktero/veta-prenesenia");
    const { sumaNaZobrazenie } = await import("@/lib/faktero/dobropis-zobrazenie");
    const fv: any = fakturaVsetko ?? f;
    const jazyk = jazykFaktury(f as any, firma);
    // Zálohová faktúra nie je daňový doklad — rozpis len pri viacerých sadzbách (ako PDF).
    const skupiny = rozpisPodlaSadzieb(
      riadkySoZlavou((polozkyVsetko ?? []) as any[], fv.discount_total).map((it: any) => ({
        vat_rate: it.vat_rate,
        subtotal: it.subtotal,
        vat_amount: it.vat_amount,
        prenesenie: Boolean(fv.reverse_charge || it.prenesenie),
      })),
      { subtotal: fv.subtotal, vat_total: fv.vat_total },
    ).map((g) => ({
      ...g,
      zaklad: sumaNaZobrazenie(fv, g.zaklad),
      dan: sumaNaZobrazenie(fv, g.dan),
    }));
    const rozpis = fv.type === "proforma" && skupiny.length < 2 ? [] : skupiny;
    const textPrenesenia = textPreneseniaDokladu({
      invoice: fv,
      company: firmaVsetko ?? firma ?? {},
      items: (polozkyVsetko ?? []) as any[],
      jazyk,
    });
    return {
      jazyk,
      rozpis,
      textPrenesenia,
      doklad: dokladNaZobrazenie(doklad),
      vetyUprav: vetyNaDoklad({
        danZPrijatejPlatby: (firma as any)?.dan_z_prijatej_platby,
        osobitnaUprava: (f as any).osobitna_uprava,
        krajina: krajinaDane((firma as any)?.country),
        upozornenieUschova: (f as any).de_hinweis_aufbewahrung,
      }),
      polozky: (polozky ?? []).map((p) => polozkaNaZobrazenie(f as any, p)),
      firma: firma ? sUctomFaktury(firma, f as any) : null,
      pata,
      textDph,
    };
  });

export const Route = createFileRoute("/faktura/$token")({
  ssr: true,
  loader: ({ params }) => {
    // Nezmyselný token je z pohľadu návštevníka to isté ako neexistujúci
    // doklad — nech dostane stránku „nenájdené", nie chybu servera.
    if (!Vstup.safeParse({ token: params.token }).success) throw notFound();
    return nacitajFakturu({ data: { token: params.token } });
  },
  head: ({ loaderData, match }) => ({
    meta: [
      {
        title: `${
          loaderData?.jazyk && loaderData.jazyk !== "sk"
            ? velkymPrve(popisky(loaderData.jazyk).faktura)
            : preloz(match.context.jazyk, "Faktúra")
        } ${loaderData?.doklad?.invoice_number ?? ""} — Faktero`,
      },
      // Doklad nepatrí do vyhľadávačov, aj keď je odkaz verejný.
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  notFoundComponent: () => {
    const { t } = useT();
    return (
      <Obal>
        <h1 className="text-xl font-semibold">{t("Faktúra sa nenašla")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("Odkaz je neplatný alebo bol doklad zrušený.")}
        </p>
      </Obal>
    );
  },
  errorComponent: () => {
    const { t } = useT();
    return (
      <Obal>
        <h1 className="text-xl font-semibold">{t("Faktúru sa nepodarilo načítať")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("Skúste to, prosím, znova.")}</p>
      </Obal>
    );
  },
  component: VerejnaFaktura,
});

function Obal({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        {children}
      </div>
    </div>
  );
}

function Riadok({ k, v }: { k: string; v: React.ReactNode }) {
  if (!v) return null;
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}

/** „BEZAHLT“ → „Bezahlt“ — popisky dokladu sú na PDF verzálkami. */
function velkymPrve(s: string): string {
  return s.charAt(0) + s.slice(1).toLocaleLowerCase();
}

function VerejnaFaktura() {
  const { t: tWebu } = useT();
  const { doklad, polozky, firma, pata, textDph, vetyUprav, jazyk, rozpis, textPrenesenia } =
    Route.useLoaderData();
  /*
    Slovenský doklad ostáva v jazyku webu (návštevník si ho môže prepnúť);
    doklad v inom jazyku sa ukáže v jazyku dokladu, s popiskami z PDF.
  */
  // „Rechnungskorrektur“ len pri firme z Nemecka, inak „Gutschrift“ (dobropis-de.ts).
  const krajinaFirmy = krajinaDane(firma?.country);
  const P = popisky(jazyk, krajinaFirmy);
  const cudzi = jazyk !== "sk";
  const POPISKY_STRANKY: Record<string, string> = {
    Dobropis: velkymPrve(P.dobropis),
    Ťarchopis: velkymPrve(P.tarchopis),
    "Zálohová faktúra": velkymPrve(P.zalohovaFaktura),
    "Daňový doklad k prijatej platbe": velkymPrve(P.dokladKPlatbe),
    Sadzba: P.sadzba,
    "Základ dane": P.zakladDane,
    Faktúra: velkymPrve(P.faktura),
    "Na úhradu": velkymPrve(P.spoluKUhrade),
    Uhradené: velkymPrve(P.uhradene),
    Dodávateľ: velkymPrve(P.dodavatel),
    Odberateľ: velkymPrve(P.odberatel),
    IČO: P.ico,
    Položka: velkymPrve(P.polozka),
    Množstvo: velkymPrve(P.mnozstvo),
    Cena: velkymPrve(P.cena),
    DPH: P.dph,
    "DPH (PDP)": P.dphPdp,
    Celkom: velkymPrve(P.celkom),
    Základ: P.zakladDane,
    Spolu: P.spolu,
    "Dátum vystavenia": P.datumVystavenia,
    "Dátum dodania": P.datumDodania,
    Splatnosť: P.datumSplatnosti,
    "Variabilný symbol": P.variabilnySymbol,
    IBAN: P.iban,
  };
  const t = (text: string) =>
    pomenovanieDobropisu(
      cudzi ? (POPISKY_STRANKY[text] ?? tWebu(text)) : tWebu(text),
      krajinaFirmy,
    );

  // Doklad pre zákazníka je vždy svetlý — tmavý podľa jeho prehliadača vyzerá
  // ako chyba a horšie sa tlačí.
  useEffect(() => vynutSvetlyMotiv(), []);
  const mena = doklad.currency ?? "EUR";
  const suma = (n: unknown) => formatujMenu(n, mena, localeDokladu(jazyk));
  const nazov =
    doklad.type === "credit_note"
      ? "Dobropis"
      : doklad.type === "debit_note"
        ? "Ťarchopis"
        : doklad.type === "proforma"
          ? "Zálohová faktúra"
          : doklad.type === "advance_payment"
            ? "Daňový doklad k prijatej platbe"
            : "Faktúra";

  return (
    <Obal>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{t(nazov)}</div>
          <h1 className="text-2xl font-semibold">{doklad.invoice_number}</h1>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {/* Dobropis sa neuhrádza — suma je jeho celková hodnota. */}
            {t(doklad.type === "credit_note" && !doklad.oprava_25a ? "Celkom" : "Na úhradu")}
          </div>
          <div className="text-2xl font-semibold tabular-nums">{suma(doklad.total)}</div>
          {doklad.status === "paid" && (
            <span className="mt-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
              {t("Uhradené")}
            </span>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {t("Dodávateľ")}
          </div>
          <div className="mt-1 text-sm font-medium">{firma?.name}</div>
          <div className="text-sm text-muted-foreground">
            {[firma?.street, [firma?.zip, firma?.city].filter(Boolean).join(" ")]
              .filter(Boolean)
              .join(", ")}
          </div>
          {firma?.ico && (
            <div className="mt-1 text-xs text-muted-foreground">
              {t("IČO")} {firma.ico}
            </div>
          )}
          {pata.zapis && (
            <div className="mt-1 text-[11px] leading-snug text-muted-foreground">{pata.zapis}</div>
          )}
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {t("Odberateľ")}
          </div>
          <div className="mt-1 text-sm font-medium">{doklad.customer_name}</div>
          <div className="text-sm text-muted-foreground">
            {[
              doklad.customer_street,
              [doklad.customer_zip, doklad.customer_city].filter(Boolean).join(" "),
            ]
              .filter(Boolean)
              .join(", ")}
          </div>
          {doklad.customer_ico && (
            <div className="mt-1 text-xs text-muted-foreground">
              {t("IČO")} {doklad.customer_ico}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="py-2">{t("Položka")}</th>
              <th className="py-2 text-right">{t("Množstvo")}</th>
              <th className="py-2 text-right">{t("Cena")}</th>
              <th className="py-2 text-right">{t("DPH")}</th>
              <th className="py-2 text-right">{t("Celkom")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {polozky.map((p: any, i: number) => (
              <tr key={i}>
                <td className="py-2">
                  {p.name}
                  {p.description && (
                    <div className="text-xs text-muted-foreground">{p.description}</div>
                  )}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {formatujMnozstvo(p.quantity, localeDokladu(jazyk))} {p.unit}
                </td>
                <td className="py-2 text-right tabular-nums">{suma(p.unit_price)}</td>
                <td className="py-2 text-right tabular-nums">{Number(p.vat_rate)} %</td>
                <td className="py-2 text-right font-medium tabular-nums">{suma(p.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 sm:ml-auto sm:w-72">
        <Riadok k={t("Základ")} v={suma(doklad.subtotal)} />
        <Riadok
          k={t(doklad.reverse_charge ? "DPH (PDP)" : "DPH")}
          v={suma(doklad.reverse_charge ? 0 : doklad.vat_total)}
        />
        <div className="mt-1 flex justify-between border-t border-border pt-2 text-base font-semibold">
          <span>{t("Spolu")}</span>
          <span className="tabular-nums">{suma(doklad.total)}</span>
        </div>
      </div>

      {/* Rekapitulácia DPH podľa sadzieb so súčtovým riadkom „Spolu“ — ako v PDF. */}
      {rozpis.length > 0 && (
        <div className="mt-4 overflow-x-auto sm:ml-auto sm:w-96">
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="text-muted-foreground">
                <th className="py-1 text-left font-normal">{t("Sadzba")}</th>
                <th className="py-1 text-right font-normal">{t("Základ dane")}</th>
                <th className="py-1 text-right font-normal">{t("DPH")}</th>
                <th className="py-1 text-right font-normal">{t("Spolu")}</th>
              </tr>
            </thead>
            <tbody>
              {rozpis.map((g: any) => (
                <tr
                  key={`${g.prenesenie ? "p" : "s"}${g.sadzba}`}
                  className="border-t border-border/60"
                >
                  <td className="py-1">
                    {g.prenesenie ? P.pdp : `${String(g.sadzba).replace(".", ",")} %`}
                  </td>
                  <td className="py-1 text-right">{suma(g.zaklad)}</td>
                  <td className="py-1 text-right">{g.prenesenie ? "—" : suma(g.dan)}</td>
                  <td className="py-1 text-right">
                    {suma(Math.round((g.zaklad + g.dan) * 100) / 100)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border font-semibold">
                <td className="py-1">{t("Spolu")}</td>
                <td className="py-1 text-right">
                  {suma(
                    Math.round(rozpis.reduce((a: number, g: any) => a + g.zaklad, 0) * 100) / 100,
                  )}
                </td>
                <td className="py-1 text-right">
                  {doklad.reverse_charge
                    ? "—"
                    : suma(
                        Math.round(rozpis.reduce((a: number, g: any) => a + g.dan, 0) * 100) / 100,
                      )}
                </td>
                <td className="py-1 text-right">
                  {suma(
                    Math.round(
                      rozpis.reduce((a: number, g: any) => a + g.zaklad + g.dan, 0) * 100,
                    ) / 100,
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Prenesenie daňovej povinnosti s celým ustanovením — rovnaká veta ako v PDF. */}
      {textPrenesenia && (
        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900">
          {textPrenesenia}
        </p>
      )}

      <div className="mt-6 rounded-xl border border-border bg-muted/30 p-4">
        <Riadok k={t("Dátum vystavenia")} v={datumNaDoklade(doklad.issue_date, jazyk)} />
        <Riadok k={t("Dátum dodania")} v={datumNaDoklade(doklad.delivery_date, jazyk)} />
        <Riadok k={t("Splatnosť")} v={datumNaDoklade(doklad.due_date, jazyk)} />
        <Riadok k={t("Variabilný symbol")} v={vsVystavenej(doklad)} />
        <Riadok k={t("IBAN")} v={firma?.iban} />
      </div>

      {doklad.currency !== domacaMena(firma?.country) &&
        doklad.exchange_rate &&
        doklad.vat_total_eur != null && (
          <p className="mt-4 text-sm text-muted-foreground">
            {textPrepoctu(
              String(doklad.currency),
              Number(doklad.exchange_rate),
              String(doklad.exchange_rate_date ?? doklad.delivery_date ?? doklad.issue_date),
              Number(doklad.vat_total_eur),
              krajinaKurzu(firma?.country) === "CZ"
                ? "cz"
                : krajinaDane(firma?.country) === "DE"
                  ? "de"
                  : "sk",
              krajinaKurzu(firma?.country),
              (doklad as any).exchange_rate_source,
            )}
          </p>
        )}

      {vetyUprav.map((v: string) => (
        <p key={v} className="mt-4 text-sm font-medium">
          {v}
        </p>
      ))}

      {textDph && <p className="mt-4 text-sm font-medium">{textDph}</p>}

      {doklad.notes && <p className="mt-4 text-sm text-muted-foreground">{doklad.notes}</p>}

      <PataDokladu
        farba={pata.farba ?? undefined}
        polozky={polozkyPaty(
          {
            vystavil: pata.vystavil,
            phone: (firma as any)?.phone,
            email: (firma as any)?.email,
            website: pata.website,
          },
          jazyk,
        ).map((p) => ({ ...p, popis: cudzi ? p.popis : tWebu(p.popis) }))}
      />

      <p className="mt-6 text-center text-xs text-muted-foreground">
        {cudzi ? (
          P.vystaveneCez
        ) : (
          <>
            {t("Vystavené cez")} <span className="font-medium">{t("Faktero")}</span>
          </>
        )}
      </p>
    </Obal>
  );
}
