/*
  Zostavenie balíka ZIP so všetkými dátami firmy — spoločné pre „Stiahnuť
  všetky dáta“ (`exportFirmyFn`, čaká sa na výsledok) a zálohy firmy
  (`zalohy-firmy.functions`, beží na pozadí s vyššími stropmi).

  Klient je buď prihlásený používateľ (RLS), alebo servisný kľúč — ten len po
  overení prístupu k firme; dopyty preto vždy filtrujú `company_id`.
*/

export type VstupBalika = {
  company_id: string;
  s_pdf: boolean;
  s_skenmi: boolean;
  od?: string | null;
  do?: string | null;
  podla: "vystavenia" | "dodania" | "vytvorenia";
};

/** Stĺpec dátumu podľa voľby — pre každú tabuľku dokladov. */
const DATUMY: Record<string, Record<"vystavenia" | "dodania" | "vytvorenia", string>> = {
  invoices: { vystavenia: "issue_date", dodania: "delivery_date", vytvorenia: "created_at" },
  purchase_invoices: {
    vystavenia: "issue_date",
    dodania: "delivery_date",
    vytvorenia: "created_at",
  },
  expense_documents: { vystavenia: "issue_date", dodania: "issue_date", vytvorenia: "created_at" },
  other_documents: {
    vystavenia: "received_date",
    dodania: "received_date",
    vytvorenia: "created_at",
  },
};

export type VysledokBalika = {
  obsah: Uint8Array;
  pocty: Record<string, number>;
  pdfka: number;
  skenov: number;
  orezaneSkeny: boolean;
  orezanePdf: boolean;
};

