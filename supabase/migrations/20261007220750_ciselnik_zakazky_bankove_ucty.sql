alter table public.predkontacie drop constraint if exists predkontacie_druh_check;
alter table public.predkontacie add constraint predkontacie_druh_check
  check (druh in ('predkontacia','clenenie_dph','stredisko','cinnost','ciselny_rad','pokladna','zakazka','bankovy_ucet'));
