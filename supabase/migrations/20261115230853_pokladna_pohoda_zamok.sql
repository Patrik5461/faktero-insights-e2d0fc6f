-- Zámok pokladničného dokladu odovzdaného do Pohody (audit exportov
-- 14. 11. 2026, S21). Pokladničný doklad sa po odovzdaní dal zmeniť aj zmazať
-- (aplikácia mazanie strážila len vo vlastnej funkcii, REST nie) — Pohoda by
-- mala iný doklad než Faktero. Ten istý spúšťač ako pri prijatých dokladoch
-- a bločkoch (`zamok_odovzdaneho_dokladu`); zmeniť ide až po „Vrátiť z
-- Pohody“. Polia = to, čo ide do XML (`polozkyPokladne`), zoznam drží
-- `ZAMOK_POKLADNE` v pohoda-zamok.ts (test kontroluje zhodu).
drop trigger if exists cash_entries_zamok_odovzdania on public.cash_entries;
create trigger cash_entries_zamok_odovzdania
  before update or delete on public.cash_entries
  for each row execute function public.zamok_odovzdaneho_dokladu('entry_number', 'entry_date', 'type', 'amount', 'description', 'category', 'note', 'pokladna_id', 'number_series_id');
