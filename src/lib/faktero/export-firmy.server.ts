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
  quotes: { vystavenia: "issue_date", dodania: "issue_date", vytvorenia: "created_at" },
  sales_orders: { vystavenia: "order_date", dodania: "order_date", vytvorenia: "created_at" },
  purchase_orders: { vystavenia: "order_date", dodania: "order_date", vytvorenia: "created_at" },
};

/*
  Ďalšie agendy firmy, ktoré balík predtým vynechával (úhrady, ponuky,
  objednávky, sklad, vozidlá, leasingy, prílohy…). Tabuľka, ktorú klient
  nesmie čítať (práva po stĺpcoch, chýbajúci modul), sa preskočí — balík
  kvôli nej nesmie spadnúť.
*/
const DALSIE_AGENDY: [subor: string, tabulka: string, pocet: string][] = [
  ["uhrady-faktur.csv", "payments", "úhrady faktúr"],
  ["uhrady-prijatych.csv", "purchase_invoice_payments", "úhrady prijatých faktúr"],
  ["zalohy-faktur.csv", "invoice_advances", "zúčtované zálohy"],
  ["ponuky.csv", "quotes", "cenové ponuky"],
  ["objednavky.csv", "sales_orders", "objednávky"],
  ["objednavky-dodavatelom.csv", "purchase_orders", "objednávky dodávateľom"],
  ["pravidelne-faktury.csv", "recurring_invoices", "pravidelné faktúry"],
  ["cennik-ceny.csv", "product_prices", "osobitné ceny"],
  ["cenove-skupiny.csv", "price_groups", "cenové skupiny"],
  ["sklad-sklady.csv", "warehouses", "sklady"],
  ["sklad-karty.csv", "stock_items", "skladové karty"],
  ["sklad-pohyby.csv", "stock_movements", "skladové pohyby"],
  ["bankove-ucty.csv", "company_bank_accounts", "bankové účty"],
  ["vozidla.csv", "vehicles", "vozidlá"],
  ["tankovanie.csv", "fuel_records", "tankovanie"],
  ["financovanie.csv", "financing_contracts", "leasingy a úvery"],
  ["financovanie-splatky.csv", "financing_installments", "splátky"],
  ["vyuctovania-vydavkov.csv", "vyuctovania_vydavkov", "vyúčtovania výdavkov"],
  ["prilohy-faktur.csv", "invoice_attachments", "prílohy faktúr"],
  ["prilohy-dokladov.csv", "prilohy_dokladov", "prílohy prijatých dokladov"],
  ["ostatne-doklady-subory.csv", "other_document_files", "súbory ostatných dokladov"],
];

