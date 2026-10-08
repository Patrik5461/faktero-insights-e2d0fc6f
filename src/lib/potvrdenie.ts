/*
  Potvrdenie akcie oknom vo vzhľade Faktera namiesto systémového `confirm()`.

  Systémové okno vyzerá v každom prehliadači inak, v appke ukáže ako nadpis
  „localhost", nedá sa zatvoriť klávesom Escape po svojom a Playwright ani
  čítačka obrazovky ho nevidia ako súčasť stránky. `potvrd()` vráti Promise,
  takže miesto `if (!confirm(x)) return;` stačí `if (!(await potvrd(x))) return;`.

  Okno samotné kreslí `PotvrdzovacieOkno`, pripojené raz v koreni aplikácie.
*/

export type MoznostiPotvrdenia = {
  /** Text tlačidla, ktoré akciu potvrdí. Predvolene podľa toho, či je akcia nebezpečná. */
  potvrdit?: string;
  zrusit?: string;
  /** Červené tlačidlo — mazanie, zrušenie, nevratná akcia. Predvolene podľa textu otázky. */
  nebezpecne?: boolean;
};

export type Ziadost = MoznostiPotvrdenia & { sprava: string; vyries: (ano: boolean) => void };

type Posluchac = (z: Ziadost | null) => void;
let posluchac: Posluchac | null = null;
let fronta: Ziadost[] = [];

/** Slová, podľa ktorých otázka pýta súhlas s nevratnou alebo deštruktívnou akciou. */
const NEBEZPECNE = /zmaza|vymaza|odstráni|zruši|zahodi|nevratn|natrvalo|odpoji|zneplatni|odobra|archivova|stornova|kôš|koša/i;

export function jeNebezpecna(sprava: string): boolean {
  return NEBEZPECNE.test(sprava);
}

/** Opýta sa používateľa; `true` = potvrdil. Bez pripojeného okna (test, server) padne späť na `confirm`. */
export function potvrd(sprava: string, moznosti: MoznostiPotvrdenia = {}): Promise<boolean> {
  if (!posluchac) {
    return Promise.resolve(typeof window !== "undefined" && typeof window.confirm === "function" ? window.confirm(sprava) : false);
  }
  return new Promise<boolean>((resolve) => {
    fronta.push({ ...moznosti, sprava, vyries: resolve });
    if (fronta.length === 1) posluchac?.(fronta[0]);
  });
}

/** Pre `PotvrdzovacieOkno`: prihlásenie na žiadosti a ich vybavenie. */
export function prihlasOkno(p: Posluchac): () => void {
  posluchac = p;
  if (fronta.length) p(fronta[0]);
  return () => {
    if (posluchac === p) posluchac = null;
  };
}

export function vybavZiadost(ano: boolean): void {
  const z = fronta.shift();
  z?.vyries(ano);
  posluchac?.(fronta[0] ?? null);
}

/** Len pre testy — vyprázdni frontu. */
export function _vycistiFrontu(): void {
  fronta = [];
}
