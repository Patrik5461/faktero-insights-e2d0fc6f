-- Prílohy už nevisia len na faktúre: rovnako sa hodia k cenovej ponuke
-- (výkres, technická špecifikácia) aj k prijatej objednávke (objednávka
-- zákazníka v PDF). Tabuľka ostáva jedna, s cudzím kľúčom na každý druh
-- dokladu — tak sa príloha pri zmazaní dokladu zmaže s ním a databáza
-- nepustí odkaz na doklad, ktorý neexistuje. Vyplnený musí byť práve jeden.
alter table public.invoice_attachments
  alter column invoice_id drop not null,
  add column quote_id uuid references public.quotes(id) on delete cascade,
  add column sales_order_id uuid references public.sales_orders(id) on delete cascade;

alter table public.invoice_attachments
  add constraint invoice_attachments_prave_jeden_doklad
  check (num_nonnulls(invoice_id, quote_id, sales_order_id) = 1);

create index invoice_attachments_quote_idx
  on public.invoice_attachments (quote_id, created_at) where quote_id is not null;
create index invoice_attachments_sales_order_idx
  on public.invoice_attachments (sales_order_id, created_at) where sales_order_id is not null;

-- Príloha musí visieť na doklade tej istej firmy a ležať v jej priečinku,
-- nech je to faktúra, ponuka alebo objednávka.
drop policy "members insert invoice attachments" on public.invoice_attachments;
create policy "members insert invoice attachments" on public.invoice_attachments
  for insert to authenticated
  with check (
    public.is_company_member(company_id, (select auth.uid()))
    and split_part(path, '/', 1) = company_id::text
    and (
      (invoice_id is not null and exists (
        select 1 from public.invoices d
         where d.id = invoice_id and d.company_id = invoice_attachments.company_id))
      or (quote_id is not null and exists (
        select 1 from public.quotes d
         where d.id = quote_id and d.company_id = invoice_attachments.company_id))
      or (sales_order_id is not null and exists (
        select 1 from public.sales_orders d
         where d.id = sales_order_id and d.company_id = invoice_attachments.company_id))
    )
  );
