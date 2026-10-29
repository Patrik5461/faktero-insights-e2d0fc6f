-- P-1008: prázdny variabilný symbol sa doplní z čísla dokladu.
-- Rovnaké pravidlá ako src/lib/faktero/variabilny-symbol.ts:
--   vystavený doklad: číslice z čísla, najviac posledných 10,
--   prijatá faktúra: len keď je číslo celé z číslic (1–10).
-- Zadaný VS sa nikdy neprepisuje. Na úprave sa VS dopĺňa len pri zmene čísla
-- (inak by zmena iného stĺpca na odovzdanom doklade narazila na zámok).

create or replace function public.vs_z_cisla_dokladu(_cislo text, _prijata boolean)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case
    when _prijata then
      case when regexp_replace(coalesce(_cislo, ''), '\s', '', 'g') ~ '^\d{1,10}$'
           then regexp_replace(_cislo, '\s', '', 'g') end
    else nullif(right(regexp_replace(coalesce(_cislo, ''), '\D', '', 'g'), 10), '')
  end
$$;

create or replace function public.doplnit_variabilny_symbol()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if coalesce(btrim(new.variable_symbol), '') <> '' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.invoice_number is not distinct from old.invoice_number then
    return new;
  end if;
  new.variable_symbol := coalesce(
    public.vs_z_cisla_dokladu(new.invoice_number, tg_table_name = 'purchase_invoices'),
    new.variable_symbol
  );
  return new;
end $$;

revoke all on function public.vs_z_cisla_dokladu(text, boolean) from public, anon;
grant execute on function public.vs_z_cisla_dokladu(text, boolean) to authenticated, service_role;
revoke all on function public.doplnit_variabilny_symbol() from public, anon;
grant execute on function public.doplnit_variabilny_symbol() to authenticated, service_role;

drop trigger if exists invoices_vs_z_cisla on public.invoices;
create trigger invoices_vs_z_cisla
  before insert or update of invoice_number, variable_symbol on public.invoices
  for each row execute function public.doplnit_variabilny_symbol();

drop trigger if exists purchase_invoices_vs_z_cisla on public.purchase_invoices;
create trigger purchase_invoices_vs_z_cisla
  before insert or update of invoice_number, variable_symbol on public.purchase_invoices
  for each row execute function public.doplnit_variabilny_symbol();
