# Push notifikácie cez APNs

iOS appka registruje **APNs token** (Capacitor plugin, žiadny Firebase), server
mu ho posiela priamo do Apple. Vďaka tomu sa push dá zapnúť **bez nového buildu
a bez ďalšieho schvaľovania v App Store** — appka už má všetko, čo treba.

Android by šiel ďalej cez FCM; server si cestu vyberie podľa tvaru tokenu (APNs
token je 64 znakov hexa, FCM token je dlhší reťazec s dvojbodkou).

## Čo treba spraviť raz

### 1. Kľúč v Apple Developer

**Certificates, Identifiers & Profiles → Keys → +**, zaškrtni **Apple Push
Notifications service (APNs)**, ulož a stiahni `.p8`. Stiahnuť sa dá **len raz**.

Poznač si:

- **Key ID** (v názve súboru, napr. `AuthKey_ABC123DEFG.p8`)
- **Team ID** (vpravo hore v portáli)

### 2. Premenné na serveri

Do `env` v `/home/patrik/ecosystem.config.cjs`:

```
APNS_KEY_ID: "ABC123DEFG",
APNS_TEAM_ID: "1234567890",
APNS_BUNDLE_ID: "sk.tobify.faktero",
APNS_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----",
```

Zalomenia v kľúči môžu byť aj ako `\n`, server si ich prepíše. Reštart cez
`pm2 restart ecosystem.config.cjs --update-env`.

`APNS_ENV: "sandbox"` sa pridáva len vtedy, keď testuješ build spustený priamo
z Xcode. Buildy z TestFlightu a App Store idú na produkciu, čiže bez tejto
premennej.

### 3. Skúška

```bash
# hook na faktúry po splatnosti; bez nastavenia vráti „Push nie je nastavený"
curl -s -X POST https://www.faktero.sk/api/public/hooks/push-overdue \
  -H "x-cron-token: $FAKTERO_CRON_TOKEN"
```

V appke musí byť push povolený (pýta sa pri prvom spustení) a v `profiles` musí
byť vyplnený `push_token`.

## Ako to funguje

- APNs hovorí len HTTP/2, takže sa nepoužíva `fetch` (ten v Node vie iba
  HTTP/1.1), ale `node:http2`.
- Autorizuje sa JWT podpísaným ES256, ktorý sa cachuje 45 minút (Apple berie
  najviac hodinu a nemá rád, keď sa vyrába pri každej správe).
- Podpis musí byť v tvare `r||s`, nie DER — preto `dsaEncoding: "ieee-p1363"`.
- Keď Apple odpovie **410** alebo **BadDeviceToken**, token sa z `profiles`
  zmaže; appku niekto odinštaloval a ďalej doň búšiť nemá zmysel.

## Čo je v binárke appky

Aby sa push dal zapnúť bez nového schvaľovania, binárka už obsahuje:

- **Push Notifications capability** (`ios/App/App/App.entitlements`,
  `aps-environment`),
- `remote-notification` v `UIBackgroundModes` (pre tichý push),
- plugin `@capacitor/push-notifications`.

Bez `aps-environment` sa appka na push **nevie zaregistrovať** a doplniť ho
neskôr znamená nový build a novú kontrolu.
