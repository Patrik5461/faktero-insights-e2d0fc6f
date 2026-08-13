# Príjem dokladov e-mailom

Každý používateľ má pre každú firmu vlastnú adresu, napríklad
`maxiticket-k7f2p9@doklady.faktero.sk`. Keď na ňu prepošle mail od dodávateľa, PDF
príloha sa uloží a založí sa **prijatá faktúra** s vyplneným dodávateľom, číslom,
dátumami a sumami. Doklad ostáva v stave *rozpracovaný*, takže ho človek ešte vidí
a potvrdí — stroj nič neschvaľuje sám.

Adresa sa zakladá až vtedy, keď si ju používateľ prvýkrát otvorí na
`/prijate-faktury` → **Posielanie dokladov e-mailom**. Tam je aj vypínač a denník
posledných desiatich mailov aj s tým, ako dopadli.

## Čo treba spraviť raz (Patrik)

### 1. Poddoména v Resende

V Resende → **Domains** pridaj doménu na prijímanie: `doklady.faktero.sk`.
Resend vypíše **MX záznam**, ktorý treba pridať v DNS.

Hlavná pošta `faktero.sk` (hostcreators) sa nemení — poddoména má vlastné MX.

### 2. MX záznam v hostcreators

V DNS pre `faktero.sk` pridaj záznam, ktorý ukázal Resend, napríklad:

```
doklady   MX   10   <hodnota z Resendu>
```

Over si to potom cez `dig +short MX doklady.faktero.sk`.

Resend po pridaní MX prijíma **ľubovoľnú adresu** na tej poddoméne, takže sa už
nikde nič nekonfiguruje pre jednotlivých používateľov.

### 3. Webhook v Resende

V Resende → **Webhooks** pridaj endpoint:

```
https://www.faktero.sk/api/public/mail/prijem
```

a zapni udalosť **`email.received`**. Resend ukáže **signing secret** v tvare
`whsec_…`.

### 4. Premenné na serveri

Do `env` v `/home/patrik/ecosystem.config.cjs` pridaj:

```
RESEND_WEBHOOK_SECRET: "whsec_…",
```

a reštartuj cez `pm2 restart ecosystem.config.cjs --update-env`. Bez nej endpoint
vracia 503 a maily sa zahadzujú — zámerne, radšej nič než prijať nepodpísaný obsah.

`RESEND_API_KEY` už na serveri je, používa sa aj na sťahovanie príloh.

**Kým vlastná poddoména nefunguje**, dá sa jazdiť na doméne, ktorú dáva Resend
(`<id>.resend.app`) a ktorá nepotrebuje žiadny DNS záznam. Stačí pridať:

```
MAIL_PRIJEM_DOMENA: "<id>.resend.app",
```

Adresy sa vypíšu na nej a webhook aj spracovanie fungujú rovnako. Keď sa poddoména
rozbehne, premennú zmaž (alebo prepíš na `doklady.faktero.sk`) a reštartuj —
lokálne časti adries sa nemenia, takže používateľom sa zmení len to za zavináčom.

## Ako to beží

1. Resend prijme mail a pošle webhook `email.received` (len metadáta, bez príloh).
2. Endpoint overí podpis (Svix, HMAC-SHA256 nad `id.timestamp.telo`, tolerancia
   5 minút) a **hneď odpovie 200** — čítanie dokladu cez AI trvá desiatky sekúnd
   a Resend by medzitým vypršal. Spracovanie pokračuje na pozadí.
3. Podľa časti adresy pred zavináčom sa nájde firma a používateľ.
4. Prílohy sa dopýtajú cez `GET /emails/receiving/{id}/attachments` a stiahnu
   (odkaz platí hodinu). Berú sa PDF a fotky, najviac 5 príloh po 15 MB.
5. Súbor ide do koša `purchase-invoices`, cez Gemini sa z neho prečítajú údaje
   a vznikne riadok v `purchase_invoices` (stav `draft`, autor = majiteľ adresy).
6. Výsledok sa zapíše do `inbox_messages` — vrátane dôvodu, keď sa niečo nepodarí.

## Na čo si dať pozor

- **Na adresu smie poslať ktokoľvek, kto ju pozná** — tak to bolo zadané. Odosielateľ
  sa ukladá a je vidno ho v denníku aj v poznámke dokladu. Keď sa adresa dostane
  von, tlačidlo **Nová adresa** starú okamžite zruší.
- **Doklad vznikne aj vtedy, keď AI neprečíta nič** — s náhradnými hodnotami
  (`Neurčený dodávateľ`, číslo z predmetu mailu, dnešný dátum). Radšej neúplný
  doklad na dopísanie než ticho zahodená faktúra.
- **Mail bez PDF a fotky** skončí v denníku ako *Bez prílohy*; nič sa nezakladá.
- Vypnutá adresa (`active = false`) sa tvári, že neexistuje — mail sa ticho zahodí.

## Skúška po nastavení

```
# 1. Endpoint žije (GET musí vrátiť ok)
curl -s -o /dev/null -w '%{http_code}\n' https://www.faktero.sk/api/public/mail/prijem

# 2. Nepodpísaná požiadavka musí skončiť na 401
curl -s -X POST https://www.faktero.sk/api/public/mail/prijem -d '{}' -w ' %{http_code}\n'

# 3. Ostré: prepošli si mail s PDF na adresu z obrazovky a pozri denník
select from_email, subject, status, detail, created_invoice_ids
from inbox_messages order by received_at desc limit 5;
```