/** Položky dokladov, ktoré sa viažu na doklad, nie na firmu. */
const POLOZKY_DOKLADOV: [subor: string, tabulka: string, stlpec: string, rodic: string][] = [
  ["ponuky-polozky.csv", "quote_items", "quote_id", "quotes"],
  ["objednavky-polozky.csv", "sales_order_items", "sales_order_id", "sales_orders"],
  [
    "objednavky-dodavatelom-polozky.csv",
    "purchase_order_items",
    "purchase_order_id",
    "purchase_orders",
  ],
];

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
  const { naCsv, nazovSuboru, sprievodnyText, volnyNazov, rozdelPodlaKosa, PRIECINOK_KOSA } =
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

  // Ďalšie agendy — každá zvlášť, chyba jednej nezhodí balík.
  const dalsie: Record<string, Record<string, unknown>[]> = {};
  const preskocene: string[] = [];
  await Promise.all(
    DALSIE_AGENDY.map(async ([, tabulka]) => {
      try {
        dalsie[tabulka] = await zTabulky(tabulka);
      } catch {
        dalsie[tabulka] = [];
        preskocene.push(tabulka);
      }
    }),
  );
  const polozkyDokladov: Record<string, Record<string, unknown>[]> = {};
  for (const [, tabulka, stlpec, rodic] of POLOZKY_DOKLADOV) {
    try {
      polozkyDokladov[tabulka] = await riadkyPreIds<Record<string, unknown>>(
        (dalsie[rodic] ?? []).map((r) => String(r.id)),
        (kus, zac, kon) =>
          supabase
            .from(tabulka)
            .select("*")
            .in(stlpec, kus)
            .order(stlpec)
            .order("id")
            .range(zac, kon),
      );
    } catch {
      polozkyDokladov[tabulka] = [];
      preskocene.push(tabulka);
    }
  }

  /*
    Kôš (`deleted_at`) ide do samostatného priečinka, nie preč — pozri
    `rozdelPodlaKosa`. Rozdeľuje sa každá tabuľka, aby sa na stĺpec
    nezabudlo, keď ho niektorá ďalšia dostane. Položky faktúr idú za faktúrou.
  */
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
    ...DALSIE_AGENDY.map(
      ([subor, tabulka, nazov]) =>
        [nazov, subor, rozdelPodlaKosa(dalsie[tabulka] ?? [])] as [
          string,
          string,
          ReturnType<typeof rozdelPodlaKosa>,
        ],
    ),
    ...POLOZKY_DOKLADOV.map(
      ([subor, tabulka]) =>
        [subor.replace(/\.csv$/, ""), subor, rozdelPodlaKosa(polozkyDokladov[tabulka] ?? [])] as [
          string,
          string,
          ReturnType<typeof rozdelPodlaKosa>,
        ],
    ),
  ];

  const pocty: Record<string, number> = {};
  pocty["firma"] = pridaj("firma.csv", [firma as Record<string, unknown>]);
  for (const [popis, subor, { zive }] of subory) pocty[popis] = pridaj(subor, zive);
  // Počty z koša idú za hlavnými (len neprázdne), aby ich prehľad ukázal oddelene.
  for (const [popis, subor, { vKosi }] of subory)
    if (vKosi.length) pocty[`kôš — ${popis}`] = pridaj(`${PRIECINOK_KOSA}/${subor}`, vKosi);

  let pdfka = 0;
  if (data.s_pdf) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const pouzite = new Set<string>();
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
        // Cesta celá v názve — prázdny priečinok (napr. kôš bez PDF) tak nevznikne.
        zip.file(
          `${priecinok}/${volnyNazov(pouzite, nazovSuboru(String(f.invoice_number ?? f.id), "pdf"))}`,
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
    const doklad = (riadky: Record<string, unknown>[]) =>
      new Map(riadky.map((r) => [String(r.id), r]));
    const fakturyPodlaId = doklad(faktury);
    const prijatePodlaId = doklad(prijate);
    const dokladyPodlaId = doklad(doklady);
    const ostatnePodlaId = doklad(ostatne);
    const zdroje: {
      kos: string;
      priecinok: string;
      riadky: Record<string, unknown>[];
      /** Cesta k súboru v riadku. */
      cesta: string;
      /** Názov súboru v balíku (bez prípony). */
      meno: (r: Record<string, unknown>) => unknown[];
    }[] = [
      {
        kos: "purchase-invoices",
        priecinok: "skeny/prijate-faktury",
        riadky: prijateKos.zive,
        cesta: "file_path",
        meno: (r) => [r.issue_date, r.supplier_name, r.invoice_number],
      },
      {
        kos: "expense-receipts",
        priecinok: "skeny/blocky",
        riadky: dokladyKos.zive,
        cesta: "file_path",
        meno: (r) => [r.issue_date, r.supplier_name, r.document_number],
      },
      {
        // Ostatné doklady (listy, predpisy, zmluvy) majú súbory v samostatnej tabuľke.
        kos: "other-docs",
        priecinok: "skeny/ostatne-doklady",
        riadky: dalsie.other_document_files ?? [],
        cesta: "path",
        meno: (r) => {
          const d = ostatnePodlaId.get(String(r.document_id));
          return [d?.received_date, d?.sender, d?.subject, r.name];
        },
      },
      {
        kos: "invoice-attachments",
        priecinok: "prilohy/faktury",
        riadky: dalsie.invoice_attachments ?? [],
        cesta: "path",
        meno: (r) => [fakturyPodlaId.get(String(r.invoice_id))?.invoice_number, r.name],
      },
      {
        kos: "invoice-attachments",
        priecinok: "prilohy/doklady",
        riadky: dalsie.prilohy_dokladov ?? [],
        cesta: "path",
        meno: (r) => [
          prijatePodlaId.get(String(r.purchase_invoice_id))?.invoice_number ??
            dokladyPodlaId.get(String(r.expense_document_id))?.document_number,
          r.name,
        ],
      },
      // Skeny dokladov z koša — až za živými, aby im strop nezobral miesto.
      {
        kos: "purchase-invoices",
        priecinok: `${PRIECINOK_KOSA}/skeny/prijate-faktury`,
        riadky: prijateKos.vKosi,
        cesta: "file_path",
        meno: (r) => [r.issue_date, r.supplier_name, r.invoice_number],
      },
      {
        kos: "expense-receipts",
        priecinok: `${PRIECINOK_KOSA}/skeny/blocky`,
        riadky: dokladyKos.vKosi,
        cesta: "file_path",
        meno: (r) => [r.issue_date, r.supplier_name, r.document_number],
      },
    ];
    for (const z of zdroje) {
      const pouzite = new Set<string>();
      for (const r of z.riadky.filter((x) =>
        String(x[z.cesta] ?? "").startsWith(`${data.company_id}/`),
      )) {
        if (skenov >= limity.maxSkenov) break;
        try {
          const { data: blob } = await supabaseAdmin.storage
            .from(z.kos)
            .download(String(r[z.cesta]));
          if (!blob) continue;
          const subor = String(r[z.cesta]);
          const pripona = subor.includes(".") ? subor.split(".").pop()!.slice(0, 5) : "pdf";
          const meno =
            z
              .meno(r)
              .filter(Boolean)
              .map((c) => String(c).replace(/\.[a-z0-9]{2,5}$/i, ""))
              .join("_") || String(r.id);
          zip.file(
            `${z.priecinok}/${volnyNazov(pouzite, nazovSuboru(meno, pripona))}`,
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
    sprievodnyText(String(firma.name ?? ""), new Date().toLocaleString("sk-SK")) +
      (preskocene.length
        ? `\n\nNezahrnuté (bez prístupu alebo chyba čítania): ${preskocene.join(", ")}\n`
        : ""),
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
