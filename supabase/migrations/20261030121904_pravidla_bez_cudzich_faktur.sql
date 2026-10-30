-- Cudzie faktúry (odberateľ nesedí na firmu) sa pravidlom nezaúčtujú —
-- spúšťač ich preskočí, no funkcia ich doteraz rátala do počtu „uplatnené“.
create or replace function public.uplatni_pravidla_uctovania(_company uuid)
returns integer
language plpgsql
set search_path = public
as $$
declare
  n integer;
  m integer;
  v integer;
begin
  -- Prázdna zmena `pravidlo_id` zobudí spúšťač; ten pravidlo vyhodnotí a zapíše.
  update public.expense_documents d
     set pravidlo_id = null
   where d.company_id = _company
     and d.pravidlo_id is null
     and d.exported_at is null
     and (public.faktero_pravidlo_pre_doklad(d.company_id, d.supplier_ico, d.supplier_name, d.payment_method,
            d.created_by, d.predmet_mailu, 'blocek', null, d.odosielatel_mailu,
            public.faktero_krajina_dokladu(null, d.supplier_ic_dph), null)).id is not null;
  get diagnostics n = row_count;
  update public.purchase_invoices p
     set pravidlo_id = null
   where p.company_id = _company
     and p.pravidlo_id is null
     and p.exported_at is null
     and p.deleted_at is null
     and p.odberatel_nesedi is null
     and (public.faktero_pravidlo_pre_doklad(p.company_id, p.supplier_ico, p.supplier_name, p.payment_method,
            p.created_by, p.predmet_mailu, 'prijata',
            public.faktero_typ_prijatej(p.type, p.amount_total, p.opravuje_cislo), p.odosielatel_mailu,
            public.faktero_krajina_dokladu(p.supplier_country, p.supplier_ic_dph), p.variable_symbol)).id is not null;
  get diagnostics m = row_count;
  update public.invoices i
     set pravidlo_id = null
   where i.company_id = _company
     and i.pravidlo_id is null
     and i.zauctovane_at is null
     and i.deleted_at is null
     and (public.faktero_pravidlo_pre_doklad(i.company_id, i.customer_ico, i.customer_name, null,
            i.created_by, null, 'vystavena', i.type::text)).id is not null;
  get diagnostics v = row_count;
  return n + m + v;
end;
$$;
