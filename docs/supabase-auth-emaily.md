# Auth e-maily — čo je nastavené a kde

Potvrdzovacie e-maily z registrácie odchádzali z testovacieho servera Supabase
(`noreply@mail.app.supabase.io`) — cudzí odosielateľ, limit rádovo jednotiek
e-mailov za hodinu a slabá doručiteľnosť. **Od 23. 8. 2026 idú cez Resend
z `noreply@faktero.sk` a sú po slovensky.**

Doména `faktero.sk` je v Resende overená, takže v DNS netreba nič.

## Stav

| Vec | Hodnota |
| --- | --- |
| Odosielateľ | `noreply@faktero.sk`, meno `Faktero` |
| SMTP | `smtp.resend.com`, port `465`, používateľ `resend`, heslo `RESEND_API_KEY` |
| Limit posielania | `100` e-mailov za hodinu (`rate_limit_email_sent`) |
| Šablóny | 13 slovenských, vrátane oznámení o zmene hesla a e-mailu |
| Potvrdenie e-mailu | **povinné** (`mailer_autoconfirm` je `false`) |

Overené celou registráciou naostro: účet založený z mobilnej appky → e-mail
„Potvrďte si e-mail vo Faktere" doručený do dvoch sekúnd → odkaz z neho účet
potvrdil a doviedol na založenie firmy.

Pozor: keďže `mailer_autoconfirm` je `false`, **bez toho e-mailu sa nový človek
do aplikácie nedostane** — vrátane registrácie v appke. Keď sa raz začne
strácať pošta, toto je prvé miesto, kam sa treba pozrieť.

## Kde sa to mení

Dashboard: **Authentication → Emails**, prepínač *SMTP Settings* a *Templates*
(`https://supabase.com/dashboard/project/sywcjxydnljkzoepfcaz/auth/templates`),
limity v **Authentication → Rate Limits**.

Cez SQL to nejde. Dá sa to však cez Management API, čím sa to aj nastavilo —
`PATCH https://api.supabase.com/v1/projects/sywcjxydnljkzoepfcaz/config/auth`
s poľami `mailer_subjects_<druh>`, `mailer_templates_<druh>_content`
a `rate_limit_email_sent`. Vyžaduje **osobný prístupový token** (`sbp_…`), ktorý
platí na celý účet, nie na jeden projekt — preto sa vyrába na jedno použitie
a hneď po práci sa ruší.

Podstatné je poradie: najprv si vytiahnuť, aké premenné pôvodná anglická
šablóna používa (`{{ .ConfirmationURL }}`, `{{ .Token }}`, `{{ .Provider }}`,
`{{ .OldEmail }}`…), a slovenskú napísať s tými istými. Premenná, ktorú GoTrue
pre daný druh nedopĺňa, ostane v e-maile ako holý text.

## Šablóny

Nastavených je 13:

- **akcie** — `confirmation` (registrácia), `recovery` (obnovenie hesla),
  `magic_link`, `email_change`, `invite`, `reauthentication`;
- **oznámenia** — zmena e-mailu, zmena hesla, pripojenie a odpojenie spôsobu
  prihlásenia, pridanie a odobranie dvojfaktorového overenia, zmena telefónu.

Oznámenia sú tam zámerne, hoci väčšina dnes nikdy neodíde (telefón ani
dvojfaktorové overenie sa nepoužívajú). Keby ostali anglické, stačilo by ich raz
zapnúť a človek by dostal polovicu pošty v cudzom jazyku.

Vzhľad je jednoduchý naschvál: inline štýly, šírka 560 px, zelené tlačidlo
`#12734f` ako vo faktúrach, a pod ním ten istý odkaz v texte pre prípad, že
poštový klient tlačidlo nevykreslí.

## Ako overiť, že to chodí

V Resende v prehľade *Emails* (alebo `GET https://api.resend.com/emails`) musia
byť aj správy z registrácie, nielen faktúry. Kým tam nie sú, posiela sa cez
Supabase.

Naostro sa to dá skúsiť aj bez cudzej schránky — zaregistrovať sa na adresu
`<čokoľvek>@doklady.faktero.sk`. Tá pošta chodí nám, e-mail sa dá prečítať cez
`GET /emails/receiving`, a keďže nemá prílohu, v prijatých dokladoch z nej nič
nevznikne (stav `bez_prilohy`). Po skúške zmazať testovací účet aj ten jeden
riadok v `inbox_messages`.

## Dve poznámky, ktoré sa inak zisťujú ťažko

- Z nášho servera je **port 465 zavretý**, prejde len 587 so STARTTLS. Supabase
  sa pripája zo svojej infraštruktúry, takže jemu 465 vadiť nemá; keby sa
  niekedy skúšalo posielanie priamo zo servera, treba 587.
- Účet v Resende **zdieľajú aj iné projekty**. Odrazený e-mail preto zhorší
  povesť odosielateľa všetkým naraz a adresa sa navyše umlčí — ďalšie pokusy
  potom vracajú 200 a nedoručí sa nič. Kontroluje sa to v *Suppressions*.