export async function zostavBalikFirmy(
  supabase: any,
  data: VstupBalika,
  limity: { maxPdf: number; maxSkenov: number },
): Promise<VysledokBalika> {
  const { naCsv, nazovSuboru, sprievodnyText, rozdelPodlaKosa, PRIECINOK_KOSA } =
    await import("./export-firmy");
  const JSZip = (await import("jszip")).default;

  const { data: firma } = await supabase
    .from("companies")
    .select("*")
    .eq("id", data.company_id)
    .maybeSingle();
  if (!firma) throw new Error("Firma sa nenašla.");

  const zip = new JSZip();
  const pridaj = (nazov: string, riadky: unknown[]) => {
    const zoznam = (riadky ?? []) as Record<string, unknown>[];
    if (!zoznam.length) return 0;
    zip.file(nazov, naCsv(zoznam));
    return zoznam.length;
  };

  const zTabulky = async (tabulka: string, stlpce = "*") => {
    // Obdobie platí len pre doklady; adresár, produkty a ostatné idú celé.
    const stlpecDatumu = DATUMY[tabulka]?.[data.podla];
    const dotaz = () => {
      let q = (supabase as any).from(tabulka).select(stlpce).eq("company_id", data.company_id);
      if (stlpecDatumu && data.od) q = q.gte(stlpecDatumu, data.od);
      if (stlpecDatumu && data.do)
        q =
          stlpecDatumu === "created_at"
            ? q.lt(stlpecDatumu, `${data.do}T23:59:59.999Z`)
            : q.lte(stlpecDatumu, data.do);
      return q;
    };
    // Po stránkach — Supabase vráti najviac 1 000 riadkov, `.limit` to neobíde.
    const { vsetkyRiadky } = await import("./strankovanie");
    return (await vsetkyRiadky<Record<string, unknown>>((zac, kon) =>
      dotaz().order("id").range(zac, kon),
    )) as Record<string, unknown>[];
  };

  const [
    faktury,
    prijate,
    doklady,
    ostatne,
    odberatelia,
    produkty,
    pokladna,
    banka,
    jazdy,
    zakazky,
  ] = await Promise.all([
    zTabulky("invoices"),
    zTabulky("purchase_invoices"),
    zTabulky("expense_documents"),
    zTabulky("other_documents"),
    zTabulky("customers"),
    zTabulky("products"),
    zTabulky("cash_entries"),
    zTabulky("bank_transactions"),
    zTabulky("trips"),
    zTabulky("jobs"),
  ]);

  // Položky faktúr sa viažu na faktúru, nie na firmu — berú sa po dávkach.
  const { riadkyPreIds } = await import("./strankovanie");
  const polozky = await riadkyPreIds<Record<string, unknown>>(
    faktury.map((f) => String(f.id)),
    (kus, zac, kon) =>
      supabase
        .from("invoice_items")
        .select("*")
        .in("invoice_id", kus)
        .order("invoice_id")
        .order("position")
        .order("id")
        .range(zac, kon),
  );

  // Kôš (`deleted_at`) ide do samostatného priečinka, nie preč — pozri
  // `rozdelPodlaKosa`. Rozdeľuje sa každá tabuľka, aby sa na stĺpec
  // nezabudlo, keď ho niektorá ďalšia dostane.
  const fakturyKos = rozdelPodlaKosa(faktury);
  const idVKosi = new Set(fakturyKos.vKosi.map((f) => String(f.id)));
  const polozkyKos = {
    zive: polozky.filter((p) => !idVKosi.has(String(p.invoice_id))),
    vKosi: polozky.filter((p) => idVKosi.has(String(p.invoice_id))),
  };
  const prijateKos = rozdelPodlaKosa(prijate);
  const dokladyKos = rozdelPodlaKosa(doklady);

  const subory: [
    string,
    string,
    { zive: Record<string, unknown>[]; vKosi: Record<string, unknown>[] },
  ][] = [
    ["faktúry", "faktury.csv", fakturyKos],
    ["položky faktúr", "faktury-polozky.csv", polozkyKos],
    ["prijaté faktúry", "prijate-faktury.csv", prijateKos],
    ["doklady", "doklady.csv", dokladyKos],
    ["iné doklady", "ostatne-doklady.csv", rozdelPodlaKosa(ostatne)],
    ["odberatelia", "odberatelia.csv", rozdelPodlaKosa(odberatelia)],
    ["produkty", "produkty.csv", rozdelPodlaKosa(produkty)],
    ["pokladňa", "pokladna.csv", rozdelPodlaKosa(pokladna)],
    ["banka", "banka.csv", rozdelPodlaKosa(banka)],
    ["jazdy", "jazdy.csv", rozdelPodlaKosa(jazdy)],
    ["zákazky", "zakazky.csv", rozdelPodlaKosa(zakazky)],
  ];

  const pocty: Record<string, number> = {};
  pocty["firma"] = pridaj("firma.csv", [firma as Record<string, unknown>]);
  for (const [popis, subor, { zive }] of subory) pocty[popis] = pridaj(subor, zive);
  // Počty z koša idú za hlavnými, aby ich prehľad po stiahnutí ukázal oddelene.
  for (const [popis, subor, { vKosi }] of subory)
    pocty[`kôš — ${popis}`] = pridaj(`${PRIECINOK_KOSA}/${subor}`, vKosi);

  let pdfka = 0;
  if (data.s_pdf) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Len súbory z priečinka tejto firmy — cestu v riadku mohol niekto prepísať.
    const vlastny = (cesta: unknown) => String(cesta ?? "").startsWith(`${data.company_id}/`);
    // Najprv živé faktúry, potom kôš — strop nesmie zobrať miesto živým.
    const sPdf = [
      ...fakturyKos.zive.map((f) => ({ f, priecinok: "faktury-pdf" })),
      ...fakturyKos.vKosi.map((f) => ({ f, priecinok: `${PRIECINOK_KOSA}/faktury-pdf` })),
    ]
      .filter(({ f }) => vlastny(f.pdf_url))
      .slice(0, limity.maxPdf);
    for (const { f, priecinok } of sPdf) {
      try {
        const { data: blob } = await supabaseAdmin.storage
          .from("invoice-pdfs")
          .download(String(f.pdf_url));
        if (!blob) continue;
        zip.file(
          `${priecinok}/${nazovSuboru(String(f.invoice_number ?? f.id), "pdf")}`,
          new Uint8Array(await blob.arrayBuffer()),
        );
        pdfka++;
      } catch {
        /* jedno chýbajúce PDF nesmie zhodiť celý balík */
      }
    }
  }

  let skenov = 0;
  if (data.s_skenmi) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const zdroje: {
      kos: string;
      priecinok: string;
      riadky: Record<string, unknown>[];
      cislo: string;
    }[] = [
      {
        kos: "purchase-invoices",
        priecinok: "skeny/prijate-faktury",
        riadky: prijateKos.zive,
        cislo: "invoice_number",
      },
      {
        kos: "expense-receipts",
        priecinok: "skeny/blocky",
        riadky: dokladyKos.zive,
        cislo: "document_number",
      },
      {
        kos: "purchase-invoices",
        priecinok: `${PRIECINOK_KOSA}/skeny/prijate-faktury`,
        riadky: prijateKos.vKosi,
        cislo: "invoice_number",
      },
      {
        kos: "expense-receipts",
        priecinok: `${PRIECINOK_KOSA}/skeny/blocky`,
        riadky: dokladyKos.vKosi,
        cislo: "document_number",
      },
    ];
    for (const z of zdroje) {
      for (const r of z.riadky.filter((x) =>
        String(x.file_path ?? "").startsWith(`${data.company_id}/`),
      )) {
        if (skenov >= limity.maxSkenov) break;
        try {
          const { data: blob } = await supabaseAdmin.storage
            .from(z.kos)
            .download(String(r.file_path));
          if (!blob) continue;
          const pripona = String(r.file_path).split(".").pop()?.slice(0, 5) || "pdf";
          const meno =
            [r.issue_date, r.supplier_name, r[z.cislo]].filter(Boolean).join("_") || String(r.id);
          // Cesta celá v názve — prázdny priečinok (napr. kôš bez skenov) tak nevznikne.
          zip.file(
            `${z.priecinok}/${nazovSuboru(meno, pripona)}`,
            new Uint8Array(await blob.arrayBuffer()),
          );
          skenov++;
        } catch {
          /* chýbajúci sken nezhodí balík */
        }
      }
    }
  }

  zip.file(
    "OBSAH.txt",
    sprievodnyText(String(firma.name ?? ""), new Date().toLocaleString("sk-SK")),
  );

  const obsah = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return {
    obsah,
    pocty,
    pdfka,
    skenov,
    orezaneSkeny: skenov >= limity.maxSkenov,
    orezanePdf: data.s_pdf && faktury.filter((f) => f.pdf_url).length > limity.maxPdf,
  };
}
