import { BookCheck } from "lucide-react";

/**
 * Tlačidlo v hlavičke dokladu: skočí na časť Zaúčtovanie (id „zauctovanie")
 * a na chvíľu ju zvýrazní. Časť je v bočnom stĺpci nízko pod ďalšími
 * panelmi a ľudia ju nenachádzali.
 */
export function skocNaZauctovanie() {
  const el = document.getElementById("zauctovanie");
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("ring-2", "ring-primary", "ring-offset-2");
  setTimeout(() => el.classList.remove("ring-2", "ring-primary", "ring-offset-2"), 2000);
  const pole = el.querySelector<HTMLElement>("select, input, textarea");
  setTimeout(() => pole?.focus({ preventScroll: true }), 400);
}

export function TlacidloZauctovat({ zauctovane }: { zauctovane?: boolean }) {
  return (
    <button
      type="button"
      onClick={skocNaZauctovanie}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-secondary"
    >
      <BookCheck className="h-4 w-4" /> {zauctovane ? "Zaúčtovanie" : "Zaúčtovať"}
    </button>
  );
}
