/**
 * Riadky z databázy sa tu netypujú — modul ich len prehadzuje do XML, CSV a
 * ZIPu a o ich tvare rozhodujú generátory v `export.server.ts`.
 */
export type Riadok = any;
/** Klient Supabase z middlewaru; nesie práva prihláseného používateľa. */
export type Klient = any;

/**
 * Odovzdanie za obdobie — jeden balík pre účtovníčku.
 *
 * Doterajší export bol „vyber si faktúry a stiahni XML". To znamená, že si
 * človek musel sám pamätať, čo už poslal; pri mesačnom odovzdávaní z toho
 * vzniká buď chýbajúci, alebo dvakrát zaúčtovaný doklad. Tu sa vyberá
 * **mesiac** a Faktero vie, čo z neho už išlo.
 *
 * V balíku je všetko, čo účtovníčka za mesiac potrebuje: vydané faktúry,
 * prijaté doklady, pokladňa, súpisky na kontrolu a samotné doklady v PDF.
 */
export type OdovzdanieVstup = {
  companyId: string;
  /** Mesiac v tvare `2026-08`. */
  mesiac: string;
  /** Zapísať do histórie, že tieto doklady sú odovzdané. */
  oznacit: boolean;
  /** Preskočiť už odovzdané doklady. */
  lenNove: boolean;
};

const MESIACE = [
  "január",
  "február",
  "marec",
  "apríl",
  "máj",
  "jún",
  "júl",
  "august",
  "september",
  "október",
  "november",
  "december",
];

export function rozsahMesiaca(mesiac: string): { od: string; do: string; nazov: string } {
  const [r, m] = mesiac.split("-").map(Number);
  const dalsiMesiac = m === 12 ? 1 : m + 1;
  const dalsiRok = m === 12 ? r + 1 : r;
  return {
    od: `${r}-${String(m).padStart(2, "0")}-01`,
    do: `${dalsiRok}-${String(dalsiMesiac).padStart(2, "0")}-01`,
    nazov: `${MESIACE[m - 1] ?? mesiac} ${r}`,
  };
}

