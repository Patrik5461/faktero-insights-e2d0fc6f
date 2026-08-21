import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/faktero/MarketingShell";
import {
  CreditCard,
  FileText,
  Code2,
  FileCheck2,
  Wallet,
  Boxes,
  HardHat,
  Tag,
  ClipboardList,
  Landmark,
  Percent,
  Lock,
  Car,
  Users,
  Repeat,
  FileDown,
  Truck,
  ReceiptText,
  Plug,
  ScanLine,
  Banknote,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/pomoc/")({
  head: () => ({
    meta: [
      { title: "Pomoc — Faktero" },
      {
        name: "description",
        content:
          "Centrum pomoci Faktero — manuály k faktúram, skladu, cenníku, zákazkám, pokladni, DPH, banke, knihe jázd a API.",
      },
      { property: "og:url", content: "https://faktero.sk/pomoc" },
    ],
    links: [{ rel: "canonical", href: "https://faktero.sk/pomoc" }],
  }),
  component: Page,
});

type Cat = {
  to: string;
  label: string;
  desc: string;
  icon: any;
  available: boolean;
  /** Do ktorej časti rozcestníka položka patrí. */
  skupina: "Fakturácia" | "Sklad a ceny" | "Účtovníctvo" | "Kniha jázd" | "Účet a vývoj";
};
const CATS: Cat[] = [
  {
    to: "/pomoc/faktury",
    label: "Faktúry",
    desc: "Vystavovanie, PDF, odosielanie, dobropisy a zálohové faktúry.",
    icon: FileText,
    available: true,
    skupina: "Fakturácia",
  },
  {
    to: "/pomoc/ponuky",
    label: "Cenové ponuky",
    desc: "Od návrhu k podpisu a premena na objednávku alebo faktúru.",
    icon: FileText,
    available: true,
    skupina: "Fakturácia",
  },
  {
    to: "/pomoc/objednavky",
    label: "Prijaté objednávky",
    desc: "Čo si u vás objednali, rezervácia tovaru a fakturovanie po častiach.",
    icon: ClipboardList,
    available: true,
    skupina: "Fakturácia",
  },
  {
    to: "/pomoc/opakovane",
    label: "Opakované faktúry",
    desc: "Paušály a pravidelné platby, ktoré sa vystavia samy.",
    icon: Repeat,
    available: true,
    skupina: "Fakturácia",
  },
  {
    to: "/pomoc/prijate-faktury",
    label: "Prijaté faktúry",
    desc: "Čo dlžíte, splatnosť a DPH na vstupe.",
    icon: FileText,
    available: true,
    skupina: "Fakturácia",
  },
  {
    to: "/pomoc/odberatelia",
    label: "Odberatelia",
    desc: "Karta odberateľa, jeho ceny, zľava a predvolená zákazka.",
    icon: Users,
    available: true,
    skupina: "Fakturácia",
  },
  {
    to: "/pomoc/efaktura",
    label: "eFaktúra",
    desc: "Pripravenosť na elektronickú fakturáciu 2027.",
    icon: FileCheck2,
    available: true,
    skupina: "Fakturácia",
  },

  {
    to: "/pomoc/sklad",
    label: "Sklad",
    desc: "Karty, pohyby, vážená cena, rezervácie, inventúra a odpočet pri faktúre.",
    icon: Boxes,
    available: true,
    skupina: "Sklad a ceny",
  },
  {
    to: "/pomoc/ceny",
    label: "Cenník a zľavy",
    desc: "Cenové skupiny, dohodnuté ceny, množstevné ceny a akcie.",
    icon: Tag,
    available: true,
    skupina: "Sklad a ceny",
  },
  {
    to: "/pomoc/objednavky-dodavatel",
    label: "Objednávky u dodávateľov",
    desc: "Doobjednanie podľa minima a príjem tovaru na objednávku.",
    icon: Truck,
    available: true,
    skupina: "Sklad a ceny",
  },
  {
    to: "/pomoc/zakazky",
    label: "Zákazky",
    desc: "Výnosy, náklady a marža jednej práce naprieč celým systémom.",
    icon: HardHat,
    available: true,
    skupina: "Sklad a ceny",
  },

  {
    to: "/pomoc/pokladna",
    label: "Pokladňa a doklady",
    desc: "Stav hotovosti, pokladničné doklady, bločky a eKasa QR.",
    icon: ReceiptText,
    available: true,
    skupina: "Účtovníctvo",
  },
  {
    to: "/pomoc/doklady",
    label: "Doklady a skenovanie",
    desc: "Odfotenie bločku, eKasa QR z Finančnej správy a presun medzi prijaté faktúry.",
    icon: ScanLine,
    available: true,
    skupina: "Účtovníctvo",
  },
  {
    to: "/pomoc/dph",
    label: "DPH",
    desc: "Sadzby, daň na vstupe a výstupe, prenesenie daňovej povinnosti.",
    icon: Percent,
    available: true,
    skupina: "Účtovníctvo",
  },
  {
    to: "/pomoc/uzavierka",
    label: "Uzávierka",
    desc: "Uzamknutie období, aby sa staré doklady už nemenili.",
    icon: Lock,
    available: true,
    skupina: "Účtovníctvo",
  },
  {
    to: "/pomoc/banka",
    label: "Bankové účty",
    desc: "Pripojenie banky, párovanie úhrad a bankové výpisy.",
    icon: Landmark,
    available: true,
    skupina: "Účtovníctvo",
  },
  {
    to: "/pomoc/financovanie",
    label: "Leasingy a úvery",
    desc: "Splátkový kalendár s istinou, úrokom a DPH — načítaný zo zmluvy a párovaný s bankou.",
    icon: Banknote,
    available: true,
    skupina: "Účtovníctvo",
  },
  {
    to: "/pomoc/exporty",
    label: "Exporty a importy",
    desc: "Podklady pre účtovníčku a prechod z iného systému.",
    icon: FileDown,
    available: true,
    skupina: "Účtovníctvo",
  },
  {
    to: "/pomoc/pohoda",
    label: "Prepojenie s Pohodou",
    desc: "Mesačné podklady, automatické odosielanie a priame prepojenie.",
    icon: Plug,
    available: true,
    skupina: "Účtovníctvo",
  },

  {
    to: "/pomoc/jazdy",
    label: "Kniha jázd",
    desc: "Vozidlá, spotreba, tankovanie, GPS a prepojenie so zákazkami.",
    icon: Car,
    available: true,
    skupina: "Kniha jázd",
  },

  {
    to: "/pomoc/predplatne",
    label: "Predplatné",
    desc: "Plány, fakturácia, zrušenie predplatného.",
    icon: Wallet,
    available: true,
    skupina: "Účet a vývoj",
  },
  {
    to: "/pomoc/role",
    label: "Role a prístupy",
    desc: "Kto vo firme čo smie — majiteľ, administrátor, účtovník, zamestnanec.",
    icon: Users,
    available: true,
    skupina: "Účet a vývoj",
  },
  {
    to: "/pomoc/api",
    label: "API a webhooky",
    desc: "Napojenie vlastného systému na Faktero.",
    icon: Code2,
    available: true,
    skupina: "Účet a vývoj",
  },
  {
    to: "/pomoc/ai-asistent",
    label: "Faktero AI",
    desc: "Otázky nad vlastnými dátami — kto dlží, čo je po splatnosti, čo poslať účtovníčke.",
    icon: Sparkles,
    available: true,
    skupina: "Účet a vývoj",
  },
];

