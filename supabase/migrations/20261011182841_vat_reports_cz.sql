-- České výkazy k DPH: priznanie DPHDP3 a kontrolné hlásenie DPHKH1.
-- Druh podania majú vlastný (B řádné, O opravné, D dodatečné, E dodatečné/opravné, N následné).
alter table public.vat_reports drop constraint if exists vat_reports_druh_check;
alter table public.vat_reports add constraint vat_reports_druh_check
  check (druh = any (array['priznanie','kv','sv','cz_dp3','cz_kh']));
alter table public.vat_reports drop constraint if exists vat_reports_typ_check;
alter table public.vat_reports add constraint vat_reports_typ_check
  check (typ = any (array['R','O','D','B','E','N']));
