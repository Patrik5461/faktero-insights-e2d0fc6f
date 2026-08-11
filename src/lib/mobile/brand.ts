/**
 * Značková zelená horného pásu mobilnej aplikácie.
 *
 * Pás pod hodinami nekreslí stránka, ale natívny plugin StatusBar (appka beží
 * s `overlaysWebView: false`, takže WebView začína až pod ním). Plugin ani
 * `capacitor.config.ts` nevedia prečítať CSS premennú, preto je hex tu na
 * jednom mieste — berie si ho hlavička aj status bar a nemôžu sa rozísť.
 *
 * Hodnota je `--primary` zo `styles.css` (`oklch(0.52 0.13 155)`) v hex tvare.
 * Keď sa mení značková farba, mení sa aj tu a v `capacitor.config.ts`.
 */
export const ZELENA_HORE = "#007e46";

/**
 * Spodok hlavičky — jemné presvetlenie smerom dole.
 *
 * Nikdy nesmie zasiahnuť oblasť výrezu: tam patrí výhradne {@link ZELENA_HORE},
 * inak je nad nadpisom vidieť predel.
 */
export const ZELENA_DOLE = "#0a8f52";
