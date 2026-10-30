/**
 * Bot podpory v Telegrame. V prihlásenej aplikácii sa meno berie zo servera
 * (`TELEGRAM_BOT_USERNAME`) — tlačidlo sa ukáže, len keď je bot nastavený.
 * Verejný web a mobilná appka nemajú prihlásené volanie na server, preto
 * používajú toto pevné meno.
 */
export const TELEGRAM_PODPORA_BOT = "FakteroPodporaBot";

/** Odkaz na chat s botom. */
export const odkazNaTelegram = (bot: string = TELEGRAM_PODPORA_BOT) => `https://t.me/${bot}`;
