import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Odsadenie toastov od okrajov obrazovky.
 *
 * Zhora sa musí zmestiť výrez telefónu — bez toho sa upozornenie kreslilo cez
 * hodiny, signál a batériu. `mobileOffset` platí pod 600 px, kde si sonner
 * počíta šírku sám ako „celá obrazovka mínus okraje"; `offset` je pre web.
 *
 * Vyváža sa preto, že mobilná appka používa `Sonner` priamo — s obálkou nižšie
 * by jej `richColors` prebili farby z tried.
 */
export const ODSADENIE_TOASTOV = {
  top: "calc(var(--safe-top) + 8px)",
  left: "12px",
  right: "12px",
  bottom: "12px",
} as const;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      offset={ODSADENIE_TOASTOV}
      mobileOffset={ODSADENIE_TOASTOV}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
