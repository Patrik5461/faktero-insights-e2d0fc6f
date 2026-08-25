-- Odberateľ, za ktorým sa išlo.
--
-- Kniha jázd vedela priradiť zákazku, ale nie firmu — a pri obhajobe pred
-- daňovým úradom je práve „za kým" to, čo robí z jazdy služobnú cestu.
-- Zákazka to nenahradí: nie každá cesta k odberateľovi je na zákazke.
alter table public.trips
  add column if not exists customer_id uuid references public.customers(id) on delete set null,
  -- Meno sa ukladá zvlášť. Odberateľ sa dá premenovať aj zmazať, ale kniha
  -- jázd musí ostať čitateľná aj po rokoch — rovnako to robia faktúry aj zákazky.
  add column if not exists customer_name text;

create index if not exists idx_trips_customer on public.trips (company_id, customer_id);

comment on column public.trips.customer_id is 'Odberateľ, za ktorým sa išlo; pri zmazaní odberateľa ostane meno.';
comment on column public.trips.customer_name is 'Meno odberateľa v čase jazdy — nemení sa jeho premenovaním.';
