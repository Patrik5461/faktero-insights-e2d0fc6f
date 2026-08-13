-- Automatická detekcia zaznamená každú jazdu firemným autom, aj tú súkromnú.
-- Kniha jázd ich musí vedieť rozlíšiť — človek to zaradí jedným ťuknutím
-- v notifikácii hneď na začiatku cesty.
alter table public.trips
  add column if not exists classification text not null default 'business';

alter table public.trips
  drop constraint if exists trips_classification_check;

alter table public.trips
  add constraint trips_classification_check
  check (classification in ('business', 'private'));

comment on column public.trips.classification is
  'business = služobná jazda, private = súkromná jazda firemným vozidlom';
