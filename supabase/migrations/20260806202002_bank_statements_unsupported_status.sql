-- Premium API generuje výpisy len pre účty vedené v Tatra banke. Účty z iných
-- bánk (agregované cez Premium API) vracajú PRODUCT_UNKNOWN — to nie je chyba
-- behu, ale trvalý stav, ktorý nemá zmysel skúšať znova každý deň.
alter table public.bank_statements drop constraint if exists bank_statements_status_check;
alter table public.bank_statements add constraint bank_statements_status_check
  check (status in ('pending','ready','failed','unsupported'));
