-- Prijaté zálohové faktúry (proforma od dodávateľa).
--
-- Zálohová faktúra od dodávateľa nie je daňový doklad: platí sa, ale daň si
-- z nej odpočítať nemožno — tú prinesie až ostrá faktúra alebo doklad k
-- prijatej platbe. Preto má vlastný typ a vlastný zoznam; do výkazov k DPH
-- ani do exportov do účtovníctva nevstupuje.
--
-- `advance_invoice_id` drží ostrá faktúra a ukazuje na zálohu, ktorú
-- zúčtováva — rovnako ako na strane vydaných faktúr.

alter table public.purchase_invoices
  add column if not exists type text not null default 'regular',
  add column if not exists advance_invoice_id uuid references public.purchase_invoices (id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'purchase_invoices_type_check') then
    alter table public.purchase_invoices
      add constraint purchase_invoices_type_check check (type in ('regular', 'proforma'));
  end if;
end $$;

create index if not exists purchase_invoices_type_idx
  on public.purchase_invoices (company_id, type, issue_date desc);
create index if not exists purchase_invoices_advance_idx
  on public.purchase_invoices (advance_invoice_id)
  where advance_invoice_id is not null;

comment on column public.purchase_invoices.type is 'regular = prijatá faktúra (daňový doklad), proforma = prijatá zálohová faktúra';
comment on column public.purchase_invoices.advance_invoice_id is 'Prijatá zálohová faktúra, ktorú táto faktúra zúčtováva';
