import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import {
  spoj,
  useKlikNaRiadok,
  type CielDetailu,
  type MoznostiRiadku,
} from "@/hooks/useKlikNaRiadok";

/**
 * `<tr>`, ktorý otvorí detail klikom kdekoľvek (pravidlá v `useKlikNaRiadok`).
 *
 *   <KlikatelnyRiadok key={r.id} ciel={{ to: "/faktury/$id", params: { id: r.id } }}>
 *     <td><VyberVRiadku … /></td>                         ← klik = len výber
 *     <td><Link to="/faktury/$id" params={{ id: r.id }}>{r.cislo}</Link></td>
 *     <td>{r.odberatel}</td>                              ← klik = detail
 *     <td><Button …/></td>                                ← klik = len tlačidlo
 *   </KlikatelnyRiadok>
 *
 * Vlastný `onClick`/`onKeyDown` sa zavolá pred otvorením detailu; ak zavolá
 * `e.preventDefault()`, detail sa neotvorí.
 */
export function KlikatelnyRiadok({
  ciel,
  naKlik,
  klavesnica,
  vypnute,
  className,
  onClick,
  onAuxClick,
  onMouseDown,
  onKeyDown,
  ...rest
}: HTMLAttributes<HTMLTableRowElement> & {
  ciel?: CielDetailu | null;
} & MoznostiRiadku) {
  const klik = useKlikNaRiadok();
  const p = klik(ciel, { naKlik, klavesnica, vypnute });
  return (
    <tr
      {...rest}
      {...(p.tabIndex !== undefined ? { tabIndex: p.tabIndex } : {})}
      data-klik-riadok={p["data-klik-riadok"]}
      className={cn(p.className, className)}
      onClick={spoj(onClick, p.onClick)}
      onAuxClick={spoj(onAuxClick, p.onAuxClick)}
      onMouseDown={spoj(onMouseDown, p.onMouseDown)}
      onKeyDown={spoj(onKeyDown, p.onKeyDown)}
    />
  );
}
