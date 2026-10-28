/**
 * Preklad celých kusov JSX — manuálov v Pomoci.
 *
 * Manuály sú dlhé odseky so `<strong>`, `<Link>` a `<code>` uprostred vety.
 * Obaliť každý kúsok do `t(...)` by vetu rozsekalo na úlomky, ktoré sa do
 * nemčiny preložiť nedajú (iný slovosled). Preto sa prekladá celý odsek:
 * zo stromu React prvkov sa poskladá kľúč, v ktorom sú vnorené prvky
 * očíslované značkami — napríklad
 *
 *   „V <0>Opakované → Nová</0> zadajte odberateľa a <1>dátum vystavenia</1>."
 *
 * Preklad smie značky presunúť (slovosled), ale musí zachovať ich čísla.
 * Prvky sa potom vrátia na svoje miesto s pôvodnými vlastnosťami (odkaz,
 * trieda). Obsah `<code>` a `<pre>` ostáva vždy pôvodný.
 *
 * Zdroják manuálu tak ostáva čistá slovenčina — číta ho aj
 * `scripts/znalosti-manualy.mjs` pre AI asistenta. Kľúče a kontrolu prekladov
 * robí `pomoc-preklad.test.tsx` (`PREKLAD_VYPIS=1` vypíše chýbajúce).
 */
import {
  Children,
  cloneElement,
  isValidElement,
  useMemo,
  type ReactElement,
  type ReactNode,
} from "react";
import { HelpArticle, type HelpSection } from "@/components/faktero/HelpArticle";
import { useT } from "./useT";

type Prekladac = (text: string) => string;
type Prvok = ReactElement<Record<string, unknown> & { children?: ReactNode }>;

/** Prvky, ktoré tvoria vlastný odsek — v kľúči sú len ako `<n/>` a prekladajú sa zvlášť. */
const BLOKY = new Set([
  "p",
  "ul",
  "ol",
  "li",
  "div",
  "section",
  "article",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "dl",
  "dt",
  "dd",
  "blockquote",
  "pre",
  "figure",
  "figcaption",
  "details",
  "summary",
  "nav",
  "aside",
  "header",
  "footer",
]);
/** Obsah sa neprekladá nikdy (kód, ukážky). */
const NEPREKLADAT = new Set(["code", "pre", "kbd", "samp", "svg"]);
const ATRIBUTY = ["title", "alt", "aria-label", "placeholder"] as const;

const jeBlok = (el: Prvok) => typeof el.type === "string" && BLOKY.has(el.type);
const neprekladat = (el: Prvok) => typeof el.type === "string" && NEPREKLADAT.has(el.type);
const jeText = (n: ReactNode) =>
  (typeof n === "string" && n.trim() !== "") || typeof n === "number";
const maDeti = (el: Prvok) =>
  el.props.children !== undefined &&
  el.props.children !== null &&
  typeof el.props.children !== "function";

function atributy(el: Prvok, t: Prekladac): Record<string, string> | null {
  if (typeof el.type !== "string") return null;
  let zmena: Record<string, string> | null = null;
  for (const a of ATRIBUTY) {
    const v = el.props[a];
    if (typeof v === "string" && v.trim()) (zmena ??= {})[a] = t(v);
  }
  return zmena;
}

/** Preloží ľubovoľný uzol stromu. */
export function prelozStrom(uzol: ReactNode, t: Prekladac): ReactNode {
  if (Array.isArray(uzol)) return uzol.map((u) => prelozStrom(u, t));
  if (typeof uzol === "string") return uzol.trim() ? t(uzol.replace(/\s+/g, " ").trim()) : uzol;
  if (!isValidElement(uzol)) return uzol;
  const el = uzol as Prvok;
  if (neprekladat(el)) return el;
  const attr = atributy(el, t);
  if (!maDeti(el)) return attr ? cloneElement(el, attr) : el;
  const deti = Children.toArray(el.props.children);
  const nove = deti.some(jeText) ? prelozOdsek(deti, t) : deti.map((d) => prelozStrom(d, t));
  return cloneElement(el, attr ?? {}, ...nove);
}

