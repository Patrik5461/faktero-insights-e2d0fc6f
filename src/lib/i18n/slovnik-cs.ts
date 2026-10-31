/**
 * Všetky české slovníky webu spojené do jedného objektu.
 *
 * Samostatný modul, aby sa dal načítať dynamickým importom ako jeden kúsok
 * kódu — pozri `nacitajSlovnik` v `jazyk.ts`. Nový súbor v `./cs/` sa pridá sám.
 */
const moduly = import.meta.glob<Record<string, string>>("./cs/*.ts", {
  eager: true,
  import: "default",
});

const slovnik: Record<string, string> = Object.assign({}, ...Object.values(moduly));
export default slovnik;
