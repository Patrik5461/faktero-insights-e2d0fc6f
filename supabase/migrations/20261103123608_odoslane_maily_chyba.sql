-- Odoslané e-maily v Nastaveniach (súhrn, kto koľko komu poslal).
--
-- `odosielanie_mailov` už od 19. 10. 2026 eviduje každý e-mail firmy
-- (strážca odosielania: druh, doklad, adresáti, kto, čas, stav). Pre súhrn
-- chýbalo len to, prečo odoslanie zlyhalo a ktorou cestou mail odišiel
-- (vlastný SMTP firmy alebo Resend). Obe hodnoty dopĺňa `hotovo()` strážcu.
--
-- Tabuľku ďalej číta a píše len server (service_role) — súhrn vydáva
-- serverová funkcia po `overPristup(..., { spravca: true })`, takže klient
-- k nej práva nepotrebuje (žiadny GRANT ani politika pre authenticated).
-- Idempotentné.

alter table public.odosielanie_mailov
  add column if not exists chyba text,
  add column if not exists cez text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'odosielanie_mailov_cez_check'
  ) then
    alter table public.odosielanie_mailov
      add constraint odosielanie_mailov_cez_check check (cez is null or cez in ('smtp', 'resend'));
  end if;
end $$;

comment on column public.odosielanie_mailov.chyba is
  'Prečo odoslanie zlyhalo (stav zlyhalo) alebo prečo vlastný SMTP nevyšiel a mail išiel cez Resend.';
comment on column public.odosielanie_mailov.cez is
  'Ktorou cestou mail odišiel: smtp (vlastný server firmy) alebo resend.';
