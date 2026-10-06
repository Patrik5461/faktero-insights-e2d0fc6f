-- Doklad vrátený na opravu sa po úprave vráti na schválenie odznova.
create or replace function public.schvalovanie_po_oprave()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _agenda text := tg_argv[0];
  _id uuid;
begin
  update public.schvalovanie
     set stav = 'caka', schvalena_uroven = 0, updated_at = now()
   where agenda = _agenda and doklad_id = new.id and stav = 'vrateny'
  returning id into _id;
  if _id is not null then
    insert into public.schvalovanie_historia (schvalovanie_id, company_id, user_id, akcia, poznamka)
    values (_id, new.company_id, auth.uid(), 'zrusil', 'Doklad opravený — znova na schválenie');
  end if;
  return new;
end
$$;
revoke all on function public.schvalovanie_po_oprave() from public, anon, authenticated;

drop trigger if exists expense_documents_schvalovanie_po_oprave on public.expense_documents;
create trigger expense_documents_schvalovanie_po_oprave
  after update of supplier_name, supplier_ico, document_number, issue_date, total_amount, vat_amount, net_amount, vat_breakdown, category, note, file_path
  on public.expense_documents for each row execute function public.schvalovanie_po_oprave('doklad');

drop trigger if exists purchase_invoices_schvalovanie_po_oprave on public.purchase_invoices;
create trigger purchase_invoices_schvalovanie_po_oprave
  after update of supplier_name, supplier_ico, invoice_number, issue_date, due_date, amount_total, amount_without_vat, vat_amount, note, file_path
  on public.purchase_invoices for each row execute function public.schvalovanie_po_oprave('prijata');

drop trigger if exists invoices_schvalovanie_po_oprave on public.invoices;
create trigger invoices_schvalovanie_po_oprave
  after update of customer_name, customer_id, issue_date, due_date, total, subtotal, notes, intro_note
  on public.invoices for each row execute function public.schvalovanie_po_oprave('vystavena');
