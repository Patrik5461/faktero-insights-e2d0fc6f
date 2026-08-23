# Prepnutie e-mailov z Auth na Resend

Potvrdzovacie e-maily z registrácie odchádzali z testovacieho servera Supabase
(`noreply@mail.app.supabase.io`) — cudzí odosielateľ, limit rádovo jednotiek
e-mailov za hodinu a slabá doručiteľnosť. Od 23. 8. 2026 idú cez Resend
z `noreply@faktero.sk`. Nastavenie je v dashboarde, cez SQL sa meniť nedá,
takže tento návod ostáva ako popis toho, čo je kde nastavené.

Doména `faktero.sk` je v Resende overená už teraz — faktúry aj pozvánky z nej
odchádzajú, takže po prepnutí netreba nič v DNS.

## Stav k 23. 8. 2026 — prepnuté a overené

**Hotovo.** SMTP je nastavené podľa tabuľky nižšie a celá registrácia prešla
naostro: účet založený z mobilnej appky → potvrdzovací e-mail odišiel
z `noreply@faktero.sk` cez Resend a bol doručený do dvoch sekúnd → odkaz z neho
účet potvrdil a doviedol na založenie firmy. `mailer_autoconfirm` ostáva
`false`, čiže bez toho e-mailu sa dnu nedá — o to viac záleží na tom, že chodí.