const SKUPINY = [
  "Fakturácia",
  "Sklad a ceny",
  "Účtovníctvo",
  "Kniha jázd",
  "Účet a vývoj",
] as const;

function Page() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-5xl px-4 py-16">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Pomoc</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Centrum pomoci</h1>
        <p className="mt-2 text-muted-foreground max-w-2xl">
          Vyberte si oblasť, s ktorou potrebujete poradiť. Ak hľadáte konkrétnu odpoveď, napíšte nám
          na{" "}
          <a href="mailto:info@faktero.sk" className="text-primary hover:underline">
            info@faktero.sk
          </a>
          .
        </p>
        {SKUPINY.map((skupina) => (
          <section key={skupina} className="mt-10">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {skupina}
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CATS.filter((c) => c.skupina === skupina).map((c) => {
                const Icon = c.icon;
                const body = (
                  <div
                    className={`h-full rounded-xl border p-5 transition ${c.available ? "border-border bg-card hover:border-emerald-500/50 hover:shadow-sm" : "border-dashed border-border bg-card/40 opacity-70"}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-emerald-50 text-emerald-700">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="font-semibold">{c.label}</div>
                      {!c.available && (
                        <span className="ml-auto text-[10px] font-medium uppercase text-muted-foreground">
                          Pripravujeme
                        </span>
                      )}
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">{c.desc}</p>
                  </div>
                );
                return c.available ? (
                  <Link key={c.label} to={c.to}>
                    {body}
                  </Link>
                ) : (
                  <div key={c.label}>{body}</div>
                );
              })}
            </div>
          </section>
        ))}
        <div className="mt-10 rounded-xl border border-border bg-card p-6 text-sm">
          <h2 className="font-semibold">Právne dokumenty</h2>
          <p className="text-muted-foreground mt-1">
            Obchodné podmienky, GDPR, GoPay podmienky a ďalšie nájdete v sekcii{" "}
            <Link to="/pravne" className="text-primary hover:underline">
              Právne
            </Link>
            .
          </p>
        </div>
      </div>
    </MarketingShell>
  );
}
