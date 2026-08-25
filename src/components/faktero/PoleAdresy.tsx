import { useEffect, useId, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { napovedzAdresu } from "@/lib/faktero/trasa.server";

/**
 * Pole na adresu, ktoré počas písania napovedá obce a ulice.
 *
 * Napovedá sa až od troch znakov a s pauzou po dopísaní — na každé písmeno by
 * to bol dopyt navyše a bezplatná úroveň má denný strop. Zoznam je zámerne
 * obyčajný `datalist`: prehliadač ho vykreslí sám, funguje klávesnicou aj
 * čítačkou a nepotrebuje vlastné zatváranie ani obsluhu šípok.
 *
 * Napovedanie je pomôcka, nie povinnosť — dá sa napísať čokoľvek. Cesta bez
 * kľúča k službe či bez signálu preto zlyhá ticho: pole sa správa ako obyčajné.
 */
export function PoleAdresy({
  hodnota,
  onZmena,
  placeholder,
  disabled,
}: {
  hodnota: string;
  onZmena: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const idZoznamu = useId();
  const napovedz = useServerFn(napovedzAdresu);
  const [navrhy, setNavrhy] = useState<string[]>([]);
  /** Čo sme naposledy poslali — nech sa to isté nepýta druhýkrát. */
  const posledne = useRef("");

  useEffect(() => {
    const text = hodnota.trim();
    if (text.length < 3 || text === posledne.current) return;
    const casovac = setTimeout(async () => {
      posledne.current = text;
      try {
        setNavrhy(await napovedz({ data: { text } }));
      } catch {
        // Bez napovedania sa jazda zapíše rovnako dobre.
        setNavrhy([]);
      }
    }, 400);
    return () => clearTimeout(casovac);
  }, [hodnota, napovedz]);

  return (
    <>
      <input
        value={hodnota}
        onChange={(e) => onZmena(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        list={idZoznamu}
        autoComplete="off"
        className="input"
      />
      <datalist id={idZoznamu}>
        {navrhy.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
    </>
  );
}
