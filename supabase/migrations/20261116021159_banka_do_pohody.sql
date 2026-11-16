-- Bankové pohyby do POHODY cez konektor (most) a mesačný balík — zapína
-- si to firma (`companies.pohoda_posielat_banku`, predvolene vypnuté, lebo
-- väčšina účtovníčok si výpisy z banky do POHODY načítava sama).
--
-- Pohyb je odovzdaný (`exported_at`) až po potvrdení POHODOU (konektor) alebo
-- pri odovzdaní balíka. Sťahovanie z banky (Tatra banka, Wise, Revolut,
-- notifikácie, import výpisu) pohyby len vkladá (`insert`, duplicity sa
-- preskočia), existujúci riadok neprepisuje — nové stĺpce teda opakovaná
-- synchronizácia nezmaže a pohyb neodíde druhýkrát.
--
-- Stĺpce zapisuje server servisným kľúčom; politiky RLS ani spúšťače sa
-- nemenia (spúšťače na bank_transactions sledujú len párovanie a firmu).

alter table public.bank_transactions
  add column if not exists exported_at timestamptz,
  add column if not exists export_job_id uuid references public.export_jobs(id) on delete set null,
  add column if not exists pohoda_cislo text;

comment on column public.bank_transactions.exported_at is
  'Kedy pohyb odišiel do POHODY (potvrdený konektorom alebo odovzdaný balíkom); null = čaká.';
comment on column public.bank_transactions.export_job_id is
  'Dávka konektora alebo odovzdanie, s ktorým pohyb odišiel do POHODY.';
comment on column public.bank_transactions.pohoda_cislo is
  'Číslo bankového dokladu, ktoré pohybu pridelila POHODA.';

create index if not exists bank_transactions_ucet_exported_idx
  on public.bank_transactions (bank_account_id, exported_at);
create index if not exists bank_transactions_export_job_idx
  on public.bank_transactions (export_job_id)
  where export_job_id is not null;

alter table public.companies
  add column if not exists pohoda_posielat_banku boolean not null default false;

comment on column public.companies.pohoda_posielat_banku is
  'Posielať bankové pohyby do POHODY (konektor a mesačný balík). Účet potrebuje skratku v POHODE.';

-- Položky dávky konektora: nový druh 'banka' (dataPackItem id `BNK-<bank_transactions.id>`).
alter table public.pohoda_konektor_polozky
  drop constraint if exists pohoda_konektor_polozky_druh_check;
alter table public.pohoda_konektor_polozky
  add constraint pohoda_konektor_polozky_druh_check check (druh in (
    'faktura', 'prijata', 'doklad', 'pokladna',
    'adresar', 'sklad', 'zakazka', 'pohyb', 'banka',
    'storno', 'storno_opravy', 'zmazane_v_pohode'
  ));
