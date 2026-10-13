-- Spoločný adresár: kontakt je odberateľ, dodávateľ alebo oboje (ako v Pohode).
alter table public.customers
  add column odberatel boolean not null default true,
  add column dodavatel boolean not null default false,
  add column iban text,
  add column swift text;
alter table public.customers
  add constraint customers_rola_chk check (odberatel or dodavatel);
create index customers_dodavatel_idx on public.customers (company_id) where dodavatel and deleted_at is null;

-- Kto už figuruje ako dodávateľ v skladových objednávkach, je dodávateľ.
update public.customers c set dodavatel = true
where exists (select 1 from public.purchase_orders po where po.supplier_id = c.id);
