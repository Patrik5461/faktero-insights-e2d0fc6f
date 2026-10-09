-- Podmienkou je aj typ faktúry a pri banke účet, smer či typ pohybu; výsledkom aj KV členenie.
alter table public.pravidla_uctovania drop constraint pravidla_uctovania_podmienka;
alter table public.pravidla_uctovania add constraint pravidla_uctovania_podmienka check (
  coalesce(nullif(btrim(dodavatel_ico), ''), nullif(btrim(dodavatel_text), ''),
           nullif(btrim(sposob_uhrady), ''), nullif(btrim(predmet_text), ''), pouzivatel_id::text,
           nullif(btrim(typ_dokladu), ''), nullif(btrim(bankovy_ucet), ''), smer,
           nullif(btrim(oznacenie), '')) is not null);
alter table public.pravidla_uctovania drop constraint pravidla_uctovania_akcia;
alter table public.pravidla_uctovania add constraint pravidla_uctovania_akcia check (
  coalesce(nullif(btrim(kategoria), ''), nullif(btrim(predkontacia), ''), nullif(btrim(clenenie_dph), ''),
           nullif(btrim(poznamka), ''), nullif(btrim(kv_clenenie), '')) is not null
  or odpocet is not null);
-- Pravidlo pre banku bez predkontácie by nerobilo nič.
alter table public.pravidla_uctovania add constraint pravidla_uctovania_banka check (
  druh is distinct from 'banka' or nullif(btrim(predkontacia), '') is not null);
