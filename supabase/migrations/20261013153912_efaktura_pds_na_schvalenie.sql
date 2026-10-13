-- Žiadosti FS s nesediacim podpisom čakajú na ručné schválenie (kým FS nepošle správny secret).
alter table public.efaktura_pds_ziadosti drop constraint efaktura_pds_ziadosti_stav_check;
alter table public.efaktura_pds_ziadosti add constraint efaktura_pds_ziadosti_stav_check
  check (stav = any (array['na_schvalenie','prijata','registruje_sa','registrovana','na_kontrolu','zamietnuta','chyba']));
alter table public.efaktura_pds_ziadosti
  add column podpis_overeny boolean not null default true,
  add column via text;