/** Kľúč odseku — text s očíslovanými vnorenými prvkami. */
function kluc(deti: ReactNode[], prvky: Prvok[]): string {
  let s = "";
  for (const d of deti) {
    if (typeof d === "string") s += d;
    else if (typeof d === "number") s += String(d);
    else if (isValidElement(d)) {
      const el = d as Prvok;
      const i = prvky.length;
      prvky.push(el);
      s +=
        jeBlok(el) || !maDeti(el)
          ? `<${i}/>`
          : `<${i}>${kluc(Children.toArray(el.props.children), prvky)}</${i}>`;
    }
  }
  return s;
}

type Kus = string | { i: number; deti: Kus[] | null };

/** Rozoberie preklad na text a značky; pri chybe vráti null (ostane slovenčina). */
function rozober(preklad: string, pocet: number): Kus[] | null {
  const koren: Kus[] = [];
  const zasobnik: { i: number; deti: Kus[] }[] = [];
  const re = /<(\d+)\/>|<(\d+)>|<\/(\d+)>/g;
  let posledny = 0;
  const pridaj = (k: Kus) => (zasobnik.length ? zasobnik[zasobnik.length - 1].deti : koren).push(k);
  for (let m = re.exec(preklad); m; m = re.exec(preklad)) {
    if (m.index > posledny) pridaj(preklad.slice(posledny, m.index));
    posledny = re.lastIndex;
    const i = Number(m[1] ?? m[2] ?? m[3]);
    if (i >= pocet) return null;
    if (m[1] !== undefined) pridaj({ i, deti: null });
    else if (m[2] !== undefined) zasobnik.push({ i, deti: [] });
    else {
      const otvoreny = zasobnik.pop();
      if (!otvoreny || otvoreny.i !== i) return null;
      pridaj(otvoreny);
    }
  }
  if (zasobnik.length) return null;
  if (posledny < preklad.length) pridaj(preklad.slice(posledny));
  return koren;
}

function prelozOdsek(deti: ReactNode[], t: Prekladac): ReactNode[] {
  const prvky: Prvok[] = [];
  const k = kluc(deti, prvky).replace(/\s+/g, " ").trim();
  const preklad = t(k);
  // Bez prekladu ostane pôvodný obsah; zvlášť sa preložia len vnorené odseky.
  const povodne = () =>
    deti.map((d) => (isValidElement(d) && jeBlok(d as Prvok) ? prelozStrom(d, t) : d));
  if (preklad === k) return povodne();
  const kusy = rozober(preklad, prvky.length);
  if (!kusy) return povodne();
  let n = 0;
  const postav = (zoznam: Kus[]): ReactNode[] =>
    zoznam.map((kus) => {
      if (typeof kus === "string") return kus;
      const el = prvky[kus.i];
      const key = `t${n++}`;
      if (jeBlok(el)) return cloneElement(prelozStrom(el, t) as Prvok, { key });
      const attr = atributy(el, t) ?? {};
      if (kus.deti === null || !maDeti(el) || neprekladat(el))
        return cloneElement(el, { key, ...attr });
      return cloneElement(el, { key, ...attr }, ...postav(kus.deti));
    });
  return postav(kusy);
}

/** Všetky kľúče, ktoré by preklad stromu hľadal (na kontrolu slovníka). */
export function kluceStromu(uzol: ReactNode): string[] {
  const kluce: string[] = [];
  prelozStrom(uzol, (s) => (kluce.push(s), s));
  return kluce;
}

type ManualProps = {
  category: string;
  title: string;
  intro?: ReactNode;
  sections: HelpSection[];
  /** Manuál má vlastné hotové PDF: /docs/faktero-<pdf>-<jazyk>.pdf. */
  pdf?: string;
};

/** `HelpArticle` s preloženým obsahom — v slovenčine ho len odovzdá ďalej. */
export function PrelozenyManual({ category, title, intro, sections, pdf }: ManualProps) {
  const { t, jazyk } = useT();
  const props = useMemo<ManualProps>(() => {
    if (jazyk === "sk") return { category, title, intro, sections, pdf };
    return {
      pdf,
      category: t(category),
      title: t(title),
      intro: intro === undefined ? undefined : prelozStrom(intro, t),
      sections: sections.map((s) => ({ ...s, title: t(s.title), body: prelozStrom(s.body, t) })),
    };
  }, [jazyk, t, category, title, intro, sections, pdf]);
  return <HelpArticle {...props} />;
}
