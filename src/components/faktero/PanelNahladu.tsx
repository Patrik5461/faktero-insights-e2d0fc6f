import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Spoločný obal panela s náhľadom dokladu.
 *
 * Panel je stĺpec na celú výšku, ktorú mu dá rodič: nástroje hore a pätička
 * dole majú prirodzenú výšku (`shrink-0`), obsah medzi nimi zaberie zvyšok a je
 * JEDINÉ miesto, kde sa roluje. Samotný viewer (`NahladPdf`, obrázok, HTML)
 * vlastný scroll ani strop výšky nemá — inak vzniknú dva vnorené posuvníky
 * a pod dokumentom prázdny pás.
 *
 * Bez pevnej výšky od rodiča (mobil, tok stránky) sa panel natiahne podľa
 * obsahu a roluje stránka.
 */
export const PanelNahladu = forwardRef<
  HTMLDivElement,
  Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
    toolbar?: ReactNode;
    paticka?: ReactNode;
    /** Triedy rolovacej časti (pozadie, odsadenie). */
    obsahClassName?: string;
    children?: ReactNode;
  }
>(function PanelNahladu({ toolbar, paticka, className, obsahClassName, children, ...zvysok }, ref) {
  return (
    <div {...zvysok} className={cn("flex h-full min-h-0 flex-col", className)}>
      {toolbar ? <div className="shrink-0">{toolbar}</div> : null}
      <div
        ref={ref}
        data-nahlad-obsah=""
        className={cn("min-h-0 flex-1 overflow-auto", obsahClassName)}
      >
        {children}
      </div>
      {paticka ? <div className="shrink-0">{paticka}</div> : null}
    </div>
  );
});
