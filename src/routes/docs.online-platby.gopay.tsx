import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/faktero/MarketingShell";

/**
 * Stránka ostáva kvôli uloženým odkazom, ale hovorí to, čo dnes platí.
 *
 * Pôvodne to bol návod, ako si firma pripojí vlastný GoPay účet a dá zákazníkom
 * tlačidlo „Zaplatiť online". Tá funkcia sa stiahla (2026-08-11) skôr, než ju
 * niekto použil — pod spoločnou doménou by na ňu poskytovateľ potreboval
 * platformovú zmluvu. Návod ostal a ďalej sľuboval niečo, čo v aplikácii nie
 * je; to je horšie než prázdna stránka, preto je tu rovné vysvetlenie a
 * `noindex`, nech to vyhľadávače neponúkajú ako funkciu.
 */
export const Route = createFileRoute("/docs/online-platby/gopay")({
  head: () => ({
    meta: [
      { title: "Online platby — Faktero" },
      {
        name: "description",
        content:
          "Platby kartou pre zákazníkov firmy Faktero neponúka. Faktúra nesie QR platbu prevodom a úhrady sa párujú z banky.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Stranka,
});

function Stranka() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-12">
        <p className="text-sm font-medium text-primary">Dokumentácia · Úhrady</p>
        <h1 className="text-3xl font-bold tracking-tight">Online platby</h1>

        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Platby kartou pre vašich zákazníkov neponúkame</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Aby firma mohla prijímať platby kartou pod vlastným účtom, potrebuje poskytovateľ
            platobnej brány zmluvu, ktorá to na spoločnej doméne umožňuje. Kým ju nemáme, funkciu
            neponúkame — je to poctivejšie, než ju sľúbiť a nechať vás zlyhať pri prvom pokuse.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Ako teda dostanete peniaze</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              Faktúra ide zákazníkovi s IBAN-om, variabilným symbolom a{" "}
              <strong>QR kódom na platbu prevodom</strong> — naskenuje ho v mobilnom bankovníctve.
            </li>
            <li>
              Keď platba príde, <strong>párovanie úhrad z banky</strong> označí faktúru za uhradenú
              samo. Podrobne v <Link to="/pomoc/banka">manuáli k banke</Link>.
            </li>
          </ul>
        </div>

        <p className="text-sm text-muted-foreground">
          Platenie <Link to="/pomoc/predplatne">predplatného za Faktero</Link> sa tým nemení — to
          cez platobnú bránu funguje bežne.
        </p>
      </div>
    </MarketingShell>
  );
}
