-- Štítky, ktoré firmy už napísali na doklady, sa ponúknu aj v číselníku (filter, hromadná akcia).
insert into public.stitky_firmy (company_id, nazov)
select distinct company_id, left(btrim(s), 40)
  from (
    select company_id, unnest(stitky) s from public.purchase_invoices
    union all
    select company_id, unnest(stitky) s from public.expense_documents
  ) x
 where btrim(s) <> ''
on conflict (company_id, nazov) do nothing;
