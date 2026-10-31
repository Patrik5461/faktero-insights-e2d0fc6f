/**
 * Mastercard v rade platobných značiek.
 *
 * Kedysi to bol text „Master“ červenou a „card“ oranžovou — oranžová na
 * svetlom pozadí mala kontrast 2:1 (WCAG žiada 4,5:1) a čítačka čítala dve
 * slová. Farby značky teraz nesú dva kruhy (grafika, nie text) a názov je
 * písaný bežnou farbou textu.
 */
export function MastercardZnacka() {
  return (
    <>
      <svg
        viewBox="0 0 24 15"
        className="h-3 w-[19px] shrink-0"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="7.5" cy="7.5" r="7.5" fill="#eb001b" />
        <circle cx="16.5" cy="7.5" r="7.5" fill="#f79e1b" />
        <path d="M12 2.9a7.5 7.5 0 0 1 0 9.2 7.5 7.5 0 0 1 0-9.2z" fill="#ff5f00" />
      </svg>
      <span className="text-foreground">Mastercard</span>
    </>
  );
}