function csvHodnota(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function csvSubor(hlavicka: string[], riadky: unknown[][]): string {
  // BOM, nech Excel prečíta diakritiku.
  return "﻿" + [hlavicka.join(";"), ...riadky.map((r) => r.map(csvHodnota).join(";"))].join("\r\n");
}

const TYP_DOKLADU: Record<string, string> = {
  regular: "Faktúra",
  proforma: "Zálohová faktúra",
  credit_note: "Dobropis",
};

/** Bezpečný názov súboru v ZIPe — diakritika ostáva, oddeľovače nie. */
function nazovSuboru(s: unknown): string {
  return String(s ?? "doklad")
    .replace(/[/\\?%*:|"<>\r\n]+/g, "-")
    .trim()
    .slice(0, 80);
}

/**
 * Koľko sa toho zmestí do prílohy mailu.
 *
 * Resend prijme 40 MB, ale schránka príjemcu býva prísnejšia (Gmail 25 MB) a
 * base64 objem ešte o tretinu nafúkne. Keď sa PDF a skeny nezmestia, balík
 * odíde bez nich — údaje na zaúčtovanie sú dôležitejšie než obrázky a v
 * Fakteru ostanú dostupné.
 */
export const STROP_PRILOH_MAILOM = 12 * 1024 * 1024;

export type Balik = {
  base64: string;
  fileName: string;
  pocetFaktur: number;
  pocetDokladov: number;
  pocetPokladnicnych: number;
  preskocene: string[];
  vynechanePrilohy: number;
  fakturyIds: string[];
  dokladyIds: string[];
  /** Číselníky, ktoré v balíku išli — zapisujú sa do `pohoda_odoslane`. */
  ciselniky: { agenda: string; id: string; verzia: string }[];
  pocetCiselnikov: number;
  xmlFaktur: string;
  poslednyDatum: string;
  nazovObdobia: string;
};

/**
 * Zostaví balík za mesiac. Nič nezapisuje — o tom, či sa doklady označia za
 * odovzdané, rozhoduje volajúci.
 */
export async function zostavBalik(
  supabase: Klient,
  vstup: OdovzdanieVstup & { stropPriloh?: number },
): Promise<{ balik: Balik; company: Riadok }> {
  const { od, do: doDatumu, nazov } = rozsahMesiaca(vstup.mesiac);

  const [{ data: company, error: cErr }, { data: vsetky, error: iErr }] = await Promise.all([
    supabase.from("companies").select("*").eq("id", vstup.companyId).single(),
    supabase
      .from("invoices")
      .select("*")
      .eq("company_id", vstup.companyId)
      .gte("issue_date", od)
      .lt("issue_date", doDatumu)
      .neq("status", "draft")
      .neq("status", "cancelled")
      .is("deleted_at", null)
      .order("issue_date"),
  ]);
  if (cErr) throw new Error(cErr.message);
  if (iErr) throw new Error(iErr.message);
  if (!company) throw new Error("Firma nenájdená");

  // Čo už raz odišlo, sa druhýkrát neposiela — inak doklad pribudne dvakrát.
  const { data: uzOdovzdane } = await supabase
    .from("export_logs")
    .select("invoice_id")
    .eq("company_id", vstup.companyId)
    .eq("status", "ok");
  const odovzdaneIds = new Set((uzOdovzdane ?? []).map((r: Riadok) => r.invoice_id));

  const faktury = (vsetky ?? []).filter((f: Riadok) => !vstup.lenNove || !odovzdaneIds.has(f.id));

  const [{ data: vsetkyDoklady }, { data: pokladnica }] = await Promise.all([
    supabase
      .from("expense_documents")
      .select("*")
      .eq("company_id", vstup.companyId)
      .gte("issue_date", od)
      .lt("issue_date", doDatumu)
      .order("issue_date"),
    supabase
      .from("cash_entries")
      .select("*")
      .eq("company_id", vstup.companyId)
      .gte("entry_date", od)
      .lt("entry_date", doDatumu)
      .order("entry_date"),
  ]);
  const doklady = (vsetkyDoklady ?? []).filter((d: Riadok) => !vstup.lenNove || !d.exported_at);

  if (!faktury.length && !doklady.length && !pokladnica?.length) {
    throw new Error(
      vstup.lenNove && (vsetky?.length || vsetkyDoklady?.length)
        ? `Za ${nazov} už bolo všetko odovzdané`
        : `Za ${nazov} nie sú žiadne doklady`,
    );
  }

  const { data: polozky, error: pErr } = faktury.length
    ? await supabase
        .from("invoice_items")
        .select("*")
        .in(
          "invoice_id",
          faktury.map((f: Riadok) => f.id),
        )
        .order("position")
    : { data: [], error: null };
  if (pErr) throw new Error(pErr.message);

  const nastavenia = {
    predkontacia: company.pohoda_predkontacia,
    predkontaciaZaloha: company.pohoda_predkontacia_zaloha,
    predkontaciaDobropis: company.pohoda_predkontacia_dobropis,
    clenenieDph: company.pohoda_clenenie_dph,
    clenenieDphPdp: company.pohoda_clenenie_dph_pdp,
    predkontaciaPrijata: company.pohoda_predkontacia_prijata,
    clenenieDphPrijata: company.pohoda_clenenie_dph_prijata,
    pokladna: company.pohoda_pokladna,
    predkontaciaPokladna: company.pohoda_predkontacia_pokladna,
    sklad: company.pohoda_sklad,
  };

  const {
    EXPORT_STRATEGIES,
    buildPohodaCashXml,
    buildPohodaExpensesXml,
    buildPohodaAddressbookXml,
    buildPohodaStockXml,
    buildPohodaContractsXml,
    buildPohodaMovementsXml,
    buildPohodaStornaXml,
    zoskupPohyby,
  } = await import("./export.server");

  // Balík nesie to isté, čo priame prepojenie — inak by ten, kto konektor
  // nechce, o adresár, sklad a zákazky prišiel len preto, že si vybral mail.
  const {
    cislaVPohode,
    nacitajPohyby,
    nacitajStorna,
    nacitajVazby,
    nacitajZakaznikov,
    nacitajZakazky,
    nacitajZasoby,
  } = await import("./pohoda-konektor.server");

  const cisla = await cislaVPohode(supabase, vstup.companyId);
  const { zalohy, opravovane } = await nacitajVazby(supabase, vstup.companyId, faktury, cisla);
  const storna = await nacitajStorna(supabase, vstup.companyId, cisla);

  const zakaznici = company.pohoda_posielat_adresar
    ? await nacitajZakaznikov(supabase, vstup.companyId)
    : [];
  const zasoby =
    company.pohoda_posielat_sklad && company.pohoda_sklad
      ? await nacitajZasoby(supabase, vstup.companyId)
      : [];
  const { nove: zakazkyNove, kody: zakazky } = company.pohoda_posielat_zakazky
    ? await nacitajZakazky(supabase, vstup.companyId, faktury)
    : { nove: [] as Riadok[], kody: {} as Record<string, string> };
  const pohyby =
    company.pohoda_posielat_pohyby && company.pohoda_posielat_sklad && company.pohoda_sklad
      ? await nacitajPohyby(supabase, vstup.companyId, zasoby)
      : [];

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  let xmlFaktur = "";
  let preskocene: string[] = [];
  let vyvezene: Riadok[] = [];
  if (faktury.length) {
    const balikFaktur = faktury.map((invoice: Riadok) => ({
      invoice,
      items: (polozky ?? []).filter((p: Riadok) => p.invoice_id === invoice.id),
    }));
    const vystup = EXPORT_STRATEGIES.pohoda_xml.build({
      company,
      invoices: balikFaktur,
      nastavenia,
      zalohy,
      opravovane,
      zakazky,
    });
    xmlFaktur = vystup.content;
    preskocene = vystup.preskocene ?? [];
    const cislaPreskocenych = new Set(preskocene.map((d) => String(d).split(" — ")[0]));
    vyvezene = faktury.filter((f: Riadok) => !cislaPreskocenych.has(f.invoice_number));

    zip.file("pohoda-faktury.xml", xmlFaktur);
    zip.file(
      "faktury.csv",
      csvSubor(
        [
          "cislo",
          "typ",
          "vystavena",
          "dodanie",
          "splatnost",
          "odberatel",
          "ico",
          "ic_dph",
          "zaklad",
          "dph",
          "celkom",
          "mena",
          "v_xml",
        ],
        faktury.map((f: Riadok) => [
          f.invoice_number,
          TYP_DOKLADU[f.type] ?? f.type,
          f.issue_date,
          f.delivery_date ?? "",
          f.due_date,
          f.customer_name ?? "",
          f.customer_ico ?? "",
          f.customer_ic_dph ?? "",
          f.subtotal,
          f.vat_total,
          f.total,
          f.currency,
          cislaPreskocenych.has(f.invoice_number) ? "nie" : "áno",
        ]),
      ),
    );
  }

  if (doklady.length) {
    zip.file(
      "pohoda-prijate-doklady.xml",
      buildPohodaExpensesXml({ company, doklady, nastavenia }),
    );
    zip.file(
      "prijate-doklady.csv",
      csvSubor(
        [
          "datum",
          "dodavatel",
          "ico",
          "ic_dph",
          "cislo_dokladu",
          "zaklad",
          "dph",
          "celkom",
          "mena",
          "kategoria",
        ],
        doklady.map((d: Riadok) => [
          d.issue_date,
          d.supplier_name ?? "",
          d.supplier_ico ?? "",
          d.supplier_ic_dph ?? "",
          d.document_number ?? "",
          d.net_amount,
          d.vat_amount,
          d.total_amount,
          d.currency,
          d.category ?? "",
        ]),
      ),
    );
  }

  if (pokladnica?.length) {
    zip.file(
      "pohoda-pokladna.xml",
      buildPohodaCashXml({ company, pohyby: pokladnica, nastavenia }),
    );
    zip.file(
      "pokladna.csv",
      csvSubor(
        ["cislo", "datum", "druh", "suma", "popis", "kategoria"],
        pokladnica.map((p: Riadok) => [
          p.entry_number,
          p.entry_date,
          p.type === "prijem" ? "príjem" : "výdavok",
          p.amount,
          p.description ?? "",
          p.category ?? "",
        ]),
      ),
    );
  }

  // Číselníky a väzby — každý ako vlastný súbor, aby si účtovníčka mohla
  // naimportovať len to, čo naozaj chce.
  if (zakaznici.length) {
    zip.file("pohoda-adresar.xml", buildPohodaAddressbookXml({ company, zakaznici }));
  }
  if (zasoby.length) {
    zip.file("pohoda-sklad.xml", buildPohodaStockXml({ company, zasoby, nastavenia }));
  }
  if (zakazkyNove.length) {
    zip.file("pohoda-zakazky.xml", buildPohodaContractsXml({ company, zakazky: zakazkyNove }));
  }
  if (pohyby.length) {
    zip.file(
      "pohoda-skladove-pohyby.xml",
      buildPohodaMovementsXml({ company, skupiny: zoskupPohyby(pohyby), nastavenia }),
    );
  }
  if (storna.length) {
    // Storno je samostatný súbor zámerne: ruší doklad, ktorý v Pohode už je, a
    // účtovníčka si ho má naimportovať vedome.
    zip.file("pohoda-storna.xml", buildPohodaStornaXml({ company, storna }));
  }

  // Samotné doklady. Účtovníčka potrebuje aj papier, nielen údaje — ale keď sa
  // balík posiela mailom, prílohy majú strop a údaje sú dôležitejšie.
  const strop = vstup.stropPriloh ?? Infinity;
  let velkost = 0;
  let vynechanePrilohy = 0;

  const { ensureInvoicePdf } = await import("./invoice-pdf.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const pdfPriecinok = zip.folder("faktury-pdf")!;
  for (const f of vyvezene) {
    if (velkost >= strop) {
      vynechanePrilohy++;
      continue;
    }
    try {
      const { path, fileName } = await ensureInvoicePdf(f.id);
      const { data: subor } = await supabaseAdmin.storage.from("invoice-pdfs").download(path);
      if (!subor) {
        vynechanePrilohy++;
        continue;
      }
      const bajty = await subor.arrayBuffer();
      velkost += bajty.byteLength;
      pdfPriecinok.file(fileName, bajty);
    } catch {
      // Jedna nevydarená faktúra nesmie zhodiť celé odovzdanie.
      vynechanePrilohy++;
    }
  }

  const skeny = zip.folder("prijate-doklady-skeny")!;
  for (const d of doklady) {
    if (!d.file_path) continue;
    if (velkost >= strop) {
      vynechanePrilohy++;
      continue;
    }
    try {
      const { data: subor } = await supabaseAdmin.storage
        .from("expense-receipts")
        .download(d.file_path);
      if (!subor) {
        vynechanePrilohy++;
        continue;
      }
      const bajty = await subor.arrayBuffer();
      velkost += bajty.byteLength;
      const pripona = (d.file_path.split(".").pop() || "bin").toLowerCase();
      skeny.file(
        `${nazovSuboru([d.issue_date, d.supplier_name, d.document_number].filter(Boolean).join("_"))}.${pripona}`,
        bajty,
      );
    } catch {
      vynechanePrilohy++;
    }
  }

  const base64 = await zip.generateAsync({ type: "base64" });

  return {
    company,
    balik: {
      base64,
      fileName: `odovzdanie-${vstup.mesiac}.zip`,
      pocetFaktur: vyvezene.length,
      pocetDokladov: doklady.length,
      pocetPokladnicnych: pokladnica?.length ?? 0,
      preskocene,
      vynechanePrilohy,
      fakturyIds: faktury.map((f: Riadok) => f.id),
      dokladyIds: doklady.map((d: Riadok) => d.id),
      ciselniky: [
        ...zakaznici.map((z: Riadok) => ({
          agenda: "adresar",
          id: String(z.id),
          verzia: String(z.updated_at),
        })),
        ...zasoby.map((z: Riadok) => ({
          agenda: "sklad",
          id: String(z.id),
          verzia: String(z.updated_at),
        })),
        ...zakazkyNove.map((z: Riadok) => ({
          agenda: "zakazka",
          id: String(z.id),
          verzia: String(z.updated_at),
        })),
        ...pohyby.map((m: Riadok) => ({
          agenda: "pohyb",
          id: String(m.id),
          verzia: String(m.created_at),
        })),
        ...storna.map((x: { id: string }) => ({
          agenda: "storno",
          id: x.id,
          verzia: new Date().toISOString(),
        })),
      ],
      pocetCiselnikov:
        zakaznici.length + zasoby.length + zakazkyNove.length + pohyby.length + storna.length,
      xmlFaktur,
      poslednyDatum: faktury[faktury.length - 1]?.issue_date ?? od,
      nazovObdobia: nazov,
    },
  };
}

/** Zapíše, že doklady odišli. Bez toho by ich ďalšie odovzdanie poslalo znova. */
export async function oznacOdovzdane(
  supabase: Klient,
  vstup: { companyId: string; mesiac: string; userId: string | null },
  balik: Balik,
  faktury: { id: string; invoice_number: string }[],
) {
  const cislaPreskocenych = new Set(balik.preskocene.map((d) => String(d).split(" — ")[0]));
  const { od } = rozsahMesiaca(vstup.mesiac);

  const { data: job, error } = await supabase
    .from("export_jobs")
    .insert({
      company_id: vstup.companyId,
      created_by: vstup.userId,
      format: "pohoda_xml",
      target_system: "pohoda",
      status: "completed",
      invoice_count: balik.pocetFaktur,
      date_from: od,
      date_to: balik.poslednyDatum,
      file_name: `pohoda-faktury-${vstup.mesiac}.xml`,
      // V histórii sa drží XML, nie celý balík — ZIP s PDF by tabuľku nafúkol
      // a dôležitý je práve importovateľný súbor.
      file_content: balik.xmlFaktur,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  if (job && faktury.length) {
    await supabase.from("export_logs").insert(
      faktury.map((f) => ({
        export_job_id: job.id,
        company_id: vstup.companyId,
        invoice_id: f.id,
        invoice_number: f.invoice_number,
        status: cislaPreskocenych.has(f.invoice_number) ? "skipped" : "ok",
        error: balik.preskocene.find((d) => d.startsWith(f.invoice_number)) ?? null,
      })),
    );
  }
  if (job && balik.dokladyIds.length) {
    await supabase
      .from("expense_documents")
      .update({
        status: "exported",
        exported_at: new Date().toISOString(),
        export_job_id: job.id,
      })
      .in("id", balik.dokladyIds);
  }
  // Číselníky si pamätá tá istá tabuľka ako pri konektore, takže sa doklad
  // neodovzdá dvakrát ani vtedy, keď firma používa obidve cesty.
  if (job && balik.ciselniky.length) {
    await supabase.from("pohoda_odoslane").upsert(
      balik.ciselniky.map((c) => ({
        company_id: vstup.companyId,
        agenda: c.agenda,
        zaznam_id: c.id,
        verzia: c.verzia,
        odoslane_at: new Date().toISOString(),
      })),
      { onConflict: "company_id,agenda,zaznam_id" },
    );
  }
  return job?.id as string | undefined;
}

/**
 * Pošle hotový balík na adresu účtovníčky.
 *
 * Text mailu je zámerne vecný — účtovníčka potrebuje vedieť, čo jej prišlo, kde
 * to v Pohode načíta a či niečo chýba. Práve poznámky o vynechaných prílohách a
 * o dokladoch mimo XML sú dôvod, prečo sa mail skladá tu, a nie na dvoch
 * miestach zvlášť.
 */
export async function posliBalikMailom(opts: {
  company: Riadok;
  balik: Balik;
  prijemca: string;
  poznamka?: string;
}): Promise<void> {
  const { company, balik, poznamka } = opts;
  const prijemca = (opts.prijemca ?? "").trim();
  if (!prijemca)
    throw new Error("Chýba e-mail účtovníčky — doplňte ho v Účtovníctvo → Prepojenie s Pohodou");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(prijemca)) {
    throw new Error(`„${prijemca}" nevyzerá ako e-mailová adresa`);
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Odosielanie e-mailov nie je nastavené");

  const casti = [
    balik.pocetFaktur ? `${balik.pocetFaktur} vydaných faktúr` : "",
    balik.pocetDokladov ? `${balik.pocetDokladov} prijatých dokladov` : "",
    balik.pocetPokladnicnych ? `${balik.pocetPokladnicnych} pokladničných dokladov` : "",
    balik.pocetCiselnikov ? `${balik.pocetCiselnikov} záznamov číselníkov` : "",
  ].filter(Boolean);

  const text = [
    `Dobrý deň,`,
    ``,
    `v prílohe posielame podklady za ${balik.nazovObdobia} — ${casti.join(", ")}.`,
    ``,
    `V balíku sú súbory XML na priamy import do programu POHODA (Súbor → Dátová komunikácia → XML import/export), súpisky v CSV na kontrolu a samotné doklady.`,
    balik.vynechanePrilohy
      ? `\nPozn.: ${balik.vynechanePrilohy} dokladov je bez prílohy, aby sa e-mail zmestil do schránky. Radi ich pošleme samostatne.`
      : "",
    balik.preskocene.length
      ? `\nPozn.: do XML sa nedostali tieto doklady: ${balik.preskocene.join(", ")}. Sú v súpiske a treba ich zadať ručne.`
      : "",
    poznamka ? `\n${poznamka}` : "",
    ``,
    `S pozdravom`,
    company.name ?? "",
  ]
    .filter((r) => r !== "" || true)
    .join("\n");

  const odosielatel = company.email_sender_name || company.name || "Faktero";
  const odpoved = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: `${odosielatel} <${process.env.RESEND_FROM_EMAIL || "faktury@faktero.sk"}>`,
      to: [prijemca],
      reply_to: company.email_reply_to || company.email || undefined,
      subject: `Podklady za ${balik.nazovObdobia} — ${company.name ?? "Faktero"}`,
      text,
      html: `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#111;white-space:pre-wrap">${text
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")}</div>`,
      attachments: [{ filename: balik.fileName, content: balik.base64 }],
    }),
  });
  const surove = await odpoved.text();
  if (!odpoved.ok) {
    let sprava = surove.slice(0, 300);
    try {
      sprava = JSON.parse(surove)?.message ?? sprava;
    } catch {
      // Resend pri chybe niekedy vráti HTML — použije sa surový text
    }
    throw new Error(`Odoslanie zlyhalo: ${sprava}`);
  }
}
