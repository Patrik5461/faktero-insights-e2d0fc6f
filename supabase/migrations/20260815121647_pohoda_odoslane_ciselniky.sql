-- Evidencia odoslaných číselníkov mimo samotných tabuliek.
--
-- Prvý pokus držal `pohoda_odoslane_at` priamo na karte — a bol chybný: obidve
-- tabuľky majú trigger `set_updated_at`, takže náš vlastný zápis posunul
-- `updated_at` a karta sa navždy tvárila ako zmenená. Konektor ju potom posielal
-- pri každom behu znova.
--
-- Tu sa drží verzia, ktorú sme naozaj poslali (`updated_at` v čase odoslania).
-- Karta čaká, keď záznam chýba alebo je jej `updated_at` novší.

drop index if exists customers_pohoda_odoslane_idx;
drop index if exists stock_items_pohoda_odoslane_idx;

alter table public.customers drop column if exists pohoda_odoslane_at;
alter table public.stock_items drop column if exists pohoda_odoslane_at;

create table if not exists public.pohoda_odoslane (
  company_id uuid not null references public.companies(id) on delete cascade,
  agenda text not null check (agenda in ('adresar', 'sklad')),
  zaznam_id uuid not null,
  verzia timestamptz not null,
  odoslane_at timestamptz not null default now(),
  primary key (company_id, agenda, zaznam_id)
);

comment on table public.pohoda_odoslane is
  'Ktorá verzia kontaktu či skladovej karty už odišla konektorom do Pohody.';
comment on column public.pohoda_odoslane.verzia is
  'Hodnota updated_at zdrojového záznamu v čase odoslania.';

alter table public.pohoda_odoslane enable row level security;

-- Politiky zámerne žiadne: k tabuľke siaha len konektor na serveri.
grant select, insert, update, delete on public.pohoda_odoslane to service_role;
