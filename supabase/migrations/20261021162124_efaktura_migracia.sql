-- eFaktúra: firma, ktorá je v Peppole u iného poskytovateľa (PARTICIPANT_ALREADY_REGISTERED).
--
-- Registrácia z tokenu FS takú firmu neprevezme — treba migračný kód, ktorý
-- vydá súčasný poskytovateľ. Žiadosť prejde do stavu `cudzi_poskytovatel`,
-- cron ju už neopakuje a admin zadá kód (Admin → eFaktúra → Prevziať firmu).
--
-- Migračný kód sa drží len zašifrovaný (encryptSecret) a len kým migrácia
-- nedobehne; po konečnom výsledku sa zmaže. Odtlačok (hash) sa neukladá.

alter table public.efaktura_pds_ziadosti drop constraint efaktura_pds_ziadosti_stav_check;
alter table public.efaktura_pds_ziadosti add constraint efaktura_pds_ziadosti_stav_check
  check (stav = any (array[
    'na_schvalenie','prijata','registruje_sa','registrovana','na_kontrolu','zamietnuta','chyba',
    'cudzi_poskytovatel'
  ]));

alter table public.efaktura_pds_ziadosti
  -- Zašifrovaný migračný kód — len počas rozbehnutej migrácie.
  add column if not exists migracny_kod_sifrovany text,
  -- Kedy admin naposledy spustil prevzatie (migráciu).
  add column if not exists migracia_at timestamptz,
  -- Názov organizácie súčasného poskytovateľa podľa certifikátu v SMP (napr. „Doklado s.r.o.“).
  add column if not exists cudzi_poskytovatel text;

comment on column public.efaktura_pds_ziadosti.migracny_kod_sifrovany is
  'Migračný kód od pôvodného poskytovateľa, šifrovaný (encryptSecret). Maže sa po konečnom výsledku migrácie.';
comment on column public.efaktura_pds_ziadosti.cudzi_poskytovatel is
  'Organizácia (O=) z certifikátu prístupového bodu v SMP — kto firmu v Peppole drží.';

-- Tabuľka je len pre servisný kľúč (žiadne povoľujúce politiky, mfa_ok už má),
-- nové stĺpce teda žiadne GRANTy ani politiky nepotrebujú.

-- SFC, s.r.o. (DIČ 2121372693) je v SMP u Doklado — registrácia padá na
-- PARTICIPANT_ALREADY_REGISTERED. Presun do nového stavu, aby ju cron prestal skúšať.
update public.efaktura_pds_ziadosti
   set stav = 'cudzi_poskytovatel',
       chyba = 'Firma je v Peppole u iného poskytovateľa — na prechod treba migračný kód od neho.',
       cudzi_poskytovatel = coalesce(cudzi_poskytovatel, 'Doklado s.r.o.')
 where id = '24b9b7e5-3165-420e-b24d-3234cd54101f'
   and stav in ('chyba', 'prijata');
