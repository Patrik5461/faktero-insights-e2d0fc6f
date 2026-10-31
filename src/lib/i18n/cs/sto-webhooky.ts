// Opakované doručenie webhookov (webhooky.tsx, webhooky-logy.tsx, zvonček)
// a odkaz na prílohy nad 20 MB (/prilohy/<token>, odoslanie faktúry a ponuky).
export default {
  "Doručené ({http})": "Doručeno ({http})",
  "Celá história doručení": "Celá historie doručení",
  "Neúspešné doručenie skúšame znova po 1 min, 5 min, 30 min, 2 h, 6 h, 12 h a 24 h. Potom ho vzdáme a upozorníme vás v zvončeku. Každé doručenie nesie hlavičku Idempotency-Key — pri opakovaní je rovnaká.":
    "Neúspěšné doručení zkoušíme znovu po 1 min, 5 min, 30 min, 2 h, 6 h, 12 h a 24 h. Potom to vzdáme a upozorníme vás ve zvonečku. Každé doručení nese hlavičku Idempotency-Key — při opakování je stejná.",
  "Ďalší pokus": "Další pokus",
  "Vzdané doručenia": "Vzdaná doručení",
  "Čakajú na ďalší pokus": "Čekají na další pokus",
  "Opakuje sa": "Opakuje se",
  Vzdané: "Vzdáno",
  "Udalosť už bola doručená.": "Událost už byla doručena.",
  "Doručenie práve prebieha — skúste to o chvíľu.": "Doručení právě probíhá — zkuste to za chvíli.",
  "Webhook je vypnutý.": "Webhook je vypnutý.",
  "Webhook už neexistuje": "Webhook už neexistuje",
  "Záznam nenájdený": "Záznam nenalezen",
  "Webhook {adresa} sa nepodarilo doručiť": "Webhook {adresa} se nepodařilo doručit",
  "Webhook {adresa}: {n} udalostí sa nepodarilo doručiť":
    "Webhook {adresa}: {n} událostí se nepodařilo doručit",
  "{udalost} · {chyba}": "{udalost} · {chyba}",
  "{udalost} · po všetkých opakovaniach": "{udalost} · po všech opakováních",
  "Do mailu sa nezmestili: {subory} — príjemca ich dostal ako odkaz na stiahnutie (platí 30 dní).":
    "Do e-mailu se nevešly: {subory} — příjemce je dostal jako odkaz ke stažení (platí 30 dní).",
  "Prílohy dokladu — Faktero": "Přílohy dokladu — Faktero",
  "odkaz platí do {datum}": "odkaz platí do {datum}",
  "Prílohy už pri doklade nie sú — odosielateľ ich medzitým odstránil.":
    "Přílohy už u dokladu nejsou — odesílatel je mezitím odstranil.",
  "Odkaz nie je platný alebo už vypršal.": "Odkaz není platný nebo už vypršel.",
  "Ak váš endpoint nevráti 2xx do 10 sekúnd, Faktero doručenie zopakuje po 1 min, 5 min, 30 min, 2 h, 6 h, 12 h a 24 h — spolu 8 pokusov počas necelých dvoch dní. Potom ho vzdá a upozorní správcu firmy; z nastavení Webhooky ho možno poslať znova. Každý pokus nesie hlavičky Idempotency-Key a X-Faktero-Delivery-Id (pri opakovaní tej istej udalosti rovnaké) a X-Faktero-Attempt s číslom pokusu — podľa kľúča spoznáte, že udalosť už máte spracovanú. Adresa musí byť https na verejnom serveri (port 443) a overuje sa pri každom pokuse.":
    "Pokud váš endpoint nevrátí 2xx do 10 sekund, Faktero doručení zopakuje po 1 min, 5 min, 30 min, 2 h, 6 h, 12 h a 24 h — celkem 8 pokusů během necelých dvou dnů. Potom to vzdá a upozorní správce firmy; z nastavení Webhooky jej lze poslat znovu. Každý pokus nese hlavičky Idempotency-Key a X-Faktero-Delivery-Id (při opakování téže události stejné) a X-Faktero-Attempt s číslem pokusu — podle klíče poznáte, že událost už máte zpracovanou. Adresa musí být https na veřejném serveru (port 443) a ověřuje se při každém pokusu.",
};
