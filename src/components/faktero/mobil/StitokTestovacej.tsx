/* Štítok „TESTOVACIA“ pri názve testovacej firmy v appke (testovacia-firma.ts). */
import { jeTestovacia } from "@/lib/faktero/testovacia-firma";
import { usePreklad } from "@/lib/mobile/preklady/hook";

export function StitokTestovacejApka({
  firma,
}: {
  firma: { testovacia_pre?: string | null } | null | undefined;
}) {
  const { t } = usePreklad();
  if (!jeTestovacia(firma)) return null;
  return (
    <span className="shrink-0 rounded px-1.5 py-[1px] text-[10px] font-bold uppercase leading-[14px] tracking-wide bg-warning text-warning-foreground">
      {t("app.testovacia")}
    </span>
  );
}