**Čo ešte ostáva:** šablóny v kroku 3 sú stále v angličtine („Confirm your
email address"). Pošta chodí, ale znie ako z cudzej aplikácie.

Dve poznámky z overovania:

- Z nášho servera je **port 465 zavretý**, prejde len 587 so STARTTLS. Supabase
  sa pripája zo svojej infraštruktúry, takže na 465 to vadiť nemá; keby sa
  niekedy skúšalo posielanie priamo zo servera, treba 587.
- Účet v Resende **zdieľajú aj iné projekty**. Odrazený e-mail preto zhorší
  povesť odosielateľa všetkým naraz a adresa sa navyše umlčí — ďalšie pokusy
  potom vracajú 200 a nedoručí sa nič. Kontroluje sa to v *Suppressions*.

---

## 1. SMTP (Authentication → Emails → SMTP Settings)

Zapnúť **Enable Custom SMTP** a vyplniť:

| Pole | Hodnota |
| --- | --- |
| Sender email | `noreply@faktero.sk` |
| Sender name | `Faktero` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | obsah `RESEND_API_KEY` (rovnaký kľúč, aký má server v `ecosystem.config.cjs`) |
| Minimum interval between emails | `10` sekúnd stačí |

Uložiť → *Save*.

## 2. Limity (Authentication → Rate Limits)

Po prepnutí na vlastné SMTP sa dá zdvihnúť **Rate limit for sending emails**
z predvolených 2 za hodinu na napríklad **100 za hodinu**. Bez toho by prísny
limit ostal aj s Resendom.

## 3. Šablóny (Authentication → Emails → Templates)

Sú v angličtine. Nižšie je slovenská verzia každej — skopírovať do príslušnej
záložky, predmet do poľa *Subject*, telo do *Message body*.

### Confirm signup

**Subject:** `Potvrďte si e-mail vo Faktero`

```html
<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#111;max-width:560px">
  <h2 style="margin:0 0 12px">Vitajte vo Faktero</h2>
  <p>Ďakujeme za registráciu. Kliknutím potvrdíte svoju adresu a budete rovno v aplikácii.</p>
  <p>
    <a href="{{ .ConfirmationURL }}"
       style="background:#16a34a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">
      Potvrdiť e-mail
    </a>
  </p>
  <p style="color:#666;font-size:12px">
    Alebo skopírujte odkaz: {{ .ConfirmationURL }}<br />
    Ak ste sa neregistrovali vy, tento e-mail pokojne ignorujte.
  </p>
</div>
```

### Reset password

**Subject:** `Obnovenie hesla do Faktero`

```html
<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#111;max-width:560px">
  <h2 style="margin:0 0 12px">Obnovenie hesla</h2>
  <p>Pre účet {{ .Email }} bolo vyžiadané nové heslo. Odkaz platí jednu hodinu.</p>
  <p>
    <a href="{{ .ConfirmationURL }}"
       style="background:#16a34a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">
      Nastaviť nové heslo
    </a>
  </p>
  <p style="color:#666;font-size:12px">
    Alebo skopírujte odkaz: {{ .ConfirmationURL }}<br />
    Ak ste o zmenu nežiadali, nemusíte robiť nič — heslo ostáva, aké bolo.
  </p>
</div>
```

### Magic Link

**Subject:** `Prihlásenie do Faktero`

```html
<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#111;max-width:560px">
  <h2 style="margin:0 0 12px">Prihlásenie bez hesla</h2>
  <p>Kliknutím sa prihlásite do Faktera. Odkaz platí jednu hodinu a použiť sa dá raz.</p>
  <p>
    <a href="{{ .ConfirmationURL }}"
       style="background:#16a34a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">
      Prihlásiť sa
    </a>
  </p>
  <p style="color:#666;font-size:12px">Alebo skopírujte odkaz: {{ .ConfirmationURL }}</p>
</div>
```

### Change Email Address

**Subject:** `Potvrďte zmenu e-mailu vo Faktero`

```html
<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#111;max-width:560px">
  <h2 style="margin:0 0 12px">Zmena e-mailu</h2>
  <p>Potvrďte, že adresu {{ .Email }} chcete používať na prihlasovanie do Faktera.</p>
  <p>
    <a href="{{ .ConfirmationURL }}"
       style="background:#16a34a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">
      Potvrdiť zmenu
    </a>
  </p>
  <p style="color:#666;font-size:12px">Alebo skopírujte odkaz: {{ .ConfirmationURL }}</p>
</div>
```

### Invite user

Pozvánky do firmy posiela samotná aplikácia cez Resend, táto šablóna sa
v bežnej prevádzke nepoužije. Pre istotu nech je aj tak po slovensky:

**Subject:** `Pozvánka do Faktera`

```html
<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#111;max-width:560px">
  <h2 style="margin:0 0 12px">Boli ste pozvaný do Faktera</h2>
  <p>Kliknutím si vytvoríte prístup.</p>
  <p>
    <a href="{{ .ConfirmationURL }}"
       style="background:#16a34a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">
      Prijať pozvánku
    </a>
  </p>
  <p style="color:#666;font-size:12px">Alebo skopírujte odkaz: {{ .ConfirmationURL }}</p>
</div>
```

### Reauthentication

**Subject:** `Overovací kód Faktero`

```html
<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#111;max-width:560px">
  <h2 style="margin:0 0 12px">Overovací kód</h2>
  <p>Váš kód je <strong style="font-size:18px">{{ .Token }}</strong>. Platí 10 minút.</p>
  <p style="color:#666;font-size:12px">Ak ste oň nežiadali, tento e-mail ignorujte.</p>
</div>
```

---

## 4. Overenie

Po uložení stačí skúsiť registráciu na adresu, ku ktorej sa dostanete. V Auth
logoch musí pri `mail.send` svietiť odosielateľ `noreply@faktero.sk` namiesto
`noreply@mail.app.supabase.io`:

```sql
-- v Supabase → Logs → Auth, alebo cez log explorer
select event_message from logs
 where source = 'auth_logs' and position(event_message, 'mail.send') > 0
 order by timestamp desc limit 5;
```

Spoľahlivejšie než logy je pozrieť sa do Resendu: v prehľade *Emails* (alebo
`GET https://api.resend.com/emails`) sa po prepnutí objavia aj potvrdzovacie
správy z registrácie, nielen faktúry. Kým tam nie sú, prepnuté to nie je.

Naostro sa to dá skúsiť aj bez cudzej schránky — zaregistrovať sa na adresu
v tvare `<čokoľvek>@doklady.faktero.sk`. Tá pošta chodí nám, e-mail sa dá
prečítať cez `GET /emails/receiving`, a keďže nemá prílohu, v prijatých
dokladoch z nej nič nevznikne (stav `bez_prilohy`).
