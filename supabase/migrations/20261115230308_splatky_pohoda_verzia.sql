-- Splátky leasingov a úverov do POHODY: verzia pre kontrolu duplicity (audit 14. 11., V8).
--
-- dataPackItem@id splátky je `SPL-<id>` a po vrátení z POHODY `SPL-<id>-<verzia>`.
-- Opakovaný export tej istej verzie POHODA odmietne ako duplicitu; „Vrátiť z Pohody“
-- (najprv zmazať záväzok v POHODE) zvýši verziu a zruší označenie exportu.
alter table public.financing_installments
  add column if not exists pohoda_verzia integer not null default 0;

comment on column public.financing_installments.pohoda_verzia is
  'Koľkokrát bola splátka vrátená z POHODY; súčasť dataPackItem@id pri exporte do Ostatných záväzkov.';
