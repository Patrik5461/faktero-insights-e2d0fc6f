# Prepnutie e-mailov z Auth na Resend

Potvrdzovacie e-maily z registrácie zatiaľ odchádzajú z testovacieho servera
Supabase (`noreply@mail.app.supabase.io`). Overené 12. 8. 2026 v Auth logoch.
Znamená to limit rádovo jednotiek e-mailov za hodinu, cudzieho odosielateľa
a slabú doručiteľnosť. Nastavenie je v dashboarde, cez SQL sa meniť nedá.

Doména `faktero.sk` je v Resende overená už teraz — faktúry aj pozvánky z nej
odchádzajú, takže po prepnutí netreba nič v DNS.

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

Rovnaký e-mail sa dá poslať aj z Resendu — v jeho prehľade *Emails* sa
po prepnutí objavia aj potvrdzovacie správy z registrácie, nielen faktúry.
