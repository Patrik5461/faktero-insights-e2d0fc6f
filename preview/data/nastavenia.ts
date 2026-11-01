/**
 * Demo dáta: nastavenia, integrácie a podpora Demo s.r.o. — API kľúče
 * (len vymyslené odtlačky, žiadny skutočný kľúč), volania API, webhooky
 * a ich doručenia, e-mailové šablóny, poznámky, štítky a stavy dokladov,
 * vlastný SMTP (vypnutý), pozvánka do firmy, platobná brána (vypnutá),
 * e-shop napojenia, help desk (požiadavky P-xxxx so správami) a história
 * AI asistenta. Modul beží posledný — môže odkazovať na všetky doklady.
 */
import type { DemoDb, Riadok } from "../server/db";
import { DEMO_UCTY } from "../server/ucty";
import { FIRMA, MAJITEL, UCTOVNIK, VLASTNY } from "./zaklad";
import { FAKTURY } from "./faktury";
import { cas, nahoda, uid } from "./pomocne";

export function naplnNastavenia(db: DemoDb) {
  const n = nahoda(4242);

  /* ---------------- API kľúče a volania */
  const kluce = [
    {
      id: uid("api-kluc:live"),
      name: "Napojenie e-shopu (LIVE)",
      mode: "live",
      prefix: "fk_live_demo1",
      created_at: cas(-200),
      last_used_at: cas(0, 8, 12),
    },
    {
      id: uid("api-kluc:test"),
      name: "Testovanie integrácie",
      mode: "test",
      prefix: "fk_test_demo2",
      created_at: cas(-60),
      last_used_at: cas(-12),
    },
    {
      id: uid("api-kluc:pohoda"),
      name: "Konektor Pohoda – účtovná kancelária",
      mode: "live",
      prefix: "fk_live_demo3",
      created_at: cas(-150),
      last_used_at: cas(-1, 23),
    },
    {
      id: uid("api-kluc:zruseny"),
      name: "Starý kľúč (zrušený)",
      mode: "live",
      prefix: "fk_live_demo4",
      created_at: cas(-380),
      last_used_at: cas(-220),
      revoked_at: cas(-200),
    },
  ];
  db.vloz(
    "api_keys",
    kluce.map((k, i) => ({
      ...k,
      company_id: FIRMA,
      created_by: MAJITEL,
      key_hash: `demo-hash-${i}-nie-je-skutocny-kluc`,
    })),
  );
  const cesty: [string, string, number][] = [
    ["GET", "/api/v1/invoices", 200],
    ["POST", "/api/v1/invoices", 201],
    ["GET", "/api/v1/customers", 200],
    ["GET", "/api/v1/invoices/20260042", 200],
    ["POST", "/api/v1/invoices", 422],
    ["GET", "/api/v1/products", 200],
    ["POST", "/api/v1/purchase-invoices", 201],
    ["GET", "/api/v1/invoices?status=unpaid", 200],
    ["DELETE", "/api/v1/webhooks/abc", 404],
    ["GET", "/api/v1/bank-transactions", 401],
  ];
  const apiLogy: Riadok[] = [];
  for (let i = 0; i < 60; i++) {
    const [method, path, status] = cesty[i % cesty.length];
    const posun = -Math.floor(i / 3);
    apiLogy.push({
      id: uid(`api-log:${i}`),
      company_id: FIRMA,
      api_key_id: kluce[i % 3].id,
      method,
      path,
      status,
      duration_ms: n.cele(18, 420),
      ip: "127.0.0.1",
      user_agent: i % 2 ? "WooCommerce-Faktero/2.1 (demo)" : "curl/8.5.0",
      request_body:
        method === "POST"
          ? { customer_id: "demo", items: [{ name: "Konzultácia", quantity: 1, unit_price: 65 }] }
          : null,
      response_body:
        status >= 400
          ? {
              error:
                status === 422
                  ? "Chýba položka items[0].vat_rate (demo)"
                  : status === 401
                    ? "Neplatný API kľúč"
                    : "Nenájdené",
            }
          : { ok: true },
      created_at: cas(posun, 8 + (i % 10), (i * 7) % 60),
    });
  }
  db.vloz("api_logs", apiLogy);

  /* ---------------- webhooky */
  const webhooky = [
    {
      id: uid("webhook:eshop"),
      url: "https://eshop-demo.example/faktero/webhook",
      events: ["invoice.created", "invoice.paid", "invoice.sent"],
      active: true,
      created_at: cas(-180),
    },
    {
      id: uid("webhook:crm"),
      url: "https://crm-demo.example/hooks/faktero-velmi-dlha-adresa-pre-test-zalamovania-v-tabulke?token=demo",
      events: ["invoice.paid", "bank_transaction.created"],
      active: true,
      created_at: cas(-90),
    },
    {
      id: uid("webhook:stary"),
      url: "https://stary-system.example/hook",
      events: ["invoice.created"],
      active: false,
      created_at: cas(-300),
    },
  ];
  db.vloz(
    "webhooks",
    webhooky.map((w) => ({ ...w, company_id: FIRMA, secret: "whsec_demo_nie_je_skutocny" })),
  );
  const dorucenia: Riadok[] = [];
  const faktury = FAKTURY.filter((f) => f.company_id === FIRMA && f.type === "regular").slice(-40);
  for (let i = 0; i < 45; i++) {
    const w = webhooky[i % 2];
    const f = faktury[i % faktury.length];
    const event = w.events[i % w.events.length];
    const zlyhal = i % 9 === 4;
    const caka = i === 2;
    dorucenia.push({
      id: uid(`webhook-dorucenie:${i}`),
      company_id: FIRMA,
      webhook_id: w.id,
      event_type: event,
      status: caka ? "pending" : zlyhal ? "failed" : "success",
      attempt_count: zlyhal ? 5 : caka ? 1 : 1,
      response_status: caka ? null : zlyhal ? 500 : 200,
      response_body: zlyhal ? "Internal Server Error (demo)" : caka ? null : '{"ok":true}',
      error_message: zlyhal ? "Server príjemcu vrátil 500 (demo)" : null,
      duration_ms: n.cele(40, 900),
      payload: {
        event,
        data: { id: f.id, invoice_number: f.invoice_number, total: f.total, currency: f.currency },
      },
      last_attempt_at: cas(-Math.floor(i / 2), 9 + (i % 8)),
      next_attempt_at: caka ? cas(0, 23) : null,
      created_at: cas(-Math.floor(i / 2), 9 + (i % 8)),
    });
  }
  db.vloz("webhook_delivery_logs", dorucenia);
  db.vloz(
    "webhook_logs",
    dorucenia
      .slice(0, 15)
      .map((d, i) => ({
        id: uid(`webhook-log:${i}`),
        company_id: FIRMA,
        webhook_id: d.webhook_id,
        event: d.event_type,
        status: d.response_status,
        payload: d.payload,
        response: d.response_body,
        created_at: d.created_at,
      })),
  );

  /* ---------------- e-mailové šablóny */
  db.vloz("email_sablony", [
    {
      id: uid("sablona:1"),
      company_id: FIRMA,
      nazov: "Štandardná faktúra",
      typ_dokladu: "regular",
      jazyk: "sk",
      predmet: "Faktúra {cislo} od {firma}",
      text: "Dobrý deň,\n\nv prílohe posielame faktúru {cislo} so splatnosťou {splatnost} na sumu {suma}.\n\nS pozdravom\n{firma}",
      created_at: cas(-100),
    },
    {
      id: uid("sablona:2"),
      company_id: FIRMA,
      nazov: "Invoice (English)",
      typ_dokladu: "vsetky",
      jazyk: "en",
      predmet: "Invoice {cislo} from {firma}",
      text: "Dear customer,\n\nplease find attached invoice {cislo} due on {splatnost}.\n\nKind regards,\n{firma}",
      created_at: cas(-90),
    },
    {
      id: uid("sablona:3"),
      company_id: FIRMA,
      nazov: "Zálohová faktúra – výzva na úhradu",
      typ_dokladu: "proforma",
      jazyk: "sk",
      predmet: "Zálohová faktúra {cislo}",
      text: "Dobrý deň,\n\npred začatím prác Vás prosíme o úhradu zálohy {suma}.\n\nĎakujeme.",
      created_at: cas(-80),
    },
    {
      id: uid("sablona:4"),
      company_id: FIRMA,
      nazov: "Cenová ponuka",
      typ_dokladu: "ponuka",
      jazyk: "sk",
      predmet: "Cenová ponuka {cislo}",
      text: "Dobrý deň,\n\nposielame cenovú ponuku. Ponuku môžete prijať priamo cez odkaz v e-maile.",
      created_at: cas(-70),
    },
    {
      id: uid("sablona:5"),
      company_id: FIRMA,
      nazov: "Upomienka – priateľská",
      typ_dokladu: "upomienka",
      jazyk: "vsetky",
      predmet: "Pripomienka úhrady faktúry {cislo}",
      text: "Dobrý deň,\n\nevidujeme neuhradenú faktúru {cislo}. Ak ste už platili, považujte správu za bezpredmetnú.",
      created_at: cas(-60),
    },
  ]);
  db.vloz("email_templates", [
    {
      id: uid("email-template:send"),
      company_id: FIRMA,
      template_type: "invoice_send",
      subject: "Faktúra {invoice_number}",
      body: "Dobrý deň,\n\nv prílohe Vám posielame faktúru {invoice_number} so splatnosťou {due_date}.\n\nĎakujeme za spoluprácu.",
      created_at: cas(-200),
    },
    {
      id: uid("email-template:r1"),
      company_id: FIRMA,
      template_type: "reminder_1",
      subject: "1. upomienka – faktúra {invoice_number}",
      body: "Dobrý deň,\n\nupozorňujeme na neuhradenú faktúru {invoice_number} po splatnosti.",
      created_at: cas(-200),
    },
  ]);

  /* ---------------- poznámky, štítky, stavy */
  db.vloz("preddefinovane_poznamky", [
    {
      id: uid("poznamka:1"),
      company_id: FIRMA,
      nazov: "Výhrada vlastníctva",
      text: "Tovar zostáva až do úplného zaplatenia vo vlastníctve predávajúceho.",
      agendy: ["faktura"],
      poradie: 1,
    },
    {
      id: uid("poznamka:2"),
      company_id: FIRMA,
      nazov: "Prenesenie daňovej povinnosti",
      text: "Prenesenie daňovej povinnosti podľa § 69 ods. 12 zákona o DPH.",
      agendy: ["faktura"],
      poradie: 2,
    },
    {
      id: uid("poznamka:3"),
      company_id: FIRMA,
      nazov: "Služobná cesta",
      text: "Výdavok súvisí so služobnou cestou (demo).",
      agendy: ["blocek", "nespracovane"],
      poradie: 3,
    },
    {
      id: uid("poznamka:4"),
      company_id: FIRMA,
      nazov: "Skontrolovať s účtovníkom",
      text: "Pred zaúčtovaním overiť zatriedenie nákladu s účtovnou kanceláriou.",
      agendy: ["prijata_faktura", "blocek"],
      poradie: 4,
    },
  ]);
  const stitky: [string, string][] = [
    ["projekt A", "modra"],
    ["dôležité", "cervena"],
    ["web", "fialova"],
    ["veľká zákazka", "zelena"],
    ["montáž", "oranzova"],
    ["zaškolenie", "siva"],
  ];
  db.vloz(
    "stitky_firmy",
    stitky.map(([nazov, farba], i) => ({
      id: uid(`stitok:${nazov}`),
      company_id: FIRMA,
      nazov,
      farba,
      created_by: MAJITEL,
      created_at: cas(-150 + i),
    })),
  );
  db.vloz("stavy_dokladov", [
    {
      id: uid("stav:kontrola"),
      company_id: FIRMA,
      nazov: "Na kontrolu",
      farba: "oranzova",
      poradie: 1,
      aktivne: true,
      created_by: MAJITEL,
    },
    {
      id: uid("stav:schvalene"),
      company_id: FIRMA,
      nazov: "Schválené konateľom",
      farba: "zelena",
      poradie: 2,
      aktivne: true,
      created_by: MAJITEL,
    },
    {
      id: uid("stav:reklamacia"),
      company_id: FIRMA,
      nazov: "Reklamácia",
      farba: "cervena",
      poradie: 3,
      aktivne: true,
      created_by: MAJITEL,
    },
    {
      id: uid("stav:stary"),
      company_id: FIRMA,
      nazov: "Archív (nepoužívať)",
      farba: "siva",
      poradie: 4,
      aktivne: false,
      created_by: MAJITEL,
    },
  ]);
  // Pár faktúr so stavom dokladu (nastavuje sa riadok faktúry v pamäti)
  for (const [i, f] of db
    .tabulka("invoices")
    .filter((x) => x.company_id === FIRMA && x.status === "sent")
    .slice(0, 4)
    .entries()) {
    f.stav_id = i < 2 ? uid("stav:kontrola") : uid("stav:reklamacia");
  }

  /* Schvaľovacie cesty a zapnutie schvaľovania zakladá modul doklady.ts. */

  /* ---------------- SMTP, pozvánka, platobná brána, e-shopy */
  db.vloz("firma_smtp", [
    {
      company_id: FIRMA,
      aktivne: false,
      host: "smtp.demo-sro.example",
      port: 587,
      zabezpecenie: "starttls",
      pouzivatel: "fakturacia@demo-sro.example",
      heslo_sifrovane: null,
      od_email: "fakturacia@demo-sro.example",
      od_meno: "Demo s.r.o.",
      updated_by: MAJITEL,
      updated_at: cas(-40),
    },
  ]);
  db.vloz("company_invitations", [
    {
      id: uid("pozvanka:1"),
      company_id: FIRMA,
      email: "novy.kolega@demo-sro.example",
      role: "employee",
      permissions: {},
      token: "demo-pozvanka-token-1",
      invited_by: MAJITEL,
      expires_at: cas(9),
      created_at: cas(-5),
    },
    {
      id: uid("pozvanka:2"),
      company_id: FIRMA,
      email: "externy.uctovnik@ucto-demo.example",
      role: "custom",
      permissions: { uctovnictvo: "edit", doklady: "read" },
      token: "demo-pozvanka-token-2",
      invited_by: MAJITEL,
      expires_at: cas(-2),
      created_at: cas(-16),
    },
  ]);
  db.vloz("company_payment_providers", [
    {
      id: uid("brana:gopay"),
      company_id: FIRMA,
      provider: "gopay",
      enabled: false,
      sandbox_mode: true,
      goid: "0000000000",
      client_id: "demo-client",
      encrypted_client_secret: null,
      created_at: cas(-100),
    },
  ]);
  db.vloz("zasielkovna_napojenia", [
    {
      company_id: FIRMA,
      api_kluc: "demo-nie-je-skutocny",
      heslo_sifrovane: "demo",
      odosielatel: "Demo s.r.o.",
      updated_by: MAJITEL,
      updated_at: cas(-30),
    },
  ]);
  db.vloz("transeu_napojenia", [
    {
      company_id: FIRMA,
      stav: "caka",
      firma_nazov: null,
      auto_sync: false,
      created_at: cas(-20),
      updated_at: cas(-20),
    },
  ]);

  /* ---------------- prečítané upozornenia */
  db.vloz("notification_reads", [
    {
      id: uid("precitane:1"),
      company_id: FIRMA,
      user_id: MAJITEL,
      notification_key: "demo:privitanie",
      read_at: cas(-30),
    },
  ]);

  /* ---------------- help desk */
  const poziadavky: [string, string, string, string, number][] = [
    ["Ako nastavím vlastný číselný rad pre pobočku?", "otazka", "vyriesena", "podpora", 40],
    ["Export do Pohody hlási chybu pri dobropise", "chyba", "otvorena", "zakaznik", 6],
    ["Návrh: hromadné odoslanie upomienok jedným klikom", "napad", "nova", "zakaznik", 2],
    [
      "Faktúra predplatného – potrebujeme doplniť IČ DPH",
      "predplatne",
      "caka_na_zakaznika",
      "podpora",
      4,
    ],
    [
      "Po prihlásení na mobile sa nenačítajú bločky z minulého mesiaca, hoci na webe sú – prosím o kontrolu (dlhý predmet)",
      "chyba",
      "vyriesena",
      "podpora",
      75,
    ],
  ];
  const spravy: Riadok[] = [];
  db.vloz(
    "podpora_poziadavky",
    poziadavky.map(([predmet, kategoria, stav, poslednaOd, dni], i) => {
      const id = uid(`podpora:${i}`);
      const zakladnyCas = cas(-dni, 9);
      const texty = [
        { od: false, text: `${predmet}\n\nDobrý deň, prosím o pomoc. (demo požiadavka)` },
        {
          od: true,
          text: "Dobrý deň, ďakujeme za správu. Pozreli sme sa na to — postup nájdete v Nastavenia → Číselné rady. (demo odpoveď)",
        },
        { od: false, text: "Ďakujem, funguje to." },
      ].slice(0, stav === "nova" ? 1 : stav === "otvorena" ? 2 : 3);
      texty.forEach((t, j) =>
        spravy.push({
          id: uid(`podpora-sprava:${i}:${j}`),
          poziadavka_id: id,
          autor_id: t.od ? null : MAJITEL,
          od_podpory: t.od,
          interna: false,
          text: t.text,
          created_at: cas(-dni + j, 10 + j),
          cez_email: false,
        }),
      );
      return {
        id,
        cislo: 1040 + i,
        user_id: MAJITEL,
        company_id: FIRMA,
        email: DEMO_UCTY[0].email,
        meno: DEMO_UCTY[0].meno,
        predmet,
        kategoria,
        stav,
        zdroj: "aplikacia",
        url: "/faktury",
        posledna_sprava_at: cas(-dni + texty.length - 1, 9 + texty.length),
        posledna_od: poslednaOd,
        zakaznik_videl_at: i === 3 ? null : cas(-1),
        podpora_videla_at: cas(-dni, 11),
        odpoved_token: `demo-token-${i}`,
        created_at: zakladnyCas,
        updated_at: cas(-dni + texty.length - 1, 12),
      };
    }),
  );
  db.vloz("podpora_spravy", spravy);
  db.vloz("podpora_prilohy", [
    {
      id: uid("podpora-priloha:1"),
      poziadavka_id: uid("podpora:1"),
      sprava_id: uid("podpora-sprava:1:0"),
      path: `${FIRMA}/podpora/snimka-chyby.png`,
      name: "snimka-chyby.png",
      mime: "image/png",
      size: 21561,
      created_by: MAJITEL,
      created_at: cas(-6, 9),
    },
  ]);

  /* ---------------- AI asistent */
  const konverzacie: [string, [string, string][]][] = [
    [
      "Koľko mi dlhujú odberatelia?",
      [
        ["user", "Koľko mi dlhujú odberatelia po splatnosti?"],
        [
          "assistant",
          "Po splatnosti evidujem niekoľko faktúr (demo odpoveď). Najväčší dlžník je Stredoeurópske centrum pre inovácie. Chcete im poslať upomienku?",
        ],
      ],
    ],
    [
      "Vystav faktúru pre Alfa Stavby",
      [
        ["user", "Vystav faktúru pre Alfa Stavby na 10 hodín konzultácie."],
        [
          "assistant",
          "Pripravil som koncept faktúry pre Alfa Stavby s.r.o.: Konzultácia – hodinová sadzba, 10 hod × 65,00 € + DPH 23 %. Skontrolujte ho a vystavte (demo).",
        ],
      ],
    ],
    [
      "Ako zaúčtovať leasing?",
      [
        ["user", "Ako sa účtuje splátka leasingu auta?"],
        [
          "assistant",
          "Splátku rozdeľte na istinu, úrok a DPH — v agende Banka → Leasingy a úvery sa rozpad počíta sám (demo odpoveď).",
        ],
      ],
    ],
  ];
  konverzacie.forEach(([titul, msg], i) => {
    const id = uid(`ai-konverzacia:${i}`);
    db.vloz("ai_conversations", [
      {
        id,
        company_id: FIRMA,
        user_id: MAJITEL,
        title: titul,
        created_at: cas(-10 + i * 3),
        updated_at: cas(-10 + i * 3, 11),
      },
    ]);
    db.vloz(
      "ai_messages",
      msg.map(([role, content], j) => ({
        id: uid(`ai-sprava:${i}:${j}`),
        conversation_id: id,
        role,
        content,
        metadata: {},
        created_at: cas(-10 + i * 3, 10, j * 2),
      })),
    );
  });

  void VLASTNY;
}
