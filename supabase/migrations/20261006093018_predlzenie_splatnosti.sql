-- Predĺženie splatnosti faktúry (vydanej aj prijatej).
--
-- Splatnosť sa dá dohodou predĺžiť, ale pre lehoty DPH (§ 53b 101 dní,
-- § 25a 150 dní) sa počíta od pôvodnej. Pôvodnú si pamätá databáza sama pri
-- prvej zmene `due_date` — nech ju mení čokoľvek (tlačidlo Predĺžiť, úprava
-- faktúry, import), nestratí sa. Zámok obdobia preto chráni `povodna_splatnost`
-- (daňový údaj), nie aktuálnu splatnosť, ktorá je obchodná dohoda.

alter table public.invoices
  add column if not exists povodna_splatnost date,
  add column if not exists predlzenie_poznamka text,
  add column if not exists predlzene_at timestamptz,
  add column if not exists predlzil uuid;
alter table public.purchase_invoices
  add column if not exists povodna_splatnost date,
  add column if not exists predlzenie_poznamka text,
  add column if not exists predlzene_at timestamptz,
  add column if not exists predlzil uuid;

create or replace function public.zapamataj_povodnu_splatnost()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if new.due_date is distinct from old.due_date
     and old.due_date is not null
     and coalesce(old.status, '') <> 'draft' then
    if old.povodna_splatnost is null then
      new.povodna_splatnost := old.due_date;
    end if;
    new.predlzene_at := now();
    new.predlzil := coalesce(auth.uid(), new.predlzil);
  end if;
  return new;
end $function$;

drop trigger if exists invoices_povodna_splatnost on public.invoices;
create trigger invoices_povodna_splatnost before update of due_date on public.invoices
  for each row execute function public.zapamataj_povodnu_splatnost();
drop trigger if exists purchase_invoices_povodna_splatnost on public.purchase_invoices;
create trigger purchase_invoices_povodna_splatnost before update of due_date on public.purchase_invoices
  for each row execute function public.zapamataj_povodnu_splatnost();

-- Zámok obdobia: namiesto due_date chráni pôvodnú splatnosť.
drop trigger if exists invoices_locked_period on public.invoices;
create trigger invoices_locked_period before insert or delete or update on public.invoices
  for each row execute function guard_locked_period('issue_date', 'issue_date', 'delivery_date', 'povodna_splatnost', 'invoice_number', 'type', 'currency', 'customer_id', 'customer_name', 'customer_ico', 'customer_dic', 'customer_ic_dph', 'subtotal', 'vat_total', 'total', 'reverse_charge', 'reverse_charge_type', 'advance_invoice_id', 'advance_amount', 'deleted_at');
drop trigger if exists purchase_invoices_locked_period on public.purchase_invoices;
create trigger purchase_invoices_locked_period before insert or delete or update on public.purchase_invoices
  for each row execute function guard_locked_period('issue_date', 'issue_date', 'received_date', 'povodna_splatnost', 'invoice_number', 'supplier_name', 'supplier_ico', 'supplier_dic', 'supplier_ic_dph', 'amount_without_vat', 'vat_amount', 'amount_total', 'currency', 'deleted_at');
