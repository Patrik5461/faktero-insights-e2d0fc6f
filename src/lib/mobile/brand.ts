/**
 * Značková zelená.
 *
 * Po redizajne to už nie je farba hornej lišty — tá je svetlá. Zelená ostáva
 * akcentom: hlavné tlačidlá, aktívna záložka, plavák. Hex je tu preto, že
 * plugin StatusBar ani `capacitor.config.ts` CSS premennú prečítať nevedia.
 *
 * Hodnota je `--primary` zo `styles.css` (`oklch(0.52 0.13 155)`) v hex tvare.
 * Keď sa mení značková farba, mení sa aj tu a v `capacitor.config.ts`.
 */
export const ZELENA_HORE = "#007e46";

/**
 * Pozadie appky, a teda aj pás pod hodinami.
 *
 * Musí sedieť s `--app-pozadie` v `styles.css` a s `backgroundColor`
 * v `capacitor.config.ts`: pás nad hlavičkou kreslí raz stránka a raz plugin,
 * a keby sa tie dve hodnoty rozišli, na iPhone by nad nadpisom bol vidieť
 * predel.
 */
export const POZADIE_APKY = "#f5f6f5";

/** To isté v tmavom režime — `--app-pozadie` v bloku `.dark`. */
export const POZADIE_APKY_TMA = "#1e2320";

/**
 * Spodok hlavičky — jemné presvetlenie smerom dole.
 *
 * Nikdy nesmie zasiahnuť oblasť výrezu: tam patrí výhradne {@link ZELENA_HORE},
 * inak je nad nadpisom vidieť predel.
 */
export const ZELENA_DOLE = "#0a8f52";

/**
 * Verzia mobilnej aplikácie tak, ako ju vidí človek.
 *
 * Musí sedieť s `MARKETING_VERSION` v `ios/App/App.xcodeproj/project.pbxproj` —
 * inak appka o sebe tvrdí jedno a v App Store je napísané druhé.
 */
export const VERZIA_APKY = "1.2";
