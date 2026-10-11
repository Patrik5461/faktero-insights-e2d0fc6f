-- České súhrnné hlásenie VIES (DPHSHV); forma R = řádné.
alter table public.vat_reports drop constraint if exists vat_reports_druh_check;
alter table public.vat_reports add constraint vat_reports_druh_check
  check (druh = any (array['priznanie','kv','sv','cz_dp3','cz_kh','cz_sh']));
