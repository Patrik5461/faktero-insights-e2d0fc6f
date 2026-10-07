import { useEffect, useState } from "react";
import { nacitajDizajn, type Dizajn } from "@/lib/faktero/dizajn";

/** Aktuálny dizajn aplikácie; zmení sa hneď po prepnutí (udalosť `faktero:dizajn`). */
export function useDizajn(): Dizajn {
  const [d, setD] = useState<Dizajn>("faktero");
  useEffect(() => {
    setD(nacitajDizajn());
    const zmena = (e: Event) => setD((e as CustomEvent<Dizajn>).detail);
    window.addEventListener("faktero:dizajn", zmena);
    return () => window.removeEventListener("faktero:dizajn", zmena);
  }, []);
  return d;
}
