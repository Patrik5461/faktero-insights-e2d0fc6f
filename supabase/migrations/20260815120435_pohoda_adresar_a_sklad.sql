-- Adresár a skladové karty pre konektor do Pohody.
--
-- Obidve agendy sú číselníky, nie doklady — nemajú dátum, takže sa neposielajú
-- „od mesiaca", ale podľa toho, či už odišli a či sa odvtedy zmenili.

alter table public.customers
  add column if not exists pohoda_odoslane_at timestamptz;

comment on column public.customers.pohoda_odoslane_at is
  'Kedy kontakt naposledy odišiel do Pohody. Znovu ide, keď je updated_at novší.';

alter table public.stock_items
  add column if not exists pohoda_odoslane_at timestamptz;

comment on column public.stock_items.pohoda_odoslane_at is
  'Kedy skladová karta naposledy odišla do Pohody.';

-- Obidve sú vypnuté, kým si ich firma nezapne. Adresár si Pohoda pri importe
-- faktúr zakladá aj sama a sklad vedie v Pohode málokto — posielať to všetkým
-- by znamenalo plniť účtovníčke číselníky vecami, o ktoré nestojí.
alter table public.companies
  add column if not exists pohoda_posielat_adresar boolean not null default false,
  add column if not exists pohoda_posielat_sklad boolean not null default false,
  add column if not exists pohoda_sklad text;

comment on column public.companies.pohoda_sklad is
  'Členenie skladu v Pohode (element storage). Bez neho sa skladová karta založiť nedá.';

create index if not exists customers_pohoda_odoslane_idx
  on public.customers (company_id, pohoda_odoslane_at);
create index if not exists stock_items_pohoda_odoslane_idx
  on public.stock_items (company_id, pohoda_odoslane_at);
