alter table public.pravidla_uctovania drop constraint if exists pravidla_uctovania_podmienka;
alter table public.pravidla_uctovania add constraint pravidla_uctovania_podmienka
  check (coalesce(nullif(btrim(dodavatel_ico), ''), nullif(btrim(dodavatel_text), ''), nullif(btrim(sposob_uhrady), ''),
                  nullif(btrim(predmet_text), ''), pouzivatel_id::text) is not null);
